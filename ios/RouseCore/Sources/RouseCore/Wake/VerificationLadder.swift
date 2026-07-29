import Foundation

/// The schedule of re-checks that fire *after* the alarm is dismissed.
///
/// This is the feature the rest of the category is missing. Every mission-style alarm solves
/// "dismiss the alarm" and stops there; users then go straight back to sleep and say so plainly —
/// *"I woke up to the alarm, got out of bed, scanned the 3 QR codes set around the house to dismiss
/// the alarm then went right back to sleep."* Alarmy ships a binary 3-minute re-check, which
/// reviewers find confusing enough to complain they cannot switch it off.
///
/// Two things make this version different:
///
/// 1. **The window matches the physiology.** Sleep inertia runs roughly 2–15 minutes when waking
///    from light sleep, 30–90 minutes from deep N3 sleep, and up to about four hours in severe
///    "sleep drunkenness." A single three-minute check is far too short to catch the cases that
///    actually matter.
/// 2. **The timing is randomised.** A re-check that always lands at T+3 is a re-check you learn to
///    sleep through — the same habituation the sound engine exists to defeat, one layer up.
public struct VerificationLadder: Equatable, Codable, Sendable {

    /// How forcefully a checkpoint announces itself. Escalation is monotonic across the ladder:
    /// the longer you go unverified, the harder it pushes.
    public enum Escalation: Int, Comparable, Codable, Sendable, CaseIterable {
        case silent = 0      // a quiet notification — enough if you are genuinely up
        case softTone = 1    // audible but gentle
        case fullAlarm = 2   // the alarm returns in full

        public static func < (a: Escalation, b: Escalation) -> Bool { a.rawValue < b.rawValue }
    }

    public struct Checkpoint: Equatable, Codable, Sendable {
        /// Seconds after the alarm was dismissed.
        public var offset: TimeInterval
        public var escalation: Escalation
        /// A short challenge. `nil` means a simple "yes, I'm up" confirmation.
        public var challenge: ChallengeSpec?

        public init(offset: TimeInterval, escalation: Escalation, challenge: ChallengeSpec?) {
            self.offset = offset
            self.escalation = escalation
            self.challenge = challenge
        }
    }

    public var window: TimeInterval
    public var checkpoints: [Checkpoint]
    public var mode: Mode

    /// Standard covers a typical light-sleep waking. Extended is the default for users who report
    /// severe inertia — the ADHD/DSPD case, where a 25-minute window would routinely end while the
    /// user is still impaired.
    public enum Mode: String, CaseIterable, Codable, Sendable {
        case off, standard, extended

        public var window: TimeInterval {
            switch self {
            case .off:      return 0
            case .standard: return 25 * 60
            case .extended: return 50 * 60
            }
        }

        public var checkpointCount: ClosedRange<Int> {
            switch self {
            case .off:      return 0...0
            case .standard: return 3...4
            case .extended: return 5...6
            }
        }
    }

    public enum Limits {
        /// Never fire immediately after dismissal — the user may still be walking to the bathroom,
        /// and an instant re-check reads as broken rather than helpful.
        public static let minFirstOffset: TimeInterval = 120
        /// Minimum gap between checkpoints. Without this, randomisation can cluster them into a
        /// barrage, which is the fastest route to an uninstall.
        public static let minSpacing: TimeInterval = 150
    }

    // MARK: - Sampling

    public static func sample(mode: Mode, _ rng: inout SeededRNG) -> VerificationLadder {
        guard mode != .off else {
            return VerificationLadder(window: 0, checkpoints: [], mode: .off)
        }

        let window = mode.window
        let range = mode.checkpointCount
        let count = rng.int(range.lowerBound..<(range.upperBound + 1))

        let offsets = sampleOffsets(count: count, window: window, &rng)

        // Escalation climbs across the ladder so the last checkpoint is always a full alarm — if
        // you are still unverified 25 (or 50) minutes on, gentleness has already failed.
        var checkpoints: [Checkpoint] = []
        var previousKind: ChallengeKind?

        for (index, offset) in offsets.enumerated() {
            let progress = offsets.count > 1
                ? Double(index) / Double(offsets.count - 1)
                : 1.0
            let escalation: Escalation = progress >= 0.99 ? .fullAlarm
                                       : (progress < 0.4 ? .silent : .softTone)

            // The first checkpoint is a plain confirmation: if you really are up, one tap should
            // clear it. Later checkpoints, where you have already failed to confirm, demand proof.
            let challenge: ChallengeSpec?
            if index == 0 {
                challenge = nil
            } else {
                let kind = pickCheckpointKind(avoiding: previousKind, &rng)
                previousKind = kind
                challenge = ChallengeSpec.sample(kind: kind, role: .checkpoint, &rng)
            }

            checkpoints.append(
                Checkpoint(offset: offset, escalation: escalation, challenge: challenge)
            )
        }

        return VerificationLadder(window: window, checkpoints: checkpoints, mode: mode)
    }

    /// Places `count` points in `[low, high]`, each at least `minSpacing` apart, **by
    /// construction**.
    ///
    /// Reserves the spacing up front and randomises only the slack left over, so the invariant
    /// cannot be violated no matter what the RNG produces. An earlier version jittered inside
    /// equal slots and patched collisions afterwards; measurement found it violated spacing on
    /// ~0.2% of draws, because adjacent slots' jitter ranges can legitimately overlap.
    private static func offsetsWithSpacing(
        count: Int, low: TimeInterval, high: TimeInterval, _ rng: inout SeededRNG
    ) -> [TimeInterval] {
        guard count > 0 else { return [] }
        let required = Double(count - 1) * Limits.minSpacing
        let slack = max(0, (high - low) - required)

        // Sorted uniforms: consecutive differences are non-negative, so adding `i * minSpacing`
        // guarantees each gap is at least `minSpacing`.
        var cuts = (0..<count).map { _ in rng.double(0, 1) }
        cuts.sort()
        return cuts.enumerated().map { index, cut in
            low + cut * slack + Double(index) * Limits.minSpacing
        }
    }

    /// Randomised offsets with both ends pinned and only the middle floating.
    ///
    /// - The **last** checkpoint lands in the final 12% of the window. Sleep inertia runs 30–90
    ///   minutes when waking from deep sleep, so a ladder that quietly finishes early defeats its
    ///   own purpose.
    /// - The **first** lands in the opening 25%. Left unbounded, the random offsets could all
    ///   bunch late — measurement showed a first checkpoint arriving as late as 18.8 minutes,
    ///   leaving the app blind during exactly the window when someone crawls back into bed.
    private static func sampleOffsets(
        count: Int, window: TimeInterval, _ rng: inout SeededRNG
    ) -> [TimeInterval] {
        guard count > 0 else { return [] }

        let last = rng.double(0.88 * window, window)
        guard count > 1 else { return [last] }

        let firstCap = max(Limits.minFirstOffset + 1, 0.25 * window)
        let first = rng.double(Limits.minFirstOffset, firstCap)
        guard count > 2 else { return [first, last] }

        let middle = offsetsWithSpacing(
            count: count - 2,
            low: first + Limits.minSpacing,
            high: last - Limits.minSpacing,
            &rng
        )
        return [first] + middle + [last]
    }

    private static func pickCheckpointKind(
        avoiding previous: ChallengeKind?, _ rng: inout SeededRNG
    ) -> ChallengeKind {
        // Consecutive checkpoints must differ, or the ladder itself becomes the thing you autopilot.
        let candidates = ChallengeKind.allCases
            .filter { $0.suitableAsCheckpoint && $0 != previous }
        return rng.pick(candidates.isEmpty
            ? ChallengeKind.allCases.filter(\.suitableAsCheckpoint)
            : candidates)
    }

    // MARK: - Invariants

    /// Everything that must hold for a ladder to be safe to schedule. Violations here are the
    /// difference between a feature that helps and one that gets the app deleted.
    public static func violatesInvariants(_ ladder: VerificationLadder) -> Bool {
        guard ladder.mode != .off else { return !ladder.checkpoints.isEmpty }
        if ladder.checkpoints.isEmpty { return true }

        // Strictly increasing, adequately spaced, inside the window.
        var previous: TimeInterval = -.infinity
        for checkpoint in ladder.checkpoints {
            if checkpoint.offset <= previous { return true }
            if previous > -.infinity, checkpoint.offset - previous < Limits.minSpacing {
                return true
            }
            if checkpoint.offset > ladder.window { return true }
            previous = checkpoint.offset
        }
        if ladder.checkpoints[0].offset < Limits.minFirstOffset { return true }

        // Escalation never softens.
        for i in 1..<ladder.checkpoints.count
        where ladder.checkpoints[i].escalation < ladder.checkpoints[i - 1].escalation {
            return true
        }

        // The ladder must end at full strength.
        if ladder.checkpoints.last?.escalation != .fullAlarm { return true }

        // No two consecutive challenges of the same kind.
        for i in 1..<ladder.checkpoints.count {
            guard let a = ladder.checkpoints[i - 1].challenge?.kind,
                  let b = ladder.checkpoints[i].challenge?.kind else { continue }
            if a == b { return true }
        }

        // Checkpoint challenges must be short, and must be kinds suited to interrupting someone.
        for checkpoint in ladder.checkpoints {
            guard let challenge = checkpoint.challenge else { continue }
            if !challenge.kind.suitableAsCheckpoint { return true }
            if ChallengeSpec.violatesLimits(challenge) { return true }
        }

        return false
    }

    // MARK: - Novelty

    var featureVector: [Double] {
        var v = Mode.allCases.map { $0 == mode ? Weights.mode : 0 }
        v.append(Double(checkpoints.count) / 6.0 * Weights.count)
        // Normalised offsets, padded to a fixed rank so vectors stay comparable across ladders of
        // different lengths.
        let normalised = checkpoints.map { window > 0 ? $0.offset / window : 0 }
        for i in 0..<6 {
            v.append((i < normalised.count ? normalised[i] : 0) * Weights.timing)
        }
        return v
    }

    enum Weights {
        static let mode = 0.6, count = 0.5, timing = 0.45
    }
}
