# Working in this repo

## Positioning: gimmick first

The front door is **the gimmick, never the science**: a sound that has never existed before, some of
them rare. Nobody downloads an alarm because of a citation. The research-forward framing was tried
and dropped.

`docs/SCIENCE.md` survives, but it is **not marketing any more** — it is the line the copy must not
cross. It stays silent and keeps claims honest.

**The audience is broad.** Do not target ADHD or any clinical group; see `docs/SCIENCE.md`.

### The rarity mechanic has four hard rules

1. **No pull farming in the app.** One alarm, one sound. (The web Lab is exempt — unlimited
   generation is the demo.)
2. **No completion pressure.** No "23 of 24 collected", no nudges to set odd alarm times.
3. **Rarity never affects the alarm.** A Common wakes you exactly as hard as a Legendary.
4. **Rarity is never purchasable.** Paying buys quantity and features, never odds.

If a user ever opens Rouse to *collect* rather than to *wake up*, the design has failed. An alarm
that feels like a game is an alarm you stop trusting at 6am.

Rarity is derived from **audible traits**, not statistics — see the comment on `rarityFor` in
`web/src/lib/engine.ts` for why distance-from-mean was measured and rejected.

## Claims

**Every public claim goes through `docs/SCIENCE.md` first.** If you write marketing copy, App Store
text, or website prose that asserts something about sleep, brains, or alertness, it must trace to a
row in that ledger. Add the row with a real citation, or change the sentence. This is not
box-ticking — unsubstantiated wellness claims are an FTC exposure and an App Store rejection.

Specifically banned, everywhere: "clinically proven", "brainwave entrainment", "treats insomnia",
"wakes you during light sleep" (technically impossible on iPhone — Apple exposes no real-time
sleep-stage API), and any numeric claim like "reduces sleep inertia by 40%".

One tone rule survives from the earlier positioning and still matters: **never guilt-frame.** No
"lazy", no "undisciplined", no character-failure framing. A large part of the audience physically
struggles to wake up, and that framing tells them it is a personality defect. It is not, and they
will correctly read the brand as not for them.

## Architecture

Four stages. The first two are forced by AlarmKit's constraints; the third is the differentiator:

1. **Trigger** — AlarmKit, ≤30 s custom sound, played once, rings through Silent and Focus.
2. **Ramp** — AVAudioEngine in-app, unbounded length, continues the stinger's character.
3. **Verify** — randomised dismissal challenge, then an escalating ladder of re-checks.
4. **Learn** — Wake Score → two bandits → tomorrow's protocol.

### Randomise the protocol, not just the sound

The unit of randomisation is `WakeProtocol` (sound + challenge + ladder), not `Genome`. This is the
central lesson of the rev. 2 research: randomised *sound* is a 1977 patent that never became a
product, and the market answered habituation with tasks instead. But a fixed task habituates
exactly like a fixed tone — users report completing multi-step missions on autopilot and going
straight back to bed. Two mornings must never sound alike **and** never work alike.

### Two bandits, not one

`Rouse.Learner` runs independent bandits over sound families (24 arms) and challenge kinds (5).
A joint bandit would have 120 arms against **one observation per day** and would never leave cold
start. If you are tempted to add a third dimension to the learner, check the arm arithmetic first.

## Where code goes

`ios/RouseCore/` is a **pure** Swift package. It must never import AVFoundation, UIKit, SwiftUI,
CoreMotion or CryptoKit. That is what keeps the engine testable without a device and buildable
without Xcode. Everything platform-specific belongs in the app target above it.

If you are adding logic that can be expressed as a function of its inputs, it belongs in RouseCore
with a test. The app layer should be thin.

## Determinism is a product requirement, not a nicety

`SeededRNG` must stay reproducible: the same seed has to produce a byte-identical audio buffer on
any device, forever. The share card prints a sound's serial number, and that number is a promise.
Never introduce `SystemRandomNumberGenerator`, `Date()`, or dictionary iteration order into the
sampling or synthesis path.

## Tuning constants have been measured — don't nudge them by feel

`GenomeSampler.noveltyThreshold`, the centroid rails, and the bandit priors were set from a
simulated year of mornings, not intuition. `tools/validate.mjs` is the harness that produced those
numbers; re-run it if you change any of them.

That harness has now caught three real bugs, none of which would have been obvious by reading:

1. A safety rail tested the *loudest partial* against a 400–4000 Hz band — but after normalisation
   the fundamental is always the loudest partial, so the rail was really testing the root
   (180–420 Hz) and rejected **92% of draws**, starving all 24 bandit arms to an ~8% sample rate.
2. The ladder's original offset sampler jittered inside equal slots and patched collisions
   afterwards. It violated minimum spacing on ~0.2% of draws. The fix reserves the spacing up front
   and randomises only the slack, so the invariant holds **by construction**.
3. With offsets otherwise unbounded, every checkpoint could bunch late — a first check arriving at
   18.8 minutes, blind during exactly the window when someone crawls back into bed. Both ends of
   the ladder are now pinned.

The lesson generalises: **measure acceptance rates and invariants rather than assuming them.**

One tuning rule worth stating outright: `ProtocolSampler.noveltyThreshold` is set by the *worst*
case, not the average. Once the bandits converge, every morning comes from one sound family and one
challenge kind — the narrowest the space ever gets, and the actual steady state. 1.20 holds there;
1.60 fails on 21 of 90 mornings and starts repeating.

## Toolchain

See `docs/TOOLCHAIN.md`. Full Xcode is required — the standalone Command Line Tools on this machine
are internally inconsistent and cannot compile Swift at all.
