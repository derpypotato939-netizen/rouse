import Foundation

/// What the user has to do to prove they are awake.
///
/// The design constraint here is subtle and is the whole reason this type exists. Every
/// mission-style alarm app treats "hard to defeat" as "harder to solve," and users defeat them
/// anyway — an Alarmy reviewer's complaint that *"multiplying two four-digit numbers mentally in 30
/// seconds is a bit much when I'm not half asleep"* is the ceiling, and a Sleep as Android user's
/// *"I scanned the 3 QR codes set around the house then went right back to sleep"* is the failure.
///
/// The two properties are independent:
///
/// - **Autopilot resistance** — can a half-asleep brain complete this without engaging? A QR scan
///   can. A fixed math problem can, once the route is memorised. Something whose *content changes
///   every morning* cannot.
/// - **Difficulty** — how hard is it once you are actually engaged?
///
/// Rouse maximises the first and deliberately caps the second. Challenge content is always drawn
/// fresh from the daily seed, so muscle memory has nothing to attach to.
public enum ChallengeKind: String, CaseIterable, Codable, Sendable {

    /// Reaction time + go/no-go inhibition. Implemented in `WakeCheck`.
    /// Autopilot-resistant because withholding a response on no-go trials requires inhibitory
    /// control, which is among the first faculties sleep inertia degrades — you cannot fake it by
    /// tapping faster.
    case reactionGoNoGo

    /// Reproduce a short sequence shown briefly. Loads working memory, which inertia hits early.
    case sequenceRecall

    /// Pick the item that does not belong from a small semantic set. Requires comprehension rather
    /// than pattern matching, so it cannot be answered by position.
    case oddOneOut

    /// Type a short randomly generated phrase. The strongest autopilot resistance of the set —
    /// there is no stable motor pattern to learn — at very low cognitive difficulty.
    case typePhrase

    /// Tap scattered targets in ascending order. Visual search plus sequencing, similar in spirit
    /// to a trail-making task, and physically demands eyes-open attention.
    case spatialTap

    /// How well this kind resists being completed on autopilot, 0–1. Used to keep the sampled mix
    /// weighted toward genuinely engaging challenges.
    public var autopilotResistance: Double {
        switch self {
        case .typePhrase:     return 0.95
        case .oddOneOut:      return 0.85
        case .sequenceRecall: return 0.80
        case .spatialTap:     return 0.70
        case .reactionGoNoGo: return 0.65
        }
    }

    /// Whether the challenge is short enough to serve as a ladder checkpoint rather than the main
    /// dismissal gate. Checkpoints must be answerable in a few seconds or they become punishment.
    public var suitableAsCheckpoint: Bool {
        switch self {
        case .reactionGoNoGo: return false  // a full trial block is too long for a re-check
        case .sequenceRecall, .oddOneOut, .typePhrase, .spatialTap: return true
        }
    }

    public var displayName: String {
        switch self {
        case .reactionGoNoGo: return "Reflex check"
        case .sequenceRecall: return "Sequence"
        case .oddOneOut:      return "Odd one out"
        case .typePhrase:     return "Type it out"
        case .spatialTap:     return "Tap in order"
        }
    }
}

/// A concrete, sampled challenge.
public struct ChallengeSpec: Equatable, Codable, Sendable {
    public var kind: ChallengeKind
    /// Number of items, trials or targets.
    public var rounds: Int
    /// 0–1, hard-capped at `Limits.maxDifficulty`. Deliberately never allowed near 1.
    public var difficulty: Double
    /// Per-round time limit. Generous by design: running out of time on a challenge you *are*
    /// engaged with teaches nothing and just breeds resentment.
    public var timeLimitMs: Double

    public init(kind: ChallengeKind, rounds: Int, difficulty: Double, timeLimitMs: Double) {
        self.kind = kind
        self.rounds = rounds
        self.difficulty = difficulty
        self.timeLimitMs = timeLimitMs
    }

    public enum Limits {
        /// The ceiling. Above this we are testing competence rather than wakefulness, which is the
        /// mistake the rest of the category makes.
        public static let maxDifficulty = 0.70
        public static let minTimeLimitMs = 6_000.0
        public static let maxRounds = 6
        /// A full gate should be over in well under a minute.
        public static let maxExpectedDurationMs = 45_000.0
    }

    /// Rough upper bound on how long this will take, used to keep gates and checkpoints honest.
    public var expectedDurationMs: Double {
        Double(rounds) * timeLimitMs
    }

    // MARK: Sampling

    /// Draws a challenge of the given kind. `role` decides how much of the user's morning it may
    /// consume.
    public enum Role: Sendable {
        /// The gate that dismisses the alarm.
        case dismissal
        /// A short re-check inside the verification ladder.
        case checkpoint
    }

    public static func sample(
        kind: ChallengeKind, role: Role, _ rng: inout SeededRNG
    ) -> ChallengeSpec {
        let difficulty = min(rng.double(0.25, Limits.maxDifficulty), Limits.maxDifficulty)

        let rounds: Int
        let timeLimit: Double
        switch role {
        case .dismissal:
            rounds = kind == .reactionGoNoGo ? 1 : rng.int(2..<(Limits.maxRounds + 1))
            timeLimit = rng.double(8_000, 15_000)
        case .checkpoint:
            // A checkpoint interrupts someone who may already be up and getting on with their day.
            // One round, generous limit, out of the way fast.
            rounds = 1
            timeLimit = rng.double(Limits.minTimeLimitMs, 12_000)
        }

        return ChallengeSpec(
            kind: kind, rounds: rounds, difficulty: difficulty, timeLimitMs: timeLimit
        )
    }

    /// The invariants that keep a challenge on the right side of the autopilot/difficulty split.
    public static func violatesLimits(_ spec: ChallengeSpec) -> Bool {
        if spec.difficulty > Limits.maxDifficulty { return true }
        if spec.rounds < 1 || spec.rounds > Limits.maxRounds { return true }
        if spec.timeLimitMs < Limits.minTimeLimitMs { return true }
        // `reactionGoNoGo` runs its own internal trial block, so its single "round" is long.
        if spec.kind != .reactionGoNoGo,
           spec.expectedDurationMs > Limits.maxExpectedDurationMs { return true }
        return false
    }

    // MARK: Novelty

    /// Contribution to `WakeProtocol`'s feature vector. The one-hot block over kind dominates:
    /// facing a *different type* of challenge matters far more for autopilot resistance than facing
    /// the same type slightly harder.
    var featureVector: [Double] {
        var v = ChallengeKind.allCases.map { $0 == kind ? Weights.kind : 0 }
        v.append(difficulty * Weights.difficulty)
        v.append(Double(rounds) / Double(Limits.maxRounds) * Weights.rounds)
        return v
    }

    enum Weights {
        static let kind = 1.6, difficulty = 0.5, rounds = 0.4
    }
}
