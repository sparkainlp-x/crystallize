'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../game.js');

const near = (a, b, tol) => assert.ok(Math.abs(a - b) <= tol, `${a} not within ${tol} of ${b}`);

/* ---------- RNG and generator ---------- */

test('hashStr is deterministic and separates inputs', () => {
  assert.equal(G.hashStr('abc'), G.hashStr('abc'));
  assert.notEqual(G.hashStr('abc'), G.hashStr('abd'));
  assert.ok(Number.isInteger(G.hashStr('x')) && G.hashStr('x') >= 0);
});

test('makeRng: same seed gives the same stream, different seeds differ, range is [0,1)', () => {
  const a = G.makeRng('seed-1'), b = G.makeRng('seed-1'), c = G.makeRng('seed-2');
  const xs = Array.from({ length: 50 }, () => a()), ys = Array.from({ length: 50 }, () => b());
  const zs = Array.from({ length: 50 }, () => c());
  assert.deepEqual(xs, ys);
  assert.notDeepEqual(xs, zs);
  assert.ok(xs.every((x) => x >= 0 && x < 1));
});

test('gauss has mean near 0 and variance near 1', () => {
  const r = G.makeRng('gauss'), n = 20000;
  let s = 0, s2 = 0;
  for (let i = 0; i < n; i++) { const g = G.gauss(r); s += g; s2 += g * g; }
  near(s / n, 0, 0.03);
  near(s2 / n, 1, 0.05);
});

test('makeInstance is deterministic per seed and differs across seeds', () => {
  assert.deepEqual(G.makeInstance('abc'), G.makeInstance('abc'));
  assert.notDeepEqual(G.makeInstance('abc').points, G.makeInstance('abd').points);
});

test('instance structure: sizes, prior grid, null has no signal', () => {
  for (let i = 0; i < 60; i++) {
    const inst = G.makeInstance('struct' + i);
    assert.equal(inst.points.length, G.MAX_SAMPLES + G.REPL_N);
    assert.ok(G.PRIORS.includes(inst.prior));
    if (inst.real) { assert.ok(G.TAU.includes(inst.tau)); assert.ok(inst.theta >= 0 && inst.theta < Math.PI); }
    else { assert.equal(inst.tau, 0); assert.equal(inst.theta, null); }
  }
});

test('same date gives the same daily puzzle for everyone, other dates differ', () => {
  const a = G.makeInstance(G.dailySeed('2026-10-24')), b = G.makeInstance(G.dailySeed('2026-10-24'));
  const c = G.makeInstance(G.dailySeed('2026-10-25'));
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.points, c.points);
});

test('share of real instruments matches the average prior', () => {
  let real = 0, prior = 0;
  const n = 3000;
  for (let i = 0; i < n; i++) { const inst = G.makeInstance('freq' + i); real += inst.real ? 1 : 0; prior += inst.prior; }
  near(real / n, prior / n, 0.03);
});

test('signal instances are elongated along the true axis on average', () => {
  let hits = 0, tried = 0;
  for (let i = 0; i < 300 && tried < 60; i++) {
    const inst = G.makeInstance('elong' + i);
    if (!inst.real || inst.tau < 1.4) continue;
    tried++;
    const st = G.stats(inst.points, 60);
    const d = Math.abs(Math.cos(st.angle - inst.theta));
    if (d > 0.9) hits++;
  }
  assert.ok(tried >= 20);
  assert.ok(hits / tried > 0.7, `${hits}/${tried}`);
});

/* ---------- statistics and the reference observer ---------- */

test('stats: axis-aligned data gives the right angle and ratio', () => {
  const pts = [[2, 0], [-2, 0], [0, 1], [0, -1]];
  const st = G.stats(pts, 4);
  near(st.lam1, 2, 1e-9); near(st.lam2, 0.5, 1e-9); near(st.ratio, 4, 1e-9); near(st.angle, 0, 1e-9);
  const rot = G.stats([[0, 2], [0, -2], [1, 0], [-1, 0]], 4);
  near(rot.angle, Math.PI / 2, 1e-9);
});

test('stats: ratio at least 1, angle in [0, pi), empty sample is neutral', () => {
  const inst = G.makeInstance('stats');
  for (const n of [2, 5, 20, 60]) {
    const st = G.stats(inst.points, n);
    assert.ok(st.ratio >= 1 && st.angle >= 0 && st.angle < Math.PI);
  }
  assert.equal(G.stats(inst.points, 0).ratio, 1);
});

test('posterior: prior at n = 0, always inside (0, 1)', () => {
  assert.equal(G.posteriorReal([], 0, 0.35), 0.35);
  for (let i = 0; i < 40; i++) {
    const inst = G.makeInstance('post' + i);
    for (const n of [5, 30, 60]) { const p = G.posteriorReal(inst.points, n, inst.prior); assert.ok(p > 0 && p < 1); }
  }
});

test('posterior: strongly elongated data scores above isotropic data', () => {
  const rng = G.makeRng('elong-iso');
  const iso = [], elong = [];
  for (let i = 0; i < 40; i++) {
    iso.push([G.gauss(rng), G.gauss(rng)]);
    const a = 2 * G.gauss(rng), c = Math.SQRT1_2;
    elong.push([G.gauss(rng) * 0.5 + a * c, G.gauss(rng) * 0.5 + a * c]);
  }
  assert.ok(G.posteriorReal(elong, 40, 0.5) > 0.99);
  assert.ok(G.posteriorReal(iso, 40, 0.5) < 0.5);
});

test('posterior is calibrated against the generator (binned, n = 30)', () => {
  const bins = Array.from({ length: 5 }, () => ({ n: 0, p: 0, t: 0 }));
  for (let i = 0; i < 1500; i++) {
    const inst = G.makeInstance('cal' + i), p = G.posteriorReal(inst.points, 30, inst.prior);
    const b = bins[Math.min(4, Math.floor(p * 5))];
    b.n++; b.p += p; b.t += inst.real ? 1 : 0;
  }
  for (const b of bins) if (b.n >= 100) near(b.p / b.n, b.t / b.n, 0.08);
});

test('posterior separates real from null on average and beats the prior in Brier score', () => {
  let pr = 0, pn = 0, nr = 0, nn = 0, bPost = 0, bPrior = 0;
  const N = 600;
  for (let i = 0; i < N; i++) {
    const inst = G.makeInstance('disc' + i), p = G.posteriorReal(inst.points, 40, inst.prior);
    if (inst.real) { pr += p; nr++; } else { pn += p; nn++; }
    bPost += G.brier(p, inst.real); bPrior += G.brier(inst.prior, inst.real);
  }
  assert.ok(pr / nr > pn / nn + 0.3);
  assert.ok(bPost < bPrior * 0.8);
});

/* ---------- scoring ---------- */

test('calibration points: 0 at 50%, near 100 when right and confident', () => {
  near(G.calibrationPoints(0.5, true), 0, 1e-9);
  near(G.calibrationPoints(0.5, false), 0, 1e-9);
  near(G.calibrationPoints(0.99, true), 100 * (1 - 4 * 0.0001), 1e-9);
  assert.ok(G.calibrationPoints(0.99, false) < -290);
});

test('scoring is strictly proper: expected score is maximised by reporting the true belief', () => {
  for (const q of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
    const ev = (p) => q * G.calibrationPoints(p, true) + (1 - q) * G.calibrationPoints(p, false);
    const atQ = ev(q);
    for (let p = 0.02; p <= 0.98; p += 0.02) {
      if (Math.abs(p - q) > 0.015) assert.ok(atQ > ev(p), `q=${q} p=${p}`);
    }
  }
});

test('scoring is monotone: more confidence in the truth never lowers the score', () => {
  for (let p = 0.02; p < 0.98; p += 0.02) {
    assert.ok(G.calibrationPoints(p + 0.01, true) > G.calibrationPoints(p, true));
    assert.ok(G.calibrationPoints(p + 0.01, false) < G.calibrationPoints(p, false));
  }
});

test('clampP keeps reports inside [0.01, 0.99]', () => {
  assert.equal(G.clampP(-3), 0.01); assert.equal(G.clampP(7), 0.99); assert.equal(G.clampP(0.4), 0.4);
  assert.ok(Number.isFinite(G.calibrationPoints(0, true)) && Number.isFinite(G.calibrationPoints(1, false)));
});

test('clampP turns NaN, undefined and infinities into a finite report', () => {
  assert.equal(G.clampP(NaN), 0.5); assert.equal(G.clampP(undefined), 0.5); assert.equal(G.clampP('x'), 0.5);
  assert.equal(G.clampP(Infinity), 0.5); assert.equal(G.clampP('0.3'), 0.3);
  assert.ok(Number.isFinite(G.roundScore({ p1: NaN, p2: undefined, truth: true, n: 10 }).total));
});

test('sampling cost is linear and increasing, so over-sampling is penalised', () => {
  assert.equal(G.samplingCost(0), 0);
  for (let n = 1; n < 60; n++) assert.ok(G.samplingCost(n + 1) > G.samplingCost(n));
  near(G.samplingCost(10), 10 * G.COST, 1e-9);
  const a = G.roundScore({ p1: 0.9, p2: 0.9, truth: true, n: 10 }), b = G.roundScore({ p1: 0.9, p2: 0.9, truth: true, n: 40 });
  assert.ok(a.total > b.total);
});

test('roundScore combines the two claims with equal weight and subtracts the cost once', () => {
  const r = G.roundScore({ p1: 0.8, p2: 0.6, truth: true, n: 12 });
  near(r.total, 0.5 * r.s1 + 0.5 * r.s2 - 12 * G.COST, 1e-9);
  near(r.s1, G.calibrationPoints(0.8, true), 1e-9);
});

test('overclaiming is penalised: a confident wrong claim scores below a hedged one', () => {
  assert.ok(G.roundScore({ p1: 0.95, p2: 0.95, truth: false, n: 20 }).total <
    G.roundScore({ p1: 0.6, p2: 0.6, truth: false, n: 20 }).total);
});

/* ---------- reviewer replication ---------- */

test('replication is deterministic, uses fresh points and reports a boolean verdict', () => {
  const inst = G.makeInstance('rep');
  const a = G.replication(inst, 0.7), b = G.replication(inst, 0.7);
  assert.deepEqual(a, b);
  assert.equal(a.points.length, G.REPL_N);
  assert.deepEqual(a.points, inst.points.slice(G.MAX_SAMPLES, G.MAX_SAMPLES + G.REPL_N));
  assert.equal(a.supports, a.ratio >= G.F95_20_20);
});

test('replication false-positive rate under pure noise is about 5% (F(20,20) threshold)', () => {
  const rng = G.makeRng('fpr');
  let hit = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    let a = 0, b = 0;
    for (let k = 0; k < G.REPL_N; k++) { const u = G.gauss(rng), v = G.gauss(rng); a += u * u; b += v * v; }
    if (a / b >= G.F95_20_20) hit++;
  }
  near(hit / N, 0.05, 0.008);
});

test('replication on the true axis passes more often than on a wrong axis', () => {
  let right = 0, wrong = 0, tried = 0;
  for (let i = 0; i < 400 && tried < 80; i++) {
    const inst = G.makeInstance('repx' + i);
    if (!inst.real || inst.tau < 1.0) continue;
    tried++;
    if (G.replication(inst, inst.theta).supports) right++;
    if (G.replication(inst, inst.theta + Math.PI / 2).supports) wrong++;
  }
  assert.ok(tried >= 30);
  assert.ok(right > wrong + tried * 0.3, `${right} vs ${wrong} of ${tried}`);
});

test('reference observer: pooled evidence helps and beats the prior-only forecast on average', () => {
  let ref = 0, base = 0;
  const N = 300;
  for (let i = 0; i < N; i++) {
    const inst = G.makeInstance('refobs' + i);
    ref += G.referenceObserver(inst, 30).score;
    base += G.roundScore({ p1: inst.prior, p2: inst.prior, truth: inst.real, n: 0 }).total;
  }
  assert.ok(ref / N > base / N + 10, `${ref / N} vs ${base / N}`);
});

/* ---------- lessons ---------- */

test('pickLesson always returns a known key and covers the intended cases', () => {
  const base = { truth: false, p1: 0.5, p2: 0.5, n: 30, prior: 0.5, supports: false, ideal: 0.2 };
  assert.equal(G.pickLesson({ ...base, p1: 0.9, p2: 0.9, n: 10 }), 'small_samples');
  assert.equal(G.pickLesson({ ...base, p1: 0.9, p2: 0.9, n: 40 }), 'pareidolia');
  assert.equal(G.pickLesson({ ...base, supports: true }), 'replication_chance');
  assert.equal(G.pickLesson({ ...base, truth: true, supports: false }), 'replication_power');
  assert.equal(G.pickLesson({ ...base, truth: true, supports: true, p1: 0.1, p2: 0.1 }), 'overconfidence');
  assert.equal(G.pickLesson({ ...base, truth: true, supports: true, p1: 0.55, p2: 0.55, ideal: 0.95 }), 'underconfidence');
  assert.equal(G.pickLesson({ ...base, truth: true, supports: true, p1: 0.85, p2: 0.9, n: 12 }), 'winners_curse');
  assert.equal(G.pickLesson({ ...base, prior: 0.2 }), 'base_rate');
  assert.equal(G.pickLesson({ ...base, n: 55 }), 'info_cost');
  assert.equal(G.pickLesson(base), 'optional_stopping');
  const rng = G.makeRng('lessons');
  for (let i = 0; i < 300; i++) {
    const k = G.pickLesson({ truth: rng() < 0.5, p1: rng(), p2: rng(), n: 5 + Math.floor(rng() * 56), prior: G.PRIORS[i % 4], supports: rng() < 0.5, ideal: rng() });
    assert.ok(G.LESSON_KEYS.includes(k));
  }
});

/* ---------- days, streaks, links ---------- */

test('dateIndex and dayNumber: epoch is day 1 and the count survives DST and leap days', () => {
  assert.equal(G.dayNumber(G.EPOCH), 1);
  assert.equal(G.dayNumber('2026-10-24'), 2);
  assert.equal(G.dateIndex('2028-03-01') - G.dateIndex('2028-02-28'), 2);
  assert.equal(G.dateIndex('2026-11-02') - G.dateIndex('2026-11-01'), 1);
  assert.ok(Number.isNaN(G.dateIndex('2026-1-1')));
  assert.equal(G.localDateString(new Date(2026, 0, 5)), '2026-01-05');
});

test('dates must be real calendar days: no roll-over, nothing before launch', () => {
  for (const bad of ['2026-13-01', '2026-02-30', '2026-00-10', '2026-04-31', '0050-01-01', '2026-1-1', '', 'x']) {
    assert.ok(Number.isNaN(G.dateIndex(bad)), bad);
  }
  assert.ok(!Number.isNaN(G.dateIndex('2028-02-29')));
  assert.ok(Number.isNaN(G.dateIndex('2027-02-29')));
  assert.equal(G.parseHash('#d=2026-13-99').seed, null);
  assert.equal(G.parseHash('#d=2026-02-30').seed, null);
  assert.equal(G.parseHash('#d=2026-10-22').seed, null);          // before day 1
  assert.equal(G.parseHash('#d=2026-10-23').seed, 'd2026-10-23');
  assert.equal(G.seedDate('d2026-02-30'), null);
});

test('computeStreak: runs, gaps, yesterday grace, duplicates, bad input', () => {
  const s = (dates, today) => G.computeStreak(dates, today);
  assert.deepEqual(s([], '2026-10-23'), { current: 0, best: 0 });
  assert.deepEqual(s(['2026-10-21', '2026-10-22', '2026-10-23'], '2026-10-23'), { current: 3, best: 3 });
  assert.deepEqual(s(['2026-10-21', '2026-10-22'], '2026-10-23'), { current: 2, best: 2 });      // played yesterday: still alive
  assert.deepEqual(s(['2026-10-20', '2026-10-21'], '2026-10-23'), { current: 0, best: 2 });      // missed a day
  assert.deepEqual(s(['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-23'], '2026-10-23'), { current: 1, best: 2 });
  assert.deepEqual(s(['2026-10-23', '2026-10-23', 'nonsense'], '2026-10-23'), { current: 1, best: 1 });
  assert.deepEqual(s(['2026-02-28', '2026-03-01'], '2026-03-01'), { current: 2, best: 2 });
});

test('parseHash accepts date, seed, best score and language; rejects unsafe input', () => {
  assert.deepEqual(G.parseHash(''), { mode: 'daily', seed: null, date: null, best: null, lang: null });
  assert.deepEqual(G.parseHash('#d=2026-10-24&b=71&l=fr'), { mode: 'challenge', seed: 'd2026-10-24', date: '2026-10-24', best: 71, lang: 'fr' });
  assert.deepEqual(G.parseHash('#s=pk3x9&b=-20'), { mode: 'challenge', seed: 'pk3x9', date: null, best: -20, lang: null });
  assert.equal(G.parseHash('#s=<script>alert(1)</script>').seed, null);
  assert.equal(G.parseHash('#s=' + 'a'.repeat(40)).seed, null);
  assert.equal(G.parseHash('#d=2026-13-99x').seed, null);
  assert.equal(G.parseHash('#b=50').best, null);                    // a score without a seed is ignored
  assert.equal(G.parseHash('#l=FRA').lang, null);
});

test('buildChallengeHash round-trips through parseHash', () => {
  const h1 = G.buildChallengeHash({ date: '2026-10-24', best: 64.4, lang: 'en' });
  assert.equal(h1, '#d=2026-10-24&b=64&l=en');
  assert.equal(G.parseHash(h1).seed, 'd2026-10-24');
  const h2 = G.buildChallengeHash({ seed: 'pabc12', best: -8 });
  assert.deepEqual(G.parseHash(h2), { mode: 'challenge', seed: 'pabc12', date: null, best: -8, lang: null });
});

/* ---------- share card ---------- */

const EN = require('../i18n.js').LANGS.en, FR = require('../i18n.js').LANGS.fr;
const shareIn = { day: 7, date: '2026-10-29', score: 61.6, ideal: 70.2, n: 24, p2: 0.82, supports: true, url: 'https://example.invalid/#d=2026-10-29' };

test('bar renders a fixed-width block bar and clamps', () => {
  assert.equal(G.bar(50, 100, 10), '\u2588'.repeat(5) + '\u2591'.repeat(5));
  assert.equal(G.bar(-5, 100, 10), '\u2591'.repeat(10));
  assert.equal(G.bar(500, 100, 10), '\u2588'.repeat(10));
  assert.equal(G.bar(0, 100).length, 10);
});

test('share card format: lines, day, score, bar, no emoji, short lines, no truth spoiler', () => {
  const card = G.buildShare({ ...shareIn, labels: EN });
  const lines = card.split('\n');
  assert.equal(lines.length, 7);
  assert.equal(lines[0], 'CRYSTALLIZE #7  2026-10-29');
  assert.equal(lines[1], 'Score 62  (reference 70)');
  assert.equal(lines[2], 'Readings 24 of 60');
  assert.equal(lines[3], 'Conviction 64% Replication: supports');
  assert.equal(lines[4], 'Score ' + G.bar(61.6, 100, 10));
  assert.equal(lines[6], shareIn.url);
  assert.ok(lines.slice(0, 6).every((l) => l.length <= 40), 'lines fit a narrow chat bubble');
  assert.ok(!/\p{Extended_Pictographic}/u.test(card));
  assert.ok(!/real|noise|hidden|true|false/i.test(lines.slice(0, 6).join(' ').replace('Replication', '')), 'no spoiler of the truth');
  assert.equal(card, G.buildShare({ ...shareIn, labels: EN }));
});

test('share card conviction ignores direction and the French card has the same shape', () => {
  const a = G.buildShare({ ...shareIn, labels: EN, p2: 0.82 }), b = G.buildShare({ ...shareIn, labels: EN, p2: 0.18 });
  assert.equal(a, b);
  const fr = G.buildShare({ ...shareIn, labels: FR });
  assert.equal(fr.split('\n').length, 7);
  assert.match(fr, /CRYSTALLIZE #7/);
  assert.match(fr, /Conviction 64 %/);
  assert.ok(!/\p{Extended_Pictographic}/u.test(fr));
});

test('share card for a free-form seed names the seed instead of a day', () => {
  const card = G.buildShare({ ...shareIn, seed: 'pk3x9', labels: EN });
  assert.equal(card.split('\n')[0], 'CRYSTALLIZE  seed pk3x9');
  assert.equal(G.seedDate('d2026-10-24'), '2026-10-24');
  assert.equal(G.seedDate('demo10'), null);
  assert.equal(G.seedDate('dnotadate'), null);
});

test('share card without url has six lines', () => {
  assert.equal(G.buildShare({ ...shareIn, url: '', labels: EN }).split('\n').length, 6);
});

test('fmt leaves unknown placeholders alone', () => {
  assert.equal(G.fmt('a {x} {y}', { x: 1 }), 'a 1 {y}');
});
