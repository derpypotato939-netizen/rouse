import Foundation

/// The measured outcome of one morning. This is the signal that makes "biofeedback" a literally
/// true description of Rouse rather than a marketing word: the app observes a physiological and
/// behavioural response, reports it back, and uses it to adapt.
///
/// Sleep inertia degrades simple reaction time substantially, so RT measured against the user's
/// own daytime baseline is the primary term. Everything else corroborates it.
public struct WakeMeasurement: Equatable, Codable, Sendable {
    /// Mean reaction time this morning, milliseconds.
    public var reactionTimeMs: Double
    /// The user's daytime baseline, captured during onboarding. Without it there is nothing to
    /// compare against, which is why onboarding does not let you skip the baseline test.
    public var baselineMs: Double
    /// Responses on no-go trials — a failure of inhibition, which inertia makes more likely.
    public var commissions: Int
    public var noGoTrials: Int
    /// Seconds from alarm start to dismissal.
    public var dismissSeconds: Double
    /// Accelerometer variance over the first minute, already normalised to [0,1] by the app layer.
    public var motionIndex: Double
    public var snoozes: Int

    public init(
        reactionTimeMs: Double, baselineMs: Double, commissions: Int, noGoTrials: Int,
        dismissSeconds: Double, motionIndex: Double, snoozes: Int
    ) {
        self.reactionTimeMs = reactionTimeMs
        self.baselineMs = baselineMs
        self.commissions = commissions
        self.noGoTrials = noGoTrials
        self.dismissSeconds = dismissSeconds
        self.motionIndex = motionIndex
        self.snoozes = snoozes
    }
}

public struct WakeScore: Equatable, Sendable {
    /// 0–100. Higher means more awake.
    public let value: Double
    /// Component breakdown, surfaced on the Wake Report so the number is explainable.
    public let alertness: Double
    public let inhibition: Double
    public let speed: Double
    public let movement: Double
    /// Morning RT ÷ daytime baseline. 1.0 means you woke as sharp as you are mid-afternoon.
    public let inertiaRatio: Double

    enum Weights {
        static let alertness = 0.40, inhibition = 0.20, speed = 0.20, movement = 0.20
    }

    /// Each snooze multiplies the score down. Multiplicative rather than subtractive so the
    /// penalty can never drive the score negative.
    static let snoozeFactor = 0.85

    public init(_ m: WakeMeasurement) {
        // Ratios below 1 are capped: waking *faster* than your daytime baseline is noise, not
        // superhuman alertness, and letting it exceed 1 would reward a mistimed tap.
        let ratio = max(1.0, m.reactionTimeMs / max(m.baselineMs, 1))
        self.inertiaRatio = ratio

        // Exponential decay: a 50% slower RT lands near 0.5, double lands near 0.25.
        self.alertness = exp(-1.4 * (ratio - 1.0))

        self.inhibition = m.noGoTrials > 0
            ? max(0, 1.0 - Double(m.commissions) / Double(m.noGoTrials))
            : 1.0

        self.speed = exp(-max(0, m.dismissSeconds) / 45.0)
        self.movement = min(max(m.motionIndex, 0), 1)

        let weighted = Weights.alertness * alertness
            + Weights.inhibition * inhibition
            + Weights.speed * speed
            + Weights.movement * movement

        let penalty = pow(WakeScore.snoozeFactor, Double(max(0, m.snoozes)))
        self.value = min(100, max(0, weighted * penalty * 100))
    }

    /// Reward signal for the bandit, in [0,1].
    public var reward: Double { value / 100.0 }
}
