# Lane A — first ten scripts

Faceless, sound-forward, cited. **Every claim shows its source on screen** — that is the entire
differentiator. A systematic review found 109 ADHD-marketed apps and **none** contained evidence of
efficacy; a separate analysis found 100% of ADHD content on TikTok misleading, with under 10% of
creators holding relevant qualifications. Being the one that sources itself is the whole position.

**Hard rules** (from `docs/SCIENCE.md`): never guilt-frame · never claim an effect on ADHD · no
"clinically proven" · no "cures" · never promise light-sleep waking (Apple exposes no real-time
sleep-stage API, so nobody can do this and anyone claiming it is inferring from motion).

**Production:** `node --experimental-strip-types tools/render-sounds.mjs --count 30 --out ./out`
gives you the audio. A screen recording of the Sound Lab generating is the visual. Assemble in
CapCut. Under 30 seconds unless noted.

---

## 1. The hook that does the most work

> **On screen:** "Your alarm didn't get quieter. You got used to it."

Silence, then a generated sound rising from nothing. Text lands at the moment it becomes audible.

*VO/caption:* Habituation. Your brain learns a repeated sound isn't a threat and stops responding to
it. It's why the alarm that used to work stopped working.
**Cite:** habituation — reduced response to repeated stimulus.

**Why this one is first:** it names a thing the audience has experienced and never had a word for.

---

## 2. The 1977 patent

> **On screen:** "Someone patented the fix for this in 1977. Nobody built it."

Show the patent header — US 4,060,973, "Automatic variable-sound alarm clock." Eight sounds, rotating
every 24 hours, explicitly to stop you getting used to one.

*Close:* Forty-nine years old. Expired. Still basically nobody does it.
**Cite:** patents.justia.com/patent/4060973

**Why it works:** it's a genuinely surprising artifact, and it makes the idea feel discovered rather
than invented.

---

## 3. Sound #00001 → #00030

Thirty generated sounds, half a second each, cut on the beat. Counter ticking in the corner.

> **End card:** "None of these existed before I pressed a button. None will happen again."

No claims at all. Pure demonstration. This is the most re-postable thing on the list.

---

## 4. Why it isn't just noise

Two sounds side by side: a harsh buzzer, then a Rouse sound.

*VO:* Random doesn't mean unpleasant. Melodic wake sounds are linked to less grogginess than harsh
ones, so every sound is drawn from a musical space — no dissonant opening, always a gradual fade-in.
**Cite:** McFarlane et al., 2020, PLOS ONE.

Show the waveform with the teal ramp highlighted.

---

## 5. The eight seconds nobody notices

> **On screen:** "The first 8 seconds are almost silent. On purpose."

Show the waveform swelling.

*VO:* A sound that hits full volume instantly triggers a startle response — which makes the grogginess
worse, not better. So it fades in. Every time.

**Why it works:** shows a decision made *against* the obvious choice, which reads as competence.

---

## 6. The part every alarm app gets wrong *(45s, the most important one)*

> **On screen:** "Every alarm app solves the wrong half."

*VO:* Alarmy has 75 million users. It works by making you do a task — scan a barcode, solve maths —
before it'll stop.

Quote on screen, from a real user of a competing app:
> "I woke up to the alarm, got out of bed, scanned the 3 QR codes set around the house to dismiss the
> alarm then went right back to sleep."

*VO:* Your brain learns the task the same way it learns the sound. Every one of these apps solves
"turn the alarm off." None of them solve "stay awake."
**Cite:** forum.urbandroid.org/t/wake-up-check/233

**This is the thesis video.** Pin it.

---

## 7. How long grogginess actually lasts

> **On screen:** "3 minutes is not enough."

*VO:* Sleep inertia runs about 2–15 minutes if you wake from light sleep. From deep sleep: 30 to 90.
In severe cases, up to four hours. So a three-minute "are you awake?" check is checking at exactly the
wrong time.
**Cite on screen.**

*Close:* Rouse checks at times you can't predict, for up to 50 minutes.

---

## 8. Reading your own alarm's obituary

Screen recording: generate a sound, download it, and set it as your phone's actual alarm.

*Caption:* You can use these right now, without the app. It just won't change tomorrow.

**Why it works:** gives something away for free, which is the cheapest trust you can buy — and every
download is a Gate 1 metric.

---

## 9. Why I'm publishing the receipts

Screen recording scrolling `docs/SCIENCE.md`, including the "claims we do NOT make" table.

*VO:* A review of 109 ADHD apps found none of them had any evidence they worked. So everything this
app claims is written down publicly, with a source — including the parts where the evidence is thin,
and the things it refuses to claim.
**Cite:** the systematic review, on screen.

**Why it works:** it is the single hardest thing for a competitor to copy, because they'd have to
actually do it.

---

## 10. Build-in-public: the bug that would have cost me every signup

*VO:* The waitlist was silently broken. Vercel's servers can't write files, so every email would have
returned an error and vanished. Found it before launch, not after.

Show the 503 test passing.

**Why it works:** competence signalling without a face, and it seeds the "this person is careful"
impression that makes the science claims land.

---

## Posting notes

- **Cadence beats polish.** Daily-ish for the first month. #3 and #8 are cheap to make in volume.
- **Lead with #1 and #6.** They carry the thesis; the rest support them.
- **Sound on is the point.** Caption everything anyway — most feeds autoplay muted.
- **Every video ends the same way:** the URL. Nothing else.
- **Never post a claim you can't put a source on screen for.** If you can't find one in
  `docs/SCIENCE.md`, cut the line.
