/**
 * Abuse controls for the public signup endpoint.
 *
 * ## The threat being defended against
 *
 * `POST /api/join` is unauthenticated and causes Kit to send a confirmation email to whatever
 * address is supplied. Composed, those two properties make it an *email amplification vector*: an
 * attacker can loop the endpoint with a victim's address and our sending domain floods a stranger's
 * inbox. The abuse report lands on us, and the lasting damage is to sender reputation — which we
 * need intact for the one email that matters, the "beta is open" blast.
 *
 * The quieter cost is data integrity: scripted signups inflate the Gate 1 opt-in rate, and that
 * number decides whether the project continues. Corrupting it is worse than losing it.
 *
 * ## Why there is no Redis here
 *
 * A correct distributed rate limiter needs shared state, because serverless functions are stateless
 * and horizontally scaled — each instance has its own memory and cannot see the others' counters.
 * That would mean a new vendor, new credentials, and a new thing to debug, for a site that at time
 * of writing has no traffic.
 *
 * Instead this file stacks cheap, dependency-free checks that stop opportunistic and scripted abuse
 * — which is essentially all real-world abuse below fame. The in-memory limiter below is explicitly
 * *best-effort* and documented as such rather than pretending to be a guarantee.
 *
 * **If you are ever genuinely targeted**, the upgrade path is one of:
 *   1. Vercel dashboard → Firewall → Attack Challenge Mode (instant, free, global).
 *   2. Cloudflare Turnstile on the form (free; adds a third-party script, so it also ends the
 *      "no consent banner needed" property — accept that trade knowingly).
 *   3. Upstash Redis + a sliding-window counter keyed by IP (the real fix).
 * Do not pre-build these. Pull one when the logs say you need it.
 */

/** Minimum time a human plausibly takes between page load and submitting. */
const MIN_ELAPSED_MS = 2_500;
/** Requests allowed per client per window by the best-effort limiter. */
const MAX_PER_WINDOW = 5;
const WINDOW_MS = 60 * 60 * 1000;

export type AbuseVerdict =
  | { ok: true }
  | { ok: false; reason: string; silent: boolean };

/**
 * Module-scope map. Survives only as long as one warm serverless instance, and is not shared across
 * instances — so it catches a burst from a single caller hitting a warm function and misses a
 * distributed or cold-start-spread attack. That is a real limitation, stated plainly rather than
 * hidden. It costs nothing and cannot break.
 */
const hits = new Map<string, number[]>();

function sweep(now: number) {
  // Bound memory: a long-lived instance must not accumulate keys forever.
  for (const [key, times] of hits) {
    const live = times.filter((t) => now - t < WINDOW_MS);
    if (live.length === 0) hits.delete(key);
    else hits.set(key, live);
  }
}

export function clientKey(request: Request): string {
  // Vercel sets x-forwarded-for; the first entry is the client. Spoofable in general, but the
  // upstream proxy overwrites it, so it is trustworthy behind Vercel specifically.
  const forwarded = request.headers.get("x-forwarded-for") ?? "";
  return forwarded.split(",")[0]?.trim() || "unknown";
}

/**
 * @param honeypot  value of a field real users never see or fill
 * @param elapsedMs milliseconds between page load and submit, per the client
 * @param sounds    how many sounds this visitor generated before signing up
 */
export function screen(opts: {
  key: string;
  honeypot?: string;
  elapsedMs?: number;
  sounds?: number;
}): AbuseVerdict {
  // 1. Honeypot. A hidden input that only an automated form-filler populates.
  //    `silent` means: respond 200 and discard. Never tell a bot which check it failed, or the
  //    next version of the script simply skips that field.
  if (opts.honeypot && opts.honeypot.trim() !== "") {
    return { ok: false, reason: "honeypot", silent: true };
  }

  // 2. Timing. Instant submission means the form was never rendered and read by a person.
  if (typeof opts.elapsedMs === "number" && opts.elapsedMs < MIN_ELAPSED_MS) {
    return { ok: false, reason: "too-fast", silent: true };
  }

  // 3. Engagement. Anyone who signs up has heard at least one sound — that is the entire premise of
  //    the page. A script POSTing the endpoint cold has not. Client-supplied and therefore trivially
  //    forged, which is fine: this is a filter, not a gate, and it costs nothing.
  if (typeof opts.sounds === "number" && opts.sounds < 1) {
    return { ok: false, reason: "no-engagement", silent: true };
  }

  // 4. Best-effort rate limit. See the caveat in the module comment.
  const now = Date.now();
  sweep(now);
  const times = (hits.get(opts.key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= MAX_PER_WINDOW) {
    // Not silent: a real person hitting this deserves to be told, and it is a signal worth logging.
    return { ok: false, reason: "rate-limited", silent: false };
  }
  times.push(now);
  hits.set(opts.key, times);

  return { ok: true };
}
