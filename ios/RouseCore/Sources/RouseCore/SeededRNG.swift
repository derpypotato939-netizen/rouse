import Foundation

/// SplitMix64. Chosen over `SystemRandomNumberGenerator` because every sound in Rouse
/// must be reproducible: the same seed has to yield a byte-identical buffer on any device,
/// forever. That is what lets a sound be shared as a number ("Sound #4,281") and what makes
/// the determinism test in `RouseCoreTests` meaningful.
public struct SeededRNG: RandomNumberGenerator, Sendable {
    private var state: UInt64

    public init(seed: UInt64) {
        // Avoid the all-zero state, which is a weak starting point for SplitMix64.
        self.state = seed == 0 ? 0x9E37_79B9_7F4A_7C15 : seed
    }

    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }

    // MARK: - Convenience

    /// Uniform in `[low, high)`.
    public mutating func double(_ low: Double, _ high: Double) -> Double {
        // 53 bits of mantissa is the most a Double can faithfully hold.
        let unit = Double(next() >> 11) * (1.0 / 9_007_199_254_740_992.0)
        return low + unit * (high - low)
    }

    public mutating func int(_ range: Range<Int>) -> Int {
        precondition(!range.isEmpty, "empty range")
        return range.lowerBound + Int(next() % UInt64(range.count))
    }

    public mutating func pick<T>(_ items: [T]) -> T {
        precondition(!items.isEmpty, "empty collection")
        return items[int(0..<items.count)]
    }

    /// Returns `true` with probability `p`.
    public mutating func chance(_ p: Double) -> Bool {
        double(0, 1) < p
    }
}

/// FNV-1a, 64-bit. Used instead of CryptoKit's SHA-256 so `RouseCore` stays dependency-free
/// and portable. The seed is not a security boundary — it only needs to scatter well.
public enum SeedHash {
    public static func hash(_ string: String) -> UInt64 {
        var h: UInt64 = 0xCBF2_9CE4_8422_2325
        for byte in string.utf8 {
            h ^= UInt64(byte)
            h &*= 0x0000_0100_0000_01B3
        }
        return h
    }

    /// The seed for a given user on a given day. `userSalt` is a per-install UUID string, so
    /// two people never share a morning, and one person never repeats a day.
    public static func daily(userSalt: String, dayKey: String) -> UInt64 {
        hash("\(userSalt)|\(dayKey)")
    }
}
