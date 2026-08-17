/**
 * Asserts the published rarity odds are the real ones.
 *
 * A tier list is a promise about frequency. Users test that promise simply by using the app, so if
 * the stated odds and the actual odds diverge, it is a lie they can detect by playing — and the
 * damage lands on everything else the page says.
 *
 * Run: node --experimental-strip-types tools/verify-rarity.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const lib = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "web", "src", "lib");
const { sampleGenome, seedHash, rarityFor, RARITY_ORDER, seedToToken, tokenToSeed } =
  await import(path.join(lib, "engine.ts"));

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

// Published odds, with tolerance. Tight enough to catch a real drift, loose enough not to be
// flaky — these are sampled, not exact.
const EXPECTED = {
  Common:    [26, 34],
  Uncommon:  [36, 44],
  Rare:      [19, 26],
  Epic:      [5.0, 8.5],
  Legendary: [0.7, 1.8],
};

const N = 100000;
console.log(`\n=== Rarity distribution over ${N.toLocaleString()} sounds ===`);
const counts = Object.fromEntries(RARITY_ORDER.map((t) => [t, 0]));
let traitless = 0;

for (let i = 0; i < N; i++) {
  const g = sampleGenome(seedHash(`rarity|${i}`)).genome;
  const { tier, traits } = rarityFor(g);
  counts[tier]++;
  // Every tier above Common must be able to say why it is that tier.
  if (tier !== "Common" && traits.length === 0) traitless++;
}

for (const tier of RARITY_ORDER) {
  const pct = (counts[tier] / N) * 100;
  const [lo, hi] = EXPECTED[tier];
  const odds = counts[tier] > 0 ? `1 in ${Math.round(N / counts[tier])}` : "never";
  check(
    `${tier.padEnd(9)} within ${lo}–${hi}%`,
    pct >= lo && pct <= hi,
    `${pct.toFixed(2)}%  (${odds})`
  );
}

check("every non-Common tier lists its traits", traitless === 0, `${traitless} unexplained`);

console.log("\n=== Rarity survives a share link ===");
{
  // A link that downgrades someone's Legendary is the worst bug this feature can have.
  let mismatches = 0;
  for (let i = 0; i < 5000; i++) {
    const seed = seedHash(`sharerarity|${i}`);
    const sender = rarityFor(sampleGenome(seed, []).genome);
    const recipient = rarityFor(sampleGenome(tokenToSeed(seedToToken(seed)), []).genome);
    if (sender.tier !== recipient.tier) mismatches++;
  }
  check("tier identical for sender and recipient", mismatches === 0, `${mismatches}/5000 differed`);
}

console.log("\n=== Legendary sounds are actually distinctive ===");
{
  // Guard against a future edit that makes tiers easy to reach without being audible.
  let legendaryTraits = 0, legendaryCount = 0;
  for (let i = 0; i < 200000 && legendaryCount < 200; i++) {
    const r = rarityFor(sampleGenome(seedHash(`leg|${i}`)).genome);
    if (r.tier === "Legendary") { legendaryCount++; legendaryTraits += r.traits.length; }
  }
  const avg = legendaryTraits / Math.max(legendaryCount, 1);
  check("Legendary averages 4+ unusual traits", avg >= 4, `${avg.toFixed(2)} traits (n=${legendaryCount})`);
}

console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : failures + " CHECK(S) FAILED"}\n`);
process.exit(failures === 0 ? 0 : 1);
