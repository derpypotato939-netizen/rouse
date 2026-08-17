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
        <p className="mt-6 max-w-[54ch] text-lg text-[var(--ink-muted)]">
          Every morning it makes you a sound that has never existed. You will never hear the same
          alarm twice. Press the button — this one is yours.
        </p>

        <div className="mt-10">
          <SoundLab />
        </div>

        {/* ---- Three short answers to the three questions people actually have ---- */}
        <section className="mt-20 grid gap-10 sm:grid-cols-3">
          <div>
            <h2 className="text-xl font-medium">Never the same twice</h2>
            <p className="mt-3 text-[var(--ink-muted)]">
              Not a shuffle through a library of ten tones. Each one is built from scratch, the
              moment you ask for it, and then it is gone.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-medium">Some are rare</h2>
            <p className="mt-3 text-[var(--ink-muted)]">
              A sound gets a rarity from the unusual things it actually does — piercing, breakneck,
              cavernous. Legendary turns up about once in eighty. You will know when you get one.
            </p>
          </div>
          <div>
            <h2 className="text-xl font-medium">It fades in</h2>
            <p className="mt-3 text-[var(--ink-muted)]">
              Every sound starts near silent and climbs over eight seconds. Being blasted awake at
              full volume feels awful and you stay groggy longer. This one arrives.
            </p>
          </div>
        </section>

        <footer className="mt-20 border-t border-[var(--border)] pt-8 text-sm text-[var(--ink-muted)]">
          <p>
            Rouse is a wellness tool, not a medical device. If you are persistently unable to wake
            or stay awake, that is worth raising with a doctor.
          </p>
          <p className="mt-4">
            Built by Jasper ·{" "}
            <a href="/privacy" className="underline underline-offset-4 hover:text-[var(--accent)]">
              Privacy
            </a>{" "}
            ·{" "}
            <a
              href="https://github.com/derpypotato939-netizen/rouse/blob/main/docs/SCIENCE.md"
              className="underline underline-offset-4 hover:text-[var(--accent)]"
            >
              What we do and don’t claim
            </a>
          </p>
        </footer>
      </div>
    </main>
  );
}
