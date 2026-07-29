import Foundation

/// Trial sequencing and scoring for the wake check. Ported from the reaction-time + go/no-go
/// engine already proven in the TeenInjury codebase (`src/components/screen/CognitiveScreen.tsx`),
/// with the timing loop left to the app layer and everything decidable kept here so it can be
/// tested without a device.
public enum WakeCheck {
    public static let rtTrials = 5
    public static let goNoGoTrials = 16
    /// Proportion of go/no-go trials that are no-go. Too few and inhibition is never tested;
    /// too many and the "go" response never becomes prepotent, which is the whole point.
    public static let noGoShare = 0.25

    /// Anything faster than this is anticipation, not perception — the participant guessed.
    public static let minimumValidMs = 120.0
    /// Beyond this the trial is treated as a miss rather than a very slow response.
    public static let timeoutMs = 3000.0

    public enum Trial: String, Equatable, Codable, Sendable {
        case go, noGo
    }

    /// Interval before the stimulus appears. Randomised so the response cannot be timed by rhythm.
    public static func stimulusDelayMs(_ rng: inout SeededRNG) -> Double {
        rng.double(1100, 2800)
    }

    /// Builds the go/no-go sequence. The first two trials are always `go` so the prepotent
    /// response is established before inhibition is ever tested.
    public static func sequence(_ rng: inout SeededRNG) -> [Trial] {
        let noGoCount = Int((Double(goNoGoTrials) * noGoShare).rounded())
        var trials: [Trial] = Array(repeating: .go, count: goNoGoTrials - noGoCount)
            + Array(repeating: .noGo, count: noGoCount)

        // Fisher-Yates with the seeded RNG, so a sequence is reproducible in tests.
        for i in stride(from: trials.count - 1, to: 0, by: -1) {
            let j = rng.int(0..<(i + 1))
            trials.swapAt(i, j)
        }

        // Force the opening two to be `go`, swapping any no-go outward rather than regenerating.
        for i in 0..<2 where trials[i] == .noGo {
            if let swapIndex = trials[2...].firstIndex(of: .go) {
                trials.swapAt(i, swapIndex)
            }
        }
        return trials
    }

    /// One recorded response. `nil` reaction time means no press occurred.
    public struct Response: Equatable, Sendable {
        public let trial: Trial
        public let reactionMs: Double?
        public init(trial: Trial, reactionMs: Double?) {
            self.trial = trial
            self.reactionMs = reactionMs
        }
    }

    public struct Result: Equatable, Sendable {
        /// Mean RT across valid go responses.
        public let meanGoMs: Double
        /// Presses on no-go trials — inhibition failures.
        public let commissions: Int
        /// Missed go trials.
        public let omissions: Int
        public let noGoTrials: Int
        /// Responses discarded as anticipation.
        public let anticipations: Int
    }

    public static func score(_ responses: [Response]) -> Result {
        var goTimes: [Double] = []
        var commissions = 0, omissions = 0, noGoTrials = 0, anticipations = 0

        for r in responses {
            switch r.trial {
            case .go:
                guard let ms = r.reactionMs else { omissions += 1; continue }
                if ms < minimumValidMs { anticipations += 1 }
                else if ms <= timeoutMs { goTimes.append(ms) }
                else { omissions += 1 }
            case .noGo:
                noGoTrials += 1
                if let ms = r.reactionMs, ms >= minimumValidMs, ms <= timeoutMs {
                    commissions += 1
                }
            }
        }

        // A morning where every go trial was missed still has to produce a number. Falling back
        // to the timeout is the honest reading: no valid response is the slowest possible result.
        let mean = goTimes.isEmpty
            ? timeoutMs
            : goTimes.reduce(0, +) / Double(goTimes.count)

        return Result(meanGoMs: mean, commissions: commissions, omissions: omissions,
                      noGoTrials: noGoTrials, anticipations: anticipations)
    }
}
