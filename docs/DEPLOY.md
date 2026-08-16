# Deploy — the six steps only you can do

I can't create accounts, buy things, or authenticate as you. Everything else is done. Follow these
in order; the whole thing is about 30 minutes.

## 1. Kit account and form

1. Sign up at **kit.com** (free tier — 10,000 subscribers).
2. **Grow → Landing Pages & Forms → Create → Form → Inline.** Name it "Rouse beta waitlist".
   Design does not matter; the form is never displayed. It exists so Kit sends the confirmation
   email and so you have something to broadcast to later.
3. Publish it. The URL will look like `app.kit.com/forms/1234567/edit` — **`1234567` is your
   `KIT_FORM_ID`**.
4. **Settings → Developer → API keys.** Create a **V4 key**. That is `KIT_API_KEY`.
   (Kit has both v3 "API secret" and v4 keys. This code uses **v4** — the `X-Kit-Api-Key` header.)

### Custom fields (2 minutes, do not skip)

**Grow → Subscribers → any subscriber → Custom fields.** Add three, exactly:

```
rouse_sounds
rouse_downloads
rouse_source
```

These record how engaged someone was *before* they signed up. Without them you get a list of
addresses with no idea which ones actually cared — and "did engaged visitors convert?" is the
question Gate 1 exists to answer. If a field is missing Kit ignores it silently rather than
failing, so a typo here costs you data, not signups.

## 2. Vercel

```bash
vercel login
```

Then at **vercel.com/new**, import `derpypotato939-netizen/rouse`.

> ⚠️ **Set Root Directory to `web`.** The Next app is not at the repo root. Miss this and the build
> fails immediately with "no Next.js version detected."

Add environment variables (Production **and** Preview):

| Name | Value |
|---|---|
| `KIT_API_KEY` | your v4 key |
| `KIT_FORM_ID` | the number from the form URL |

Deploy.

## 3. Smoke test — before any traffic

Open the live URL on your phone and:

1. Generate a sound. Confirm you hear it.
2. Press **Share**, send the link to yourself, open it. **The sound must be the same one** — same
   five-digit number, same waveform.
3. Sign up with your real email.
4. Confirm you see **"Almost — check your inbox"**, that the confirmation email arrives, and that
   after clicking it you appear in Kit as **confirmed**.
5. In Kit, check the subscriber shows `rouse_sounds` with a number in it.

If step 4 shows an error instead: the env vars are missing or wrong. The endpoint returns **503** on
purpose in that case rather than pretending to succeed — it is designed to fail loudly so you catch
it here, with your own email, instead of losing other people's.

## 4. Then, and only then

Post. The plan's Gate 1 thresholds are pre-committed in
`in-a-new-folder-floofy-torvalds.md` — do not move them after seeing data.

---

## Reading your Gate 1 numbers

**Signups:** Kit dashboard. Count **confirmed** subscribers, not form submissions — double opt-in
means those differ, usually by 20–40%.

**Everything else:** each visit sends one summary line to the server log when the tab is hidden.
In the Vercel dashboard → your project → **Logs**, filter for `rouse_session`:

```json
{"kind":"rouse_session","sounds":4,"downloads":1,"shares":0,"signedUp":true,"seconds":73}
```

- **Repeat generation** = share of lines with `sounds >= 3` (threshold ≥35%)
- **Share/download rate** = share of lines with `downloads + shares >= 1` (threshold ≥8%)
- **Bounce** = lines with `sounds: 0` — these are the denominator, and they are recorded on purpose

Vercel's free log retention is short (about an hour of live tail). **For a real read, watch the logs
during your first traffic spike and write the counts down**, or upgrade to Pro, which you need
before promoting anyway (see `OPERATIONS.md`).

## When it breaks

| Symptom | Cause |
|---|---|
| Build fails, "no Next.js version detected" | Root Directory is not set to `web` |
| Signup returns 503 | `KIT_API_KEY` / `KIT_FORM_ID` missing in Vercel |
| Signup returns 502 | Kit rejected the call — usually a v3 key where v4 is needed |
| Signup returns 429 | Rate limit; 5/hour per IP. Expected if you test repeatedly |
| Confirmation email never arrives | Check spam; confirm the form is *published*, not draft |
| Shared link plays a different sound | Regression. Run `node --experimental-strip-types tools/verify-share.mjs` |
