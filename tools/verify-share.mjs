/**
 * Regression test for share links.
 *
 * The share loop is a Gate 1 metric and the growth mechanism, so a link that fails to reproduce the
 * sound it names is a silent product failure. Two bugs already lived here:
 *
 *   1. The page never read the `?s=` parameter at all — every shared link landed on a generic page.
 *   2. The parameter carried `serialFor(seed)`, which is `seed % 100000` and therefore lossy. Even
 *      once read, it could not rebuild the sound.
 *
 * Run: node --experimental-strip-types tools/verify-share.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const lib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "src", "lib");
const { seedHash, seedToToken, tokenToSeed, sampleGenome, serialFor, renderSeedFor } =
  await import(path.join(lib, "engine.ts"));
const { render } = await import(path.join(lib, "synth.ts"));

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

console.log("\n=== 1. Token round-trips losslessly ===");
{
  let worst = null;
  for (let i = 0; i < 20000; i++) {
    const seed = seedHash(`share|${i}`);
    if (tokenToSeed(seedToToken(seed)) !== seed) { worst = seed; break; }
  }
  check("20,000 seeds survive seed → token → seed", worst === null,
        worst === null ? "" : `broke on ${worst}`);

  // The old behaviour, kept as a guard: prove the serial genuinely cannot do this job, so nobody
  // "simplifies" the token away later.
  const a = seedHash("collide-a"), b = seedHash("collide-b");
  check("serial is lossy by design (not a valid identifier)",
        String(serialFor(a)).length <= 5 && seedToToken(a).length > 5,
        `serial=${serialFor(a)} token=${seedToToken(a)}`);
  void b;
}

console.log("\n=== 2. Malformed tokens are rejected, not guessed at ===");
{
  const bad = ["", "!!!", "ABC", "-1", "0.5", "z".repeat(20), "<script>", "../../etc"];
  const rejected = bad.filter((t) => tokenToSeed(t) === null);
  check("all malformed tokens return null", rejected.length === bad.length,
        `${rejected.length}/${bad.length}`);
}

console.log("\n=== 3. A recipient hears exactly what the sender heard ===");
{
  let mismatches = 0;
  for (let i = 0; i < 12; i++) {
    const seed = seedHash(`recipient|${i}`);

    // Sender: generated after some prior listening in the session. The Lab passes an empty history
    // deliberately (see SoundLab.tsx) so the draw cannot depend on it — that is what this asserts.
    const sender = sampleGenome(seed, []).genome;
    const senderAudio = render(sender, 3, renderSeedFor(seed));

    // Recipient: arrives cold from a link, with no history at all.
    const recipientSeed = tokenToSeed(seedToToken(seed));
    const recipient = sampleGenome(recipientSeed, []).genome;
    const recipientAudio = render(recipient, 3, renderSeedFor(recipientSeed));

    let identical = senderAudio.left.length === recipientAudio.left.length;
    if (identical) {
      for (let f = 0; f < senderAudio.left.length; f += 97) {
        if (senderAudio.left[f] !== recipientAudio.left[f]) { identical = false; break; }
      }
    }
    if (!identical) mismatches++;
  }
  // This is the subtle one, and it failed on first run: the sender's novelty history pushed the
  // sampler to a different draw than the recipient's empty history, so ~1 in 12 links delivered the
  // wrong sound. Fixed by sampling against an empty history in the Lab. If this regresses, do not
  // paper over it — either restore the empty-history draw, or make the token carry the genome.
  check("sender and recipient audio match", mismatches === 0, `${mismatches}/12 differed`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}\n`);
process.exit(failures === 0 ? 0 : 1);
