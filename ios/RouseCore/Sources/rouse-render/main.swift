import Foundation
import RouseCore

// Renders a run of consecutive mornings to .wav so the engine can be auditioned before any of the
// iOS layer exists. Doubles as the Phase 1 content asset: this is the "30 days of sounds" post.
//
//   swift run rouse-render --days 30 --out ./out
//   swift run rouse-render --days 7 --seconds 29 --salt jasper --simulate-learning

struct Options {
    var days = 10
    var seconds = 29.0
    var salt = "demo-user"
    var outDir = "./out"
    var simulateLearning = false
}

func parseOptions() -> Options {
    var o = Options()
    var args = Array(CommandLine.arguments.dropFirst())
    while let flag = args.first {
        args.removeFirst()
        func value() -> String? {
            guard let v = args.first, !v.hasPrefix("--") else { return nil }
            args.removeFirst()
            return v
        }
        switch flag {
        case "--days":              o.days = value().flatMap(Int.init) ?? o.days
        case "--seconds":           o.seconds = value().flatMap(Double.init) ?? o.seconds
        case "--salt":              o.salt = value() ?? o.salt
        case "--out":               o.outDir = value() ?? o.outDir
        case "--simulate-learning": o.simulateLearning = true
        case "--help", "-h":
            print("""
            rouse-render — audition the Rouse sound engine

              --days N              mornings to generate (default 10)
              --seconds S           length of each render (default 29, AlarmKit's cap)
              --salt STRING         per-user seed salt (default "demo-user")
              --out DIR             output directory (default ./out)
              --simulate-learning   feed the bandit synthetic rewards so family choice adapts
            """)
            exit(0)
        default:
            FileHandle.standardError.write(Data("unknown flag: \(flag)\n".utf8))
            exit(2)
        }
    }
    return o
}

/// Top-level code cannot propagate errors, so every throwing call is funnelled through here.
func failing<T>(_ what: String, _ body: () throws -> T) -> T {
    do { return try body() } catch {
        FileHandle.standardError.write(Data("rouse-render: \(what) failed — \(error)\n".utf8))
        exit(1)
    }
}

let options = parseOptions()
let outURL = URL(fileURLWithPath: options.outDir)
failing("creating \(outURL.path)") {
    try FileManager.default.createDirectory(at: outURL, withIntermediateDirectories: true)
}

var learner = Rouse.Learner()
var history: [WakeProtocol] = []
let synth = Synth()

/// Stands in for a real user until there is real data. This user genuinely wakes better to bright,
/// faster sounds — so if the bandit is working, its family choices should drift that way.
func syntheticReward(for family: SoundFamily, rng: inout SeededRNG) -> Double {
    let brightnessFit = family.brightness
    let tempoFit = (family.tempoBand.low - 56) / 64.0
    let signal = 0.35 + 0.4 * brightnessFit + 0.25 * tempoFit
    return min(max(signal + rng.double(-0.12, 0.12), 0), 1)
}

print("Rouse — rendering \(options.days) mornings at \(Int(options.seconds))s\n")
print(String(format: "%-5@ %-8@ %-16@ %-14@ %-6@ %-9@ %@",
             "day" as NSString, "serial" as NSString, "family" as NSString,
             "challenge" as NSString, "bpm" as NSString, "novelty" as NSString, "file" as NSString))
print(String(repeating: "─", count: 84))

var rewardRNG = SeededRNG(seed: 99)
var fallbacks = 0

for day in 0..<options.days {
    let date = Calendar.current.date(byAdding: .day, value: day, to: Date()) ?? Date()
    let dayKey = Rouse.dayKey(for: date)
    let weekday = Calendar.current.component(.weekday, from: date)
    let context = Bandit.Context(hour: 7, minute: 0, isWeekend: weekday == 1 || weekday == 7)

    let plan = Rouse.nextMorning(
        userSalt: options.salt, dayKey: dayKey,
        context: context, learner: learner,
        ladderMode: .standard, history: history
    )

    let buffer = synth.render(plan.sound, seconds: options.seconds, seed: UInt64(day))
    let name = String(format: "day%02d-%@-%05d.wav", day + 1, plan.family.id, plan.serial)
    failing("writing \(name)") {
        try WavWriter.write(buffer, to: outURL.appendingPathComponent(name))
    }

    if plan.usedFallback { fallbacks += 1 }
    let novelty = plan.nearestDistance.isFinite
        ? String(format: "%.2f", plan.nearestDistance) : "—"

    print(String(format: "%-5d %-8d %-16@ %-14@ %-6.0f %-9@ %@",
                 day + 1, plan.serial, plan.family.id as NSString,
                 plan.challenge.kind.rawValue as NSString,
                 plan.sound.bpm, novelty as NSString, name as NSString))

    history.insert(plan.wakeProtocol, at: 0)

    if options.simulateLearning {
        let reward = syntheticReward(for: plan.family, rng: &rewardRNG)
        learner.observe(soundFamily: plan.family.id, challengeKind: plan.challenge.kind,
                        context: context, reward: reward)
    }
}

print("\nWrote \(options.days) files to \(outURL.path)")
print("Novelty threshold \(ProtocolSampler.noveltyThreshold) — fallbacks used: \(fallbacks)/\(options.days)")

if options.simulateLearning {
    let context = Bandit.Context(window: .standard, isWeekend: false)
    print("\nSound bandit after \(learner.totalObservations) observations (top 5):")
    for entry in learner.sound.rankedArms(SoundFamily.all.map(\.id), context: context).prefix(5) {
        print(String(format: "  %-18@ mean %.3f  (n=%d)", entry.arm as NSString, entry.mean, entry.n))
    }
    print("\nChallenge bandit:")
    let kinds = ChallengeKind.allCases.map(\.rawValue)
    for entry in learner.challenge.rankedArms(kinds, context: context) {
        print(String(format: "  %-18@ mean %.3f  (n=%d)", entry.arm as NSString, entry.mean, entry.n))
    }
}
