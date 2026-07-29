import Foundation

// MARK: - Categorical genes

/// Scale sets, all chosen to be consonant. McFarlane et al. (2020) found melodic waking sounds
/// clear sleep inertia better than harsh ones, so the randomisation space is deliberately
/// bounded to modes that resolve — Rouse randomises *within* melody, never toward noise.
public enum Mode: String, CaseIterable, Codable, Sendable {
    case ionian, lydian, mixolydian, dorian, pentatonic, harmonicMinor

    /// Semitone offsets from the root.
    public var degrees: [Int] {
        switch self {
        case .ionian:        return [0, 2, 4, 5, 7, 9, 11]
        case .lydian:        return [0, 2, 4, 6, 7, 9, 11]
        case .mixolydian:    return [0, 2, 4, 5, 7, 9, 10]
        case .dorian:        return [0, 2, 3, 5, 7, 9, 10]
        case .pentatonic:    return [0, 2, 4, 7, 9]
        case .harmonicMinor: return [0, 2, 3, 5, 7, 8, 11]
        }
    }
}

/// Melodic direction. `rising` is weighted most heavily during sampling because an ascending
/// contour matches the arousal curve we want — the sound should feel like it is going somewhere.
public enum Contour: String, CaseIterable, Codable, Sendable {
    case rising, arch, oscillating
}

/// Background texture under the melody.
public enum Bed: String, CaseIterable, Codable, Sendable {
    case none, noise, pad, water, wind
}

/// How the sound arrives. Note this shapes the *first note's* character only — the macro
/// loudness ramp in `Synth` is applied unconditionally, so `sudden` never means "instantly loud."
/// A startle response spikes cortisol and worsens mood, which is the opposite of the goal.
public enum Entrance: String, CaseIterable, Codable, Sendable {
    case fade, sudden, stutter, reverseSwell
}

// MARK: - Genome

/// A complete description of one morning's sound. Sampling is seeded, so a `Genome` is fully
/// reproducible from `(userSalt, dayKey)` — see `SeedHash.daily`.
public struct Genome: Equatable, Codable, Sendable {
    /// Root frequency in Hz. Floored at 180 because phone speakers roll off below that and a
    /// sub-bass alarm simply is not heard.
    public var root: Double
    public var mode: Mode
    public var contour: Contour
    /// Eight scale-degree indices forming the melodic phrase.
    public var phrase: [Int]
    /// Six harmonic partial weights, normalised so the fundamental is 1.0.
    /// Sweeping these moves the timbre from pure sine through bell to reed.
    public var partials: [Double]
    /// Per-note envelope, seconds.
    public var attack: Double
    public var decay: Double
    public var bpm: Double
    /// BPM gained per minute. The pulse accelerates as the sound plays.
    public var accel: Double
    /// 16-step rhythmic pattern as a bit field.
    public var subdivision: UInt16
    public var bed: Bed
    /// Lowpass cutoff trajectory in Hz, start → end.
    public var sweepStart: Double
    public var sweepEnd: Double
    /// Reverb size 0–1 and stereo pan rate in Hz.
    public var space: Double
    public var panRate: Double
    public var entrance: Entrance

    public init(
        root: Double, mode: Mode, contour: Contour, phrase: [Int], partials: [Double],
        attack: Double, decay: Double, bpm: Double, accel: Double, subdivision: UInt16,
        bed: Bed, sweepStart: Double, sweepEnd: Double, space: Double, panRate: Double,
        entrance: Entrance
    ) {
        self.root = root; self.mode = mode; self.contour = contour; self.phrase = phrase
        self.partials = partials; self.attack = attack; self.decay = decay
        self.bpm = bpm; self.accel = accel; self.subdivision = subdivision
        self.bed = bed; self.sweepStart = sweepStart; self.sweepEnd = sweepEnd
        self.space = space; self.panRate = panRate; self.entrance = entrance
    }

    // MARK: Derived

    /// Semitone offset of a phrase position, wrapping into higher octaves past the scale length.
    public func semitone(at index: Int) -> Int {
        let degrees = mode.degrees
        let d = phrase[index % phrase.count]
        let octave = d / degrees.count
        return degrees[d % degrees.count] + 12 * octave
    }

    /// The interval the listener hears first. Constrained at sample time — see
    /// `GenomeSampler.violatesSafetyRails`.
    public var openingInterval: Int {
        abs(semitone(at: 1) - semitone(at: 0))
    }

    public func frequency(at index: Int) -> Double {
        root * pow(2.0, Double(semitone(at: index)) / 12.0)
    }

    /// Amplitude-weighted mean frequency of the partials — where the energy actually sits.
    ///
    /// This, not the loudest single partial, is what determines whether a timbre reads as present
    /// on a phone speaker. After normalisation the fundamental is always the loudest partial, so
    /// testing *it* against a frequency band only ever tests the root and rejects almost
    /// everything; the centroid is the measure that means what it says.
    public var spectralCentroid: Double {
        var numerator = 0.0, denominator = 0.0
        for (index, weight) in partials.enumerated() {
            numerator += weight * root * Double(index + 1)
            denominator += weight
        }
        return denominator > 0 ? numerator / denominator : root
    }

    // MARK: Novelty vector

    /// Normalised feature vector used for the anti-habituation distance check.
    ///
    /// Continuous genes map to [0,1]; categorical genes contribute a one-hot block so that two
    /// different modes sit a fixed distance apart rather than being ordered arbitrarily.
    /// Weights reflect what the ear actually notices: timbre and tempo dominate, reverb does not.
    public var featureVector: [Double] {
        var v: [Double] = []

        func norm(_ x: Double, _ lo: Double, _ hi: Double) -> Double {
            min(max((x - lo) / (hi - lo), 0), 1)
        }
        func oneHot<T: CaseIterable & Equatable>(_ value: T, weight: Double) -> [Double] {
            T.allCases.map { $0 == value ? weight : 0 }
        }

        v.append(norm(root, Limits.rootLow, Limits.rootHigh) * Weights.root)
        v += oneHot(mode, weight: Weights.mode)
        v += oneHot(contour, weight: Weights.contour)
        v += partials.map { $0 * Weights.partials }
        v.append(norm(attack, Limits.attackLow, Limits.attackHigh) * Weights.envelope)
        v.append(norm(decay, Limits.decayLow, Limits.decayHigh) * Weights.envelope)
        v.append(norm(bpm, Limits.bpmLow, Limits.bpmHigh) * Weights.bpm)
        v.append(norm(accel, Limits.accelLow, Limits.accelHigh) * Weights.bpm)
        // Rhythm as popcount + a few individual bits: catches "busy vs sparse" and gross shape.
        v.append(Double(subdivision.nonzeroBitCount) / 16.0 * Weights.rhythm)
        for shift in stride(from: 0, to: 16, by: 4) {
            v.append(((subdivision >> UInt16(shift)) & 0xF).nonzeroBitCount > 1 ? Weights.rhythm : 0)
        }
        v += oneHot(bed, weight: Weights.bed)
        v.append(norm(sweepStart, Limits.cutoffLow, Limits.cutoffHigh) * Weights.sweep)
        v.append(norm(sweepEnd, Limits.cutoffLow, Limits.cutoffHigh) * Weights.sweep)
        v.append(space * Weights.space)
        v += oneHot(entrance, weight: Weights.entrance)
        // Phrase shape, normalised by the widest degree we ever sample.
        v += phrase.map { Double($0) / 13.0 * Weights.phrase }
        return v
    }

    /// Euclidean distance in feature space.
    public func distance(to other: Genome) -> Double {
        let a = featureVector, b = other.featureVector
        precondition(a.count == b.count, "feature vectors must be the same rank")
        return sqrt(zip(a, b).reduce(0.0) { $0 + ($1.0 - $1.1) * ($1.0 - $1.1) })
    }

    // MARK: Constants

    public enum Limits {
        public static let rootLow = 180.0, rootHigh = 420.0
        public static let attackLow = 0.005, attackHigh = 0.40
        public static let decayLow = 0.20, decayHigh = 3.0
        public static let bpmLow = 56.0, bpmHigh = 120.0
        public static let accelLow = 0.0, accelHigh = 24.0
        public static let cutoffLow = 400.0, cutoffHigh = 9000.0
    }

    enum Weights {
        static let root = 1.0, mode = 0.8, contour = 0.9, partials = 1.4
        static let envelope = 0.7, bpm = 1.3, rhythm = 0.5, bed = 0.9
        static let sweep = 0.6, space = 0.3, entrance = 0.7, phrase = 0.5
    }
}
