import XCTest
@testable import RouseCore

// MARK: - Determinism

final class DeterminismTests: XCTestCase {

    /// The product claim "Sound #4,281" only means anything if a serial reproduces the same audio
    /// on any device, forever. This is the test that keeps that claim honest.
    func testSameSeedProducesIdenticalAudio() {
        let seed = SeedHash.daily(userSalt: "user-a", dayKey: "2026-07-27")
        let a = GenomeSampler.sample(seed: seed).genome
        let b = GenomeSampler.sample(seed: seed).genome
        XCTAssertEqual(a, b)

        let synth = Synth()
        let bufA = synth.render(a, seconds: 2.0, seed: 7)
        let bufB = synth.render(b, seconds: 2.0, seed: 7)
        XCTAssertEqual(bufA.left, bufB.left)
        XCTAssertEqual(bufA.right, bufB.right)
    }

    func testDifferentDaysProduceDifferentSounds() {
        let a = GenomeSampler.sample(seed: SeedHash.daily(userSalt: "u", dayKey: "2026-07-27")).genome
        let b = GenomeSampler.sample(seed: SeedHash.daily(userSalt: "u", dayKey: "2026-07-28")).genome
        XCTAssertNotEqual(a, b)
    }

    func testDifferentUsersNeverShareAMorning() {
        let key = "2026-07-27"
        let a = GenomeSampler.sample(seed: SeedHash.daily(userSalt: "user-a", dayKey: key)).genome
        let b = GenomeSampler.sample(seed: SeedHash.daily(userSalt: "user-b", dayKey: key)).genome
        XCTAssertNotEqual(a, b)
    }

    func testRNGIsUniformEnough() {
        var rng = SeededRNG(seed: 12345)
        var buckets = [Int](repeating: 0, count: 10)
        for _ in 0..<100_000 {
            buckets[min(Int(rng.double(0, 1) * 10), 9)] += 1
        }
        // Each bucket should hold ~10_000. A 15% band catches real bias without being flaky.
        for count in buckets {
            XCTAssertGreaterThan(count, 8_500)
            XCTAssertLessThan(count, 11_500)
        }
    }
}

// MARK: - Anti-habituation

final class NoveltyTests: XCTestCase {

    /// The core product mechanism. Walk 365 consecutive mornings against a rolling 30-day history
    /// and assert every sound clears the novelty threshold.
    func testAYearOfMorningsStaysNovel() {
        var history: [Genome] = []
        var fallbacks = 0
        var minimumObserved = Double.infinity

        for day in 0..<365 {
            let seed = SeedHash.daily(userSalt: "novelty-user", dayKey: "day-\(day)")
            let draw = GenomeSampler.sample(seed: seed, avoiding: history)

            if !history.isEmpty {
                let nearest = history.prefix(GenomeSampler.historyDepth)
                    .map { draw.genome.distance(to: $0) }.min() ?? .infinity
                minimumObserved = min(minimumObserved, nearest)
            }
            if draw.usedFallback { fallbacks += 1 }
            history.insert(draw.genome, at: 0)
        }

        // Measured over a simulated year: with the centroid rails the sampler clears the threshold
        // on ~1.1 attempts and never falls back. Allowing a handful leaves headroom without
        // letting a regression through — an earlier rail bug produced starvation, and this is the
        // assertion that would have caught it.
        XCTAssertLessThanOrEqual(fallbacks, 5, "sampler is starving — check the safety rails")
        XCTAssertGreaterThan(minimumObserved, 0.85, "two mornings landed audibly close together")
    }

    /// Regression guard for the rail bug: if any single rail rejects most candidates, the sampler
    /// burns its whole attempt budget and the bandit's arms starve.
    func testSafetyRailsAcceptMostDraws() {
        var accepted = 0
        let total = 5_000
        for seed in 0..<total where !GenomeSampler.violatesSafetyRails(
            GenomeSampler.sample(seed: UInt64(seed)).genome
        ) {
            accepted += 1
        }
        XCTAssertGreaterThan(Double(accepted) / Double(total), 0.95)
    }

    /// Every one of the bandit's 24 arms has to be reachable. An arm that can never be sampled is
    /// an arm the learner can never evaluate.
    func testEveryFamilyIsSamplable() {
        for family in SoundFamily.all {
            var accepted = 0
            let attempts = 300
            for i in 0..<attempts {
                let seed = SeedHash.hash("\(family.id)-\(i)")
                let draw = GenomeSampler.sample(seed: seed, family: family)
                if !draw.usedFallback && !GenomeSampler.violatesSafetyRails(draw.genome) {
                    accepted += 1
                }
            }
            XCTAssertGreaterThan(Double(accepted) / Double(attempts), 0.5,
                                 "family \(family.id) is starved")
        }
    }

    func testNoveltyRejectsAnIdenticalGenome() {
        let seed = SeedHash.daily(userSalt: "u", dayKey: "d")
        let original = GenomeSampler.sample(seed: seed).genome
        // Sampling against a history containing itself must not return it again.
        let second = GenomeSampler.sample(seed: seed, avoiding: [original]).genome
        XCTAssertNotEqual(original, second)
    }

    func testDistanceIsZeroToItselfAndSymmetric() {
        let a = GenomeSampler.sample(seed: 1).genome
        let b = GenomeSampler.sample(seed: 2).genome
        XCTAssertEqual(a.distance(to: a), 0, accuracy: 1e-9)
        XCTAssertEqual(a.distance(to: b), b.distance(to: a), accuracy: 1e-9)
    }

    /// Sampling must terminate even when asked for the impossible.
    func testTerminatesAgainstAHostileHistory() {
        var history: [Genome] = []
        for i in 0..<200 { history.append(GenomeSampler.sample(seed: UInt64(i)).genome) }
        let draw = GenomeSampler.sample(seed: 999, avoiding: history)
        XCTAssertLessThanOrEqual(draw.attempts, GenomeSampler.maxAttempts)
        XCTAssertFalse(GenomeSampler.violatesSafetyRails(draw.genome))
    }
}

// MARK: - Melodic safety rails

final class SafetyRailTests: XCTestCase {

    /// Randomisation must never wander into "jarring." McFarlane et al. (2020) is the reason:
    /// melodic waking sounds clear sleep inertia better than harsh ones, so a random sound that
    /// happens to be unpleasant is a product failure, not a fun surprise.
    func testTenThousandDrawsAreAllMelodicAndAudible() {
        for seed in 0..<10_000 {
            let g = GenomeSampler.sample(seed: UInt64(seed)).genome

            XCTAssertFalse(
                GenomeSampler.forbiddenOpeningIntervals.contains(g.openingInterval),
                "seed \(seed) opened on a dissonant interval (\(g.openingInterval) semitones)"
            )

            let centroid = g.spectralCentroid
            XCTAssertTrue((GenomeSampler.centroidLow...GenomeSampler.centroidHigh).contains(centroid),
                          "seed \(seed) put its energy at \(Int(centroid)) Hz")

            XCTAssertGreaterThanOrEqual(g.partials[0], 0.35, "seed \(seed) lost its fundamental")
            XCTAssertGreaterThanOrEqual(min(g.sweepStart, g.sweepEnd), g.root,
                                        "seed \(seed) filtered out its own melody")
        }
    }

    /// `Entrance.sudden` shapes the first note's attack, never its level. A sound arriving at full
    /// volume causes a startle response, which is precisely what Rouse exists to avoid.
    func testMacroRampAppliesEvenToASuddenEntrance() {
        var genome = GenomeSampler.sample(seed: 42).genome
        genome.entrance = .sudden

        let synth = Synth()
        XCTAssertEqual(synth.macroRamp(0), 0, accuracy: 1e-9)
        XCTAssertLessThan(synth.macroRamp(1.0), 0.10)
        XCTAssertEqual(synth.macroRamp(Synth.macroRampSeconds), 1.0, accuracy: 1e-9)
        XCTAssertEqual(synth.macroRamp(60), 1.0, accuracy: 1e-9)

        // And it shows up in real audio: the opening second must be far quieter than the body.
        let buffer = synth.render(genome, seconds: 12, seed: 3)
        let firstSecond = buffer.left.prefix(Int(Synth.sampleRate)).map(abs).max() ?? 0
        let later = buffer.left.dropFirst(Int(Synth.sampleRate * 9)).map(abs).max() ?? 0
        XCTAssertLessThan(firstSecond, later * 0.5,
                          "the sound arrived too loud, too fast")
    }

    func testRampIsMonotonic() {
        let synth = Synth()
        var previous = -1.0
        for step in 0...200 {
            let value = synth.macroRamp(Double(step) / 200.0 * Synth.macroRampSeconds)
            XCTAssertGreaterThanOrEqual(value, previous)
            previous = value
        }
    }
}

// MARK: - Synthesis

final class SynthTests: XCTestCase {

    func testRenderProducesAudibleNonClippingStereo() {
        let synth = Synth()
        for seed in 0..<25 {
            let g = GenomeSampler.sample(seed: UInt64(seed)).genome
            let buffer = synth.render(g, seconds: 12, seed: UInt64(seed))

            XCTAssertEqual(buffer.frameCount, Int(12 * Synth.sampleRate))

            let peak = buffer.left.map(abs).max() ?? 0
            XCTAssertGreaterThan(peak, 0.2, "seed \(seed) rendered near-silence")
            XCTAssertLessThanOrEqual(peak, 1.0, "seed \(seed) clipped")

            for sample in buffer.left { XCTAssertFalse(sample.isNaN || sample.isInfinite) }
        }
    }

    /// Tempo rises linearly, so step times must follow the integral of the tempo curve. If this is
    /// wrong the acceleration lurches instead of gliding.
    func testAcceleratingPulseHasShrinkingIntervals() {
        var g = GenomeSampler.sample(seed: 5).genome
        g.bpm = 60
        g.accel = 20

        let synth = Synth()
        let times = (0...16).map { synth.timeOfStep($0, g: g) }
        var previousGap = Double.infinity
        for i in 1..<times.count {
            let gap = times[i] - times[i - 1]
            XCTAssertGreaterThan(gap, 0, "steps must advance")
            XCTAssertLessThan(gap, previousGap, "tempo failed to accelerate at step \(i)")
            previousGap = gap
        }
    }

    func testConstantTempoIsEvenlySpaced() {
        var g = GenomeSampler.sample(seed: 6).genome
        g.bpm = 120
        g.accel = 0

        let synth = Synth()
        // 120 BPM, sixteenth notes -> 0.125 s per step.
        XCTAssertEqual(synth.timeOfStep(1, g: g) - synth.timeOfStep(0, g: g), 0.125, accuracy: 1e-9)
        XCTAssertEqual(synth.timeOfStep(9, g: g) - synth.timeOfStep(8, g: g), 0.125, accuracy: 1e-9)
    }

    func testWavHeaderIsWellFormed() {
        let g = GenomeSampler.sample(seed: 11).genome
        let buffer = Synth().render(g, seconds: 1, seed: 1)
        let data = WavWriter.data(buffer)

        XCTAssertEqual(String(decoding: data[0..<4], as: UTF8.self), "RIFF")
        XCTAssertEqual(String(decoding: data[8..<12], as: UTF8.self), "WAVE")
        XCTAssertEqual(String(decoding: data[12..<16], as: UTF8.self), "fmt ")
        XCTAssertEqual(String(decoding: data[36..<40], as: UTF8.self), "data")
        XCTAssertEqual(data.count, 44 + buffer.frameCount * 4)
    }
}

// MARK: - Wake Score

final class WakeScoreTests: XCTestCase {

    private func measurement(
        rt: Double = 320, baseline: Double = 280, commissions: Int = 1,
        dismiss: Double = 20, motion: Double = 0.6, snoozes: Int = 0
    ) -> WakeMeasurement {
        WakeMeasurement(reactionTimeMs: rt, baselineMs: baseline, commissions: commissions,
                        noGoTrials: 4, dismissSeconds: dismiss, motionIndex: motion,
                        snoozes: snoozes)
    }

    func testScoreStaysInRange() {
        for rt in stride(from: 200.0, through: 3000.0, by: 100) {
            for snoozes in 0...5 {
                let s = WakeScore(measurement(rt: rt, snoozes: snoozes))
                XCTAssertTrue((0...100).contains(s.value))
                XCTAssertTrue((0...1).contains(s.reward))
            }
        }
    }

    /// Every input must move the score in the direction a reader would expect. A score that is not
    /// monotonic is a score nobody can trust or explain on the Wake Report.
    func testMonotonicInEveryInput() {
        func score(_ m: WakeMeasurement) -> Double { WakeScore(m).value }

        // Slower reaction -> lower score.
        XCTAssertGreaterThan(score(measurement(rt: 300)), score(measurement(rt: 600)))
        XCTAssertGreaterThan(score(measurement(rt: 600)), score(measurement(rt: 1200)))

        // More inhibition failures -> lower score.
        XCTAssertGreaterThan(score(measurement(commissions: 0)), score(measurement(commissions: 2)))
        XCTAssertGreaterThan(score(measurement(commissions: 2)), score(measurement(commissions: 4)))

        // Slower dismissal -> lower score.
        XCTAssertGreaterThan(score(measurement(dismiss: 10)), score(measurement(dismiss: 90)))

        // More movement -> higher score.
        XCTAssertLessThan(score(measurement(motion: 0.1)), score(measurement(motion: 0.9)))

        // More snoozes -> lower score.
        XCTAssertGreaterThan(score(measurement(snoozes: 0)), score(measurement(snoozes: 1)))
        XCTAssertGreaterThan(score(measurement(snoozes: 1)), score(measurement(snoozes: 3)))
    }

    /// Beating your own daytime baseline is noise, not superhuman alertness — the ratio floors at 1
    /// so a lucky early tap cannot inflate the score.
    func testInertiaRatioFloorsAtOne() {
        let s = WakeScore(measurement(rt: 150, baseline: 300))
        XCTAssertEqual(s.inertiaRatio, 1.0, accuracy: 1e-9)
        XCTAssertEqual(s.alertness, 1.0, accuracy: 1e-9)
    }

    func testAPerfectMorningScoresNearTheTop() {
        let s = WakeScore(WakeMeasurement(
            reactionTimeMs: 280, baselineMs: 280, commissions: 0, noGoTrials: 4,
            dismissSeconds: 2, motionIndex: 1.0, snoozes: 0))
        XCTAssertGreaterThan(s.value, 90)
    }

    func testAWrecksOfAMorningScoresNearTheBottom() {
        let s = WakeScore(WakeMeasurement(
            reactionTimeMs: 1400, baselineMs: 280, commissions: 4, noGoTrials: 4,
            dismissSeconds: 300, motionIndex: 0.02, snoozes: 4))
        XCTAssertLessThan(s.value, 12)
    }
}

// MARK: - Wake check

final class WakeCheckTests: XCTestCase {

    func testSequenceShapeAndOpeningTrials() {
        for seed in 0..<200 {
            var rng = SeededRNG(seed: UInt64(seed))
            let trials = WakeCheck.sequence(&rng)

            XCTAssertEqual(trials.count, WakeCheck.goNoGoTrials)
            XCTAssertEqual(trials.filter { $0 == .noGo }.count, 4)

            // The prepotent "go" response must be established before inhibition is tested.
            XCTAssertEqual(trials[0], .go, "seed \(seed) opened on a no-go trial")
            XCTAssertEqual(trials[1], .go, "seed \(seed) tested inhibition too early")
        }
    }

    func testAnticipationIsDiscardedNotCounted() {
        let responses = [
            WakeCheck.Response(trial: .go, reactionMs: 40),    // guessed
            WakeCheck.Response(trial: .go, reactionMs: 300),
            WakeCheck.Response(trial: .go, reactionMs: 340),
        ]
        let result = WakeCheck.score(responses)
        XCTAssertEqual(result.anticipations, 1)
        XCTAssertEqual(result.meanGoMs, 320, accuracy: 1e-9)
    }

    func testCommissionsAndOmissions() {
        let responses = [
            WakeCheck.Response(trial: .go, reactionMs: 300),
            WakeCheck.Response(trial: .go, reactionMs: nil),      // missed
            WakeCheck.Response(trial: .noGo, reactionMs: 280),    // failed to inhibit
            WakeCheck.Response(trial: .noGo, reactionMs: nil),    // correctly withheld
        ]
        let result = WakeCheck.score(responses)
        XCTAssertEqual(result.commissions, 1)
        XCTAssertEqual(result.omissions, 1)
        XCTAssertEqual(result.noGoTrials, 2)
    }

    /// A morning where nothing valid was recorded still has to yield a number — the alarm happened
    /// whether or not the user cooperated.
    func testNoValidResponsesFallsBackToTimeout() {
        let result = WakeCheck.score([WakeCheck.Response(trial: .go, reactionMs: nil)])
        XCTAssertEqual(result.meanGoMs, WakeCheck.timeoutMs)
        XCTAssertEqual(result.omissions, 1)
    }
}

// MARK: - Bandit

final class BanditTests: XCTestCase {

    func testThereAreTwentyFourArms() {
        XCTAssertEqual(SoundFamily.all.count, 24)
        XCTAssertEqual(Set(SoundFamily.all.map(\.id)).count, 24)
    }

    /// The learner has to actually learn. A synthetic user who wakes better to bright, fast sounds
    /// should pull the bandit's choices that way — if this fails, the loop is decorative.
    func testConvergesOnTheRewardingRegion() {
        var bandit = Bandit()
        var rng = SeededRNG(seed: 4242)
        let context = Bandit.Context(window: .standard, isWeekend: false)

        func trueReward(_ f: SoundFamily) -> Double {
            let tempoFit = (f.tempoBand.low - 56) / 64.0
            return min(max(0.30 + 0.45 * f.brightness + 0.25 * tempoFit, 0), 1)
        }

        var earlyBrightness = 0.0, lateBrightness = 0.0
        let rounds = 400
        let arms = SoundFamily.all.map(\.id)

        for round in 0..<rounds {
            let id = bandit.select(arms: arms, context: context, rng: &rng)
            let family = SoundFamily.family(id: id)!
            if round < 40 { earlyBrightness += family.brightness }
            if round >= rounds - 40 { lateBrightness += family.brightness }

            let noisy = min(max(trueReward(family) + rng.double(-0.10, 0.10), 0), 1)
            bandit.observe(arm: family.id, context: context, reward: noisy)
        }

        XCTAssertGreaterThan(lateBrightness / 40, earlyBrightness / 40,
                             "the bandit did not drift toward the rewarding region")
        XCTAssertGreaterThan(lateBrightness / 40, 0.6,
                             "converged choices are still too dark")

        let best = bandit.rankedArms(arms, context: context).first
        XCTAssertNotNil(best)
        XCTAssertGreaterThan(SoundFamily.family(id: best!.arm)!.brightness, 0.5)
    }

    /// The challenge bandit runs over only five arms and must still converge — it is the dimension
    /// that decides whether the user faces something they can autopilot through.
    func testChallengeBanditConverges() {
        var bandit = Bandit()
        var rng = SeededRNG(seed: 555)
        let context = Bandit.Context(window: .standard, isWeekend: false)
        let arms = ChallengeKind.allCases.map(\.rawValue)

        // A synthetic user who genuinely wakes better to harder-to-autopilot challenges.
        func trueReward(_ kind: ChallengeKind) -> Double {
            min(max(0.25 + 0.6 * kind.autopilotResistance, 0), 1)
        }

        var early = 0.0, late = 0.0
        let rounds = 200
        for round in 0..<rounds {
            let id = bandit.select(arms: arms, context: context, rng: &rng)
            let kind = ChallengeKind(rawValue: id)!
            if round < 25 { early += kind.autopilotResistance }
            if round >= rounds - 25 { late += kind.autopilotResistance }
            let noisy = min(max(trueReward(kind) + rng.double(-0.08, 0.08), 0), 1)
            bandit.observe(arm: id, context: context, reward: noisy)
        }

        XCTAssertGreaterThan(late / 25, early / 25)
        XCTAssertEqual(bandit.rankedArms(arms, context: context).first?.arm,
                       ChallengeKind.typePhrase.rawValue)
    }

    /// Day one must not look like knowledge. With no observations, nothing is reported as a finding.
    func testColdStartReportsNoFindings() {
        let bandit = Bandit()
        let context = Bandit.Context(window: .early, isWeekend: false)
        XCTAssertTrue(bandit.rankedArms(SoundFamily.all.map(\.id), context: context).isEmpty)
        XCTAssertEqual(bandit.totalObservations, 0)
    }

    /// Pooling: evidence gathered in one context should still inform a context with no data of its
    /// own, otherwise every new wake time restarts cold.
    func testGlobalEvidenceInformsAnUnseenContext() {
        var bandit = Bandit()
        let weekday = Bandit.Context(window: .standard, isWeekend: false)
        let weekend = Bandit.Context(window: .standard, isWeekend: true)
        let target = SoundFamily.all[0]

        for _ in 0..<30 { bandit.observe(arm: target.id, context: weekday, reward: 0.95) }

        let unseen = bandit.blended(family: target.id, context: weekend)
        let mean = unseen.alpha / (unseen.alpha + unseen.beta)
        XCTAssertGreaterThan(mean, 0.55, "pooled evidence did not carry across contexts")
    }

    func testSelectionIsReproducibleForAGivenRNG() {
        let bandit = Bandit()
        let context = Bandit.Context(window: .late, isWeekend: true)
        var a = SeededRNG(seed: 77)
        var b = SeededRNG(seed: 77)
        let arms = SoundFamily.all.map(\.id)
        XCTAssertEqual(bandit.select(arms: arms, context: context, rng: &a),
                       bandit.select(arms: arms, context: context, rng: &b))
    }

    func testBetaSamplesStayInUnitInterval() {
        var rng = SeededRNG(seed: 8)
        for _ in 0..<20_000 {
            let v = Bandit.sampleBeta(alpha: 1.2, beta: 1.0, rng: &rng)
            XCTAssertTrue((0...1).contains(v))
            XCTAssertFalse(v.isNaN)
        }
    }

    func testContextBucketing() {
        XCTAssertEqual(Bandit.Context(hour: 5, minute: 30, isWeekend: false).window, .early)
        XCTAssertEqual(Bandit.Context(hour: 7, minute: 0, isWeekend: false).window, .standard)
        XCTAssertEqual(Bandit.Context(hour: 10, minute: 0, isWeekend: false).window, .late)
        // Boundaries: 6:30 starts standard, 8:00 is the last standard minute.
        XCTAssertEqual(Bandit.Context(hour: 6, minute: 29, isWeekend: false).window, .early)
        XCTAssertEqual(Bandit.Context(hour: 6, minute: 30, isWeekend: false).window, .standard)
        XCTAssertEqual(Bandit.Context(hour: 8, minute: 0, isWeekend: false).window, .standard)
        XCTAssertEqual(Bandit.Context(hour: 8, minute: 1, isWeekend: false).window, .late)
    }
}

// MARK: - End to end

final class RouseFacadeTests: XCTestCase {

    func testAWeekOfMorningsEndToEnd() {
        var learner = Rouse.Learner()
        var history: [WakeProtocol] = []
        let synth = Synth()

        for day in 1...7 {
            let context = Bandit.Context(hour: 6, minute: 45, isWeekend: day >= 6)
            let plan = Rouse.nextMorning(
                userSalt: "e2e-user", dayKey: String(format: "2026-08-%02d", day),
                context: context, learner: learner,
                ladderMode: .standard, history: history
            )

            XCTAssertFalse(GenomeSampler.violatesSafetyRails(plan.sound))
            XCTAssertFalse(ChallengeSpec.violatesLimits(plan.challenge))
            XCTAssertFalse(VerificationLadder.violatesInvariants(plan.ladder))
            XCTAssertNotNil(SoundFamily.family(id: plan.family.id))

            let buffer = synth.render(plan.sound, seconds: 2, seed: UInt64(day))
            XCTAssertGreaterThan(buffer.left.map(abs).max() ?? 0, 0.05)

            history.insert(plan.wakeProtocol, at: 0)
            learner.observe(soundFamily: plan.family.id, challengeKind: plan.challenge.kind,
                            context: context, reward: 0.7)
        }

        XCTAssertEqual(history.count, 7)
        XCTAssertEqual(learner.totalObservations, 7)
    }

    /// The whole point of rev. 2: two mornings must never *work* alike, not merely sound alike.
    func testAYearOfProtocolsStaysNovel() {
        var history: [WakeProtocol] = []
        var fallbacks = 0
        var minimumObserved = Double.infinity
        var pick = SeededRNG(seed: 4242)

        for day in 0..<365 {
            let family = pick.pick(SoundFamily.all)
            let kind = pick.pick(ChallengeKind.allCases)
            let draw = ProtocolSampler.sample(
                seed: SeedHash.hash("proto-\(day)"), family: family, challengeKind: kind,
                ladderMode: .standard, avoiding: history
            )
            if draw.usedFallback { fallbacks += 1 }
            if !history.isEmpty { minimumObserved = min(minimumObserved, draw.nearestDistance) }
            history.insert(draw.wakeProtocol, at: 0)
        }

        XCTAssertLessThanOrEqual(fallbacks, 5)
        XCTAssertGreaterThan(minimumObserved, 1.0)
    }

    /// The realistic steady state: once both bandits converge, every morning is drawn from one
    /// family and one challenge kind. That is the narrowest the space ever gets, and it is where
    /// the novelty threshold was tuned — 1.20 holds here, 1.60 does not.
    func testNoveltyHoldsAfterBanditsConverge() {
        var history: [WakeProtocol] = []
        var fallbacks = 0
        let family = SoundFamily.family(id: "glass.fast") ?? SoundFamily.all[0]

        for day in 0..<90 {
            let draw = ProtocolSampler.sample(
                seed: SeedHash.hash("converged-\(day)"), family: family,
                challengeKind: .typePhrase, ladderMode: .standard, avoiding: history
            )
            if draw.usedFallback { fallbacks += 1 }
            history.insert(draw.wakeProtocol, at: 0)
        }

        XCTAssertLessThanOrEqual(fallbacks, 5, "converged mornings started repeating")
    }

    /// The stinger is built to AlarmKit's documented budget: 30 seconds, played once.
    func testStingerFitsAlarmKitBudget() {
        XCTAssertLessThan(Rouse.stingerSeconds, 30.0)

        let plan = Rouse.nextMorning(
            userSalt: "u", dayKey: "2026-07-27",
            context: .init(window: .standard, isWeekend: false),
            learner: Rouse.Learner(), ladderMode: .standard, history: []
        )
        let buffer = Rouse.renderStinger(plan)
        XCTAssertLessThan(buffer.duration, 30.0)
        XCTAssertGreaterThan(buffer.duration, 25.0)
    }

    func testDayKeyFormat() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "America/Los_Angeles")!
        let date = calendar.date(from: DateComponents(year: 2026, month: 7, day: 27, hour: 6))!
        XCTAssertEqual(Rouse.dayKey(for: date, calendar: calendar), "2026-07-27")
    }

    func testGenomeSurvivesACodableRoundTrip() throws {
        let original = GenomeSampler.sample(seed: 1234).genome
        let data = try JSONEncoder().encode(original)
        let restored = try JSONDecoder().decode(Genome.self, from: data)
        XCTAssertEqual(original, restored)
    }

    func testBanditSurvivesACodableRoundTrip() throws {
        var bandit = Bandit()
        let context = Bandit.Context(window: .standard, isWeekend: false)
        for _ in 0..<10 { bandit.observe(arm: "bell.mid", context: context, reward: 0.8) }

        let restored = try JSONDecoder().decode(Bandit.self, from: JSONEncoder().encode(bandit))
        XCTAssertEqual(restored.totalObservations, 10)
        XCTAssertEqual(restored.rankedArms(SoundFamily.all.map(\.id), context: context).first?.arm,
                       "bell.mid")
    }

    func testWakeProtocolSurvivesACodableRoundTrip() throws {
        let draw = ProtocolSampler.sample(
            seed: 1234, family: SoundFamily.all[3], challengeKind: .oddOneOut,
            ladderMode: .extended, avoiding: []
        )
        let data = try JSONEncoder().encode(draw.wakeProtocol)
        let restored = try JSONDecoder().decode(WakeProtocol.self, from: data)
        XCTAssertEqual(draw.wakeProtocol, restored)
    }
}

// MARK: - Challenges

final class ChallengeSpecTests: XCTestCase {

    /// The difficulty ceiling exists because of a specific, repeated failure mode in this category:
    /// an Alarmy reviewer's *"multiplying two four-digit numbers mentally in 30 seconds is a bit
    /// much when I'm not half asleep."* Rouse maximises autopilot resistance, not difficulty.
    func testSampledChallengesNeverExceedTheDifficultyCeiling() {
        var rng = SeededRNG(seed: 9)
        for _ in 0..<20_000 {
            for kind in ChallengeKind.allCases {
                for role in [ChallengeSpec.Role.dismissal, .checkpoint] {
                    let spec = ChallengeSpec.sample(kind: kind, role: role, &rng)
                    XCTAssertFalse(ChallengeSpec.violatesLimits(spec),
                                   "\(kind) \(role) produced an out-of-bounds challenge")
                    XCTAssertLessThanOrEqual(spec.difficulty, ChallengeSpec.Limits.maxDifficulty)
                }
            }
        }
    }

    /// A checkpoint interrupts someone who may already be up. It has to be over in seconds.
    func testCheckpointChallengesAreShort() {
        var rng = SeededRNG(seed: 11)
        for _ in 0..<5_000 {
            for kind in ChallengeKind.allCases where kind.suitableAsCheckpoint {
                let spec = ChallengeSpec.sample(kind: kind, role: .checkpoint, &rng)
                XCTAssertEqual(spec.rounds, 1)
                XCTAssertLessThanOrEqual(spec.expectedDurationMs, 12_000)
            }
        }
    }

    func testReactionBlockIsNotUsedAsACheckpoint() {
        // A full trial block is far too long to interrupt someone's morning with.
        XCTAssertFalse(ChallengeKind.reactionGoNoGo.suitableAsCheckpoint)
        XCTAssertTrue(ChallengeKind.allCases.contains { $0.suitableAsCheckpoint })
    }

    func testTypePhraseIsTheMostAutopilotResistant() {
        // Nothing else in the set denies a stable motor pattern as completely.
        let ranked = ChallengeKind.allCases.max { $0.autopilotResistance < $1.autopilotResistance }
        XCTAssertEqual(ranked, .typePhrase)
    }
}

// MARK: - Verification ladder

final class VerificationLadderTests: XCTestCase {

    /// Spacing, ordering and escalation are guaranteed by construction. An earlier implementation
    /// jittered inside equal slots and patched collisions afterwards; it violated spacing on ~0.2%
    /// of draws, which at one alarm a day is a barrage of re-checks roughly twice a year.
    func testEveryLadderSatisfiesItsInvariants() {
        for mode in [VerificationLadder.Mode.standard, .extended] {
            var rng = SeededRNG(seed: SeedHash.hash("ladder-\(mode.rawValue)"))
            for i in 0..<20_000 {
                let ladder = VerificationLadder.sample(mode: mode, &rng)
                XCTAssertFalse(VerificationLadder.violatesInvariants(ladder),
                               "\(mode.rawValue) draw \(i) violated its invariants")
            }
        }
    }

    /// Sleep inertia runs 30–90 minutes waking from deep sleep, so the ladder must still be live
    /// late in the window. A standard ladder that finished at 18 minutes would miss the cases that
    /// most need catching.
    func testLadderStaysLiveLateEnoughToMatchThePhysiology() {
        for (mode, minimumLast) in [(VerificationLadder.Mode.standard, 20.0 * 60),
                                    (.extended, 40.0 * 60)] {
            var rng = SeededRNG(seed: 7)
            for _ in 0..<5_000 {
                let ladder = VerificationLadder.sample(mode: mode, &rng)
                XCTAssertGreaterThanOrEqual(ladder.checkpoints.last!.offset, minimumLast)
            }
        }
    }

    /// The mirror of the previous test. Unbounded jitter once let every checkpoint bunch late,
    /// leaving an 18-minute hole at the start — exactly when someone crawls back into bed.
    func testFirstCheckpointArrivesEarly() {
        for (mode, latestFirst) in [(VerificationLadder.Mode.standard, 7.0 * 60),
                                    (.extended, 13.0 * 60)] {
            var rng = SeededRNG(seed: 8)
            for _ in 0..<5_000 {
                let ladder = VerificationLadder.sample(mode: mode, &rng)
                XCTAssertLessThanOrEqual(ladder.checkpoints[0].offset, latestFirst)
                XCTAssertGreaterThanOrEqual(ladder.checkpoints[0].offset,
                                            VerificationLadder.Limits.minFirstOffset)
            }
        }
    }

    /// If gentleness has already failed for 25 minutes, the ladder ends with the alarm back on.
    func testLadderAlwaysEndsAtFullAlarm() {
        var rng = SeededRNG(seed: 12)
        for _ in 0..<2_000 {
            let ladder = VerificationLadder.sample(mode: .standard, &rng)
            XCTAssertEqual(ladder.checkpoints.last?.escalation, .fullAlarm)
            XCTAssertEqual(ladder.checkpoints.first?.escalation, .silent)
        }
    }

    /// The first checkpoint is a plain confirmation — if you really are up, one tap clears it.
    /// Demanding a puzzle from someone already making coffee is how this feature gets switched off.
    func testFirstCheckpointIsAPlainConfirmation() {
        var rng = SeededRNG(seed: 13)
        for _ in 0..<2_000 {
            let ladder = VerificationLadder.sample(mode: .extended, &rng)
            XCTAssertNil(ladder.checkpoints[0].challenge)
        }
    }

    func testOffModeSchedulesNothing() {
        var rng = SeededRNG(seed: 1)
        let ladder = VerificationLadder.sample(mode: .off, &rng)
        XCTAssertTrue(ladder.checkpoints.isEmpty)
        XCTAssertFalse(VerificationLadder.violatesInvariants(ladder))
    }

    func testInvariantCheckerRejectsABadLadder() {
        // Guard against the guard: a checker that never fails proves nothing.
        let clustered = VerificationLadder(
            window: 1500,
            checkpoints: [
                .init(offset: 130, escalation: .silent, challenge: nil),
                .init(offset: 150, escalation: .fullAlarm, challenge: nil),  // 20s apart
            ],
            mode: .standard
        )
        XCTAssertTrue(VerificationLadder.violatesInvariants(clustered))

        let softening = VerificationLadder(
            window: 1500,
            checkpoints: [
                .init(offset: 200, escalation: .fullAlarm, challenge: nil),
                .init(offset: 900, escalation: .silent, challenge: nil),
            ],
            mode: .standard
        )
        XCTAssertTrue(VerificationLadder.violatesInvariants(softening))
    }
}
