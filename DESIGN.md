# Design notes

SYNTHETIC educational game. Everything is generated from a seed; nothing is clinical.

## Why this game

The audience is PhDs and physicians. The game has to be short (two minutes), skill-based, shareable and accurate, so it tests habits that experienced readers of evidence already care about: not mistaking a fitted pattern for a finding, stating calibrated probabilities, respecting base rates, stopping rules and replication. A hidden direction in noise gives a visual, immediate version of "the estimate crystallizes or it wanders" that links to the author's streaming-PCA work, without any domain content that could be misread as clinical.

## The generator

Noise sigma is 1 in two dimensions. A puzzle has a prior (20, 35, 50 or 65 percent) that its instrument is "real". If real, each reading gets an extra component `a * u` with `u` a uniform unit direction and `a ~ N(0, tau^2)`, `tau` equally likely 0.7, 1.0 or 1.4. The covariance is then `I + tau^2 u u'`, the null covariance is `I`. All 80 readings (60 for you, 20 reserved for the reviewer) are drawn up front from a seeded RNG (xmur3 hash into mulberry32), so every player of a seed sees the same data in the same order whatever they do.

The seed of the daily puzzle is the local date string, `d2026-10-23`. Same date, same puzzle, worldwide; the day boundary follows each player's own clock, as in other daily games. The generator namespace `crystallize/v1/` changes every puzzle if it is bumped.

## The reference observer

For this generator the posterior probability that the instrument is real is available in closed form up to a one-dimensional integral over the direction. With the second-moment sums `a = sum x^2`, `b = sum xy`, `c = sum y^2` and `q(theta) = a cos^2 + 2 b cos sin + c sin^2`:

    log BF(theta, tau) = -(n/2) log(1 + tau^2) + (1/2) tau^2 / (1 + tau^2) q(theta)
    BF = mean over theta (180 midpoints on [0, pi)) and tau in {0.7, 1.0, 1.4}
    posterior odds = prior odds x BF

The tests check that this posterior is calibrated against the generator (binned, n = 30), separates real from null, and beats the prior in Brier score. It gives the "reference" score shown after each round and is why the lessons about calibration are testable rather than asserted.

## Scoring

`calibration(p) = 100 (1 - 4 (p - y)^2)`, a rescaled Brier score. Strictly proper, so honesty maximises the expected score; tests check the maximiser numerically. Two claims, each weighted 0.5. The reviewer's 20 readings are free, so a player could commit almost at once and let the replication do the work. The first claim is scored too, which limits that: for the reference observer, 5 readings then committing earns about 43 calibration points minus 4 for the readings (39), while stopping adaptively earns about 50 (`docs/reference-curve.txt`). The gap is real but modest, so quick commits are a viable strategy and the game does not hide that.

Tuning: fixed reading counts and adaptive stopping rules for the reference observer were simulated for several costs (0.4, 0.6, 0.8, 1.0). At 0.8 the best adaptive rule stops when the posterior leaves 10 to 90 percent and has an interior optimum (about 25 readings), which makes "when to stop" a real decision. The numbers are in `docs/reference-curve.txt`.

Probabilities are clamped to 1 to 99 percent so the worst single round is bounded (about -292 for the calibration part).

## The reviewer

The replication is one pre-registered, one-sided test on the axis the player claimed: along-variance over across-variance on 20 fresh readings. With a known zero origin and unit noise, under pure noise the two sums are independent chi-square(20) variables, so the ratio is F(20, 20); its 95th percentile is 2.1242. A failed replication is described as "not supportive", never as a refutation; the lessons explain power. The reviewer's points are shown to the player but, for the reference observer, are pooled with the player's own readings.

## Lessons

One card per round, picked by `pickLesson` from what happened (truth, claims, readings, base rate, replication result). Each statement is deliberately conservative:

- a finite sample always has a principal axis; elongation needs the noise reference;
- a 5 percent test passes about one time in twenty on pure noise;
- a non-significant replication means the data did not clear the bar, not that the effect is absent;
- the Brier score is strictly proper; calibration means 80 percent claims come true about 80 percent of the time;
- selected, thresholded estimates tend to overestimate effects (the winner's curse);
- the chance that a positive result is true depends on the prior, power and false-positive rate;
- looking at the data repeatedly and stopping when it looks convincing inflates false positives unless the design allows for it.

References are in the README. Every card exists in every language; tests enforce it.

## Languages

`i18n.js` holds one dictionary per language. To add one: copy the `en` block, translate, keep every `{placeholder}`, and add it to `LANGS`. The language button cycles through `LANGS`; the default comes from `navigator.language`. Tests enforce key and placeholder parity.

## Sharing and links

The share card is plain text and fits a narrow bubble (lines of at most 40 characters apart from the link). It reports conviction as distance from 50 percent so the card does not reveal whether the player thought the instrument was real. A free-form seed is shown as `seed ...` instead of a day number. Challenge links use the URL hash (`#s=SEED&b=SCORE`, `#d=DATE`, `&l=fr`); the hash never reaches a server and is parsed defensively (seed pattern `[A-Za-z0-9_-]{1,24}`, score a short integer).

## Storage

One `localStorage` key, `crystallize.v1`: language, the daily results by date (score, readings, both claims), best daily and best practice scores. Streaks are computed from the dates (played today or yesterday keeps a streak alive). All access is wrapped for private mode. Nothing is transmitted.

## Accessibility

Keyboard operable (S, F, C shortcuts plus normal tabbing), labelled sliders, live regions for the readout, a skip link, a modal dialog closed with Escape, focus moved to each new heading, SVG plots with titles, reduced-motion respected, text contrast at least 8:1 against the navy panels, no information carried by colour alone (the axis and values are also written out).

## What is not covered

Screen-reader testing, more languages, an automated browser test in CI, and anything that would need a server (global leaderboards, anti-cheat). Those are deliberately out of scope for a zero-dependency, no-network game.
