# Rouse — where things stand and what happens next

*Plain-language plan. Everything technical lives in the repo; this is the version you can read in
five minutes and hand to someone else.*

---

## What Rouse is

**An alarm that gives you a sound nobody has ever heard, every single morning.**

Not a shuffle through ten ringtones. Each sound is built from scratch the moment you need it, then
never happens again. Some come out rare — and the app tells you when one does.

The tagline: **"The alarm your brain can't learn."**

## Why it should work

Your brain gets used to a repeated sound and stops reacting. That's why the alarm that used to wake
you doesn't any more. A sound you've never heard doesn't have that problem yet.

Here's the part most alarm apps miss: **the same thing happens to tasks.** Apps that make you scan a
barcode or solve maths get beaten too — people do the puzzle half-asleep and go straight back to bed.
One user of a competitor put it exactly: *"I scanned the 3 QR codes around the house, then went right
back to sleep."*

So Rouse changes everything each morning — the sound, the task, and when it checks on you again.

## Who it's for

**Anyone who struggles to wake up.** Deliberately broad.

We considered aiming specifically at people with ADHD, and dropped it. The rarity mechanic is a
random-reward system, and pointing that squarely at a community already vocal about apps exploiting
them is a bad idea we'd rather not do than manage. They can still find us; we just don't target them.

---

## The rarity system, and the line it must not cross

Every sound gets a tier based on how many genuinely unusual things it does:

| Tier | How often |
|---|---|
| Common | 30% |
| Uncommon | 40% |
| Rare | 22% |
| Epic | 1 in 15 |
| **Legendary** | **1 in 78** |

Those numbers are measured from 100,000 real sounds, not invented. The app publishes them on screen.

**A Legendary genuinely sounds like one** — it earns the tier by being, say, *piercing, breakneck,
accelerating and cavernous* all at once, and the app shows you which. That matters because these
sounds are played out loud: if "Legendary" were assigned at random, people would work it out in about
four taps and stop trusting anything else on the page.

**Four rules keep this from eating the product:**

1. **No farming.** One alarm, one sound. There's no button to get extra chances.
2. **No pressure to collect.** No "23 of 24 collected", no nudging you to set weird alarm times.
3. **Rarity never changes how hard it wakes you.** A Common works exactly as well as a Legendary.
4. **Rarity can never be bought.** Paying gets you more features, never better luck.

If someone ever opens Rouse to *collect* rather than to *wake up*, we got it wrong. An alarm that
feels like a game is an alarm you stop trusting at 6am. Rule 4 also keeps it clear of loot-box
regulation, which only bites when randomness is sold.

---

## What exists right now

**The website is finished.** Anyone can go to it, tap a button, and hear a brand-new alarm sound
generated in their browser — no download, no signup. They can save it, share it, and the person they
send it to hears the *exact same sound*.

It works on phones, it doesn't freeze, and every part of it has been tested.

**The phone app is written but has never been run.** All the logic is there. It can't be compiled yet
(see blockers).

**Everything is on GitHub**, publicly: `github.com/derpypotato939-netizen/rouse`

---

## Your next six steps

About 30 minutes. Full detail in `docs/DEPLOY.md`.

1. **Make a free Kit account** (email service) and create a form
2. **Copy two values** from it — an API key and a form number
3. **Log into Vercel** (hosting)
4. **Connect the GitHub repo** — ⚠️ set "Root Directory" to `web`, or the build fails
5. **Paste the two Kit values in** as settings
6. **Publish, then sign up with your own email to check it works end to end**

**Do not send anyone to the site until step 6 passes.** A broken signup on your first good post
costs you that entire batch of people.

---

## Then: getting people there

Ten ready-made video scripts are in `content/lane-a-scripts.md`. The one to start with is thirty
seconds of nothing:

> Silence. Tap. A sound rises. A badge lands: **LEGENDARY**. Text: *"1 in 78."*

No voiceover, no explanation. You can make a new one every single day because every sound is
different — the product generates its own content.

**Your friends posting about it** need `content/advocate-brief.md`. Four rules, and the first is
legally required: they must say out loud in the video that they know you and got it free. Not in the
caption — in the video.

**Reddit is closed to you.** r/ADHD and most relevant subreddits ban app promotion outright. Use them
to listen, never to post.

---

## How you'll know if it's working

Three numbers, decided in advance so you can't talk yourself into a different answer later:

| Question | Keep going if |
|---|---|
| Do people want more than one? | **35%+ generate three or more sounds** |
| Do they share or save them? | **8%+** |
| Do they want the actual app? | **10%+ join the waitlist** |

The first one is the real test. The whole pitch is "never the same twice" — if people don't want a
second one, the idea isn't interesting, and finding that out on a free website is enormously cheaper
than finding it out after building an iPhone app.

`docs/DEPLOY.md` explains where to read these numbers.

---

## What's blocking you

**1. Your Mac is too full to build the phone app.** You have about 11 GB free; you need roughly 40.
The biggest wins: clearing browser caches (~12 GB), and uninstalling Steam and Minecraft (~12 GB),
which you can reinstall any time. Nothing about the website needs this — do it while you wait for
website numbers.

**2. Hosting is free right now, but only for hobby projects.** Vercel's free plan bans commercial
use, and they enforce it by suspending accounts. **Upgrade to the $20/month plan before your first
real promotional post** — being suspended mid-viral-moment costs far more than $240 a year.

**Current spend: $0.** Nothing else gets bought until it's blocking something: a domain only if the
website numbers pass, and Apple's $99 developer fee only when the app actually runs on a phone.

---

## The honest timeline

Only **3.5% of apps ever reach $10,000/month.** The typical solo developer makes under $1,000. A
realistic good outcome is $3,000–15,000/month after **12 to 18 months**.

Six weeks gets you launched. Not paid. The gap between those two is normal, and pretending otherwise
would just make you quit at month four thinking something went wrong.

Roughly 2,000–2,500 paying customers gets you to $10k. That's around 55,000 downloads. Getting
attention is the hard part — not the code.

---

## What we learned the hard way

Kept here because these cost real time and would be expensive to rediscover.

- **The waitlist was silently broken.** It looked fine locally and would have thrown away every email
  in production without telling anyone. Found before launch, not after.
- **Sharing didn't work.** Links opened a blank page instead of the sound they promised. Then, once
  fixed, about 1 in 12 delivered *the wrong sound*.
- **A hidden setting was rejecting 92% of all sounds** and starving the variety system.
- **The website and phone app had drifted apart** — the website grew rarity tiers and the app didn't.
  There's now an automatic check for it.
- **A safety check that couldn't actually fail.** It was tested by deliberately breaking things, and
  the first version caught nothing.

Every one of these was found by *testing*, not by reading the code. That's why there's a single
command — `node tools/check.mjs` — that runs everything in about 15 seconds. Run it before you push.

---

## The one thing to watch when you start posting

Script #5 in the content file plays a Common and a Legendary back to back with no commentary.

**If viewers can't hear the difference, the rarity system is decoration** — and you want to learn
that from a video's comments, not from people quietly uninstalling three weeks in.
