import Foundation

/// Contextual Thompson sampling over the 24 sound families.
///
/// The hard constraint here is data volume: one user produces one observation per day, so a naive
/// per-context table would never leave cold start. Instead each arm keeps a global posterior and a
/// per-context posterior, and the global one is blended in with weight that decays as context
/// evidence accumulates — the pooling idea from IntelligentPooling (arXiv:2008.01571), which is
/// designed for exactly this limited-data mHealth regime.
public struct Bandit: Codable, Sendable {

    // MARK: - Context

    /// Deliberately coarse. Six buckets over one observation per day is already slow to fill;
    /// finer context would look sophisticated and learn nothing.
    public struct Context: Hashable, Codable, Sendable {
        public enum WakeWindow: String, Codable, Sendable, CaseIterable {
            case early, standard, late
        }
        public let window: WakeWindow
        public let isWeekend: Bool

        public init(window: WakeWindow, isWeekend: Bool) {
            self.window = window
            self.isWeekend = isWeekend
        }

        public init(hour: Int, minute: Int = 0, isWeekend: Bool) {
            let minutes = hour * 60 + minute
            let window: WakeWindow = minutes < 390 ? .early : (minutes <= 480 ? .standard : .late)
            self.init(window: window, isWeekend: isWeekend)
        }

        var key: String { "\(window.rawValue)|\(isWeekend)" }
    }

    // MARK: - Posterior

    struct Beta: Codable, Sendable {
        var alpha: Double
        var beta: Double
        var count: Int

        /// Weakly informative prior centred slightly optimistic, which encourages early
        /// exploration without asserting knowledge we do not have.
        static let prior = Beta(alpha: 1.2, beta: 1.0, count: 0)

        mutating func update(reward: Double) {
            let r = min(max(reward, 0), 1)
            alpha += r
            beta += 1 - r
            count += 1
        }
    }

    private var global: [String: Beta] = [:]
    private var contextual: [String: [String: Beta]] = [:]

    public init() {}

    // MARK: - Selection

    /// Picks the next arm by Thompson sampling. `rng` is injected so the choice is reproducible
    /// under test.
    ///
    /// Arms are plain strings rather than a concrete type because Rouse runs *two* independent
    /// bandits — one over sound families, one over challenge kinds. A joint bandit over their
    /// product would have 120 arms against one observation per day and would never leave cold
    /// start; factoring the action space is what makes the learner viable at this data rate.
    public func select(arms: [String], context: Context, rng: inout SeededRNG) -> String {
        precondition(!arms.isEmpty, "cannot select from an empty arm set")
        var best = arms[0]
        var bestSample = -Double.infinity

        for arm in arms {
            let posterior = blended(family: arm, context: context)
            let sample = Bandit.sampleBeta(alpha: posterior.alpha, beta: posterior.beta, rng: &rng)
            if sample > bestSample {
                bestSample = sample
                best = arm
            }
        }
        return best
    }

    /// Combines the context-specific posterior with the pooled one. The pooled contribution is
    /// scaled by `1/(1+n)`, so it dominates on day one and fades to irrelevance as the context
    /// fills in.
    func blended(family: String, context: Context) -> (alpha: Double, beta: Double) {
        let ctx = contextual[context.key]?[family] ?? .prior
        let glob = global[family] ?? .prior
        let shrink = 1.0 / (1.0 + Double(ctx.count))
        return (ctx.alpha + shrink * glob.alpha, ctx.beta + shrink * glob.beta)
    }

    // MARK: - Learning

    public mutating func observe(arm: String, context: Context, reward: Double) {
        var g = global[arm] ?? .prior
        g.update(reward: reward)
        global[arm] = g

        var byArm = contextual[context.key] ?? [:]
        var c = byArm[arm] ?? .prior
        c.update(reward: reward)
        byArm[arm] = c
        contextual[context.key] = byArm
    }

    // MARK: - Reporting

    /// Posterior mean per arm, for the Trends screen. Only arms with observations appear — showing
    /// a prior as if it were a finding would be misleading, and the Trends screen is the one place
    /// the app makes claims about the user.
    public func rankedArms(
        _ arms: [String], context: Context
    ) -> [(arm: String, mean: Double, n: Int)] {
        arms.compactMap { arm in
            let ctx = contextual[context.key]?[arm]
            let glob = global[arm]
            let n = (ctx?.count ?? 0) + (glob?.count ?? 0)
            guard n > 0 else { return nil }
            let p = blended(family: arm, context: context)
            return (arm, p.alpha / (p.alpha + p.beta), ctx?.count ?? 0)
        }
        .sorted { $0.mean > $1.mean }
    }

    public var totalObservations: Int {
        global.values.reduce(0) { $0 + $1.count }
    }

    // MARK: - Sampling primitives

    /// Beta(a,b) via the ratio of two Gamma draws.
    static func sampleBeta(alpha: Double, beta: Double, rng: inout SeededRNG) -> Double {
        let x = sampleGamma(shape: alpha, rng: &rng)
        let y = sampleGamma(shape: beta, rng: &rng)
        let total = x + y
        return total > 0 ? x / total : 0.5
    }

    /// Marsaglia–Tsang. Shapes below 1 are boosted then corrected, which the method requires.
    static func sampleGamma(shape: Double, rng: inout SeededRNG) -> Double {
        guard shape > 0 else { return 0 }
        if shape < 1 {
            let u = max(rng.double(0, 1), .leastNormalMagnitude)
            return sampleGamma(shape: shape + 1, rng: &rng) * pow(u, 1.0 / shape)
        }
        let d = shape - 1.0 / 3.0
        let c = 1.0 / sqrt(9 * d)
        while true {
            let z = sampleNormal(rng: &rng)
            let v = pow(1 + c * z, 3)
            guard v > 0 else { continue }
            let u = rng.double(0, 1)
            if u < 1 - 0.0331 * pow(z, 4) { return d * v }
            if log(u) < 0.5 * z * z + d * (1 - v + log(v)) { return d * v }
        }
    }

    /// Box–Muller.
    static func sampleNormal(rng: inout SeededRNG) -> Double {
        let u1 = max(rng.double(0, 1), .leastNormalMagnitude)
        let u2 = rng.double(0, 1)
        return sqrt(-2 * log(u1)) * cos(2 * .pi * u2)
    }
}
