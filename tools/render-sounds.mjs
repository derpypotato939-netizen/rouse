/**
 * Batch-render Rouse sounds to .wav — the raw material for Lane A content.
 *
 * This exists because the Swift renderer (`swift run rouse-render`) cannot run: the Command Line
 * Tools install on this machine can't compile Swift at all (see docs/TOOLCHAIN.md). The TypeScript
 * port is byte-faithful to the Swift, so driving it from Node produces the same audio and unblocks
 * content production today rather than after an Xcode install.
 *
 *   node --experimental-strip-types tools/render-sounds.mjs --count 30 --out ./out
 *   node --experimental-strip-types tools/render-sounds.mjs --count 5 --seconds 12 --family glass.fast
 *
 * Node warns that `web/package.json` has no `"type": "module"`. It is harmless — silence it with
 * `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` if it bothers you. Do NOT "fix" it by adding
 * `"type": "module"` to the web package: that changes how Next resolves its own config files.
 *
 * Each file is a real 29-second alarm stinger. Drop them into CapCut over a screen recording of the
 * Sound Lab, or use them straight as audio for a faceless post.
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const lib = path.join(here, "..", "web", "src", "lib");

const { sampleGenome, seedHash, serialFor, describeGenome, SOUND_FAMILIES, violatesSafetyRails } =
  await import(path.join(lib, "engine.ts"));
const { render, toWav } = await import(path.join(lib, "synth.ts"));

function parseArgs() {
  const o = { count: 10, seconds: 29, out: "./out", family: null, salt: `batch-${Date.now()}` };
  const args = process.argv.slice(2);
  while (args.length) {
    const flag = args.shift();
    const value = () => (args[0] && !args[0].startsWith("--") ? args.shift() : undefined);
    switch (flag) {
      case "--count": o.count = Number(value()) || o.count; break;
      case "--seconds": o.seconds = Number(value()) || o.seconds; break;
      case "--out": o.out = value() ?? o.out; break;
      case "--family": o.family = value() ?? null; break;
      case "--salt": o.salt = value() ?? o.salt; break;
      case "--help":
      case "-h":
        console.log(`render-sounds — batch-render Rouse alarm sounds to .wav

  --count N       how many to render (default 10)
  --seconds S     length of each (default 29, AlarmKit's cap)
  --out DIR       output directory (default ./out)
  --family ID     restrict to one sound family, e.g. glass.fast
  --salt STRING   seed salt; change it for a different batch

Families: ${SOUND_FAMILIES.map((f) => f.id).join(", ")}`);
        process.exit(0);
      default:
        console.error(`unknown flag: ${flag}`);
        process.exit(2);
    }
  }
  return o;
}

const options = parseArgs();
const outDir = path.resolve(options.out);
await mkdir(outDir, { recursive: true });

let family = null;
if (options.family) {
  family = SOUND_FAMILIES.find((f) => f.id === options.family);
  if (!family) {
    console.error(`unknown family "${options.family}". Try --help for the list.`);
    process.exit(2);
  }
}

console.log(
  `Rendering ${options.count} sound${options.count === 1 ? "" : "s"} at ${options.seconds}s` +
    `${family ? ` from ${family.id}` : ""}\n`
);
console.log("  #   serial   character            novelty   file");
console.log("  " + "─".repeat(70));

// The same rolling history the app keeps, so a batch is internally novel rather than 30 draws that
// happen to collide.
const history = [];
let fallbacks = 0;

for (let i = 0; i < options.count; i++) {
  const seed = seedHash(`${options.salt}|${i}`);
  const draw = sampleGenome(seed, history, family);

  if (violatesSafetyRails(draw.genome)) {
    console.error(`  !! draw ${i} violated a safety rail — this should be impossible, skipping`);
    continue;
  }
  if (draw.usedFallback) fallbacks += 1;

  const buffer = render(draw.genome, options.seconds, i);
  const serial = String(serialFor(seed)).padStart(5, "0");
  const name = `rouse-${serial}.wav`;

  const blob = toWav(buffer);
  await writeFile(path.join(outDir, name), Buffer.from(await blob.arrayBuffer()));

  const novelty = Number.isFinite(draw.nearestDistance) ? draw.nearestDistance.toFixed(2) : "—";
  console.log(
    `  ${String(i + 1).padStart(3)}  ${serial}   ${describeGenome(draw.genome).padEnd(20)} ` +
      `${novelty.padStart(7)}   ${name}`
  );

  history.unshift(draw.genome);
}

console.log(`\nWrote ${options.count} file${options.count === 1 ? "" : "s"} to ${outDir}`);
if (fallbacks) {
  console.log(
    `${fallbacks} draw${fallbacks === 1 ? "" : "s"} fell back to max-min novelty — expected only ` +
      `if you asked for many sounds from a single family.`
  );
}
