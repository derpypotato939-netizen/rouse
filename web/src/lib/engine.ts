/**
 * TypeScript port of the Rouse sound engine.
 *
 * This mirrors `ios/RouseCore/Sources/RouseCore/{SeededRNG,Genome,GenomeSampler,SoundFamily}.swift`
 * and must stay behaviourally identical to it — including the *order* in which random values are
 * drawn, because a genome is defined by its seed. If the two diverge, "Sound #4,281" means one
 * thing on the web and another in the app, and the whole premise of a shareable serial number
 * falls apart.
 *
 * When you change the Swift, change this, and re-run `node tools/validate.mjs`.
 */

// MARK: - Seeded RNG (SplitMix64)

const MASK = 0xffffffffffffffffn;
const GOLDEN = 0x9e3779b97f4a7c15n;

export class SeededRNG {
  private state: bigint;

  constructor(seed: bigint) {
    this.state = (seed & MASK) === 0n ? GOLDEN : seed & MASK;
  }

  next(): bigint {
    this.state = (this.state + GOLDEN) & MASK;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK;
    return (z ^ (z >> 31n)) & MASK;
  }

  /** Uniform in [low, high). 53 bits — the most a double can faithfully hold. */
  double(low: number, high: number): number {
    const unit = Number(this.next() >> 11n) / 9007199254740992;
    return low + unit * (high - low);
  }

  int(count: number): number {
    return Number(this.next() % BigInt(count));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(items.length)];
  }

  chance(p: number): boolean {
    return this.double(0, 1) < p;
  }
}

/** FNV-1a 64-bit. Not a security boundary — it only needs to scatter well. */
export function seedHash(input: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(input)) {
    h = (h ^ BigInt(byte)) & MASK;
    h = (h * 0x100000001b3n) & MASK;
  }
  return h;
}

// MARK: - Genome

export const MODES = {
  ionian: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 2, 4, 7, 9],
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
} as const;

export type Mode = keyof typeof MODES;
export const MODE_NAMES = Object.keys(MODES) as Mode[];

export type Contour = "rising" | "arch" | "oscillating";
export const CONTOURS: Contour[] = ["rising", "arch", "oscillating"];

export type Bed = "none" | "noise" | "pad" | "water" | "wind";
export const BEDS: Bed[] = ["none", "noise", "pad", "water", "wind"];

export type Entrance = "fade" | "sudden" | "stutter" | "reverseSwell";
export const ENTRANCES: Entrance[] = ["fade", "sudden", "stutter", "reverseSwell"];

export const LIMITS = {
  rootLow: 180, rootHigh: 420,
  attackLow: 0.005, attackHigh: 0.4,
  decayLow: 0.2, decayHigh: 3.0,
  bpmLow: 56, bpmHigh: 120,
  accelLow: 0, accelHigh: 24,
  cutoffLow: 400, cutoffHigh: 9000,
} as const;

export interface Genome {
  root: number;
  mode: Mode;
  contour: Contour;
  phrase: number[];
  partials: number[];
  attack: number;
  decay: number;
  bpm: number;
  accel: number;
  subdivision: number;
  bed: Bed;
  sweepStart: number;
  sweepEnd: number;
  space: number;
  panRate: number;
  entrance: Entrance;
}

export function semitoneAt(g: Genome, index: number): number {
  const degrees = MODES[g.mode];
  const d = g.phrase[index % g.phrase.length];
  return degrees[d % degrees.length] + 12 * Math.floor(d / degrees.length);
}

export function frequencyAt(g: Genome, index: number): number {
  return g.root * Math.pow(2, semitoneAt(g, index) / 12);
}

export function openingInterval(g: Genome): number {
  return Math.abs(semitoneAt(g, 1) - semitoneAt(g, 0));
}

/**
 * Amplitude-weighted mean frequency — where the energy actually sits.
 * Testing the *loudest partial* instead looks equivalent and is not: after normalisation the
 * fundamental is always loudest, so that test only ever measures the root. It rejected 92% of
 * draws before measurement caught it.
 */
export function spectralCentroid(g: Genome): number {
  let numerator = 0;
  let denominator = 0;
  g.partials.forEach((weight, i) => {
    numerator += weight * g.root * (i + 1);
    denominator += weight;
  });
  return denominator > 0 ? numerator / denominator : g.root;
}

// MARK: - Sound families

export interface SoundFamily {
  id: string;
  displayName: string;
  modes: Mode[];
  contour: Contour;
  brightness: number;
  tempoBand: { name: string; low: number; high: number };
}

const ARCHETYPES = [
  { id: "glass",  name: "Glass",  modes: ["lydian", "ionian"],        contour: "rising",      brightness: 0.95 },
  { id: "bell",   name: "Bell",   modes: ["pentatonic", "ionian"],    contour: "rising",      brightness: 0.75 },
  { id: "reed",   name: "Reed",   modes: ["dorian", "mixolydian"],    contour: "arch",        brightness: 0.55 },
  { id: "hollow", name: "Hollow", modes: ["dorian", "pentatonic"],    contour: "oscillating", brightness: 0.2 },
  { id: "chime",  name: "Chime",  modes: ["pentatonic", "lydian"],    contour: "arch",        brightness: 0.85 },
  { id: "drone",  name: "Drone",  modes: ["harmonicMinor", "dorian"], contour: "oscillating", brightness: 0.35 },
  { id: "pluck",  name: "Pluck",  modes: ["mixolydian", "pentatonic"],contour: "rising",      brightness: 0.6 },
  { id: "swell",  name: "Swell",  modes: ["ionian", "harmonicMinor"], contour: "arch",        brightness: 0.3 },
] as const;

const TEMPO_BANDS = [
  { name: "slow", low: 56, high: 76 },
  { name: "mid", low: 76, high: 98 },
  { name: "fast", low: 98, high: 120 },
];

export const SOUND_FAMILIES: SoundFamily[] = ARCHETYPES.flatMap((a) =>
  TEMPO_BANDS.map((band) => ({
    id: `${a.id}.${band.name}`,
    displayName: `${a.name}, ${band.name}`,
    modes: [...a.modes] as Mode[],
    contour: a.contour as Contour,
    brightness: a.brightness,
    tempoBand: band,
  }))
);

// MARK: - Sampling

export const NOVELTY_THRESHOLD = 1.1;
export const HISTORY_DEPTH = 30;
export const MAX_ATTEMPTS = 64;
export const FORBIDDEN_OPENING_INTERVALS = new Set([1, 6, 11]);
export const CENTROID_LOW = 250;
export const CENTROID_HIGH = 5000;

/** The constraints that keep a randomised sound from becoming a jarring one. */
export function violatesSafetyRails(g: Genome): boolean {
  if (FORBIDDEN_OPENING_INTERVALS.has(openingInterval(g))) return true;
  const centroid = spectralCentroid(g);
  if (centroid < CENTROID_LOW || centroid > CENTROID_HIGH) return true;
  if (g.partials[0] < 0.35) return true;
  if (Math.min(g.sweepStart, g.sweepEnd) < g.root) return true;
  return false;
}

function drawPhrase(rng: SeededRNG, contour: Contour, scaleLength: number): number[] {
  const span = scaleLength + 3;
  const phrase: number[] = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    let centre: number;
    if (contour === "rising") centre = t * span;
    else if (contour === "arch") centre = Math.sin(t * Math.PI) * span;
    else centre = (Math.sin(t * Math.PI * 3) * 0.5 + 0.5) * span;
    phrase.push(Math.max(0, Math.min(span, Math.round(centre + rng.double(-1.5, 1.5)))));
  }
  return phrase;
}

/** `brightness` biases the roll-off: 0 is close to a sine, 1 is bell-like. */
function drawPartials(rng: SeededRNG, brightness: number): number[] {
  const weights = [1.0];
  for (let n = 1; n < 6; n++) {
    weights.push(Math.pow(n + 1, -(2.2 - 1.6 * brightness)) * rng.double(0.4, 1.3));
  }
  const total = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (w / total) * 2.2);
}

/** 16-step pattern with the downbeat always set, so the pulse stays legible. */
function drawRhythm(rng: SeededRNG): number {
  let bits = 1;
  const density = rng.double(0.2, 0.55);
  for (let step = 1; step < 16; step++) {
    if (rng.chance(density)) bits |= 1 << step;
  }
  return bits;
}

/**
 * NOTE: the order of `rng` calls below is load-bearing and matches `GenomeSampler.draw` in Swift
 * exactly — family fields, root, phrase, partials, sweepStart, sweepEnd, then attack, decay,
 * accel, subdivision, bed, space, panRate, entrance.
 */
function drawCandidate(rng: SeededRNG, family: SoundFamily | null): Genome {
  let mode: Mode;
  let contour: Contour;
  let bpm: number;

  if (family) {
    mode = rng.pick(family.modes);
    contour = family.contour;
    bpm = rng.double(family.tempoBand.low, family.tempoBand.high);
  } else {
    mode = rng.pick(MODE_NAMES);
    // Rising is weighted: an ascending line matches the arousal curve we want.
    contour = rng.chance(0.5) ? "rising" : rng.pick(["arch", "oscillating"] as Contour[]);
    bpm = rng.double(LIMITS.bpmLow, LIMITS.bpmHigh);
  }

  const root = rng.double(LIMITS.rootLow, LIMITS.rootHigh);
  const phrase = drawPhrase(rng, contour, MODES[mode].length);
  const partials = drawPartials(rng, family ? family.brightness : rng.double(0, 1));
  const sweepStart = rng.double(LIMITS.cutoffLow, LIMITS.cutoffHigh);
  const sweepEnd = rng.double(LIMITS.cutoffLow, LIMITS.cutoffHigh);

  return {
    root,
    mode,
    contour,
    phrase,
    partials,
    attack: rng.double(LIMITS.attackLow, LIMITS.attackHigh),
    decay: rng.double(LIMITS.decayLow, LIMITS.decayHigh),
    bpm,
    accel: rng.double(LIMITS.accelLow, LIMITS.accelHigh),
    subdivision: drawRhythm(rng),
    bed: rng.pick(BEDS),
    sweepStart,
    sweepEnd,
    space: rng.double(0, 1),
    panRate: rng.double(0.05, 0.9),
    entrance: rng.pick(ENTRANCES),
  };
}

const WEIGHTS = {
  root: 1.0, mode: 0.8, contour: 0.9, partials: 1.4, envelope: 0.7,
  bpm: 1.3, rhythm: 0.5, bed: 0.9, sweep: 0.6, space: 0.3,
  entrance: 0.7, phrase: 0.5,
};

function popcount(n: number): number {
  let c = 0;
  let v = n;
  while (v) {
    c += v & 1;
    v >>= 1;
  }
  return c;
}

export function featureVector(g: Genome): number[] {
  const norm = (x: number, lo: number, hi: number) => Math.min(Math.max((x - lo) / (hi - lo), 0), 1);
  const oneHot = <T,>(value: T, all: readonly T[], weight: number) =>
    all.map((x) => (x === value ? weight : 0));

  const v: number[] = [];
  v.push(norm(g.root, LIMITS.rootLow, LIMITS.rootHigh) * WEIGHTS.root);
  v.push(...oneHot(g.mode, MODE_NAMES, WEIGHTS.mode));
  v.push(...oneHot(g.contour, CONTOURS, WEIGHTS.contour));
  v.push(...g.partials.map((p) => p * WEIGHTS.partials));
  v.push(norm(g.attack, LIMITS.attackLow, LIMITS.attackHigh) * WEIGHTS.envelope);
  v.push(norm(g.decay, LIMITS.decayLow, LIMITS.decayHigh) * WEIGHTS.envelope);
  v.push(norm(g.bpm, LIMITS.bpmLow, LIMITS.bpmHigh) * WEIGHTS.bpm);
  v.push(norm(g.accel, LIMITS.accelLow, LIMITS.accelHigh) * WEIGHTS.bpm);
  v.push((popcount(g.subdivision) / 16) * WEIGHTS.rhythm);
  for (let shift = 0; shift < 16; shift += 4) {
    v.push(popcount((g.subdivision >> shift) & 0xf) > 1 ? WEIGHTS.rhythm : 0);
  }
  v.push(...oneHot(g.bed, BEDS, WEIGHTS.bed));
  v.push(norm(g.sweepStart, LIMITS.cutoffLow, LIMITS.cutoffHigh) * WEIGHTS.sweep);
  v.push(norm(g.sweepEnd, LIMITS.cutoffLow, LIMITS.cutoffHigh) * WEIGHTS.sweep);
  v.push(g.space * WEIGHTS.space);
  v.push(...oneHot(g.entrance, ENTRANCES, WEIGHTS.entrance));
  v.push(...g.phrase.map((p) => (p / 13) * WEIGHTS.phrase));
  return v;
}

export function distance(a: Genome, b: Genome): number {
  const x = featureVector(a);
  const y = featureVector(b);
  let sum = 0;
  for (let i = 0; i < x.length; i++) sum += (x[i] - y[i]) ** 2;
  return Math.sqrt(sum);
}

export interface Draw {
  genome: Genome;
  /** Distance to the nearest genome in history; `Infinity` when history is empty. */
  nearestDistance: number;
  usedFallback: boolean;
  attempts: number;
}

/**
 * Rejection sampling under both the novelty constraint and the melodic safety rails, with a
 * max-min fallback so the loop always terminates. The alarm cannot afford an unbounded search.
 */
export function sampleGenome(
  seed: bigint,
  history: Genome[] = [],
  family: SoundFamily | null = null
): Draw {
  const rng = new SeededRNG(seed);
  const recent = history.slice(0, HISTORY_DEPTH);

  let best: Genome | null = null;
  let bestDistance = -1;
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    attempts += 1;
    const candidate = drawCandidate(rng, family);
    if (violatesSafetyRails(candidate)) continue;

    const nearest = recent.length
      ? Math.min(...recent.map((h) => distance(candidate, h)))
      : Infinity;

    if (nearest >= NOVELTY_THRESHOLD) {
      return { genome: candidate, nearestDistance: nearest, usedFallback: false, attempts };
    }
    if (nearest > bestDistance) {
      bestDistance = nearest;
      best = candidate;
    }
  }

  if (best) {
    return { genome: best, nearestDistance: bestDistance, usedFallback: true, attempts };
  }

  // Every candidate hit a rail. Vanishingly unlikely, but the demo must still make a sound.
  const safe: Genome = {
    root: 264, mode: "pentatonic", contour: "rising",
    phrase: [0, 2, 3, 4, 5, 6, 7, 8],
    partials: [1.0, 0.5, 0.28, 0.16, 0.1, 0.06],
    attack: 0.03, decay: 1.1, bpm: 76, accel: 8,
    subdivision: 0b1000100010100101, bed: "pad",
    sweepStart: 900, sweepEnd: 5200, space: 0.4, panRate: 0.2,
    entrance: "fade",
  };
  const nearest = recent.length ? Math.min(...recent.map((h) => distance(safe, h))) : Infinity;
  return { genome: safe, nearestDistance: nearest, usedFallback: true, attempts };
}

/** The public number printed on the share card. */
export function serialFor(seed: bigint): number {
  return Number(seed % 100000n);
}

export function describeGenome(g: Genome): string {
  const family = SOUND_FAMILIES.find(
    (f) => f.contour === g.contour && g.bpm >= f.tempoBand.low && g.bpm <= f.tempoBand.high
  );
  return family?.displayName ?? `${g.contour}, ${Math.round(g.bpm)} BPM`;
}
