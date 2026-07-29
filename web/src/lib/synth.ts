/**
 * TypeScript port of `ios/RouseCore/Sources/RouseCore/Synth.swift`.
 *
 * Samples are computed directly rather than assembled from Web Audio nodes. That is deliberate:
 * the same arithmetic runs here and in the app, so what a visitor hears on the web is what the
 * alarm will actually sound like — and the identical buffer serves both playback and the .wav
 * download, so the shareable file is never a re-render that drifted.
 */

// The explicit `.ts` extension lets `tools/render-sounds.mjs` import this module directly under
// `node --experimental-strip-types`, which has no bundler to resolve extensionless specifiers.
// That is what lets the content pipeline run without Xcode. Bundlers resolve it unchanged.
import { SeededRNG, type Genome } from "./engine.ts";

export const SAMPLE_RATE = 44100;

/**
 * The macro loudness ramp, applied unconditionally.
 *
 * A safety rail, not a taste choice: a sound arriving at full level triggers a startle response,
 * which raises cortisol and worsens mood on waking — the opposite of the point. `entrance:
 * "sudden"` therefore shapes the first note's *character*, never its level.
 */
export const MACRO_RAMP_SECONDS = 8;

const STEPS_PER_BEAT = 4;

export interface StereoBuffer {
  // The buffer type is pinned rather than left as the default `ArrayBufferLike`, because
  // `AudioBuffer.copyToChannel` will not accept a possibly-shared buffer.
  left: Float32Array<ArrayBuffer>;
  right: Float32Array<ArrayBuffer>;
  sampleRate: number;
  duration: number;
}

interface Note {
  start: number;
  duration: number;
  frequency: number;
  attack: number;
  gain: number;
}

/** Raised-cosine fade over `MACRO_RAMP_SECONDS`, then unity. */
export function macroRamp(t: number): number {
  if (t >= MACRO_RAMP_SECONDS) return 1;
  const x = Math.max(0, t) / MACRO_RAMP_SECONDS;
  return 0.5 - 0.5 * Math.cos(Math.PI * x);
}

/**
 * Position in seconds of a 16th-note step under linear tempo acceleration.
 * Solves `beats(t) = (bpm0·t + accel·t²/120)/60` for `t`. Using `bpm * t` instead makes the
 * acceleration audibly lurch.
 */
export function timeOfStep(step: number, g: Genome): number {
  const beats = step / STEPS_PER_BEAT;
  if (g.accel < 1e-6) return (beats * 60) / g.bpm;
  const a = g.accel / 120;
  const b = g.bpm;
  const c = -60 * beats;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
}

function attackFor(g: Genome, isFirst: boolean): number {
  if (!isFirst) return g.attack;
  switch (g.entrance) {
    case "fade": return Math.max(g.attack, 0.25);
    case "sudden": return Math.min(g.attack, 0.008);
    case "stutter": return 0.01;
    case "reverseSwell": return Math.max(g.attack, 0.45);
  }
}

function accentWeight(step: number): number {
  if (step % 16 === 0) return 1.0;
  return step % 4 === 0 ? 0.8 : 0.5;
}

function schedule(g: Genome, seconds: number): Note[] {
  const notes: Note[] = [];
  let step = 0;
  let phraseIndex = 0;

  for (;;) {
    const t = timeOfStep(step, g);
    if (!(t < seconds)) break;

    if ((g.subdivision >> (step % 16)) & 1) {
      const nextT = timeOfStep(step + 1, g);
      const gap = Math.max(nextT - t, 0.02);
      const duration = Math.min(g.decay + g.attack, Math.max(gap * 3, 0.12));
      notes.push({
        start: t,
        duration: Math.min(duration, seconds - t),
        frequency: g.root * Math.pow(2, semitone(g, phraseIndex) / 12),
        attack: attackFor(g, notes.length === 0),
        gain: notes.length === 0 ? 1.0 : 0.62 + 0.38 * accentWeight(step),
      });
      phraseIndex += 1;
    }
    step += 1;
  }

  if (g.entrance === "stutter" && notes.length > 0) {
    const first = notes[0];
    for (let k = 1; k <= 3; k++) {
      notes.push({
        start: Math.max(0, first.start + k * 0.055),
        duration: 0.09,
        frequency: first.frequency,
        attack: 0.004,
        gain: 0.45,
      });
    }
  }
  return notes;
}

function semitone(g: Genome, index: number): number {
  // Inlined from engine.ts to keep the hot path free of module indirection.
  const degreesByMode: Record<string, number[]> = {
    ionian: [0, 2, 4, 5, 7, 9, 11],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    pentatonic: [0, 2, 4, 7, 9],
    harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  };
  const degrees = degreesByMode[g.mode];
  const d = g.phrase[index % g.phrase.length];
  return degrees[d % degrees.length] + 12 * Math.floor(d / degrees.length);
}

function envelope(t: number, attack: number, decay: number, total: number): number {
  if (t < 0 || t > total) return 0;
  if (t < attack) return t / Math.max(attack, 1e-6);
  const value = Math.exp(-(t - attack) / Math.max(decay, 1e-6));
  // Taper the last 20 ms so truncated notes do not click.
  const tail = total - t;
  return tail < 0.02 ? value * (tail / 0.02) : value;
}

function addBed(g: Genome, dry: Float64Array, frames: number, rng: SeededRNG): void {
  if (g.bed === "none") return;
  let lp = 0;
  let lp2 = 0;
  const level = 0.18;

  for (let f = 0; f < frames; f++) {
    const t = f / SAMPLE_RATE;
    const white = rng.double(-1, 1);
    let value = 0;

    switch (g.bed) {
      case "noise":
        lp += 0.08 * (white - lp);
        value = lp;
        break;
      case "pad":
        value =
          0.5 * Math.sin(2 * Math.PI * g.root * 0.5 * t) +
          0.3 * Math.sin(2 * Math.PI * g.root * 0.75 * t + 0.4);
        break;
      case "water":
        lp += 0.25 * (white - lp);
        lp2 += 0.02 * (lp - lp2);
        value = (lp - lp2) * (0.6 + 0.4 * Math.sin(2 * Math.PI * 0.23 * t));
        break;
      case "wind":
        lp += 0.012 * (white - lp);
        value = lp * (0.7 + 0.3 * Math.sin(2 * Math.PI * 0.07 * t));
        break;
    }
    dry[f] += value * level;
  }
}

/** One-pole lowpass gliding from `sweepStart` to `sweepEnd` across the render. */
function applySweep(g: Genome, buffer: Float64Array, frames: number): void {
  let z = 0;
  for (let f = 0; f < frames; f++) {
    const cutoff = g.sweepStart + (g.sweepEnd - g.sweepStart) * (f / frames);
    const alpha = 1 - Math.exp((-2 * Math.PI * cutoff) / SAMPLE_RATE);
    z += alpha * (buffer[f] - z);
    buffer[f] = z;
  }
}

/** Three combs into one allpass — enough to place the sound in a room, which is all it needs. */
function reverb(input: Float64Array, size: number): Float64Array {
  if (size <= 0.01 || input.length === 0) return input;
  const output = new Float64Array(input.length);

  const combDelays = [1231, 1523, 1811];
  const feedback = 0.55 + 0.35 * Math.min(Math.max(size, 0), 1);

  for (const delay of combDelays) {
    const buf = new Float64Array(delay);
    let index = 0;
    for (let f = 0; f < input.length; f++) {
      const delayed = buf[index];
      buf[index] = input[f] + delayed * feedback;
      output[f] += delayed / combDelays.length;
      index = (index + 1) % delay;
    }
  }

  const apDelay = 331;
  const apBuffer = new Float64Array(apDelay);
  let apIndex = 0;
  const gain = 0.5;
  for (let f = 0; f < output.length; f++) {
    const delayed = apBuffer[apIndex];
    const value = -gain * output[f] + delayed;
    apBuffer[apIndex] = output[f] + gain * value;
    output[f] = value;
    apIndex = (apIndex + 1) % apDelay;
  }
  return output;
}

export function render(g: Genome, seconds: number, seed = 0): StereoBuffer {
  const frames = Math.floor(seconds * SAMPLE_RATE);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  const rng = new SeededRNG(BigInt(seed) ^ 0xa5a5n);

  const notes = schedule(g, seconds);
  const dry = new Float64Array(frames);

  // --- Melody -------------------------------------------------------------------------------
  for (const note of notes) {
    const startFrame = Math.floor(note.start * SAMPLE_RATE);
    const noteFrames = Math.floor(note.duration * SAMPLE_RATE);
    if (startFrame >= frames) continue;

    for (let i = 0; i < noteFrames; i++) {
      const f = startFrame + i;
      if (f >= frames) break;
      const t = i / SAMPLE_RATE;
      const env = envelope(t, note.attack, g.decay, note.duration);
      if (env <= 1e-5) continue;

      let sample = 0;
      for (let p = 0; p < g.partials.length; p++) {
        const weight = g.partials[p];
        if (weight <= 1e-4) continue;
        const freq = note.frequency * (p + 1);
        if (freq >= SAMPLE_RATE * 0.45) break; // anti-alias
        sample += weight * Math.sin(2 * Math.PI * freq * (startFrame / SAMPLE_RATE + t));
      }
      dry[f] += sample * env * note.gain;
    }
  }

  addBed(g, dry, frames, rng);
  applySweep(g, dry, frames);

  const wet = reverb(dry, g.space);
  const mix = g.space * 0.45;

  for (let f = 0; f < frames; f++) {
    const t = f / SAMPLE_RATE;
    const signal = dry[f] * (1 - mix) + wet[f] * mix;
    const ramped = signal * macroRamp(t);

    // Constant-power pan drifting under an LFO.
    const pan = Math.sin(2 * Math.PI * g.panRate * t) * 0.35;
    const angle = ((pan + 1) * Math.PI) / 4;
    left[f] = ramped * Math.cos(angle);
    right[f] = ramped * Math.sin(angle);
  }

  normalize(left, right, 0.89);
  return { left, right, sampleRate: SAMPLE_RATE, duration: frames / SAMPLE_RATE };
}

function normalize(left: Float32Array, right: Float32Array, peak: number): void {
  let maximum = 0;
  for (let i = 0; i < left.length; i++) {
    maximum = Math.max(maximum, Math.abs(left[i]), Math.abs(right[i]));
  }
  if (maximum <= 1e-6) return;
  const gain = peak / maximum;
  for (let i = 0; i < left.length; i++) {
    left[i] *= gain;
    right[i] *= gain;
  }
}

// MARK: - Output

/** Minimal RIFF/WAVE serialiser, 16-bit stereo PCM. Mirrors `WavWriter.swift`. */
export function toWav(buffer: StereoBuffer): Blob {
  const channels = 2;
  const bytesPerFrame = channels * 2;
  const frames = buffer.left.length;
  const dataBytes = frames * bytesPerFrame;

  const out = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(out);
  let offset = 0;

  const ascii = (s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset++, s.charCodeAt(i));
  };
  const u32 = (v: number) => { view.setUint32(offset, v, true); offset += 4; };
  const u16 = (v: number) => { view.setUint16(offset, v, true); offset += 2; };

  ascii("RIFF");
  u32(36 + dataBytes);
  ascii("WAVE");
  ascii("fmt ");
  u32(16);
  u16(1); // PCM
  u16(channels);
  u32(buffer.sampleRate);
  u32(buffer.sampleRate * bytesPerFrame);
  u16(bytesPerFrame);
  u16(16);
  ascii("data");
  u32(dataBytes);

  for (let i = 0; i < frames; i++) {
    for (const sample of [buffer.left[i], buffer.right[i]]) {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, Math.round(clamped * 32767), true);
      offset += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

/** Copies the computed samples into a Web Audio buffer for playback. */
export function toAudioBuffer(buffer: StereoBuffer, context: BaseAudioContext): AudioBuffer {
  const audio = context.createBuffer(2, buffer.left.length, buffer.sampleRate);
  audio.copyToChannel(buffer.left, 0);
  audio.copyToChannel(buffer.right, 1);
  return audio;
}

/** Downsampled absolute-peak envelope, for drawing the waveform. */
export function peaks(buffer: StereoBuffer, bins: number): number[] {
  const step = Math.max(1, Math.floor(buffer.left.length / bins));
  const out: number[] = [];
  for (let b = 0; b < bins; b++) {
    let peak = 0;
    const start = b * step;
    for (let i = start; i < Math.min(start + step, buffer.left.length); i++) {
      peak = Math.max(peak, Math.abs(buffer.left[i]), Math.abs(buffer.right[i]));
    }
    out.push(peak);
  }
  return out;
}
