import Foundation

/// Draws genomes that are simultaneously *novel* (the anti-habituation mechanism) and *melodic*
/// (the sleep-inertia finding). Those two goals pull against each other, so sampling is
/// rejection-based with a guaranteed-terminating fallback.
public enum GenomeSampler {

    /// Minimum feature-space distance a new genome must keep from every genome in recent history.
    ///
    /// Tuned empirically over a simulated 365 consecutive mornings: at 1.10 the sampler still
    /// clears the bar on essentially the first draw (≈1.1 attempts) and never falls back, so the
    /// stronger guarantee costs nothing. Raising it further starts to bind.
    public static let noveltyThreshold = 1.10

    /// The band the spectral centroid must fall in. The lower bound keeps dark timbres from
    /// disappearing into a phone speaker's rolloff; the upper keeps bright ones from turning thin
    /// and hissy. Widened from an initial 400–4000 after measurement showed that range rejected
    /// 92% of draws and starved every bandit arm.
    public static let centroidLow = 250.0
    public static let centroidHigh = 5000.0

    /// How many days of history a new sound must differ from.
    public static let historyDepth = 30

    /// Candidates drawn before falling back to max-min selection.
    public static let maxAttempts = 64

    /// Intervals that are harsh as an opening gesture: minor 2nd, tritone, major 7th.
    public static let forbiddenOpeningIntervals: Set<Int> = [1, 6, 11]

    // MARK: - Public API

    /// The result of a draw, including why it was accepted — surfaced in tests and in the
    /// developer-facing sound inspector rather than hidden.
    public struct Draw: Sendable {
        public let genome: Genome
        /// Distance to the nearest genome in history, or `.infinity` when history is empty.
        public let nearestDistance: Double
        /// True when the novelty threshold could not be met and max-min fallback was used.
        public let usedFallback: Bool
        public let attempts: Int
    }

    /// Samples tomorrow's genome.
    ///
    /// - Parameters:
    ///   - seed: from `SeedHash.daily(userSalt:dayKey:)`.
    ///   - history: recent genomes, newest first. Only the first `historyDepth` are considered.
    ///   - family: optional constraint from the bandit. The bandit picks the *family*; this
    ///     function randomises *within* it — which is how Rouse is personalised and
    ///     never-repeating at the same time.
    public static func sample(
        seed: UInt64,
        avoiding history: [Genome] = [],
        family: SoundFamily? = nil
    ) -> Draw {
        var rng = SeededRNG(seed: seed)
        let recent = Array(history.prefix(historyDepth))

        var best: Genome?
        var bestDistance = -1.0
        var attempts = 0

        while attempts < maxAttempts {
            attempts += 1
            let candidate = draw(&rng, family: family)
            guard !violatesSafetyRails(candidate) else { continue }

            let nearest = recent.map { candidate.distance(to: $0) }.min() ?? .infinity
            if nearest >= noveltyThreshold {
                return Draw(genome: candidate, nearestDistance: nearest,
                            usedFallback: false, attempts: attempts)
            }
            // Track the most novel candidate seen so the loop always has an answer.
            if nearest > bestDistance {
                bestDistance = nearest
                best = candidate
            }
        }

        // Fallback: the space around this user's history is crowded. Return the candidate that
        // maximises distance from the nearest neighbour rather than looping forever.
        if let best {
            return Draw(genome: best, nearestDistance: bestDistance,
                        usedFallback: true, attempts: attempts)
        }
        // Every candidate hit a safety rail — vanishingly unlikely, but the alarm must still ring.
        let safe = safeDefault(&rng)
        let nearest = recent.map { safe.distance(to: $0) }.min() ?? .infinity
        return Draw(genome: safe, nearestDistance: nearest, usedFallback: true, attempts: attempts)
    }

    // MARK: - Safety rails

    /// The constraints that keep a randomised sound from becoming a jarring one.
    public static func violatesSafetyRails(_ g: Genome) -> Bool {
        // 1. No dissonant opening gesture.
        if forbiddenOpeningIntervals.contains(g.openingInterval) { return true }

        // 2. The spectral centroid must land in the band the ear and the phone speaker share.
        //    Too low and the sound vanishes into the driver's rolloff; too high and it reads as
        //    thin rather than urgent.
        let centroid = g.spectralCentroid
        if centroid < centroidLow || centroid > centroidHigh { return true }

        // 3. The fundamental must remain audible — a hollowed-out spectrum loses pitch.
        if g.partials[0] < 0.35 { return true }

        // 4. Sanity on the sweep: a cutoff below the fundamental mutes the melody entirely.
        if min(g.sweepStart, g.sweepEnd) < g.root { return true }

        return false
    }

    // MARK: - Drawing

    private static func draw(_ rng: inout SeededRNG, family: SoundFamily?) -> Genome {
        let mode: Mode
        let contour: Contour
        let bpm: Double

        if let family {
            mode = rng.pick(family.modes)
            contour = family.contour
            bpm = rng.double(family.tempoBand.low, family.tempoBand.high)
        } else {
            mode = rng.pick(Mode.allCases)
            // Rising is weighted: an ascending line matches the arousal curve we are after.
            contour = rng.chance(0.5) ? .rising : rng.pick([.arch, .oscillating])
            bpm = rng.double(Genome.Limits.bpmLow, Genome.Limits.bpmHigh)
        }

        let root = rng.double(Genome.Limits.rootLow, Genome.Limits.rootHigh)
        let phrase = drawPhrase(&rng, contour: contour, scaleLength: mode.degrees.count)
        let partials = drawPartials(&rng, brightness: family?.brightness ?? rng.double(0, 1))

        let sweepStart = rng.double(Genome.Limits.cutoffLow, Genome.Limits.cutoffHigh)
        let sweepEnd = rng.double(Genome.Limits.cutoffLow, Genome.Limits.cutoffHigh)

        return Genome(
            root: root,
            mode: mode,
            contour: contour,
            phrase: phrase,
            partials: partials,
            attack: rng.double(Genome.Limits.attackLow, Genome.Limits.attackHigh),
            decay: rng.double(Genome.Limits.decayLow, Genome.Limits.decayHigh),
            bpm: bpm,
            accel: rng.double(Genome.Limits.accelLow, Genome.Limits.accelHigh),
            subdivision: drawRhythm(&rng),
            bed: rng.pick(Bed.allCases),
            sweepStart: sweepStart,
            sweepEnd: sweepEnd,
            space: rng.double(0, 1),
            panRate: rng.double(0.05, 0.9),
            entrance: rng.pick(Entrance.allCases)
        )
    }

    /// Eight scale-degree indices shaped by the contour. Degrees may exceed the scale length —
    /// `Genome.semitone(at:)` wraps them into higher octaves.
    private static func drawPhrase(
        _ rng: inout SeededRNG, contour: Contour, scaleLength: Int
    ) -> [Int] {
        let span = scaleLength + 3
        var phrase: [Int] = []
        for i in 0..<8 {
            let t = Double(i) / 7.0
            let centre: Double
            switch contour {
            case .rising:      centre = t * Double(span)
            case .arch:        centre = sin(t * .pi) * Double(span)
            case .oscillating: centre = (sin(t * .pi * 3) * 0.5 + 0.5) * Double(span)
            }
            let jittered = centre + rng.double(-1.5, 1.5)
            phrase.append(max(0, min(span, Int(jittered.rounded()))))
        }
        return phrase
    }

    /// Six partial weights. `brightness` biases the roll-off: 0 is close to a sine, 1 is bell-like.
    private static func drawPartials(_ rng: inout SeededRNG, brightness: Double) -> [Double] {
        var weights: [Double] = [1.0]
        for n in 1..<6 {
            let rolloff = pow(Double(n + 1), -(2.2 - 1.6 * brightness))
            weights.append(rolloff * rng.double(0.4, 1.3))
        }
        // Normalise so peak amplitude is predictable before the macro ramp is applied.
        let total = weights.reduce(0, +)
        return weights.map { $0 / total * 2.2 }
    }

    /// A 16-step pattern with the downbeat always set, so the pulse is legible.
    private static func drawRhythm(_ rng: inout SeededRNG) -> UInt16 {
        var bits: UInt16 = 0b1
        let density = rng.double(0.20, 0.55)
        for step in 1..<16 where rng.chance(density) {
            bits |= (1 << UInt16(step))
        }
        return bits
    }

    /// A known-good genome used only if every random candidate fails. Conservative by design.
    private static func safeDefault(_ rng: inout SeededRNG) -> Genome {
        Genome(
            root: 264, mode: .pentatonic, contour: .rising,
            phrase: [0, 2, 3, 4, 5, 6, 7, 8],
            partials: [1.0, 0.5, 0.28, 0.16, 0.10, 0.06],
            attack: 0.03, decay: 1.1, bpm: 76, accel: 8,
            subdivision: 0b1000_1000_1010_0101, bed: .pad,
            sweepStart: 900, sweepEnd: 5200, space: 0.4, panRate: 0.2,
            entrance: .fade
        )
    }
}
