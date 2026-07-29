import { NextResponse } from "next/server";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * Waitlist capture → Kit (formerly ConvertKit).
 *
 * ## Why not a file, and why not a spreadsheet
 *
 * The first version of this route fell back to appending `.data/signups.jsonl`. That works locally
 * and **silently destroys data in production**: Vercel's serverless filesystem is read-only, so the
 * write throws `EROFS`, the route 500s, and the visitor's email is gone. Every signup collected
 * before anyone noticed would have been lost — which is precisely the data Gate 1 exists to produce.
 *
 * A Google Sheet fixes the durability problem but not the useful one: a column of addresses cannot
 * send the "the beta is open" email, which is the entire reason for collecting them. Kit stores them
 * *and* mails them, free to 10,000 subscribers.
 *
 * ## Double opt-in
 *
 * Adding a subscriber to a Kit form sends a confirmation email; they are not subscribed until they
 * click it. That is deliberate — confirmed consent, and far better deliverability when a few thousand
 * people are emailed at once — but it means the UI must say "check your inbox", never "you're on the
 * list". See `SoundLab.tsx`.
 */

const KIT_API = "https://api.kit.com/v4";

type Signup = {
  email: string;
  /** Gate 1 telemetry, stored as Kit custom fields so engagement-at-signup is visible per person. */
  sounds?: number;
  downloads?: number;
  source?: string;
};

function isDev() {
  return process.env.NODE_ENV !== "production";
}

async function kitFetch(pathname: string, apiKey: string, body: unknown) {
  const res = await fetch(`${KIT_API}${pathname}`, {
    method: "POST",
    headers: {
      "X-Kit-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Kit ${pathname} failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  return res;
}

/**
 * Create the subscriber, then add them to the form.
 *
 * The two-step order matters: Kit wants the subscriber to exist as `inactive` before the form
 * triggers the confirmation email.
 */
async function addToKit(record: {
  email: string;
  sounds: number;
  downloads: number;
  source: string;
}) {
  const apiKey = process.env.KIT_API_KEY;
  const formId = process.env.KIT_FORM_ID;
  if (!apiKey || !formId) return false;

  await kitFetch("/subscribers", apiKey, {
    email_address: record.email,
    state: "inactive",
    fields: {
      // Kit custom fields must already exist in the account, and are keyed by slug. If a key is
      // missing Kit ignores it rather than failing, so a misconfigured field never costs us a signup.
      rouse_sounds: String(record.sounds),
      rouse_downloads: String(record.downloads),
      rouse_source: record.source,
    },
  });

  await kitFetch(`/forms/${formId}/subscribers`, apiKey, {
    email_address: record.email,
  });

  return true;
}

/** Development convenience only. Never reached in production — see the 503 below. */
async function appendLocally(record: Record<string, string | number>) {
  const dir = path.join(process.cwd(), ".data");
  await mkdir(dir, { recursive: true });
  await appendFile(path.join(dir, "signups.jsonl"), JSON.stringify(record) + "\n");
}

export async function POST(request: Request) {
  let body: Signup;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email." }, { status: 400 });
  }

  const record = {
    timestamp: new Date().toISOString(),
    email,
    sounds: Math.max(0, Math.floor(body.sounds ?? 0)),
    downloads: Math.max(0, Math.floor(body.downloads ?? 0)),
    source: (body.source ?? "").slice(0, 64),
  };

  try {
    const stored = await addToKit(record);
    if (stored) {
      return NextResponse.json({ ok: true, confirmationRequired: true });
    }

    // Not configured. In development that is expected and we keep a local file. In production it
    // means the deploy is missing its env vars, and the only safe behaviour is to fail loudly —
    // a silent fallback here is what loses real people's addresses.
    if (isDev()) {
      await appendLocally(record);
      return NextResponse.json({ ok: true, confirmationRequired: false, stored: "local" });
    }

    console.error("[join] KIT_API_KEY / KIT_FORM_ID missing — refusing to accept signups");
    return NextResponse.json(
      { error: "The waitlist isn't available right now. Please try again shortly." },
      { status: 503 }
    );
  } catch (err) {
    // Log the address alongside the failure so a Kit outage is recoverable from the logs rather
    // than being a permanent loss.
    console.error("[join] failed", { email: record.email, err: String(err) });
    return NextResponse.json(
      { error: "We couldn't add you just then. Please try again." },
      { status: 502 }
    );
  }
}
