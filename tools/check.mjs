/**
 * Run every check, in one command.
 *
 * There are four harnesses now, and four things to remember is zero things that actually get run.
 * This is the single entry point:
 *
 *   node tools/check.mjs
 *
 * Each one exists because it caught a real bug that reading the code did not:
 *
 *   validate      a safety rail that rejected 92% of draws and starved every bandit arm; ladder
 *                 checkpoints violating minimum spacing; checkpoints bunching late enough to leave
 *                 an 18-minute blind spot
 *   share         shared links resolving to a different sound than the sender heard, ~1 in 12
 *   rarity        that the published tier odds are the real ones
 *   parity        the Swift and TypeScript engines drifting apart unnoticed
 *   web           typecheck, lint and production build
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE_TS = ["--experimental-strip-types", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"];

const CHECKS = [
  { name: "engine tuning", cmd: "node", args: ["tools/validate.mjs"], cwd: root,
    // validate.mjs deliberately keeps two failing checks as the documented before/after record of
    // the safety-rail bug, so its exit code is not a pass/fail signal. Look at the count instead.
    expectFailures: 2 },
  { name: "share links",   cmd: "node", args: [...NODE_TS, "tools/verify-share.mjs"], cwd: root },
  { name: "rarity odds",   cmd: "node", args: [...NODE_TS, "tools/verify-rarity.mjs"], cwd: root },
  { name: "engine parity", cmd: "node", args: ["tools/verify-parity.mjs"], cwd: root },
  { name: "web typecheck", cmd: "npx", args: ["tsc", "--noEmit"], cwd: path.join(root, "web") },
  { name: "web lint",      cmd: "npx", args: ["eslint", "src", "--max-warnings=0"], cwd: path.join(root, "web") },
  { name: "web build",     cmd: "npm", args: ["run", "build"], cwd: path.join(root, "web") },
];

function run(check) {
  return new Promise((resolve) => {
    const child = spawn(check.cmd, check.args, { cwd: check.cwd, shell: false });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => {
      if (check.expectFailures !== undefined) {
        const failed = (out.match(/^ {2}FAIL/gm) ?? []).length;
        const passed = (out.match(/^ {2}PASS/gm) ?? []).length;
        resolve({
          ok: failed === check.expectFailures,
          detail: `${passed} passed, ${failed} expected-fail`,
          out,
        });
        return;
      }
      resolve({ ok: code === 0, detail: code === 0 ? "" : `exit ${code}`, out });
    });
  });
}

const started = Date.now();
console.log("\nRouse — running all checks\n");

const results = [];
for (const check of CHECKS) {
  process.stdout.write(`  ${check.name.padEnd(16)} `);
  const r = await run(check);
  console.log(r.ok ? `ok${r.detail ? "  (" + r.detail + ")" : ""}` : `FAILED  ${r.detail}`);
  results.push({ check, ...r });
}

const failed = results.filter((r) => !r.ok);
const seconds = ((Date.now() - started) / 1000).toFixed(0);

if (failed.length === 0) {
  console.log(`\nAll checks passed in ${seconds}s.\n`);
  process.exit(0);
}

// Print output only for what broke — a wall of successful output is how people learn to ignore CI.
for (const f of failed) {
  console.log(`\n${"─".repeat(70)}\n${f.check.name}\n${"─".repeat(70)}`);
  console.log(f.out.trim().split("\n").slice(-40).join("\n"));
}
console.log(`\n${failed.length} check(s) failed in ${seconds}s.\n`);
process.exit(1);
