/**
 * Cross-engine parity: the Swift and TypeScript engines must agree.
 *
 * Rouse ships the same generator twice — Swift for the app, TypeScript for the website — and the
 * product promises they behave identically: a given seed yields the same sound, the same serial and
 * the same rarity tier in both. That promise is invisible to test suites, because neither codebase
 * imports the other. It broke once already: the web gained rarity tiers and the Swift did not, and
 * nothing caught it.
 *
 * So this reads both sources and compares the constants that must match. It is deliberately a text
 * comparison rather than a behavioural one, because the Swift cannot be executed on this machine
 * (see docs/TOOLCHAIN.md) — a crude check that runs every day beats a perfect one that never does.
 *
 * Run: node tools/verify-parity.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ts = readFileSync(path.join(root, "web/src/lib/engine.ts"), "utf8");
const swiftRarity = readFileSync(path.join(root, "ios/RouseCore/Sources/RouseCore/Rarity.swift"), "utf8");
const swiftGenome = readFileSync(path.join(root, "ios/RouseCore/Sources/RouseCore/Genome.swift"), "utf8");
const swiftSampler = readFileSync(path.join(root, "ios/RouseCore/Sources/RouseCore/GenomeSampler.swift"), "utf8");

let failures = 0;
const check = (name, ok, detail = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failures++;
};

/** Every distinct number in a source, so a changed threshold on either side shows up. */
const numbers = (src) => new Set((src.match(/-?\d+\.?\d*/g) ?? []).map(Number));

/** Strip comments, so prose about the numbers isn't mistaken for the numbers. */
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Numbers with their occurrence counts — catches a threshold changed in one place but not another. */
function numberCounts(src) {
  const counts = new Map();
  for (const n of (code(src).match(/-?\d+\.?\d*/g) ?? []).map(Number)) {
    counts.set(n, (counts.get(n) ?? 0) + 1);
  }
  return counts;
}

console.log("\n=== Rarity thresholds match across engines ===");
{
  // These are the numbers that decide what tier a sound gets. If one engine drifts, a Legendary on
  // the site becomes a Rare in the app.
  const RARITY_THRESHOLDS = [1100, 380, 112, 62, 19, 2.4, 6200, 10, 0.82];
  const tsNums = numbers(ts.slice(ts.indexOf("// MARK: - Rarity")));
  const swNums = numbers(swiftRarity);
  const missingTs = RARITY_THRESHOLDS.filter((n) => !tsNums.has(n));
  const missingSw = RARITY_THRESHOLDS.filter((n) => !swNums.has(n));
  check("TypeScript has every rarity threshold", missingTs.length === 0, missingTs.join(", "));
  check("Swift has every rarity threshold", missingSw.length === 0, missingSw.join(", "));
}

console.log("\n=== Rarity numbers match exactly, not just approximately ===");
{
  // A stricter comparison than "does this number appear somewhere". Several thresholds appear twice
  // — once to test the trait and once to pick which label it gets — and changing only one of them
  // is a real bug: at bpm 110 the trait would fire but be labelled with the wrong branch. Comparing
  // the full multiset of numbers in each rarity implementation catches that, and catches any
  // addition or removal on either side without hardcoding what to look for.
  const tsRarity = ts.slice(ts.indexOf("// MARK: - Rarity"));
  const a = numberCounts(tsRarity);
  const b = numberCounts(swiftRarity);

  // Structural noise each language has and the other doesn't (case indices, array literals).
  const IGNORE = new Set([0, 1, 2, 3, 4, 5, 6]);
  const meaningful = (m) => [...m].filter(([n]) => !IGNORE.has(n)).sort((x, y) => x[0] - y[0]);

  const aList = meaningful(a), bList = meaningful(b);
  const fmt = (l) => l.map(([n, c]) => (c > 1 ? `${n}x${c}` : `${n}`)).join(" ");
  const same = fmt(aList) === fmt(bList);
  check("identical thresholds, identical multiplicity", same,
        same ? fmt(aList) : `ts: ${fmt(aList)}\n            swift: ${fmt(bList)}`);
}

console.log("\n=== Trait vocabulary matches ===");
{
  // The words shown to users. A tier that says "piercing" on the web and "bright" in the app is the
  // same bug wearing a different hat.
  const LABELS = ["piercing", "subterranean", "breakneck", "glacial", "accelerating",
                  "endless tail", "opening up", "closing down", "frantic", "skeletal", "cavernous"];
  const missingTs = LABELS.filter((l) => !ts.includes(`"${l}"`));
  const missingSw = LABELS.filter((l) => !swiftRarity.includes(`"${l}"`));
  check("TypeScript defines every trait label", missingTs.length === 0, missingTs.join(", "));
  check("Swift defines every trait label", missingSw.length === 0, missingSw.join(", "));

  // And neither may invent labels the other doesn't have.
  const tsExtra = [...ts.slice(ts.indexOf("// MARK: - Rarity")).matchAll(/"([a-z ]{4,16})"/g)]
    .map((m) => m[1]).filter((l) => !LABELS.includes(l));
  check("TypeScript adds no unknown trait labels", tsExtra.length === 0, tsExtra.join(", "));
}

console.log("\n=== Tier names and order match ===");
{
  const TIERS = ["Common", "Uncommon", "Rare", "Epic", "Legendary"];
  check("TypeScript RARITY_ORDER is correct",
        TIERS.every((t) => ts.includes(`"${t}"`)) &&
        ts.includes('["Common", "Uncommon", "Rare", "Epic", "Legendary"]'));
  check("Swift declares the same five tiers",
        TIERS.every((t) => swiftRarity.includes(`= "${t}"`)));
}

console.log("\n=== Generator constants match ===");
{
  // The genome limits and safety rails define what sounds exist at all. These drifting would break
  // the deeper promise: that a serial means the same thing in both places.
  const PAIRS = [
    ["root range", [180, 420]],
    ["attack range", [0.005, 0.4]],
    ["decay range", [0.2, 3.0]],
    ["bpm range", [56, 120]],
    ["accel range", [0, 24]],
    ["cutoff range", [400, 9000]],
    ["centroid rails", [250, 5000]],
    ["forbidden intervals", [1, 6, 11]],
  ];
  const tsNums = numbers(ts);
  const swNums = new Set([...numbers(swiftGenome), ...numbers(swiftSampler)]);
  for (const [name, values] of PAIRS) {
    const okTs = values.every((v) => tsNums.has(v));
    const okSw = values.every((v) => swNums.has(v));
    check(`${name} present in both`, okTs && okSw,
          okTs ? (okSw ? "" : "missing in Swift") : "missing in TypeScript");
  }
}

console.log("\n=== Novelty threshold ===");
{
  // The web deliberately differs here: the Lab samples against an empty history so a shared link is
  // reproducible, while the app keeps the 30-day novelty constraint because its seeds are
  // date-derived and can land close together. Documented so nobody "fixes" the discrepancy.
  const tsThreshold = ts.match(/NOVELTY_THRESHOLD\s*=\s*([\d.]+)/)?.[1];
  const swThreshold = swiftSampler.match(/noveltyThreshold\s*=\s*([\d.]+)/)?.[1];
  check("both engines declare a novelty threshold", !!tsThreshold && !!swThreshold,
        `ts=${tsThreshold} swift=${swThreshold}`);
  // Compared numerically: "1.1" and "1.10" are the same threshold written two ways, and a string
  // comparison flags that as drift.
  const agree = Number(tsThreshold) === Number(swThreshold);
  check("thresholds agree", agree,
        agree ? `both ${Number(tsThreshold)}` : `ts=${tsThreshold} swift=${swThreshold}`);
}

console.log(`\n${failures === 0 ? "ENGINES IN SYNC" : failures + " PARITY FAILURE(S)"}\n`);
process.exit(failures === 0 ? 0 : 1);
