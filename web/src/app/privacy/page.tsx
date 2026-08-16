import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Rouse",
  description: "What Rouse collects, why, and how to get rid of it.",
};

/**
 * Deliberately short and specific. A policy that lists things this site does not do is worse than
 * useless — it is inaccurate, and the audience for this product is unusually alert to being handled
 * carelessly. Update this page whenever data handling changes; Apple requires a policy URL at App
 * Store submission and will read it.
 */
export default function Privacy() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-16 sm:py-24">
      <Link href="/" className="text-sm text-[var(--ink-muted)] hover:text-[var(--accent)]">
        ← Rouse
      </Link>

      <h1 className="mt-8 text-4xl">Privacy</h1>
      <p className="mt-4 text-[var(--ink-muted)]">Last updated 29 July 2026.</p>

      <section className="mt-10 space-y-6 text-[var(--ink-muted)]">
        <div>
          <h2 className="text-xl text-[var(--ink)]">The sounds never leave your device</h2>
          <p className="mt-2">
            Every sound on this site is generated in your browser. No audio is uploaded, stored, or
            sent anywhere. If you download one, the file is created locally.
          </p>
        </div>

        <div>
          <h2 className="text-xl text-[var(--ink)]">If you join the waitlist</h2>
          <p className="mt-2">
            We store your email address, and two numbers: how many sounds you generated and how many
            you downloaded before signing up. That is it — no name, no location, no profile.
          </p>
          <p className="mt-2">
            Addresses are held by <strong className="text-[var(--ink)]">Kit</strong> (kit.com), which
            handles our email. You will get a confirmation email; you are only subscribed if you
            click it. After that you get <em>one</em> email when the iOS beta opens. Every email has
            an unsubscribe link, and unsubscribing deletes you from the list.
          </p>
        </div>

        <div>
          <h2 className="text-xl text-[var(--ink)]">Anonymous usage counts</h2>
          <p className="mt-2">
            When you leave the page we record how many sounds were generated, downloaded and shared
            in that visit, and how long it lasted. It contains nothing that identifies you and is not
            linked to your email. We use it to find out whether the idea is worth building.
          </p>
        </div>

        <div>
          <h2 className="text-xl text-[var(--ink)]">No cookies, no trackers</h2>
          <p className="mt-2">
            This site sets no cookies, runs no advertising or analytics scripts, and shares nothing
            with data brokers. That is why there is no cookie banner — there is nothing to consent
            to.
          </p>
        </div>

        <div>
          <h2 className="text-xl text-[var(--ink)]">Getting your data removed</h2>
          <p className="mt-2">
            Use the unsubscribe link in any email, or write to{" "}
            <a
              href="mailto:derpypotato939@gmail.com"
              className="text-[var(--accent-soft)] underline underline-offset-4"
            >
              derpypotato939@gmail.com
            </a>{" "}
            and it will be deleted.
          </p>
        </div>

        <div>
          <h2 className="text-xl text-[var(--ink)]">Not a medical service</h2>
          <p className="mt-2">
            Rouse is a wellness tool. It does not diagnose or treat any condition, and nothing here
            is medical advice. Claims made about sleep and habituation are sourced in{" "}
            <a
              href="https://github.com/derpypotato939-netizen/rouse/blob/main/docs/SCIENCE.md"
              className="text-[var(--accent-soft)] underline underline-offset-4"
            >
              our public claims ledger
            </a>
            .
          </p>
        </div>
      </section>
    </main>
  );
}
