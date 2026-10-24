#!/usr/bin/env node
/* Reference-observer score curves for the tuning of COST (SYNTHETIC, fixed seeds).
 * Usage: node scripts/reference-curve.js [puzzles]   (default 1500) */
'use strict';
const G = require('../game.js');
const N = parseInt(process.argv[2] || '1500', 10);
const ns = [5, 10, 15, 20, 25, 30, 40, 50, 60];

console.log(`Reference observer (knows the generator), ${N} puzzles, seeds ref0..ref${N - 1}`);
console.log(`COST ${G.COST} per reading; calibration = mean of the two claims; no cost subtracted in the first table`);
console.log('\nFixed number of readings n: mean calibration points (two claims averaged)');
for (const n of ns) {
  let s = 0;
  for (let i = 0; i < N; i++) {
    const inst = G.makeInstance('ref' + i), r = G.referenceObserver(inst, n);
    s += G.roundScore({ p1: r.p1, p2: r.p2, truth: inst.real, n: 0 }).total;
  }
  console.log(`  n=${String(n).padStart(2)}  ${(s / N).toFixed(1)}`);
}
console.log('\nAdaptive stopping: stop when the posterior leaves [lo, hi] (at least 5 readings), score includes the cost');
for (const [lo, hi] of [[0.05, 0.95], [0.1, 0.9], [0.2, 0.8]]) {
  let tot = 0, ns_ = 0;
  for (let i = 0; i < N; i++) {
    const inst = G.makeInstance('ref' + i);
    let n = G.MIN_SAMPLES;
    for (; n < G.MAX_SAMPLES; n++) { const p = G.posteriorReal(inst.points, n, inst.prior); if (p < lo || p > hi) break; }
    const r = G.referenceObserver(inst, n);
    tot += G.roundScore({ p1: r.p1, p2: r.p2, truth: inst.real, n }).total; ns_ += n;
  }
  console.log(`  [${lo}, ${hi}]  mean score ${(tot / N).toFixed(1)}  mean readings ${(ns_ / N).toFixed(1)}`);
}
let base = 0;
for (let i = 0; i < N; i++) { const inst = G.makeInstance('ref' + i); base += G.roundScore({ p1: inst.prior, p2: inst.prior, truth: inst.real, n: 0 }).total; }
console.log(`\nPrior-only forecast, no readings: mean score ${(base / N).toFixed(1)}`);
