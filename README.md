# Rouse

**The alarm your brain can't learn.**

Every morning Rouse generates a wake-up that has never happened before — the sound, the challenge
that dismisses it, and when it checks back on you. Then it measures how awake you actually got and
uses that to shape tomorrow.

## Why it works

Your brain habituates to anything repeated. The same tone every morning produces a weaker response
over time — which is why the alarm that used to wake you stops working.

But so does the same *task*. Every mission-style alarm app solves "dismiss the alarm" and stops
there, and users are blunt about what happens next: *"I woke up to the alarm, got out of bed,
scanned the 3 QR codes set around the house to dismiss the alarm then went right back to sleep."*
A half-asleep brain automates any fixed obstacle.

So Rouse randomises the whole protocol, and doesn't stop until you've proven you're awake.

Random must not mean jarring, though. Melodic waking sounds are linked to less morning grogginess
than harsh ones (McFarlane et al., 2020), so sound is drawn from a melodic space behind safety rails
that forbid dissonant openings and enforce a gradual loudness ramp. Challenges are capped for
difficulty and optimised for *autopilot resistance* instead — a different axis, and the one that
matters.

Built for people whose brains habituate fastest: the ADHD/DSPD audience, where roughly 75% also
have trouble with sleep timing. Named as the audience, never as something Rouse treats.

Claims are tracked in [`docs/SCIENCE.md`](docs/SCIENCE.md). Anything not in that ledger does not
get said.

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
| [`docs/SCIENCE.md`](docs/SCIENCE.md) | Claims ledger — every public claim, sourced |
| [`docs/TOOLCHAIN.md`](docs/TOOLCHAIN.md) | Why Swift doesn't compile here yet |
| [`content/lane-a-scripts.md`](content/lane-a-scripts.md) | First ten content scripts |
| [`content/advocate-brief.md`](content/advocate-brief.md) | Send to anyone posting about Rouse |
