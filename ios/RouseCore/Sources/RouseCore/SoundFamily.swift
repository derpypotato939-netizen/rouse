import Foundation

/// A named region of genome space. Families are the bandit's arms: the learner chooses a family,
/// then `GenomeSampler` randomises freely inside it. That split is what lets Rouse be personalised
/// and never-repeating at once — the *kind* of sound adapts to you, the sound itself never recurs.
///
/// Names are user-facing: the Trends screen says things like "your brain responds best to rising
/// bell timbres at 92 BPM," which is only meaningful if the families are nameable.
public struct SoundFamily: Equatable, Codable, Sendable, Identifiable {
    public struct TempoBand: Equatable, Codable, Sendable {
        public let name: String
        public let low: Double
        public let high: Double
    }

    public let id: String
    public let displayName: String
    public let modes: [Mode]
    public let contour: Contour
    /// 0 = near-sine and dark, 1 = bell-like and bright.
    public let brightness: Double
    public let tempoBand: TempoBand

    // MARK: Tempo bands

    public static let slow = TempoBand(name: "slow", low: 56, high: 76)
    public static let mid  = TempoBand(name: "mid",  low: 76, high: 98)
    public static let fast = TempoBand(name: "fast", low: 98, high: 120)
    public static let tempoBands = [slow, mid, fast]

    // MARK: Timbre archetypes

    /// Eight archetypes chosen to span the perceptual space rather than the parameter space —
    /// two families should never be confusable by ear.
    public struct Archetype: Sendable {
        let id: String, name: String, modes: [Mode], contour: Contour, brightness: Double
    }

    public static let archetypes: [Archetype] = [
        .init(id: "glass",  name: "Glass",  modes: [.lydian, .ionian],           contour: .rising,      brightness: 0.95),
        .init(id: "bell",   name: "Bell",   modes: [.pentatonic, .ionian],       contour: .rising,      brightness: 0.75),
        .init(id: "reed",   name: "Reed",   modes: [.dorian, .mixolydian],       contour: .arch,        brightness: 0.55),
        .init(id: "hollow", name: "Hollow", modes: [.dorian, .pentatonic],       contour: .oscillating, brightness: 0.20),
        .init(id: "chime",  name: "Chime",  modes: [.pentatonic, .lydian],       contour: .arch,        brightness: 0.85),
        .init(id: "drone",  name: "Drone",  modes: [.harmonicMinor, .dorian],    contour: .oscillating, brightness: 0.35),
        .init(id: "pluck",  name: "Pluck",  modes: [.mixolydian, .pentatonic],   contour: .rising,      brightness: 0.60),
        .init(id: "swell",  name: "Swell",  modes: [.ionian, .harmonicMinor],    contour: .arch,        brightness: 0.30),
    ]

    /// All 24 arms: 8 archetypes × 3 tempo bands.
    public static let all: [SoundFamily] = archetypes.flatMap { archetype in
        tempoBands.map { band in
            SoundFamily(
                id: "\(archetype.id).\(band.name)",
                displayName: "\(archetype.name), \(band.name)",
                modes: archetype.modes,
                contour: archetype.contour,
                brightness: archetype.brightness,
                tempoBand: band
            )
        }
    }

    public static func family(id: String) -> SoundFamily? {
        all.first { $0.id == id }
    }
}
