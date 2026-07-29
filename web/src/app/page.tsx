import SoundLab from "@/components/SoundLab";

export default function Home() {
  return (
    <main className="relative flex-1 overflow-hidden">
      <div
        className="glow"
        style={{ background: "var(--accent)", width: 480, height: 480, top: -160, left: -120 }}
      />
      <div
        className="glow"
        style={{
          background: "var(--cool)",
          width: 420,
          height: 420,
          top: 120,
          right: -140,
          animationDelay: "-8s",
        }}
      />

      <div className="relative mx-auto max-w-3xl px-5 py-16 sm:py-24">
        <p className="text-xs uppercase tracking-[0.22em] text-[var(--ink-muted)]">Rouse</p>
        <h1 className="mt-4 max-w-[18ch] text-4xl leading-[1.08] sm:text-6xl">
          The alarm your brain can&rsquo;t learn.
        </h1>
        <p className="mt-6 max-w-[58ch] text-lg text-[var(--ink-muted)]">
          Your brain habituates to a repeated alarm — the tone that used to wake you stops working.
          Press the button and hear a sound that has never existed before.
        </p>

        <div className="mt-10">
          <SoundLab />
        </div>

        {/* ---- The argument ---------------------------------------------------------------- */}
        <section className="mt-20 grid gap-10 sm:grid-cols-2">
          <div>
            <h2 className="text-xl font-medium">Novelty is the mechanism</h2>
            <p className="mt-3 text-[var(--ink-muted)]">
              Habituation is a reduced response to a repeated stimulus — your brain learns the sound
              is not a threat and stops reacting. Novel sounds keep their alerting power because
              there is nothing yet to habituate to.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-medium">Random, but never jarring</h2>
            <p className="mt-3 text-[var(--ink-muted)]">
              Melodic waking sounds are linked to less morning grogginess than harsh ones, so every
              sound is drawn from a melodic space behind fixed rules: no dissonant opening interval,
              and always a gradual fade-in.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-medium">The sound is the easy half</h2>
            <p className="mt-3 text-[var(--ink-muted)]">
              A fixed <em>task</em> habituates just like a fixed tone. People solve the puzzle, scan
              the code, and go straight back to bed. So Rouse randomises the whole wake-up — and
              keeps checking, at times you can&rsquo;t predict, until you&rsquo;ve actually stayed
              up.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-medium">Built to be checked</h2>
            <p className="mt-3 text-[var(--ink-muted)]">
              Most sleep apps cite nothing. Every claim Rouse makes is written down with its source,
              including the ones where the evidence is thin — and what it deliberately refuses to
              claim.
            </p>
          </div>
        </section>

        <footer className="mt-20 border-t border-[var(--border)] pt-8 text-sm text-[var(--ink-muted)]">
          <p>
            Rouse is a wellness tool, not a medical device. It does not diagnose or treat any
            condition. If you are persistently unable to wake or stay awake, that is worth raising
            with a doctor.
          </p>
          <p className="mt-4">Built by Jasper.</p>
        </footer>
      </div>
    </main>
  );
}
