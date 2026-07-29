import Foundation

/// The one entry point the app layer talks to. Everything below it is pure and tested; everything
/// above it is AlarmKit, AVAudioEngine, CoreMotion and SwiftUI.
public enum Rouse {

    /// Duration of the Stage 1 stinger. AlarmKit caps custom alarm sounds at 30 seconds and plays
    /// them once, so the stinger is built to that budget deliberately — the unbounded Stage 2 ramp
    /// takes over once the user is in the app.
    public static let stingerSeconds = 29.0

    /// The learner. Two independent bandits over a factored action space rather than one joint
    /// bandit over their product: with a single observation per day, 24 × 5 = 120 joint arms would
    /// never leave cold start, while 24 and 5 separately converge at a usable rate.
    public struct Learner: Codable, Sendable {
        public var sound = Bandit()
        public var challenge = Bandit()

        public init() {}

        /// Both dimensions are credited with the same Wake Score. This is a deliberate
        /// simplification: with one observation per morning there is no way to attribute outcome
        /// between sound and challenge, and pretending otherwise would be false precision.
        public mutating func observe(
            soundFamily: String, challengeKind: ChallengeKind,
            context: Bandit.Context, reward: Double
        ) {
            sound.observe(arm: soundFamily, context: context, reward: reward)
            challenge.observe(arm: challengeKind.rawValue, context: context, reward: reward)
        }

        public var totalObservations: Int { sound.totalObservations }
    }

    /// Everything the app needs for one morning.
    public struct MorningPlan: Sendable {
        public let wakeProtocol: WakeProtocol
        public let family: SoundFamily
        /// Stable public number for the sound — what the share card prints.
        public let serial: UInt32
        public let nearestDistance: Double
        public let usedFallback: Bool

        public var sound: Genome { wakeProtocol.sound }
        public var challenge: ChallengeSpec { wakeProtocol.challenge }
        public var ladder: VerificationLadder { wakeProtocol.ladder }
    }

    /// Chooses and generates tomorrow's whole wake-up.
    ///
    /// The bandits pick *categories*; the sampler randomises inside them under a novelty constraint
    /// against the last 30 mornings. That is the design in one call: personalised because the
    /// categories adapt to your measured wake response, and never-repeating because the protocol
    /// drawn inside them is fresh every day.
    public static func nextMorning(
        userSalt: String,
        dayKey: String,
        context: Bandit.Context,
        learner: Learner,
        ladderMode: VerificationLadder.Mode,
        history: [WakeProtocol]
    ) -> MorningPlan {
        let seed = SeedHash.daily(userSalt: userSalt, dayKey: dayKey)

        var soundRNG = SeededRNG(seed: seed &* 31)
        let familyID = learner.sound.select(
            arms: SoundFamily.all.map(\.id), context: context, rng: &soundRNG
        )
        let family = SoundFamily.family(id: familyID) ?? SoundFamily.all[0]

        var challengeRNG = SeededRNG(seed: seed &* 37)
        let kindID = learner.challenge.select(
            arms: ChallengeKind.allCases.map(\.rawValue), context: context, rng: &challengeRNG
        )
        let kind = ChallengeKind(rawValue: kindID) ?? .typePhrase

        let draw = ProtocolSampler.sample(
            seed: seed, family: family, challengeKind: kind,
            ladderMode: ladderMode, avoiding: history
        )

        return MorningPlan(
            wakeProtocol: draw.wakeProtocol,
            family: family,
            serial: UInt32(truncatingIfNeeded: seed % 100_000),
            nearestDistance: draw.nearestDistance,
            usedFallback: draw.usedFallback
        )
    }

    /// Renders the Stage 1 stinger.
    public static func renderStinger(_ plan: MorningPlan, seed: UInt64 = 0) -> Synth.Buffer {
        Synth().render(plan.sound, seconds: stingerSeconds, seed: seed)
    }

    /// `dayKey` for a date, in the user's own timezone — the seed must change at *their* midnight.
    public static func dayKey(for date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}
