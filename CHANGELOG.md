# Changelog

## 0.1.0 (unreleased)

- First version: a daily and practice puzzle ("is there a hidden direction in this noise?") with a sampling budget, a probability claim, a simulated peer-review replication, a revised claim, a reference observer and a lesson card.
- Pure logic in `game.js`: seeded RNG, generator, statistics, exact Bayesian reference observer, strictly proper scoring, replication, lessons, streaks, hash links, share card.
- Bilingual EN/FR interface with a dictionary per language; default from the browser language.
- Plain-text share card (no emoji), challenge links in the URL hash, streaks and personal bests in local storage only.
- `build.js` inlines everything into `dist/index.html` (one file).
- 52 tests with Node's built-in runner, CI on Node 20, 22 and 24, README, DESIGN, CITATION.cff and .zenodo.json.
- Checked in headless Chrome by hand (not in CI): full round on 390 px, 320 px and desktop viewports, EN and FR, reduced motion; no console errors, no overflow, no external requests.
- Tuning: sampling cost set to 0.8 per reading after simulating the reference observer (`docs/reference-curve.txt`).
