import { NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * One summary beacon per session, sent when the page is hidden.
 *
 * This exists to measure Gate 1 and nothing else: ≥35% of visitors generating 3+ sounds, ≥8%
 * downloading or sharing, ≥10% opting in. Per-click events would drown a log and answer no question
 * worth asking, so only the session total is sent.
 *
 * Like `/api/join`, this cannot write files in production — Vercel's serverless filesystem is
 * read-only. Here the stakes are lower: a beacon is a handful of counters, not someone's email
 * address, so production writes a structured line to stdout (which Vercel captures) instead of
 * failing. Losing a beacon is survivable; losing a signup is not.
 *
 * No cookies, no identifiers, no third-party script — nothing here can identify a visitor, so the
 * page needs no consent banner. Keep it that way.
 */
type Beacon = {
  sounds?: number;
  downloads?: number;
  shares?: number;
  signedUp?: boolean;
  seconds?: number;
};

const clamp = (v: number | undefined, max: number) =>
  Math.max(0, Math.min(max, Math.floor(v ?? 0)));

export async function POST(request: Request) {
  let body: Beacon;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }

  // Sessions that generated nothing are recorded too — the bounce rate is the denominator for
  // every Gate 1 threshold.
  const record = {
    kind: "rouse_session",
    timestamp: new Date().toISOString(),
    sounds: clamp(body.sounds, 1000),
    downloads: clamp(body.downloads, 1000),
    shares: clamp(body.shares, 1000),
    signedUp: Boolean(body.signedUp),
    seconds: clamp(body.seconds, 86400),
  };

  try {
    if (process.env.NODE_ENV === "production") {
      // Single-line JSON so it can be grepped straight out of `vercel logs`.
      console.log(JSON.stringify(record));
    } else {
      const dir = path.join(process.cwd(), ".data");
      await mkdir(dir, { recursive: true });
      await appendFile(path.join(dir, "sessions.jsonl"), JSON.stringify(record) + "\n");
    }
  } catch (err) {
    // Telemetry must never break the page, and must never be the reason a request fails.
    console.error("[event] beacon failed", String(err));
  }

  return NextResponse.json({ ok: true });
}
