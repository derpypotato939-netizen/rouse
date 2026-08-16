# Operations — cost, limits, and when to spend

Standing decisions, so they don't have to be re-litigated. Each spend is gated on a signal, not a
date. The rule throughout: **do not provision for traffic you do not have.**

## What is running, and what it costs

| Thing | Plan | Cost | Ceiling before it matters |
|---|---|---|---|
| Vercel | Hobby | $0 | See the licence trap below |
| Kit (waitlist + email) | Free | $0 | 10,000 subscribers |
| GitHub | Free public | $0 | — |
| Sound synthesis | Runs in the visitor's browser | $0 | None — a traffic spike costs nothing server-side |
| Domain | Not bought yet | — | Buy only if Gate 1 passes |
| Apple Developer | Not enrolled | $99/yr | Enrol only when TestFlight-ready |

## ⚠️ The Vercel licence trap

**Vercel's Hobby plan prohibits commercial use** — defined broadly as any deployment used for the
financial gain of anyone who produced it. Enforcement is account suspension, not a friendly email.

A zero-traffic demand experiment with no payments, ads, or affiliate links is defensible. A funnel
collecting a customer list for a paid app is not.

**Trigger: upgrade to Pro ($20/mo) before the first promoted post.** Getting suspended mid-viral-
moment would cost far more than $240/yr. Until you are actively driving traffic, Hobby is fine.

## Abuse controls

Implemented in `web/src/lib/abuse.ts`: honeypot, timing gate, engagement gate, and a best-effort
in-memory rate limit (5/hour per IP). Zero dependencies, zero cost, nothing to maintain.

The in-memory limiter is **deliberately partial** — serverless instances don't share memory, so it
catches bursts against a warm instance and misses a distributed attack. That is an accepted
trade-off at current traffic, not an oversight.

**If you are ever actually targeted**, pull one of these — in this order:

1. Vercel dashboard → Firewall → **Attack Challenge Mode**. Instant, free, global.
2. **Cloudflare Turnstile** on the form. Free, and you already have a Cloudflare account. Note it
   adds a third-party script, which ends the "no cookie banner needed" property — accept knowingly.
3. **Upstash Redis** + sliding-window counter keyed by IP. The real fix. ~$0 at this scale.

Do not pre-build these.

## Disk: Xcode is blocked

As of 2026-07-29 the machine has **~11 GiB free of 228 GiB (95% full)**. Xcode needs roughly 40 GB
to install. **Phase 2 cannot start until ~35 GB is freed.**

This is currently the single hardest blocker on the iOS app, and it is worth noting that none of the
Gate 1 work needs Xcode — the TypeScript engine and `tools/render-sounds.mjs` cover the web demo and
content production without it.

Likely reclaims: `~/Library/Developer` (old DerivedData/simulators, if any), old iOS backups,
Downloads, and `node_modules` in dormant projects (`npx npkill` finds these fast).

## Spend gates

| Spend | Only after |
|---|---|
| Vercel Pro $20/mo | First promoted post, or any monetisation on the page |
| Domain ~$12/yr | Gate 1 passes (≥35% generate 3+ sounds) |
| Apple Developer $99/yr | The app builds and runs on a device — not before |
| Anything else | It is blocking a gate you have already passed |
