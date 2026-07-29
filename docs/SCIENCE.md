# Claims ledger

Every public claim Rouse makes — App Store copy, the website, a TikTok caption — must appear in
this table before it ships. FTC substantiation standards require competent and reliable scientific
evidence for each *specific* claim, and App Store review flags unsubstantiated wellness claims.
This file is the paper trail.

Rule: if a sentence in marketing copy is not traceable to a row below, either add the row with a
real citation, or change the sentence.

## Claims we make

| Claim as stated publicly | Evidence | Strength |
|---|---|---|
| "Your brain learns your alarm and stops responding to it." | Habituation — reduced neural/attentional response to a repeated stimulus — is well established, and is studied directly in auditory-warning contexts (locomotive cab alerts, construction-equipment alarms). | **Strong.** Established phenomenon, though most direct measurement is in operator-alertness settings rather than domestic alarm clocks. |
| "A sound your brain has never heard keeps its alerting power." | Novel stimuli retain alerting power precisely because of their salience and low frequency of presentation; habituation does not transfer to a sufficiently different stimulus. | **Moderate–strong.** The mechanism is well supported; the specific dose-response for morning alarms is not established. Do not quantify it. |
| "Harsh alarms leave you groggier than melodic ones." | McFarlane et al. (2020), PLOS ONE — melodic waking sounds are significantly associated with reduced *perceived* sleep inertia. | **Moderate.** Self-reported inertia, ecological (not lab) design. Say "linked to", never "proven to". |
| "Sleep inertia measurably slows your reaction time." | Sleep inertia produces documented decrements in simple reaction time and cognitive throughput after waking. | **Strong.** But the *size* of the effect varies widely by sleep stage, duration and individual — never publish a fixed percentage as if it applied to the user. |
| "Rouse measures how awake you actually are." | Literally true as built: reaction time vs. the user's own daytime baseline, go/no-go commission errors, accelerometer variance. See `Wake/` and `WakeScore.swift`. | **Product fact**, not a scientific claim. |
| "Biofeedback." | Defensible **only** because Stage 3 measures a physiological/behavioural response and feeds it back to the user and into the sound selection. | **Conditional.** If measurement is ever removed from a build, this word must come out of the copy in the same release. |
| "Sleep inertia can last well past the few minutes most alarms assume." | Roughly 2–15 min waking from light sleep, 30–90 min from deep N3, and up to ~4 hours in severe "sleep drunkenness." This is what sizes the verification ladder's window. | **Strong**, with wide individual variation. Give the range, never a single number as if it applied to the reader. |
| "People complete wake-up challenges on autopilot and go back to sleep." | Directly reported by users of competing apps — e.g. scanning three QR codes around the house to dismiss an alarm, then returning to bed. | **User-reported, not a study.** Present it as what people say, which is all it is. Do not dress it up as a finding. |
| "Most people with ADHD also have trouble with sleep timing." | ADHD co-occurs with delayed sleep-wake phase disorder at high rates; DSWPD is the most frequent circadian disorder seen in ADHD populations. | **Moderate–strong.** Say "commonly co-occurs." Never imply a causal direction, and never imply Rouse addresses ADHD itself. |

## The ADHD/DSPD wedge — additional rules

ADHD and DSPD are named as **who Rouse is built for**, never as something it treats. That line is
not negotiable: a treatment claim would make this a regulated medical device.

Two further constraints, both from how this specific community has been treated by app marketing:

- **Never guilt.** No "lazy", "undisciplined", "just try harder", no before/after morality. The
  documented complaint about ADHD marketing is exactly this framing — associating the condition
  with character failure to sell a fix. Rouse's frame is mechanical: *your brain habituates
  faster, so here is a tool that stops being predictable.*
- **Cite or don't say it.** A 2022 analysis found ~85% of mental-health content on TikTok
  misleading and **100% of ADHD content misleading**, with under 10% of creators holding relevant
  qualifications. Against that backdrop, an uncited claim is not a small shortcut — it is
  indistinguishable from the grift the audience is already tired of. Every content piece cites its
  source on screen.

## Claims we do NOT make

| Forbidden | Why |
|---|---|
| "Brainwave entrainment", "binaural beats retune your brain" | Evidence is weak and contested. Not load-bearing anywhere in Rouse; do not invoke it. |
| "Clinically proven", "doctor recommended" | We have run no clinical trial and have no clinician endorsement. |
| "Wakes you during light sleep" | **Not technically possible.** HealthKit writes sleep stages only *after* the user wakes; Apple exposes no real-time sleep-staging API. Any competitor claiming this on iPhone alone is inferring from motion. |
| "Treats/cures insomnia, sleep apnea, delayed sleep phase" | A treatment claim makes the app a regulated medical device. Rouse is a wellness product. |
| "Reduces sleep inertia by N%" | We have no data supporting a specific figure. Once we do have aggregate data, it may be reported as *our observed data*, clearly labelled, never as an established finding. |
| Any claim about children, shift-worker safety, or driving alertness | Higher-stakes populations demand evidence we do not have. |
| "Helps/manages/is designed for ADHD symptoms" | Naming ADHD as the audience is fine. Claiming any effect *on* ADHD is a treatment claim. |
| "Guaranteed to wake you up" | No alarm can promise this, and the category's own reviews are full of users it failed. |

## When we start reporting our own data

Aggregate Wake Score data is an observational dataset from a self-selected, unblinded sample with
no control condition. It can honestly support statements like *"across N Rouse mornings, users
scored X points higher on days following a novel sound"* — labelled as our own data, with N shown.
It cannot support *"novel sounds improve alertness by X%"* as a general claim.

## Sources

- McFarlane, Garcia, Verhagen, Dyer (2020). *Alarm tones, music and their elements: Analysis of
  reported waking sounds to counteract sleep inertia.* PLOS ONE.
  https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0215788
- *Alarm Tones, Voice Warnings, and Musical Treatments: A Systematic Review of Auditory
  Countermeasures for Sleep Inertia in Abrupt and Casual Awakenings.*
  https://pmc.ncbi.nlm.nih.gov/articles/PMC7711682/
- Federal Railroad Administration. *Evaluation of Habituation to Alerts in Locomotive Cabs.*
  https://railroads.dot.gov/sites/fra.dot.gov/files/2024-09/Eval%20of%20Habituation%20to%20Alerts%20in%20Loco%20Cabs.pdf
- Tomkins, Liao, Klasnja, Murphy (2020). *IntelligentPooling: Practical Thompson Sampling for
  mHealth.* arXiv:2008.01571 — the pooling approach used in `Bandit.swift`.
  https://arxiv.org/pdf/2008.01571
- ADDitude. *Late Nights, Later Days: The Under-Recognized Impact of Delayed Sleep Phase Syndrome in
  ADHD.* https://www.additudemag.com/delayed-sleep-phase-syndrome-signs-treatments-adhd/
- Understood. *The ADHD content economy: how algorithms and incentives turn help into grift* —
  the source of the "never guilt" rule.
  https://www.understood.org/en/podcasts/hyperfocus/adhd-scam
- Sleep as Android feature forum, *Wake up check* — the primary user testimony that mission-style
  alarms are defeated on autopilot. https://forum.urbandroid.org/t/wake-up-check/233
- US Patent 4,060,973, *Automatic variable-sound alarm clock* (1977) — prior art establishing that
  rotating alarm sounds to defeat habituation is a long-known idea, not a novel claim we may make.
  https://patents.justia.com/patent/4060973
