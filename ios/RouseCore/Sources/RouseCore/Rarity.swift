import Foundation

/// Rarity, derived from traits you can actually hear.
///
/// **This must stay identical to `rarityFor` in `web/src/lib/engine.ts`.** The two engines share a
/// promise: a given seed produces the same sound *and the same tier* everywhere. A Legendary on the
/// website that arrives as a Rare in the app would be worse than having no tiers at all.
///
/// ## Why not distance-from-mean
///
/// The obvious approach — how far a genome sits from the population average in feature space — was
/// measured and rejected. Across 100,000 samples the distance ranged only 1.47 to 2.14, with the
/// 55th and 99th percentiles just 0.23 apart. That is distance concentration: in 45 dimensions
/// almost everything is roughly equidistant from the mean. A "Legendary" would have been
/// statistically distinguishable and *audibly identical* to a Common — and since these sounds are
/// played out loud, users would have worked that out in about four pulls.
///
/// ## What this does instead
///
/// Counts how many independently unusual characteristics a sound has, each one something a listener
/// could point at. Rarity is then genuinely rare (the traits are near-independent, so probabilities
/// multiply) *and* genuinely audible (four unusual traits at once sounds unusual).
///
/// Measured incidence over 100,000 samples, asserted by `tools/verify-rarity.mjs`:
/// Common 30% · Uncommon 40% · Rare 22% · Epic 6.6% (1 in 15) · Legendary 1.3% (1 in 78).
public enum Rarity: String, CaseIterable, Codable, Sendable, Comparable {
    case common = "Common"
    case uncommon = "Uncommon"
    case rare = "Rare"
    case epic = "Epic"
    case legendary = "Legendary"

    private var rank: Int {
        switch self {
        case .common: return 0
        case .uncommon: return 1
        case .rare: return 2
        case .epic: return 3
        case .legendary: return 4
        }
    }

    public static func < (a: Rarity, b: Rarity) -> Bool { a.rank < b.rank }
}

public struct RarityResult: Equatable, Sendable {
    public let tier: Rarity
    /// The unusual traits this sound actually has, in user-facing language.
    ///
    /// Shown to the user deliberately: a tier that cannot justify itself is a tier nobody believes,
    /// and these sounds are audible enough that an unjustified claim gets caught immediately.
    public let traits: [String]
}

public extension Genome {

    /// A named, audible peculiarity, and whether this genome has it.
    private struct Trait {
        let test: (Genome) -> Bool
        let label: (Genome) -> String
    }

    private static var traits: [Trait] {
        [
            Trait(
                test: { $0.spectralCentroid > 1100 || $0.spectralCentroid < 380 },
                label: { $0.spectralCentroid > 1100 ? "piercing" : "subterranean" }
            ),
            Trait(
                test: { $0.bpm > 112 || $0.bpm < 62 },
                label: { $0.bpm > 112 ? "breakneck" : "glacial" }
            ),
            Trait(test: { $0.accel > 19 }, label: { _ in "accelerating" }),
            Trait(test: { $0.decay > 2.4 }, label: { _ in "endless tail" }),
            Trait(
                test: { abs($0.sweepEnd - $0.sweepStart) > 6200 },
                label: { $0.sweepEnd > $0.sweepStart ? "opening up" : "closing down" }
            ),
            Trait(
                test: { $0.subdivision.nonzeroBitCount > 10 || $0.subdivision.nonzeroBitCount <= 2 },
                label: { $0.subdivision.nonzeroBitCount > 10 ? "frantic" : "skeletal" }
            ),
            Trait(test: { $0.space > 0.82 }, label: { _ in "cavernous" }),
        ]
    }

    var rarity: RarityResult {
        let matched = Genome.traits.filter { $0.test(self) }.map { $0.label(self) }
        let tier: Rarity
        switch matched.count {
        case 0: tier = .common
        case 1: tier = .uncommon
        case 2: tier = .rare
        case 3: tier = .epic
        default: tier = .legendary
        }
        return RarityResult(tier: tier, traits: matched)
    }
}
