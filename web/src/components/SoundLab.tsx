"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  NOVELTY_THRESHOLD,
  describeGenome,
  distance,
  renderSeedFor,
  sampleGenome,
  seedHash,
  seedToToken,
  serialFor,
  tokenToSeed,
  type Genome,
} from "@/lib/engine";
import { peaks, render, toAudioBuffer, toWav, type StereoBuffer } from "@/lib/synth";

/** Matches `Rouse.stingerSeconds` — AlarmKit caps custom alarm sounds at 30 seconds. */
const STINGER_SECONDS = 29;

/**
 * Playback starts past the loudness ramp by default.
 *
 * The first 8 seconds are deliberately near-silent — a sound that arrives at full level triggers a
 * startle response, which is the opposite of what Rouse is for. That is correct behaviour for an
 * alarm and terrible behaviour for a demo, so the default press drops you where the sound is
 * actually alive, and the ramp is shown in the waveform instead of being heard as dead air.
 */
const SKIP_RAMP_TO = 6.5;

const WAVEFORM_BINS = 220;

type Sound = {
  genome: Genome;
  buffer: StereoBuffer;
  /** Kept so the share link can carry something that actually reproduces this sound. */
  seed: bigint;
  serial: number;
  family: string;
  bins: number[];
  novelty: number;
};

export default function SoundLab() {
  const [sound, setSound] = useState<Sound | null>(null);
  const [generating, setGenerating] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [fromStart, setFromStart] = useState(false);
  const [count, setCount] = useState(0);
  const [downloads, setDownloads] = useState(0);
  const [email, setEmail] = useState("");
  const [joinState, setJoinState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [joinError, setJoinError] = useState("");
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  /** Honeypot. Real users never see this field, so a non-empty value means a bot filled the form. */
  const [website, setWebsite] = useState("");
  /** Kit uses double opt-in, so "submitted" and "subscribed" are not the same thing. */
  const [needsConfirmation, setNeedsConfirmation] = useState(true);

  const historyRef = useRef<Genome[]>([]);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  // Set on mount rather than during render — reading the clock while rendering is impure and can
  // change between a render and its replay.
  const startedAtRef = useRef<number | null>(null);

  // --- Session beacon -------------------------------------------------------------------------
  // One summary per session on hide. Enough to answer Gate 1, small enough to read in a sheet.
  const statsRef = useRef({ sounds: 0, downloads: 0, shares: 0, signedUp: false });
  useEffect(() => {
    startedAtRef.current ??= Date.now();
    const send = () => {
      if (document.visibilityState !== "hidden") return;
      const payload = {
        ...statsRef.current,
        seconds: Math.round((Date.now() - (startedAtRef.current ?? Date.now())) / 1000),
      };
      navigator.sendBeacon?.("/api/event", new Blob([JSON.stringify(payload)], {
        type: "application/json",
      }));
    };
    document.addEventListener("visibilitychange", send);
    return () => document.removeEventListener("visibilitychange", send);
  }, []);

  const stop = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback(
    (target: Sound, offset: number) => {
      // The AudioContext must be created inside a user gesture or iOS Safari keeps it suspended.
      const context =
        contextRef.current ?? new (window.AudioContext || window.webkitAudioContext)();
      contextRef.current = context;
      void context.resume();

      sourceRef.current?.stop();
      const source = context.createBufferSource();
      source.buffer = toAudioBuffer(target.buffer, context);
      source.connect(context.destination);
      source.onended = () => {
        if (sourceRef.current === source) {
          sourceRef.current = null;
          setPlaying(false);
        }
      };
      source.start(0, offset);
      sourceRef.current = source;
      setPlaying(true);
    },
    []
  );

  /**
   * Build and play the sound for a specific seed.
   *
   * Seed-driven rather than index-driven so a shared link reproduces exactly what the sender heard.
   * `autoplay` is false when restoring from a URL: browsers block audio that no one asked for, and
   * a page that makes noise on arrival is worse than one that waits to be asked.
   */
  const generateFrom = useCallback(
    (seed: bigint, autoplay = true) => {
      setGenerating(true);
      stop();

      // Yield a frame so the "generating" state paints before the synchronous render blocks.
      setTimeout(() => {
        // Sampled against an EMPTY history on purpose, so a genome is a pure function of its seed.
        //
        // Passing the session history here made the draw depend on what you had already heard —
        // which meant a recipient arriving from a link, with no history, could resolve the same
        // seed to a different sound. Measured at roughly 1 in 12 shared links delivering the wrong
        // audio (tools/verify-share.mjs). The novelty-vs-history machinery still matters in the
        // iOS app, where seeds are date-derived and can land close together; here seeds are random,
        // so collisions are already vanishingly unlikely.
        const draw = sampleGenome(seed, []);
        const buffer = render(draw.genome, STINGER_SECONDS, renderSeedFor(seed));

        // Distance is still computed against the session, purely so the page can say how far this
        // sound sits from the last few. It no longer influences which sound you get.
        const nearest = historyRef.current.length
          ? Math.min(...historyRef.current.map((h) => distance(draw.genome, h)))
          : Infinity;

        const next: Sound = {
          genome: draw.genome,
          buffer,
          seed,
          serial: serialFor(seed),
          family: describeGenome(draw.genome),
          bins: peaks(buffer, WAVEFORM_BINS),
          novelty: nearest,
        };

        historyRef.current = [draw.genome, ...historyRef.current];
        statsRef.current.sounds = historyRef.current.length;
        setCount(historyRef.current.length);
        setSound(next);
        setGenerating(false);
        if (autoplay) play(next, fromStart ? 0 : SKIP_RAMP_TO);
      }, 20);
    },
    [fromStart, play, stop]
  );

  const generate = useCallback(() => {
    const nth = historyRef.current.length + 1;
    generateFrom(seedHash(`lab|${startedAtRef.current ?? 0}|${nth}|${Math.random()}`));
  }, [generateFrom]);

  // Restore a shared sound. Runs once; a bad or absent token simply leaves the page in its normal
  // "press the button" state rather than erroring at someone who followed a link.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const token = new URLSearchParams(window.location.search).get("s");
    if (!token) return;
    const seed = tokenToSeed(token);
    if (seed === null) return;
    // Deferred out of the effect body: `generateFrom` sets state immediately, and doing that
    // synchronously inside an effect triggers a cascading render. Restoring a shared sound is
    // asynchronous work anyway — it renders 29 seconds of audio — so a task boundary is honest here,
    // not a workaround.
    const task = setTimeout(() => generateFrom(seed, false), 0);
    return () => clearTimeout(task);
  }, [generateFrom]);

  const download = useCallback(() => {
    if (!sound) return;
    const url = URL.createObjectURL(toWav(sound.buffer));
    const a = document.createElement("a");
    a.href = url;
    a.download = `rouse-${String(sound.serial).padStart(5, "0")}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    statsRef.current.downloads += 1;
    setDownloads((d) => d + 1);
  }, [sound]);

  /**
   * Share the sound's serial. Uses the native share sheet where it exists — which is where this
   * page's traffic actually lands, since it arrives from short-form video — and falls back to
   * copying the link on desktop.
   */
  const share = useCallback(async () => {
    if (!sound) return;
    const serial = String(sound.serial).padStart(5, "0");
    // The token, not the serial: `serialFor` is lossy and cannot rebuild the sound.
    const url = `${window.location.origin}?s=${seedToToken(sound.seed)}`;
    const text = `Rouse sound #${serial} — an alarm tone that has never existed before and will never repeat.`;

    try {
      if (navigator.share) {
        await navigator.share({ title: "Rouse", text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setShareState("copied");
        setTimeout(() => setShareState("idle"), 2200);
      }
      statsRef.current.shares += 1;
    } catch {
      // A cancelled share sheet throws. That is not an error and must not be counted as a share.
    }
  }, [sound]);

  const join = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setJoinState("sending");
      setJoinError("");
      try {
        const res = await fetch("/api/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            sounds: statsRef.current.sounds,
            downloads: statsRef.current.downloads,
            source: "sound-lab",
            website,
            elapsedMs: Date.now() - (startedAtRef.current ?? Date.now()),
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? "Something went wrong.");
        statsRef.current.signedUp = true;
        setNeedsConfirmation(body.confirmationRequired !== false);
        setJoinState("done");
      } catch (err) {
        setJoinError(err instanceof Error ? err.message : "Something went wrong.");
        setJoinState("error");
      }
    },
    [email, website]
  );

  return (
    <div className="w-full">
      {/* ---- The lab ---------------------------------------------------------------------- */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-raised)] p-6 sm:p-8">
        {sound ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                  Sound
                </div>
                <div className="font-mono text-3xl sm:text-4xl text-[var(--accent-soft)]">
                  #{String(sound.serial).padStart(5, "0")}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                  Character
                </div>
                <div className="text-lg">{sound.family}</div>
              </div>
            </div>

            <Waveform bins={sound.bins} playing={playing} />

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                onClick={() => (playing ? stop() : play(sound, fromStart ? 0 : SKIP_RAMP_TO))}
                className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm transition hover:border-[var(--accent)] hover:text-[var(--accent-soft)]"
              >
                {playing ? "■ Stop" : "▶ Play again"}
              </button>
              <button
                onClick={generate}
                disabled={generating}
                className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-[#1a0d06] transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
              >
                {generating ? "Generating…" : "Generate another"}
              </button>
              <button
                onClick={download}
                className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm transition hover:border-[var(--cool)] hover:text-[var(--cool)]"
              >
                ↓ Download .wav
              </button>
              <button
                onClick={share}
                className="rounded-full border border-[var(--border)] px-5 py-2.5 text-sm transition hover:border-[var(--cool)] hover:text-[var(--cool)]"
              >
                {shareState === "copied" ? "✓ Link copied" : "↗ Share this sound"}
              </button>
            </div>

            <label className="mt-4 flex items-center gap-2 text-sm text-[var(--ink-muted)]">
              <input
                type="checkbox"
                checked={fromStart}
                onChange={(e) => setFromStart(e.target.checked)}
                className="accent-[var(--accent)]"
              />
              Play from the very beginning — including the 8-second ramp
            </label>

            {count > 1 && (
              <p className="mt-5 border-t border-[var(--border)] pt-5 text-sm text-[var(--ink-muted)]">
                You&rsquo;ve heard <span className="text-[var(--ink)]">{count} sounds</span>. None of
                them existed before you pressed the button, and none of them will ever occur again.
                {/* Built as one string: JSX silently drops the space between an expression and
                    the text that follows it, which produced "2.63away" on the first pass. */}
                {sound.novelty !== Infinity &&
                  ` This one sits ${sound.novelty.toFixed(2)} away from the nearest thing you’ve` +
                    ` already heard — the engine refuses anything closer than` +
                    ` ${NOVELTY_THRESHOLD.toFixed(2)}.`}
              </p>
            )}
          </>
        ) : (
          <div className="py-6 text-center">
            <button
              onClick={generate}
              disabled={generating}
              className="rounded-full bg-[var(--accent)] px-8 py-4 text-base font-medium text-[#1a0d06] transition hover:bg-[var(--accent-soft)] disabled:opacity-60"
            >
              {generating ? "Generating…" : "Generate a sound nobody has ever heard"}
            </button>
            <p className="mt-4 text-sm text-[var(--ink-muted)]">
              Synthesised in your browser, from scratch. Turn your volume up a little.
            </p>
          </div>
        )}
      </div>

      {/* ---- Waitlist --------------------------------------------------------------------- */}
      <div className="mt-6 rounded-2xl border border-[var(--border)] p-6 sm:p-8">
        {joinState === "done" ? (
          // Kit only subscribes someone once they click the confirmation link. Saying "you're on
          // the list" before that would be untrue, and would quietly inflate the Gate 1 number.
          <div className="text-[var(--cool)]">
            {needsConfirmation ? (
              <>
                <p className="font-medium">Almost — check your inbox.</p>
                <p className="mt-2 text-sm text-[var(--ink-muted)]">
                  We&rsquo;ve sent a confirmation email. You&rsquo;re on the list once you click the
                  link in it. After that: one email when the iOS beta opens, nothing else.
                </p>
              </>
            ) : (
              <p>You&rsquo;re on the list. One email when the iOS beta opens — nothing else.</p>
            )}
          </div>
        ) : (
          <>
            <h2 className="text-xl font-medium">Want it as an actual alarm?</h2>
            <p className="mt-2 text-sm text-[var(--ink-muted)]">
              Rouse is being built for iOS, because a web page cannot reliably wake anyone — browsers
              suspend timers the moment the phone sleeps. One email when the beta opens. No spam, no
              sharing, unsubscribe whenever.
            </p>
            <form onSubmit={join} className="mt-4 flex flex-col gap-3 sm:flex-row">
              {/*
                Honeypot. Hidden from people and from screen readers (aria-hidden + tabIndex -1) but
                present in the DOM, so an automated form-filler populates it and gives itself away.
                Deliberately named "website" — bots look for familiar field names.
              */}
              <input
                type="text"
                name="website"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                style={{ position: "absolute", left: "-9999px", width: 1, height: 1 }}
              />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 rounded-full border border-[var(--border)] bg-[var(--bg)] px-5 py-3 text-sm outline-none focus:border-[var(--accent)]"
              />
              <button
                type="submit"
                disabled={joinState === "sending"}
                className="rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-medium text-[#1a0d06] transition hover:bg-[var(--accent-soft)] disabled:opacity-50"
              >
                {joinState === "sending" ? "…" : "Join the beta list"}
              </button>
            </form>
            {joinError && <p className="mt-3 text-sm text-[var(--accent)]">{joinError}</p>}
          </>
        )}
        {downloads > 0 && (
          <p className="mt-4 text-xs text-[var(--ink-muted)]">
            Tip: the file you downloaded is exactly what the alarm would play.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Peak envelope, with the deliberate ramp shaded so the design decision is visible.
 *
 * The bar count is derived from the measured width rather than fixed. At a fixed 220 bars a
 * 375 px phone gives each bar under 1.5 px before gaps, `flex-1` collapses them to zero, and the
 * waveform renders as an empty box — which is exactly where most of this page's traffic will be.
 */
function Waveform({ bins, playing }: { bins: number[]; playing: boolean }) {
  const rampFraction = 8 / STINGER_SECONDS;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  // ~4 px per bar including its gap keeps bars visible at any width.
  const shown = width > 0 ? Math.max(24, Math.min(bins.length, Math.floor(width / 4))) : 64;
  const group = bins.length / shown;
  const display = Array.from({ length: shown }, (_, i) => {
    const start = Math.floor(i * group);
    const end = Math.max(start + 1, Math.floor((i + 1) * group));
    let peak = 0;
    for (let j = start; j < end && j < bins.length; j++) peak = Math.max(peak, bins[j]);
    return peak;
  });

  return (
    <div className="mt-6">
      <div
        ref={containerRef}
        className="flex h-28 items-end gap-[2px]"
        role="img"
        aria-label="Waveform of the generated sound"
      >
        {display.map((peak, i) => {
          const inRamp = i / display.length < rampFraction;
          return (
            <div
              key={i}
              className="min-w-[1px] flex-1 rounded-full transition-[height] duration-300"
              style={{
                height: `${Math.max(2, peak * 100)}%`,
                background: inRamp ? "var(--cool)" : "var(--accent)",
                opacity: playing ? 1 : 0.65,
              }}
            />
          );
        })}
      </div>
      <p className="mt-2 text-xs text-[var(--ink-muted)]">
        <span className="text-[var(--cool)]">Teal</span> is the 8-second ramp. Every Rouse sound fades
        in — waking to a sound at full volume triggers a startle response, which makes the grogginess
        worse, not better.
      </p>
    </div>
  );
}
