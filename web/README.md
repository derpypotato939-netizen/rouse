# Rouse — web

The **Sound Lab**: a page where a visitor generates and hears an alarm sound that has never existed
before, without installing anything. This is Gate 1 of the demand check, the content engine, and the
waitlist capture, all in one artifact.

It is **not** the product. A web page cannot be a real alarm — on iOS, push cannot trigger background
code execution and timers stop counting when backgrounded. The alarm ships natively; this page exists
to find out whether anyone wants it.

```bash
npm run dev     # http://localhost:3000
npm run build
```

## How it stays honest about the app

`src/lib/engine.ts` and `src/lib/synth.ts` are ports of `ios/RouseCore/Sources/RouseCore/`. They
compute the same samples from the same seeds, in the same order — so the `.wav` a visitor downloads is
exactly what the alarm would play, not a lookalike.

Verified: a rendered stinger is 5,115,644 bytes (44-byte header + 29 s × 44.1 kHz × 2ch × 16-bit) with
a peak of 29163 — which is `0.89 × 32767`, matching `Synth.normalize(peak: 0.89)` in the Swift.

**If you change the Swift engine, change these too**, then re-run `node ../tools/validate.mjs`.

## Playback starts 6.5 s in, on purpose

The first 8 seconds are the deliberate loudness ramp — a sound arriving at full level triggers a
startle response, which makes grogginess worse. That is right for an alarm and terrible for a demo, so
the default press lands where the sound is alive, and the ramp is *shown* in the waveform (teal)
instead of being heard as dead air. The checkbox plays it from zero.

## Data

| Route | Writes | Purpose |
|---|---|---|
| `POST /api/join` | `Signups` sheet, or `.data/signups.jsonl` | Waitlist |
| `POST /api/event` | `.data/sessions.jsonl` | One summary beacon per session |

Set these in Vercel to write to a spreadsheet instead of local files:

```
GOOGLE_SHEETS_ID
GOOGLE_SERVICE_ACCOUNT_EMAIL
GOOGLE_PRIVATE_KEY
```

Share the sheet with the service-account email as an Editor. Same pattern as `~/Desktop/private-kitchen`.

`.data/` is gitignored — it holds real email addresses.

No cookies, no third-party analytics, nothing that identifies a visitor, so the page needs no consent
banner. Keep it that way.

## The numbers this page exists to produce

Gate 1 thresholds, pre-committed so they can't be rationalised later:

| Metric | Continue if |
|---|---|
| Visitors generating 3+ sounds | ≥35% |
| Download / share rate | ≥8% |
| Waitlist opt-in | ≥10% of visitors |

Sessions that generate nothing are recorded too — the bounce rate is the denominator for all three.
