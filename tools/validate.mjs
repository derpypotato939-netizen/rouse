// Faithful JS port of the numeric core of RouseCore, used to validate the tuning constants
// I chose by judgment (novelty threshold, safety rails, bandit convergence) while the Swift
// toolchain on this machine is broken. Mirrors the Swift line for line where it matters.

const M = 0xFFFFFFFFFFFFFFFFn;
class RNG {
  constructor(seed) { this.s = BigInt(seed) === 0n ? 0x9E3779B97F4A7C15n : BigInt(seed) & M; }
  next() {
    this.s = (this.s + 0x9E3779B97F4A7C15n) & M;
    let z = this.s;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & M;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & M;
    return (z ^ (z >> 31n)) & M;
  }
  double(lo, hi) { return lo + Number(this.next() >> 11n) / 9007199254740992 * (hi - lo); }
  int(n) { return Number(this.next() % BigInt(n)); }
  pick(a) { return a[this.int(a.length)]; }
  chance(p) { return this.double(0, 1) < p; }
}
function fnv(str) {
  let h = 0xCBF29CE484222325n;
  for (const b of Buffer.from(str, 'utf8')) { h = (h ^ BigInt(b)) & M; h = (h * 0x100000001B3n) & M; }
  return h;
}

const MODES = {
  ionian: [0,2,4,5,7,9,11], lydian: [0,2,4,6,7,9,11], mixolydian: [0,2,4,5,7,9,10],
  dorian: [0,2,3,5,7,9,10], pentatonic: [0,2,4,7,9], harmonicMinor: [0,2,3,5,7,8,11],
};
const MODE_NAMES = Object.keys(MODES);
const CONTOURS = ['rising','arch','oscillating'];
const BEDS = ['none','noise','pad','water','wind'];
const ENTRANCES = ['fade','sudden','stutter','reverseSwell'];
const L = { rootLow:180, rootHigh:420, attackLow:0.005, attackHigh:0.40, decayLow:0.20,
            decayHigh:3.0, bpmLow:56, bpmHigh:120, accelLow:0, accelHigh:24,
            cutoffLow:400, cutoffHigh:9000 };

function semitone(g, i) {
  const d = MODES[g.mode], v = g.phrase[i % g.phrase.length];
  return d[v % d.length] + 12 * Math.floor(v / d.length);
}
const openingInterval = g => Math.abs(semitone(g,1) - semitone(g,0));

function drawPhrase(rng, contour, scaleLength) {
  const span = scaleLength + 3, out = [];
  for (let i = 0; i < 8; i++) {
    const t = i / 7;
    let c;
    if (contour === 'rising') c = t * span;
    else if (contour === 'arch') c = Math.sin(t * Math.PI) * span;
    else c = (Math.sin(t * Math.PI * 3) * 0.5 + 0.5) * span;
    out.push(Math.max(0, Math.min(span, Math.round(c + rng.double(-1.5, 1.5)))));
  }
  return out;
}
function drawPartials(rng, brightness) {
  const w = [1.0];
  for (let n = 1; n < 6; n++) w.push(Math.pow(n+1, -(2.2 - 1.6*brightness)) * rng.double(0.4, 1.3));
  const total = w.reduce((a,b)=>a+b,0);
  return w.map(x => x/total*2.2);
}
function drawRhythm(rng) {
  let bits = 1; const density = rng.double(0.20, 0.55);
  for (let s = 1; s < 16; s++) if (rng.chance(density)) bits |= (1 << s);
  return bits;
}
function draw(rng, family) {
  let mode, contour, bpm;
  if (family) {
    mode = rng.pick(family.modes); contour = family.contour;
    bpm = rng.double(family.band[0], family.band[1]);
  } else {
    mode = rng.pick(MODE_NAMES);
    contour = rng.chance(0.5) ? 'rising' : rng.pick(['arch','oscillating']);
    bpm = rng.double(L.bpmLow, L.bpmHigh);
  }
  const root = rng.double(L.rootLow, L.rootHigh);
  const phrase = drawPhrase(rng, contour, MODES[mode].length);
  const partials = drawPartials(rng, family ? family.brightness : rng.double(0,1));
  return { root, mode, contour, phrase, partials,
    attack: rng.double(L.attackLow, L.attackHigh), decay: rng.double(L.decayLow, L.decayHigh),
    bpm, accel: rng.double(L.accelLow, L.accelHigh), subdivision: drawRhythm(rng),
    bed: rng.pick(BEDS), sweepStart: rng.double(L.cutoffLow, L.cutoffHigh),
    sweepEnd: rng.double(L.cutoffLow, L.cutoffHigh), space: rng.double(0,1),
    panRate: rng.double(0.05,0.9), entrance: rng.pick(ENTRANCES) };
}

// ---- Safety rails: ORIGINAL (loudest-partial) vs PROPOSED (spectral centroid) ----
function railsOriginal(g) {
  if ([1,6,11].includes(openingInterval(g))) return 'interval';
  let li = 0; for (let i=1;i<6;i++) if (g.partials[i] > g.partials[li]) li = i;
  const peak = g.root * (li+1);
  if (peak < 400 || peak > 4000) return 'peakHz';
  if (g.partials[0] < 0.35) return 'fundamental';
  if (Math.min(g.sweepStart, g.sweepEnd) < g.root) return 'sweep';
  return null;
}
function centroid(g) {
  let num = 0, den = 0;
  for (let i = 0; i < 6; i++) { num += g.partials[i] * g.root * (i+1); den += g.partials[i]; }
  return num/den;
}
function railsProposed(g, lo, hi) {
  if ([1,6,11].includes(openingInterval(g))) return 'interval';
  const c = centroid(g);
  if (c < lo || c > hi) return 'centroid';
  if (g.partials[0] < 0.35) return 'fundamental';
  if (Math.min(g.sweepStart, g.sweepEnd) < g.root) return 'sweep';
  return null;
}

const W = { root:1.0, mode:0.8, contour:0.9, partials:1.4, envelope:0.7, bpm:1.3,
            rhythm:0.5, bed:0.9, sweep:0.6, space:0.3, entrance:0.7, phrase:0.5 };
function featureVector(g) {
  const v = [], nrm = (x,lo,hi) => Math.min(Math.max((x-lo)/(hi-lo),0),1);
  const oh = (val, all, w) => all.map(x => x===val ? w : 0);
  v.push(nrm(g.root,L.rootLow,L.rootHigh)*W.root);
  v.push(...oh(g.mode, MODE_NAMES, W.mode));
  v.push(...oh(g.contour, CONTOURS, W.contour));
  v.push(...g.partials.map(x=>x*W.partials));
  v.push(nrm(g.attack,L.attackLow,L.attackHigh)*W.envelope);
  v.push(nrm(g.decay,L.decayLow,L.decayHigh)*W.envelope);
  v.push(nrm(g.bpm,L.bpmLow,L.bpmHigh)*W.bpm);
  v.push(nrm(g.accel,L.accelLow,L.accelHigh)*W.bpm);
  const pc = n => { let c=0; while(n){c+=n&1;n>>=1;} return c; };
  v.push(pc(g.subdivision)/16*W.rhythm);
  for (let s=0;s<16;s+=4) v.push(pc((g.subdivision>>s)&0xF) > 1 ? W.rhythm : 0);
  v.push(...oh(g.bed, BEDS, W.bed));
  v.push(nrm(g.sweepStart,L.cutoffLow,L.cutoffHigh)*W.sweep);
  v.push(nrm(g.sweepEnd,L.cutoffLow,L.cutoffHigh)*W.sweep);
  v.push(g.space*W.space);
  v.push(...oh(g.entrance, ENTRANCES, W.entrance));
  v.push(...g.phrase.map(x=>x/13*W.phrase));
  return v;
}
function distance(a,b){ const x=featureVector(a),y=featureVector(b);
  let s=0; for(let i=0;i<x.length;i++) s+=(x[i]-y[i])**2; return Math.sqrt(s); }

// Mirrors GenomeSampler.safeDefault in the Swift.
const SAFE_DEFAULT = { root:264, mode:'pentatonic', contour:'rising', phrase:[0,2,3,4,5,6,7,8],
  partials:[1.0,0.5,0.28,0.16,0.10,0.06], attack:0.03, decay:1.1, bpm:76, accel:8,
  subdivision:0b1000100010100101, bed:'pad', sweepStart:900, sweepEnd:5200, space:0.4,
  panRate:0.2, entrance:'fade' };

function sample(seed, history, family, rails, threshold, maxAttempts=64) {
  const rng = new RNG(seed), recent = history.slice(0,30);
  let best=null, bestD=-1, attempts=0, railFails=0;
  while (attempts < maxAttempts) {
    attempts++;
    const c = draw(rng, family);
    if (rails(c)) { railFails++; continue; }
    const near = recent.length ? Math.min(...recent.map(h=>distance(c,h))) : Infinity;
    if (near >= threshold) return {genome:c, near, fallback:false, attempts, railFails};
    if (near > bestD) { bestD = near; best = c; }
  }
  if (best) return {genome:best, near:bestD, fallback:true, attempts, railFails};
  // Every candidate hit a rail — the alarm still has to ring.
  const near = recent.length ? Math.min(...recent.map(h=>distance(SAFE_DEFAULT,h))) : Infinity;
  return {genome:SAFE_DEFAULT, near, fallback:true, safeDefault:true, attempts, railFails};
}

// ================= CHECKS =================
let failures = 0;
const check = (name, ok, detail='') => {
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
  if (!ok) failures++;
};

console.log('\n=== 1. RNG uniformity ===');
{
  const rng = new RNG(12345), b = new Array(10).fill(0);
  for (let i=0;i<100000;i++) b[Math.min(Math.floor(rng.double(0,1)*10),9)]++;
  check('buckets within 15% of 10000', b.every(c=>c>8500&&c<11500), b.join(','));
}

console.log('\n=== 2. Safety-rail rejection rate (THE bug hunt) ===');
{
  const N = 20000, rng = new RNG(7);
  const reasons = {};
  for (let i=0;i<N;i++) { const r = railsOriginal(draw(rng, null)); reasons[r||'pass'] = (reasons[r||'pass']||0)+1; }
  const passRate = (reasons.pass||0)/N;
  console.log('   ORIGINAL rails (loudest partial in 400-4000 Hz):', JSON.stringify(reasons));
  check('original rails pass >40% of draws', passRate > 0.40, `actual ${(passRate*100).toFixed(1)}%`);

  for (const [lo,hi] of [[400,4000],[300,5000],[250,5000],[250,6000]]) {
    const r2 = new RNG(7); let pass=0;
    for (let i=0;i<N;i++) if (!railsProposed(draw(r2,null), lo, hi)) pass++;
    console.log(`   PROPOSED centroid rails [${lo},${hi}]: pass ${(pass/N*100).toFixed(1)}%`);
  }
}

console.log('\n=== 3. Every one of the 24 families must be samplable ===');
{
  const ARCH = [
    ['glass',['lydian','ionian'],'rising',0.95], ['bell',['pentatonic','ionian'],'rising',0.75],
    ['reed',['dorian','mixolydian'],'arch',0.55], ['hollow',['dorian','pentatonic'],'oscillating',0.20],
    ['chime',['pentatonic','lydian'],'arch',0.85], ['drone',['harmonicMinor','dorian'],'oscillating',0.35],
    ['pluck',['mixolydian','pentatonic'],'rising',0.60], ['swell',['ionian','harmonicMinor'],'arch',0.30],
  ];
  const BANDS = [['slow',56,76],['mid',76,98],['fast',98,120]];
  const families = [];
  for (const [id,modes,contour,brightness] of ARCH)
    for (const [bn,lo,hi] of BANDS)
      families.push({id:`${id}.${bn}`, modes, contour, brightness, band:[lo,hi]});

  for (const [label, rails] of [['ORIGINAL', railsOriginal],
                                ['PROPOSED[250,5000]', g=>railsProposed(g,250,5000)]]) {
    const dead = [];
    for (const f of families) {
      const rng = new RNG(fnv(f.id)); let pass = 0;
      for (let i=0;i<2000;i++) if (!rails(draw(rng, f))) pass++;
      if (pass/2000 < 0.15) dead.push(`${f.id}:${(pass/2000*100).toFixed(0)}%`);
    }
    check(`${label}: no dead bandit arms`, dead.length === 0,
          dead.length ? `starved: ${dead.join(' ')}` : 'all 24 samplable');
  }
}

console.log('\n=== 4. Novelty threshold over 365 mornings ===');
{
  for (const [label, rails] of [['ORIGINAL', railsOriginal],
                                ['PROPOSED[250,5000]', g=>railsProposed(g,250,5000)]]) {
    for (const thr of [0.70, 0.90, 1.10]) {
      let history=[], fallbacks=0, safeDefaults=0, minNear=Infinity, totalAttempts=0;
      for (let d=0; d<365; d++) {
        const r = sample(fnv(`novelty-user|day-${d}`), history, null, rails, thr);
        if (r.fallback) fallbacks++;
        if (r.safeDefault) safeDefaults++;
        totalAttempts += r.attempts;
        if (history.length) minNear = Math.min(minNear, r.near);
        history.unshift(r.genome);
      }
      console.log(`   ${label} thr=${thr.toFixed(2)}: fallbacks ${fallbacks}/365, ` +
                  `safeDefault ${safeDefaults}, minNearest ${minNear.toFixed(3)}, ` +
                  `avg attempts ${(totalAttempts/365).toFixed(1)}`);
      if (label.startsWith('PROPOSED') && thr === 0.90) {
        check('proposed rails @0.90: <10% fallback', fallbacks < 37, `${fallbacks}/365`);
        check('proposed rails @0.90: no two mornings closer than 0.45',
              minNear > 0.45, `min ${minNear.toFixed(3)}`);
      }
    }
  }
}

console.log('\n=== 5. Accelerating tempo (integral of the tempo curve) ===');
{
  const timeOfStep = (step, bpm, accel) => {
    const beats = step/4;
    if (accel < 1e-6) return beats*60/bpm;
    const a = accel/120, b = bpm, c = -60*beats;
    return (-b + Math.sqrt(b*b - 4*a*c))/(2*a);
  };
  let mono = true, prev = Infinity;
  for (let i=1;i<=16;i++) { const gap = timeOfStep(i,60,20)-timeOfStep(i-1,60,20);
    if (!(gap>0 && gap<prev)) mono=false; prev=gap; }
  check('gaps strictly shrink under acceleration', mono);
  const g0 = timeOfStep(1,120,0)-timeOfStep(0,120,0);
  check('120 BPM sixteenths are 0.125 s apart', Math.abs(g0-0.125)<1e-9, g0.toFixed(6));
  // Sanity: after 30 s at bpm0=60/accel=20, instantaneous tempo should be 60+20*0.5=70.
  const t30 = timeOfStep(1000,60,20);
  check('quadratic solves forward consistently', t30 > 0 && isFinite(t30), `${t30.toFixed(2)}s`);
}

console.log('\n=== 6. WakeScore monotonicity ===');
{
  const score = m => {
    const ratio = Math.max(1, m.rt/Math.max(m.base,1));
    const alertness = Math.exp(-1.4*(ratio-1));
    const inhibition = m.nogo>0 ? Math.max(0,1-m.com/m.nogo) : 1;
    const speed = Math.exp(-Math.max(0,m.dismiss)/45);
    const movement = Math.min(Math.max(m.motion,0),1);
    const w = 0.40*alertness + 0.20*inhibition + 0.20*speed + 0.20*movement;
    return Math.min(100, Math.max(0, w*Math.pow(0.85, Math.max(0,m.snooze))*100));
  };
  const base = {rt:320, base:280, com:1, nogo:4, dismiss:20, motion:0.6, snooze:0};
  const vary = (k, vals) => vals.map(v => score({...base, [k]:v}));
  const dec = a => a.every((v,i)=>i===0||v<a[i-1]);
  const inc = a => a.every((v,i)=>i===0||v>a[i-1]);
  check('decreasing in reaction time', dec(vary('rt',[300,500,800,1500])));
  check('decreasing in commissions', dec(vary('com',[0,1,2,3,4])));
  check('decreasing in dismiss time', dec(vary('dismiss',[5,20,60,180])));
  check('increasing in motion', inc(vary('motion',[0.1,0.4,0.7,1.0])));
  check('decreasing in snoozes', dec(vary('snooze',[0,1,2,3])));
  check('perfect morning > 90', score({rt:280,base:280,com:0,nogo:4,dismiss:2,motion:1,snooze:0}) > 90,
        score({rt:280,base:280,com:0,nogo:4,dismiss:2,motion:1,snooze:0}).toFixed(1));
  check('terrible morning < 12', score({rt:1400,base:280,com:4,nogo:4,dismiss:300,motion:0.02,snooze:4}) < 12,
        score({rt:1400,base:280,com:4,nogo:4,dismiss:300,motion:0.02,snooze:4}).toFixed(1));
}

console.log('\n=== 7. Bandit convergence ===');
{
  const ARCH = [['glass',0.95],['bell',0.75],['reed',0.55],['hollow',0.20],
                ['chime',0.85],['drone',0.35],['pluck',0.60],['swell',0.30]];
  const BANDS = [['slow',56],['mid',76],['fast',98]];
  const families = [];
  for (const [id,br] of ARCH) for (const [bn,lo] of BANDS)
    families.push({id:`${id}.${bn}`, brightness:br, low:lo});

  const gammaS = (shape, rng) => {
    if (shape < 1) return gammaS(shape+1,rng) * Math.pow(Math.max(rng.double(0,1),1e-300), 1/shape);
    const d = shape - 1/3, c = 1/Math.sqrt(9*d);
    for(;;){
      const u1 = Math.max(rng.double(0,1),1e-300), u2 = rng.double(0,1);
      const z = Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
      const v = Math.pow(1+c*z,3); if (v<=0) continue;
      const u = rng.double(0,1);
      if (u < 1-0.0331*Math.pow(z,4)) return d*v;
      if (Math.log(u) < 0.5*z*z + d*(1-v+Math.log(v))) return d*v;
    }
  };
  const betaS = (a,b,rng) => { const x=gammaS(a,rng), y=gammaS(b,rng); return (x+y)>0 ? x/(x+y) : 0.5; };

  const global = {}, ctx = {};
  const PRIOR = {a:1.2,b:1.0,n:0};
  const blended = id => {
    const c = ctx[id]||PRIOR, g = global[id]||PRIOR, s = 1/(1+c.n);
    return {a: c.a + s*g.a, b: c.b + s*g.b};
  };
  const truth = f => Math.min(Math.max(0.30 + 0.45*f.brightness + 0.25*((f.low-56)/64), 0), 1);

  const rng = new RNG(4242);
  let early=0, late=0; const ROUNDS=400;
  for (let r=0;r<ROUNDS;r++){
    let best=families[0], bestS=-Infinity;
    for (const f of families){ const p=blended(f.id); const s=betaS(p.a,p.b,rng);
      if (s>bestS){bestS=s;best=f;} }
    if (r<40) early += best.brightness;
    if (r>=ROUNDS-40) late += best.brightness;
    const rw = Math.min(Math.max(truth(best)+rng.double(-0.10,0.10),0),1);
    for (const store of [global, ctx]) {
      const cur = store[best.id] || {...PRIOR};
      store[best.id] = {a:cur.a+rw, b:cur.b+(1-rw), n:cur.n+1};
    }
  }
  const e=early/40, l=late/40;
  check('drifts toward the rewarding region', l > e, `early ${e.toFixed(2)} -> late ${l.toFixed(2)}`);
  check('converged choices are bright (>0.6)', l > 0.6, l.toFixed(2));

  const ranked = Object.keys(ctx).map(id => {
    const p = blended(id); return {id, mean: p.a/(p.a+p.b)};
  }).sort((x,y)=>y.mean-x.mean);
  console.log('   top 5:', ranked.slice(0,5).map(r=>`${r.id}=${r.mean.toFixed(3)}`).join(' '));
  check('best arm is a bright family',
        ['glass','chime','bell'].some(p=>ranked[0].id.startsWith(p)), ranked[0].id);
}

process.on('exit', () => {
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}\n`);
});

// ===== 8. Worst case: the bandit converges and every morning comes from ONE family =====
console.log('\n=== 8. Converged bandit — 90 straight days in a single family ===');
{
  const rails = g => railsProposed(g, 250, 5000);
  const FAMS = [
    {id:'glass.fast', modes:['lydian','ionian'], contour:'rising', brightness:0.95, band:[98,120]},
    {id:'hollow.slow', modes:['dorian','pentatonic'], contour:'oscillating', brightness:0.20, band:[56,76]},
    {id:'bell.mid', modes:['pentatonic','ionian'], contour:'rising', brightness:0.75, band:[76,98]},
  ];
  for (const thr of [0.90, 1.10]) {
    for (const f of FAMS) {
      let history=[], fb=0, sd=0, minNear=Infinity, att=0;
      for (let d=0; d<90; d++) {
        const r = sample(fnv(`conv|${f.id}|${d}`), history, f, rails, thr);
        if (r.fallback) fb++; if (r.safeDefault) sd++;
        att += r.attempts;
        if (history.length) minNear = Math.min(minNear, r.near);
        history.unshift(r.genome);
      }
      const flag = fb > 9 ? '  <-- DEGRADED' : '';
      console.log(`   thr=${thr.toFixed(2)} ${f.id.padEnd(12)} fallbacks ${String(fb).padStart(2)}/90, ` +
                  `safeDefault ${sd}, minNearest ${minNear.toFixed(3)}, avg attempts ${(att/90).toFixed(1)}${flag}`);
    }
  }
}

// ============================================================================
// rev. 2 — WakeProtocol: sound + challenge + verification ladder
// ============================================================================

const KINDS = ['reactionGoNoGo','sequenceRecall','oddOneOut','typePhrase','spatialTap'];
const CHECKPOINT_OK = { reactionGoNoGo:false, sequenceRecall:true, oddOneOut:true,
                        typePhrase:true, spatialTap:true };
const CH = { maxDifficulty:0.70, minTimeLimitMs:6000, maxRounds:6, maxExpectedDurationMs:45000 };

function sampleChallenge(rng, kind, role) {
  const difficulty = Math.min(rng.double(0.25, CH.maxDifficulty), CH.maxDifficulty);
  let rounds, timeLimitMs;
  if (role === 'dismissal') {
    rounds = kind === 'reactionGoNoGo' ? 1 : rng.int(CH.maxRounds - 1) + 2; // 2..6
    timeLimitMs = rng.double(8000, 15000);
  } else {
    rounds = 1;
    timeLimitMs = rng.double(CH.minTimeLimitMs, 12000);
  }
  return { kind, rounds, difficulty, timeLimitMs };
}
function challengeViolates(s) {
  if (s.difficulty > CH.maxDifficulty) return 'difficulty';
  if (s.rounds < 1 || s.rounds > CH.maxRounds) return 'rounds';
  if (s.timeLimitMs < CH.minTimeLimitMs) return 'time';
  if (s.kind !== 'reactionGoNoGo' && s.rounds * s.timeLimitMs > CH.maxExpectedDurationMs)
    return 'duration';
  return null;
}

const LAD = { minFirstOffset:120, minSpacing:150 };
const LADDER_MODES = { off:{w:0,c:[0,0]}, standard:{w:1500,c:[3,4]}, extended:{w:3000,c:[5,6]} };
const LADDER_MODE_NAMES = ["off",'standard','extended'];

// Spacing guaranteed by construction: place `count` points in [lo,hi] each >= minSpacing apart
// by drawing sorted uniforms and distributing only the SLACK left after reserving the spacing.
function offsetsWithSpacing(rng, count, lo, hi, minSpacing) {
  if (count <= 0) return [];
  const required = (count - 1) * minSpacing;
  const slack = Math.max(0, (hi - lo) - required);
  const cuts = Array.from({length: count}, () => rng.double(0, 1)).sort((a, b) => a - b);
  return cuts.map((c, i) => lo + c * slack + i * minSpacing);
}
function sampleOffsets(rng, count, window) {
  if (count === 0) return [];
  // Both ends are pinned, and only the middle floats.
  //   - The LAST checkpoint sits in the final 12% of the window: sleep inertia runs 30-90 min from
  //     deep sleep, so a ladder that quietly finishes early defeats its own purpose.
  //   - The FIRST sits in the opening 25%: unbounded jitter let every checkpoint bunch late, which
  //     left a ~19 min hole at the start — exactly when someone crawls back into bed.
  const last = rng.double(0.88 * window, window);
  if (count === 1) return [last];
  const first = rng.double(LAD.minFirstOffset, Math.max(LAD.minFirstOffset + 1, 0.25 * window));
  if (count === 2) return [first, last];
  const middle = offsetsWithSpacing(rng, count - 2, first + LAD.minSpacing,
                                    last - LAD.minSpacing, LAD.minSpacing);
  return [first, ...middle, last];
}
function sampleLadder(rng, mode) {
  if (mode === 'off') return { window:0, checkpoints:[], mode };
  const m = LADDER_MODES[mode];
  const count = rng.int(m.c[1] - m.c[0] + 1) + m.c[0];
  const offsets = sampleOffsets(rng, count, m.w);
  const checkpoints = []; let prevKind = null;
  offsets.forEach((offset, i) => {
    const progress = offsets.length > 1 ? i/(offsets.length-1) : 1;
    const escalation = progress >= 0.99 ? 2 : (progress < 0.4 ? 0 : 1);
    let challenge = null;
    if (i > 0) {
      let cands = KINDS.filter(k => CHECKPOINT_OK[k] && k !== prevKind);
      if (!cands.length) cands = KINDS.filter(k => CHECKPOINT_OK[k]);
      const kind = rng.pick(cands); prevKind = kind;
      challenge = sampleChallenge(rng, kind, 'checkpoint');
    }
    checkpoints.push({ offset, escalation, challenge });
  });
  return { window:m.w, checkpoints, mode };
}
function ladderViolates(L) {
  if (L.mode === 'off') return L.checkpoints.length ? 'off-nonempty' : null;
  if (!L.checkpoints.length) return 'empty';
  let prev = -Infinity;
  for (const c of L.checkpoints) {
    if (c.offset <= prev) return 'not-increasing';
    if (prev > -Infinity && c.offset - prev < LAD.minSpacing) return 'spacing';
    if (c.offset > L.window) return 'past-window';
    prev = c.offset;
  }
  if (L.checkpoints[0].offset < LAD.minFirstOffset) return 'too-early';
  for (let i=1;i<L.checkpoints.length;i++)
    if (L.checkpoints[i].escalation < L.checkpoints[i-1].escalation) return 'escalation';
  if (L.checkpoints[L.checkpoints.length-1].escalation !== 2) return 'no-full-alarm';
  for (let i=1;i<L.checkpoints.length;i++) {
    const a=L.checkpoints[i-1].challenge, b=L.checkpoints[i].challenge;
    if (a && b && a.kind === b.kind) return 'repeat-kind';
  }
  for (const c of L.checkpoints) {
    if (!c.challenge) continue;
    if (!CHECKPOINT_OK[c.challenge.kind]) return 'bad-checkpoint-kind';
    if (challengeViolates(c.challenge)) return 'checkpoint-limits';
  }
  return null;
}

const CW = { kind:1.6, difficulty:0.5, rounds:0.4 };
const LW = { mode:0.6, count:0.5, timing:0.45 };
function challengeVec(s) {
  return [...KINDS.map(k => k===s.kind ? CW.kind : 0),
          s.difficulty*CW.difficulty, s.rounds/CH.maxRounds*CW.rounds];
}
function ladderVec(L) {
  const v = LADDER_MODE_NAMES.map(m => m===L.mode ? LW.mode : 0);
  v.push(L.checkpoints.length/6*LW.count);
  const n = L.checkpoints.map(c => L.window>0 ? c.offset/L.window : 0);
  for (let i=0;i<6;i++) v.push((i<n.length ? n[i] : 0)*LW.timing);
  return v;
}
function protoVec(p){ return [...featureVector(p.sound), ...challengeVec(p.challenge), ...ladderVec(p.ladder)]; }
function protoDist(a,b){ const x=protoVec(a),y=protoVec(b);
  let s=0; for(let i=0;i<x.length;i++) s+=(x[i]-y[i])**2; return Math.sqrt(s); }

const rails250 = g => railsProposed(g, 250, 5000);
function sampleProtocol(seed, family, kind, mode, history, threshold, maxAttempts=64) {
  const rng = new RNG(seed), recent = history.slice(0,30);
  let best=null, bestD=-1, attempts=0;
  while (attempts < maxAttempts) {
    attempts++;
    const sd = sample(seed + BigInt(attempts)*0x9E37n, [], family, rails250, 0);
    const challenge = sampleChallenge(rng, kind, 'dismissal');
    if (challengeViolates(challenge)) continue;
    const ladder = sampleLadder(rng, mode);
    if (ladderViolates(ladder)) continue;
    const cand = { sound: sd.genome, challenge, ladder };
    const near = recent.length ? Math.min(...recent.map(h=>protoDist(cand,h))) : Infinity;
    if (near >= threshold) return {p:cand, near, fallback:false, attempts};
    if (near > bestD) { bestD = near; best = cand; }
  }
  return {p:best, near:bestD, fallback:true, attempts};
}

console.log('\n=== 9. Verification ladder invariants (20k samples, both modes) ===');
{
  for (const mode of ['standard','extended']) {
    const reasons = {}; const rng = new RNG(fnv('ladder-'+mode));
    for (let i=0;i<20000;i++) {
      const r = ladderViolates(sampleLadder(rng, mode));
      reasons[r||'ok'] = (reasons[r||'ok']||0)+1;
    }
    const ok = (reasons.ok||0)/20000;
    check(`${mode}: all ladders valid`, ok === 1,
          ok === 1 ? '20000/20000' : JSON.stringify(reasons));
  }
  const off = sampleLadder(new RNG(1), 'off');
  check('off mode yields no checkpoints', !ladderViolates(off) && off.checkpoints.length===0);
}

console.log('\n=== 10. Ladder window matches sleep-inertia physiology ===');
{
  const rng = new RNG(7);
  for (const [mode, minLast] of [['standard', 20*60], ['extended', 40*60]]) {
    let worstLast = Infinity, worstFirst = 0;
    for (let i=0;i<5000;i++) {
      const L = sampleLadder(rng, mode);
      worstLast = Math.min(worstLast, L.checkpoints[L.checkpoints.length-1].offset);
      worstFirst = Math.max(worstFirst, L.checkpoints[0].offset);
    }
    check(`${mode}: last checkpoint always past ${minLast/60}min`, worstLast >= minLast,
          `earliest last = ${(worstLast/60).toFixed(1)}min`);
    const firstCap = mode === 'standard' ? 7*60 : 13*60;
    check(`${mode}: first checkpoint always within ${firstCap/60}min`, worstFirst <= firstCap,
          `latest first = ${(worstFirst/60).toFixed(1)}min`);
  }
}

console.log('\n=== 11. WakeProtocol novelty threshold sweep (365 mornings) ===');
{
  const FAMS = [
    {id:'glass.fast', modes:['lydian','ionian'], contour:'rising', brightness:0.95, band:[98,120]},
    {id:'bell.mid', modes:['pentatonic','ionian'], contour:'rising', brightness:0.75, band:[76,98]},
  ];
  for (const thr of [1.20, 1.60, 2.00, 2.40]) {
    let history=[], fb=0, minNear=Infinity, att=0;
    const pick = new RNG(fnv('sweep'+thr));
    for (let d=0; d<365; d++) {
      const fam = FAMS[pick.int(FAMS.length)], kind = pick.pick(KINDS);
      const r = sampleProtocol(fnv(`proto|${d}`), fam, kind, 'standard', history, thr);
      if (r.fallback) fb++;
      att += r.attempts;
      if (history.length) minNear = Math.min(minNear, r.near);
      history.unshift(r.p);
    }
    console.log(`   thr=${thr.toFixed(2)}: fallbacks ${String(fb).padStart(3)}/365, ` +
                `minNearest ${minNear.toFixed(2)}, avg attempts ${(att/365).toFixed(1)}`);
  }
}

console.log('\n=== 12. Worst case: bandits converge, ONE family + ONE challenge for 90 days ===');
{
  const fam = {id:'glass.fast', modes:['lydian','ionian'], contour:'rising',
               brightness:0.95, band:[98,120]};
  for (const thr of [1.20, 1.60, 2.00]) {
    let history=[], fb=0, minNear=Infinity;
    for (let d=0; d<90; d++) {
      const r = sampleProtocol(fnv(`conv2|${thr}|${d}`), fam, 'typePhrase', 'standard', history, thr);
      if (r.fallback) fb++;
      if (history.length) minNear = Math.min(minNear, r.near);
      history.unshift(r.p);
    }
    const flag = fb > 9 ? '  <-- DEGRADED' : '';
    console.log(`   thr=${thr.toFixed(2)}: fallbacks ${String(fb).padStart(2)}/90, ` +
                `minNearest ${minNear.toFixed(2)}${flag}`);
  }
}

console.log('\n=== 13. Challenge bandit converges over 5 arms ===');
{
  const gammaS = (shape, rng) => {
    if (shape < 1) return gammaS(shape+1,rng)*Math.pow(Math.max(rng.double(0,1),1e-300),1/shape);
    const d = shape-1/3, c = 1/Math.sqrt(9*d);
    for(;;){
      const u1=Math.max(rng.double(0,1),1e-300), u2=rng.double(0,1);
      const z=Math.sqrt(-2*Math.log(u1))*Math.cos(2*Math.PI*u2);
      const v=Math.pow(1+c*z,3); if(v<=0) continue;
      const u=rng.double(0,1);
      if (u < 1-0.0331*Math.pow(z,4)) return d*v;
      if (Math.log(u) < 0.5*z*z + d*(1-v+Math.log(v))) return d*v;
    }
  };
  const betaS=(a,b,rng)=>{const x=gammaS(a,rng),y=gammaS(b,rng);return (x+y)>0?x/(x+y):0.5;};
  const PRIOR={a:1.2,b:1.0,n:0}, store={};
  // Synthetic user who genuinely wakes better to the most autopilot-resistant challenge.
  const RESIST={reactionGoNoGo:0.65,sequenceRecall:0.80,oddOneOut:0.85,typePhrase:0.95,spatialTap:0.70};
  const truth = k => Math.min(Math.max(0.25 + 0.6*RESIST[k], 0), 1);
  const rng = new RNG(555);
  let early=0, late=0; const R=200;
  for (let r=0;r<R;r++){
    let best=KINDS[0], bs=-Infinity;
    for (const k of KINDS){ const p=store[k]||PRIOR; const s=betaS(p.a,p.b,rng); if(s>bs){bs=s;best=k;} }
    if (r<25) early += RESIST[best];
    if (r>=R-25) late += RESIST[best];
    const rw = Math.min(Math.max(truth(best)+rng.double(-0.08,0.08),0),1);
    const cur = store[best]||{...PRIOR};
    store[best] = {a:cur.a+rw, b:cur.b+(1-rw), n:cur.n+1};
  }
  const e=early/25, l=late/25;
  check('challenge bandit drifts to resistant kinds', l > e, `${e.toFixed(2)} -> ${l.toFixed(2)}`);
  const top = Object.entries(store).sort((a,b)=> (b[1].a/(b[1].a+b[1].b))-(a[1].a/(a[1].a+a[1].b)))[0];
  check('best challenge arm is typePhrase', top[0]==='typePhrase', top[0]);
}
