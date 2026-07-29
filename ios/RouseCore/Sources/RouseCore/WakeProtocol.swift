import Foundation

/// One morning's complete wake-up, end to end.
///
/// This is the unit Rouse actually randomises. The original design randomised only the sound, which
/// turns out to be a 1977 idea that never became a product — and the market answered habituation
/// with *tasks*, not audio. But a fixed task habituates exactly like a fixed tone: users report
/// completing multi-step missions on autopilot and going straight back to bed.
///
/// So the novelty constraint applies to the whole protocol. Two mornings must never *sound* alike
/// and must never *work* alike.
public struct WakeProtocol: Equatable, Codable, Sendable {
    /// What you hear. Unchanged from the original engine.
    public var sound: Genome
    /// What dismisses the alarm.
    public var challenge: ChallengeSpec
    /// What happens after you dismiss it — the part no competitor does well.
    public var ladder: VerificationLadder

    public init(sound: Genome, challenge: ChallengeSpec, ladder: VerificationLadder) {
        self.sound = sound
        self.challenge = challenge
        self.ladder = ladder
    }

    /// Concatenation of the three components' vectors. Because each component weights its own
    /// dimensions, distance in this space is dominated by whichever aspect changed most — which is
    /// the behaviour we want: a morning that merely re-tunes the reverb is not a new morning.
    public var featureVector: [Double] {
        sound.featureVector + challenge.featureVector + ladder.featureVector
    }

    public func distance(to other: WakeProtocol) -> Double {
        let a = featureVector, b = other.featureVector
        precondition(a.count == b.count, "feature vectors must be the same rank")
        return sqrt(zip(a, b).reduce(0.0) { $0 + ($1.0 - $1.1) * ($1.0 - $1.1) })
    }
}

/// Draws whole protocols under the same novelty-plus-safety discipline `GenomeSampler` applies to
/// sound alone.
public enum ProtocolSampler {

    /// Minimum feature-space distance from every protocol in recent history.
    ///
    /// Set by the **worst case, not the average case**. Once the bandits converge, a user's
    /// mornings all come from one sound family and one challenge kind, which is the narrowest the
    /// space ever gets — and that is the steady state, not an edge case. Measured over 90
    /// consecutive converged mornings: 1.20 never falls back, while 1.60 fails on 21 of 90 and
    /// starts repeating. Re-tuned via `tools/validate.mjs`; do not adjust by feel.
    public static let noveltyThreshold = 1.20

    public static let historyDepth = GenomeSampler.historyDepth
    public static let maxAttempts = 64

    public struct Draw: Sendable {
        public let wakeProtocol: WakeProtocol
        public let nearestDistance: Double
        public let usedFallback: Bool
        public let attempts: Int
    }

    /// Samples tomorrow's protocol.
    ///
    /// - Parameters:
    ///   - family: the sound family chosen by the sound bandit.
    ///   - challengeKind: the challenge kind chosen by the challenge bandit. The bandits pick
    ///     *categories*; this function randomises freely inside them, which is how Rouse is
    ///     personalised and never-repeating at the same time.
    ///   - ladderMode: user setting, not a learned parameter — how long someone is willing to be
    ///     checked on is their call, not the algorithm's.
    public static func sample(
        seed: UInt64,
        family: SoundFamily,
        challengeKind: ChallengeKind,
        ladderMode: VerificationLadder.Mode,
        avoiding history: [WakeProtocol] = []
    ) -> Draw {
        var rng = SeededRNG(seed: seed)
        let recent = Array(history.prefix(historyDepth))

        var best: WakeProtocol?
        var bestDistance = -1.0
        var attempts = 0

        while attempts < maxAttempts {
            attempts += 1
            guard let candidate = drawCandidate(
                &rng, seed: seed, attempt: attempts,
                family: family, challengeKind: challengeKind, ladderMode: ladderMode
            ) else { continue }

            let nearest = recent.map { candidate.distance(to: $0) }.min() ?? .infinity
            if nearest >= noveltyThreshold {
                return Draw(wakeProtocol: candidate, nearestDistance: nearest,
                            usedFallback: false, attempts: attempts)
            }
            if nearest > bestDistance {
                bestDistance = nearest
                best = candidate
            }
        }

        if let best {
            return Draw(wakeProtocol: best, nearestDistance: bestDistance,
                        usedFallback: true, attempts: attempts)
        }

        // Nothing valid was drawn. The alarm still has to ring, so fall back to a known-good
        // protocol rather than failing to wake the user.
        let fallback = WakeProtocol(
            sound: GenomeSampler.sample(seed: seed, family: family).genome,
            challenge: ChallengeSpec(kind: challengeKind, rounds: 3,
                                     difficulty: 0.45, timeLimitMs: 12_000),
            ladder: VerificationLadder.sample(mode: ladderMode, &rng)
        )
        let nearest = recent.map { fallback.distance(to: $0) }.min() ?? .infinity
        return Draw(wakeProtocol: fallback, nearestDistance: nearest,
                    usedFallback: true, attempts: attempts)
    }

    private static func drawCandidate(
        _ rng: inout SeededRNG,
        seed: UInt64,
        attempt: Int,
        family: SoundFamily,
        challengeKind: ChallengeKind,
        ladderMode: VerificationLadder.Mode
    ) -> WakeProtocol? {
        // Vary the sound seed per attempt so retries explore rather than redrawing the same genome.
        let soundDraw = GenomeSampler.sample(
            seed: seed &+ UInt64(attempt) &* 0x9E37, family: family
        )
        let challenge = ChallengeSpec.sample(kind: challengeKind, role: .dismissal, &rng)
        guard !ChallengeSpec.violatesLimits(challenge) else { return nil }

        let ladder = VerificationLadder.sample(mode: ladderMode, &rng)
        guard !VerificationLadder.violatesInvariants(ladder) else { return nil }

        return WakeProtocol(sound: soundDraw.genome, challenge: challenge, ladder: ladder)
    }
}
