# Rouse

**The alarm your brain can't learn.**

An alarm sound that has never existed before and will never repeat. Some of them are rare.

## The idea

Every morning, a sound that has never existed. You will never hear the same alarm twice.

Some are rare. A sound earns its tier from the unusual things it actually does — piercing,
breakneck, cavernous — so a Legendary (about 1 in 78) genuinely sounds like one. Rarity is never
purchasable and never affects how hard the alarm wakes you; see the four rules in `AGENTS.md`.

Underneath, the same idea runs deeper: your brain habituates to a repeated *task* just as it does to
a repeated tone, which is why every mission-style alarm gets solved on autopilot. So Rouse
randomises the whole wake-up and keeps checking until you've actually stayed up.

Random must not mean jarring. Every sound is drawn from a melodic space behind fixed rules — no
dissonant opening interval, always a gradual eight-second fade-in, because being blasted awake at
full volume feels awful and leaves you groggier.

[`docs/SCIENCE.md`](docs/SCIENCE.md) is not marketing — it is the line the copy must not cross.

## Architecture

AlarmKit caps custom alarm sounds at 30 seconds, played once — so Rouse is built in four stages:

| Stage | What | Where |
|---|---|---|
| **1. Trigger** | ≤30 s procedurally rendered stinger. Rings through Silent and Focus. | AlarmKit |
| **2. Ramp** | Unbounded adaptive soundscape, tempo climbing ~60 → 110 BPM. | AVAudioEngine |
| **3. Verify** | Randomised dismissal challenge, then an escalating ladder of re-checks across 25–50 min. | `Wake/` |
| **4. Learn** | Reaction time vs. your daytime baseline + motion → Wake Score → tomorrow's protocol. | `WakeScore`, `Bandit` |

Stage 3 is the differentiator. The window is sized to the physiology — sleep inertia runs 30–90
minutes waking from deep sleep, so Alarmy's single 3-minute re-check is far too short — and the
check *times* are randomised, because a re-check that always lands at T+3 is one you learn to sleep
through.

Two independent bandits pick the sound family and the challenge kind; the sampler randomises freely
inside them. That is how Rouse is personalised and never-repeating at once. They are kept separate
deliberately: a joint bandit would have 120 arms against one observation per day and would never
converge.

## Layout

```
ios/RouseCore/     pure Swift package — no AVFoundation, no UIKit. All the logic, all the tests.
ios/Rouse/         SwiftUI app target (not yet created — needs Xcode)
web/               Next.js marketing site
tools/validate.mjs numeric validation harness (runs today, no Xcode needed)
docs/              SCIENCE.md claims ledger, TOOLCHAIN.md
```

## Getting started

Swift does not compile on this machine yet — see [`docs/TOOLCHAIN.md`](docs/TOOLCHAIN.md). Install
full Xcode first, then:

```bash
swift test --package-path ios/RouseCore
```

Audition the engine — writes one `.wav` per morning:

```bash
swift run --package-path ios/RouseCore rouse-render --days 30 --out ./out --simulate-learning
```

Validate the tuning constants without Xcode:

```bash
node tools/validate.mjs
```

Verify the published rarity odds are the real ones:

```bash
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/verify-rarity.mjs
```

Verify share links still reproduce the exact sound they name:

```bash
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/verify-share.mjs
```

Batch-render sounds for content (no Xcode needed):

```bash
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tools/render-sounds.mjs --count 30 --out ./out
```

## Where things are

| | |
|---|---|
| [`docs/DEPLOY.md`](docs/DEPLOY.md) | The six steps to get this live. Start here. |
| [`docs/OPERATIONS.md`](docs/OPERATIONS.md) | What costs money, and when to start paying it |
| [`docs/SCIENCE.md`](docs/SCIENCE.md) | Not marketing — the line the copy must not cross |
| [`docs/TOOLCHAIN.md`](docs/TOOLCHAIN.md) | Why Swift doesn't compile here yet |
| [`content/lane-a-scripts.md`](content/lane-a-scripts.md) | First ten content scripts |
| [`content/advocate-brief.md`](content/advocate-brief.md) | Send to anyone posting about Rouse |
