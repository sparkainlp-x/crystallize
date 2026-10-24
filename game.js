/*
 * Crystallize: pure game logic (SYNTHETIC educational game).
 *
 * Seeded RNG, instance generator, evidence statistics, an exact Bayesian
 * reference observer for the generator, scoring, replication, lessons, streaks,
 * hash links and the plain-text share card. No DOM, no network, no storage.
 *
 * Copyright (c) 2026 Jean-François Brisson, Spark AI NLP. AGPL-3.0-only.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CrystallizeGame = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var VERSION = '0.1.0';
  var GEN = 'crystallize/v1/';           // generator namespace: changing it changes every puzzle
  var EPOCH = '2026-10-23';              // day number 1
  var PRIORS = [0.2, 0.35, 0.5, 0.65];   // share of instruments that carry a hidden direction
  var TAU = [0.7, 1.0, 1.4];             // signal amplitude (noise sigma is 1), equally likely
  var MAX_SAMPLES = 60;
  var MIN_SAMPLES = 5;
  var REPL_N = 20;                       // fresh samples in the reviewer's replication
  var COST = 0.8;                        // points per sample revealed
  var P_MIN = 0.01, P_MAX = 0.99;
  var F95_20_20 = 2.1242;                // 95th percentile of F(20, 20)
  var THETA_STEPS = 180;

  /* ---------- seeded RNG (xmur3 hash + mulberry32) ---------- */

  function hashStr(str) {
    var h = 1779033703 ^ str.length;
    for (var i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeRng(seedStr) { return mulberry32(hashStr(String(seedStr))); }

  function gauss(rng) {
    var u = 0;
    while (u === 0) u = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
  }

  /* ---------- instance generator ---------- */

  function makeInstance(seed) {
    var rng = makeRng(GEN + seed);
    var prior = PRIORS[Math.floor(rng() * PRIORS.length)];
    var real = rng() < prior;
    var tau = TAU[Math.floor(rng() * TAU.length)];
    var theta = rng() * Math.PI;
    var c = Math.cos(theta), s = Math.sin(theta);
    var pts = [];
    for (var i = 0; i < MAX_SAMPLES + REPL_N; i++) {
      var x = gauss(rng), y = gauss(rng);
      if (real) {
        var a = tau * gauss(rng);
        x += a * c; y += a * s;
      }
      pts.push([x, y]);
    }
    return { seed: String(seed), prior: prior, real: real, tau: real ? tau : 0, theta: real ? theta : null, points: pts };
  }

  /* ---------- evidence statistics ---------- */

  function moments(points, n) {
    var a = 0, b = 0, c = 0;
    for (var i = 0; i < n; i++) {
      var p = points[i];
      a += p[0] * p[0]; b += p[0] * p[1]; c += p[1] * p[1];
    }
    return { n: n, a: a, b: b, c: c };
  }

  // second-moment matrix about the known origin; closed-form 2x2 eigen-decomposition
  function stats(points, n) {
    if (n <= 0) return { n: 0, lam1: 0, lam2: 0, ratio: 1, angle: 0 };
    var m = moments(points, n);
    var a = m.a / n, b = m.b / n, c = m.c / n;
    var mid = (a + c) / 2, rad = Math.sqrt(((a - c) / 2) * ((a - c) / 2) + b * b);
    var lam1 = mid + rad, lam2 = Math.max(mid - rad, 1e-12);
    var angle = 0.5 * Math.atan2(2 * b, a - c);
    if (angle < 0) angle += Math.PI;
    return { n: n, lam1: lam1, lam2: lam2, ratio: lam1 / lam2, angle: angle };
  }

  function logSumExp(xs) {
    var m = -Infinity;
    for (var i = 0; i < xs.length; i++) if (xs[i] > m) m = xs[i];
    var s = 0;
    for (var j = 0; j < xs.length; j++) s += Math.exp(xs[j] - m);
    return m + Math.log(s);
  }

  // Exact posterior P(real | first n points) for this generator: noise sigma 1, latent
  // amplitude N(0, tau^2) along a uniform direction, tau uniform on TAU, prior as shown.
  function posteriorReal(points, n, prior) {
    if (n <= 0) return prior;
    var m = moments(points, n);
    var terms = [];
    for (var k = 0; k < THETA_STEPS; k++) {
      var th = (k + 0.5) * Math.PI / THETA_STEPS, cs = Math.cos(th), sn = Math.sin(th);
      var q = m.a * cs * cs + 2 * m.b * cs * sn + m.c * sn * sn;   // n * u'Su
      for (var j = 0; j < TAU.length; j++) {
        var t2 = TAU[j] * TAU[j];
        terms.push(-0.5 * n * Math.log(1 + t2) + 0.5 * (t2 / (1 + t2)) * q);
      }
    }
    var logBF = logSumExp(terms) - Math.log(terms.length);
    var logOdds = Math.log(prior / (1 - prior)) + logBF;
    var p = 1 / (1 + Math.exp(-logOdds));
    return Math.min(1 - 1e-9, Math.max(1e-9, p));
  }

  /* ---------- scoring ---------- */

  // non-numbers and NaN become 50% instead of poisoning the score
  function clampP(p) { p = Number(p); if (!isFinite(p)) return 0.5; return Math.min(P_MAX, Math.max(P_MIN, p)); }
  function brier(p, truth) { var d = clampP(p) - (truth ? 1 : 0); return d * d; }
  // 100 at a perfect report, 0 at 50%, negative when confidently wrong. Strictly proper.
  function calibrationPoints(p, truth) { return 100 * (1 - 4 * brier(p, truth)); }
  function samplingCost(n) { return COST * n; }

  function roundScore(o) {
    var s1 = calibrationPoints(o.p1, o.truth);
    var s2 = calibrationPoints(o.p2, o.truth);
    var cost = samplingCost(o.n);
    return { s1: s1, s2: s2, cost: cost, total: 0.5 * s1 + 0.5 * s2 - cost };
  }

  /* ---------- reviewer replication ---------- */

  // Pre-registered test on the claimed axis: variance along it over variance across it,
  // on REPL_N fresh samples. Under pure noise this ratio follows F(20, 20).
  function replication(inst, angle) {
    var pts = inst.points.slice(MAX_SAMPLES, MAX_SAMPLES + REPL_N);
    var cs = Math.cos(angle), sn = Math.sin(angle);
    var along = 0, across = 0;
    for (var i = 0; i < pts.length; i++) {
      var u = pts[i][0] * cs + pts[i][1] * sn, v = -pts[i][0] * sn + pts[i][1] * cs;
      along += u * u; across += v * v;
    }
    var ratio = along / Math.max(across, 1e-12);
    return { points: pts, angle: angle, ratio: ratio, supports: ratio >= F95_20_20, threshold: F95_20_20 };
  }

  // points that the reference observer sees at the second stage: yours plus the replication
  function stageTwoPoints(inst, n) {
    return inst.points.slice(0, n).concat(inst.points.slice(MAX_SAMPLES, MAX_SAMPLES + REPL_N));
  }

  function referenceObserver(inst, n) {
    var p1 = posteriorReal(inst.points, n, inst.prior);
    var two = stageTwoPoints(inst, n);
    var p2 = posteriorReal(two, two.length, inst.prior);
    var sc = roundScore({ p1: p1, p2: p2, truth: inst.real, n: n });
    return { p1: p1, p2: p2, score: sc.total };
  }

  /* ---------- lessons (accurate, short; text lives in i18n) ---------- */

  function pickLesson(o) {
    var claimedReal = Math.max(o.p1, o.p2) >= 0.6;
    if (!o.truth && claimedReal) return o.n <= 20 ? 'small_samples' : 'pareidolia';
    if (!o.truth && o.supports) return 'replication_chance';
    if (o.truth && !o.supports) return 'replication_power';
    if (brier(o.p1, o.truth) > 0.4) return 'overconfidence';
    if (o.truth && o.ideal >= 0.8 && Math.max(o.p1, o.p2) < 0.6) return 'underconfidence';
    if (o.truth && o.n <= 15 && o.p1 >= 0.8) return 'winners_curse';
    if (o.prior <= 0.35) return 'base_rate';
    if (o.n >= 50) return 'info_cost';
    return 'optional_stopping';
  }
  var LESSON_KEYS = ['small_samples', 'pareidolia', 'replication_chance', 'replication_power',
    'overconfidence', 'underconfidence', 'winners_curse', 'base_rate', 'info_cost', 'optional_stopping'];

  /* ---------- days, streaks, hash links ---------- */

  // days since 1970-01-01 for a real calendar date YYYY-MM-DD, else NaN (no rolling over: 2026-02-30 is invalid)
  function dateIndex(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str));
    if (!m) return NaN;
    var y = +m[1], mo = +m[2], d = +m[3];
    var ms = Date.UTC(y, mo - 1, d), dt = new Date(ms);
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return NaN;
    return Math.round(ms / 86400000);
  }
  function dayNumber(dateStr) { return dateIndex(dateStr) - dateIndex(EPOCH) + 1; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function localDateString(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function dailySeed(dateStr) { return 'd' + dateStr; }
  // the date behind a daily seed, or null for a free-form seed
  function seedDate(seed) {
    return seed.charAt(0) === 'd' && !isNaN(dateIndex(seed.slice(1))) ? seed.slice(1) : null;
  }

  function computeStreak(dates, today) {
    var idx = {};
    dates.forEach(function (d) { var i = dateIndex(d); if (!isNaN(i)) idx[i] = true; });
    var days = Object.keys(idx).map(Number).sort(function (a, b) { return a - b; });
    var best = 0, run = 0, prev = null;
    days.forEach(function (d) { run = prev !== null && d === prev + 1 ? run + 1 : 1; prev = d; if (run > best) best = run; });
    var t = dateIndex(today), cur = 0;
    var d0 = idx[t] ? t : (idx[t - 1] ? t - 1 : null);
    if (d0 !== null) { for (var d = d0; idx[d]; d--) cur++; }
    return { current: cur, best: best };
  }

  var SEED_RE = /^[A-Za-z0-9_-]{1,24}$/;
  function parseHash(hash) {
    var out = { mode: 'daily', seed: null, date: null, best: null, lang: null };
    var h = String(hash || '').replace(/^#/, '');
    if (!h) return out;
    h.split('&').forEach(function (kv) {
      var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : kv.slice(i + 1);
      if (k === 'd' && dateIndex(v) >= dateIndex(EPOCH)) { out.date = v; out.seed = dailySeed(v); out.mode = 'challenge'; }
      else if (k === 's' && SEED_RE.test(v)) { out.seed = v; out.mode = 'challenge'; }
      else if (k === 'b' && /^-?\d{1,4}$/.test(v)) out.best = parseInt(v, 10);
      else if (k === 'l' && /^[a-z]{2}$/.test(v)) out.lang = v;
    });
    if (out.seed === null) out.best = null;
    return out;
  }
  function buildChallengeHash(o) {
    var parts = [];
    if (o.date) parts.push('d=' + o.date); else parts.push('s=' + o.seed);
    if (typeof o.best === 'number' && isFinite(o.best)) parts.push('b=' + Math.round(o.best));
    if (o.lang) parts.push('l=' + o.lang);
    return '#' + parts.join('&');
  }

  /* ---------- share card (plain text, no emoji) ---------- */

  function bar(value, max, width) {
    width = width || 10;
    var f = Math.round(Math.min(1, Math.max(0, value / max)) * width);
    return new Array(f + 1).join('\u2588') + new Array(width - f + 1).join('\u2591');
  }

  function fmt(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, function (m, k) { return vars && k in vars ? vars[k] : m; });
  }

  // Rebuild a saved record from untrusted JSON: keep only well-formed entries, drop everything else.
  function sanitizeStore(raw) {
    var out = { daily: {}, bestDaily: null, bestPractice: null }, num = function (v) { return typeof v === 'number' && isFinite(v); };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    if (num(raw.bestDaily)) out.bestDaily = raw.bestDaily;
    if (num(raw.bestPractice)) out.bestPractice = raw.bestPractice;
    if (typeof raw.lang === 'string' && /^[a-z]{2}$/.test(raw.lang)) out.lang = raw.lang;
    var d = raw.daily;
    if (d && typeof d === 'object' && !Array.isArray(d)) {
      Object.keys(d).forEach(function (k) {
        var e = d[k];
        if (isNaN(dateIndex(k)) || !e || typeof e !== 'object') return;
        if (!num(e.score) || !num(e.p1) || !num(e.p2) || !num(e.n)) return;
        if (e.n < MIN_SAMPLES || e.n > MAX_SAMPLES || Math.floor(e.n) !== e.n) return;
        if (e.p1 <= 0 || e.p1 >= 1 || e.p2 <= 0 || e.p2 >= 1) return;
        out.daily[k] = { score: e.score, n: e.n, p1: e.p1, p2: e.p2 };
      });
    }
    return out;
  }

  function buildShare(o) {
    var L = o.labels, lines = [];
    lines.push(o.seed ? fmt(L['share.title_seed'], { seed: o.seed }) : fmt(L['share.title'], { day: o.day, date: o.date }));
    lines.push(fmt(L['share.score'], { score: Math.round(o.score), ideal: Math.round(o.ideal) }));
    lines.push(fmt(L['share.samples'], { n: o.n, max: MAX_SAMPLES }));
    lines.push(fmt(L['share.conviction'], { conv: Math.round(Math.abs(o.p2 - 0.5) * 200) }) + ' ' + fmt(L[o.supports ? 'share.review_yes' : 'share.review_no'], {}));
    lines.push(L['share.calibration'] + ' ' + bar(o.score, 100, 10));
    lines.push(L['share.synthetic']);
    if (o.url) lines.push(o.url);
    return lines.join('\n');
  }

  return {
    VERSION: VERSION, EPOCH: EPOCH, PRIORS: PRIORS, TAU: TAU, MAX_SAMPLES: MAX_SAMPLES,
    MIN_SAMPLES: MIN_SAMPLES, REPL_N: REPL_N, COST: COST, P_MIN: P_MIN, P_MAX: P_MAX,
    F95_20_20: F95_20_20, LESSON_KEYS: LESSON_KEYS,
    hashStr: hashStr, makeRng: makeRng, gauss: gauss,
    makeInstance: makeInstance, stats: stats, posteriorReal: posteriorReal,
    clampP: clampP, brier: brier, calibrationPoints: calibrationPoints, samplingCost: samplingCost,
    roundScore: roundScore, replication: replication, stageTwoPoints: stageTwoPoints,
    referenceObserver: referenceObserver, pickLesson: pickLesson,
    dateIndex: dateIndex, dayNumber: dayNumber, localDateString: localDateString, dailySeed: dailySeed, seedDate: seedDate,
    computeStreak: computeStreak, sanitizeStore: sanitizeStore, parseHash: parseHash, buildChallengeHash: buildChallengeHash,
    bar: bar, fmt: fmt, buildShare: buildShare
  };
});
