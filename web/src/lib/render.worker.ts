/// <reference lib="webworker" />
/**
 * Renders a sound off the main thread.
 *
 * Synthesis takes roughly 370ms on a desktop and an estimated 1.5–3.5s on a mid-range phone, and
 * it is pure arithmetic — which means on the main thread it *freezes the page completely*. No
 * scrolling, no button feedback, not even the "Generating…" label repainting. A frozen page reads as
 * broken, and Gate 1's headline metric is whether visitors generate three or more sounds. Nobody
 * taps three times through three freezes.
 *
 * The audio is deliberately **not** optimised to go faster. Roughly 270ms of it is the per-note,
 * per-partial sine loop, and a faster approximation would change the samples — breaking
 * byte-identical determinism, breaking Swift/TypeScript parity, and silently invalidating every
 * share link already in the wild. Moving the same code to another thread costs nothing and changes
 * nothing.
 */
import { sampleGenome, renderSeedFor, serialFor, describeGenome, rarityFor } from "./engine.ts";
import { render, peaks, type StereoBuffer } from "./synth.ts";

export interface RenderRequest {
  id: number;
  seed: string; // bigint is not structured-cloneable in every browser; pass as a decimal string
  seconds: number;
  bins: number;
  /**
   * A tiny throwaway render sent on startup.
   *
   * Measured: the first real generate took ~3s while every subsequent one took ~350ms, because the
   * worker's module graph loads and JITs lazily on first use. That is the worst possible place for
   * the cost — a visitor arriving from a video taps once, and that one tap was the slow one.
   * Warming costs a few milliseconds nobody sees.
   */
  warmup?: boolean;
}

export interface RenderResponse {
  id: number;
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
  serial: number;
  family: string;
  rarity: { tier: string; traits: string[] };
  bins: number[];
  genome: unknown;
}

self.onmessage = (event: MessageEvent<RenderRequest>) => {
  const { id, seed, seconds, bins, warmup } = event.data;
  const s = BigInt(seed);

  if (warmup) {
    // Touch every hot path so it is compiled and optimised before the user asks for anything.
    const g = sampleGenome(s, []).genome;
    const b = render(g, 0.25, renderSeedFor(s));
    peaks(b, 16);
    rarityFor(g);
    describeGenome(g);
    serialFor(s);
    return; // deliberately no reply — the main thread is not waiting on this
  }

  const draw = sampleGenome(s, []);
  const buffer: StereoBuffer = render(draw.genome, seconds, renderSeedFor(s));

  const response: RenderResponse = {
    id,
    left: buffer.left,
    right: buffer.right,
    sampleRate: buffer.sampleRate,
    serial: serialFor(s),
    family: describeGenome(draw.genome),
    rarity: rarityFor(draw.genome),
    bins: peaks(buffer, bins),
    genome: draw.genome,
  };

  // Transfer the audio rather than copying it — these are ~5MB of samples.
  (self as unknown as Worker).postMessage(response, [
    response.left.buffer,
    response.right.buffer,
  ]);
};
