import Foundation

/// Renders a `Genome` to raw stereo audio.
///
/// Written against plain `[Float]` rather than AVFoundation so the whole engine builds and is
/// testable from the command line, and so the identical code path serves both the offline 30-second
/// stinger (Stage 1, handed to AlarmKit) and the real-time ramp (Stage 2, driven by AVAudioEngine
/// in the app). One renderer, two stages — the ramp cannot drift out of character from the alarm
/// that preceded it.
public struct Synth: Sendable {

    public static let sampleRate = 44_100.0

    /// The macro loudness ramp, applied unconditionally.
    ///
    /// This is a safety rail, not a taste choice: a sound arriving at full level triggers a startle
    /// response, which raises cortisol and worsens mood on waking — the opposite of what Rouse is
    /// for. `Entrance.sudden` therefore shapes the first note's *character*, never its level.
    public static let macroRampSeconds = 8.0

    /// Sixteenth notes.
    static let stepsPerBeat = 4.0

    public struct Buffer: Sendable {
        public let left: [Float]
        public let right: [Float]
        public var frameCount: Int { left.count }
        public var duration: Double { Double(left.count) / Synth.sampleRate }
    }

    public init() {}

    // MARK: - Render

    public func render(_ g: Genome, seconds: Double, seed: UInt64 = 0) -> Buffer {
        let frames = Int(seconds * Synth.sampleRate)
        var left = [Float](repeating: 0, count: frames)
        var right = [Float](repeating: 0, count: frames)
        var rng = SeededRNG(seed: seed &+ 0xA5A5)

        // Voices are scheduled up front so the render loop stays a simple accumulate.
        let notes = schedule(g, seconds: seconds)

        // --- Melody -------------------------------------------------------------------------
        var dry = [Double](repeating: 0, count: frames)
        for note in notes {
            let startFrame = Int(note.start * Synth.sampleRate)
            let noteFrames = Int(note.duration * Synth.sampleRate)
            guard startFrame < frames else { continue }

            for i in 0..<noteFrames {
                let f = startFrame + i
                guard f < frames else { break }
                let t = Double(i) / Synth.sampleRate
                let env = envelope(t, attack: note.attack, decay: g.decay, total: note.duration)
                guard env > 1e-5 else { continue }

                var sample = 0.0
                for (index, weight) in g.partials.enumerated() where weight > 1e-4 {
                    let freq = note.frequency * Double(index + 1)
                    guard freq < Synth.sampleRate * 0.45 else { break }  // anti-alias
                    let phase = 2.0 * .pi * freq * (Double(startFrame) / Synth.sampleRate + t)
                    sample += weight * sin(phase)
                }
                dry[f] += sample * env * note.gain
            }
        }

        // --- Bed ----------------------------------------------------------------------------
        if g.bed != .none {
            addBed(g, into: &dry, frames: frames, rng: &rng)
        }

        // --- Filter sweep -------------------------------------------------------------------
        applySweep(g, to: &dry, frames: frames)

        // --- Space, stereo, and the macro ramp ----------------------------------------------
        let wet = reverb(dry, size: g.space)
        let mix = g.space * 0.45

        for f in 0..<frames {
            let t = Double(f) / Synth.sampleRate
            let signal = dry[f] * (1 - mix) + wet[f] * mix
            let ramped = signal * macroRamp(t)

            // Constant-power pan drifting under an LFO.
            let pan = sin(2.0 * .pi * g.panRate * t) * 0.35
            let angle = (pan + 1) * .pi / 4
            left[f] = Float(ramped * cos(angle))
            right[f] = Float(ramped * sin(angle))
        }

        normalize(&left, &right, peak: 0.89)
        return Buffer(left: left, right: right)
    }

    // MARK: - Scheduling

    struct Note {
        let start: Double
        let duration: Double
        let frequency: Double
        let attack: Double
        let gain: Double
    }

    /// Walks the accelerating pulse and emits a note wherever the rhythm pattern has a bit set.
    ///
    /// Tempo rises linearly, so beat position is the integral of the tempo curve rather than
    /// `bpm * t` — getting this wrong makes the acceleration audibly lurch.
    func schedule(_ g: Genome, seconds: Double) -> [Note] {
        var notes: [Note] = []
        var step = 0
        var phraseIndex = 0

        while true {
            let t = timeOfStep(step, g: g)
            guard t < seconds else { break }

            let bit = (g.subdivision >> UInt16(step % 16)) & 1
            if bit == 1 {
                let nextT = timeOfStep(step + 1, g: g)
                let gap = max(nextT - t, 0.02)
                let duration = min(g.decay + g.attack, max(gap * 3.0, 0.12))

                notes.append(Note(
                    start: t,
                    duration: min(duration, seconds - t),
                    frequency: g.frequency(at: phraseIndex),
                    attack: attackFor(g, isFirst: notes.isEmpty),
                    gain: notes.isEmpty ? 1.0 : 0.62 + 0.38 * accentWeight(step)
                ))
                phraseIndex += 1
            }
            step += 1
        }

        if g.entrance == .stutter, let first = notes.first {
            // Three fast retriggers ahead of the phrase proper.
            for k in 1...3 {
                notes.append(Note(
                    start: max(0, first.start + Double(k) * 0.055),
                    duration: 0.09, frequency: first.frequency,
                    attack: 0.004, gain: 0.45
                ))
            }
        }
        return notes
    }

    /// Position in seconds of a 16th-note step under linear tempo acceleration.
    /// Solves `beats(t) = (bpm0·t + accel·t²/120)/60` for `t`.
    func timeOfStep(_ step: Int, g: Genome) -> Double {
        let beats = Double(step) / Synth.stepsPerBeat
        guard g.accel > 1e-6 else { return beats * 60.0 / g.bpm }
        // Quadratic: (accel/120)·t² + bpm0·t − 60·beats = 0
        let a = g.accel / 120.0
        let b = g.bpm
        let c = -60.0 * beats
        return (-b + sqrt(b * b - 4 * a * c)) / (2 * a)
    }

    private func accentWeight(_ step: Int) -> Double {
        step % 16 == 0 ? 1.0 : (step % 4 == 0 ? 0.8 : 0.5)
    }

    private func attackFor(_ g: Genome, isFirst: Bool) -> Double {
        guard isFirst else { return g.attack }
        switch g.entrance {
        case .fade:         return max(g.attack, 0.25)
        case .sudden:       return min(g.attack, 0.008)
        case .stutter:      return 0.01
        case .reverseSwell: return max(g.attack, 0.45)
        }
    }

    // MARK: - Envelopes

    func envelope(_ t: Double, attack: Double, decay: Double, total: Double) -> Double {
        guard t >= 0, t <= total else { return 0 }
        if t < attack { return t / max(attack, 1e-6) }
        let released = t - attack
        let value = exp(-released / max(decay, 1e-6))
        // Taper the final 20 ms so truncated notes do not click.
        let tail = total - t
        return tail < 0.02 ? value * (tail / 0.02) : value
    }

    /// Raised-cosine fade over `macroRampSeconds`, then unity.
    public func macroRamp(_ t: Double) -> Double {
        guard t < Synth.macroRampSeconds else { return 1 }
        let x = max(0, t) / Synth.macroRampSeconds
        return 0.5 - 0.5 * cos(.pi * x)
    }

    // MARK: - Bed

    private func addBed(_ g: Genome, into dry: inout [Double], frames: Int, rng: inout SeededRNG) {
        var lp = 0.0
        var lp2 = 0.0
        let level = 0.18

        for f in 0..<frames {
            let t = Double(f) / Synth.sampleRate
            let white = rng.double(-1, 1)
            var value = 0.0

            switch g.bed {
            case .none:
                continue
            case .noise:
                lp += 0.08 * (white - lp)
                value = lp
            case .pad:
                // Two detuned sines a fifth apart, tracking the root.
                value = 0.5 * sin(2 * .pi * g.root * 0.5 * t)
                      + 0.3 * sin(2 * .pi * g.root * 0.75 * t + 0.4)
            case .water:
                // Bandpassed noise with a slow amplitude wobble.
                lp += 0.25 * (white - lp)
                lp2 += 0.02 * (lp - lp2)
                value = (lp - lp2) * (0.6 + 0.4 * sin(2 * .pi * 0.23 * t))
            case .wind:
                lp += 0.012 * (white - lp)
                value = lp * (0.7 + 0.3 * sin(2 * .pi * 0.07 * t))
            }
            dry[f] += value * level
        }
    }

    // MARK: - Filter

    /// One-pole lowpass whose cutoff glides from `sweepStart` to `sweepEnd` across the render.
    private func applySweep(_ g: Genome, to buffer: inout [Double], frames: Int) {
        guard frames > 0 else { return }
        var z = 0.0
        for f in 0..<frames {
            let progress = Double(f) / Double(frames)
            let cutoff = g.sweepStart + (g.sweepEnd - g.sweepStart) * progress
            let alpha = 1 - exp(-2.0 * .pi * cutoff / Synth.sampleRate)
            z += alpha * (buffer[f] - z)
            buffer[f] = z
        }
    }

    // MARK: - Space

    /// Three combs into one allpass. Not a concert hall — enough to place the sound in a room,
    /// which is all a 30-second alarm needs.
    private func reverb(_ input: [Double], size: Double) -> [Double] {
        guard size > 0.01, !input.isEmpty else { return input }
        var output = [Double](repeating: 0, count: input.count)

        let combDelays = [1231, 1523, 1811]
        let feedback = 0.55 + 0.35 * min(max(size, 0), 1)

        for delay in combDelays {
            var buffer = [Double](repeating: 0, count: delay)
            var index = 0
            for f in 0..<input.count {
                let delayed = buffer[index]
                buffer[index] = input[f] + delayed * feedback
                output[f] += delayed / Double(combDelays.count)
                index = (index + 1) % delay
            }
        }

        let apDelay = 331
        var apBuffer = [Double](repeating: 0, count: apDelay)
        var apIndex = 0
        let gain = 0.5
        for f in 0..<output.count {
            let delayed = apBuffer[apIndex]
            let value = -gain * output[f] + delayed
            apBuffer[apIndex] = output[f] + gain * value
            output[f] = value
            apIndex = (apIndex + 1) % apDelay
        }
        return output
    }

    // MARK: - Level

    private func normalize(_ left: inout [Float], _ right: inout [Float], peak: Float) {
        var maximum: Float = 0
        for i in 0..<left.count {
            maximum = max(maximum, abs(left[i]), abs(right[i]))
        }
        guard maximum > 1e-6 else { return }
        let gain = peak / maximum
        for i in 0..<left.count {
            left[i] *= gain
            right[i] *= gain
        }
    }
}
