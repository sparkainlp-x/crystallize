'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../i18n.js');
const G = require('../game.js');

const langs = Object.keys(I.LANGS);
const keys = (l) => Object.keys(I.LANGS[l]).sort();
const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(',');

test('every language has the same keys as English (parity)', () => {
  for (const l of langs) {
    assert.deepEqual(keys(l), keys('en'), `${l} differs from en`);
  }
  assert.ok(langs.includes('en') && langs.includes('fr'));
});

test('placeholders match between languages for every key', () => {
  for (const l of langs) for (const k of keys('en')) {
    assert.equal(ph(I.LANGS[l][k]), ph(I.LANGS.en[k]), `${l}:${k}`);
  }
});

test('no empty strings and translations differ from English where they should', () => {
  for (const l of langs) for (const k of keys('en')) assert.ok(String(I.LANGS[l][k]).trim().length > 0, `${l}:${k}`);
  let differing = 0;
  for (const k of keys('en')) if (I.LANGS.fr[k] !== I.LANGS.en[k]) differing++;
  assert.ok(differing > keys('en').length * 0.85);
});

test('every lesson key has a title and a body in every language', () => {
  for (const l of langs) for (const lk of G.LESSON_KEYS) {
    assert.ok(I.LANGS[l]['lesson.' + lk + '.title'], `${l}:${lk}.title`);
    assert.ok(I.LANGS[l]['lesson.' + lk + '.body'], `${l}:${lk}.body`);
  }
  const lessonKeys = keys('en').filter((k) => /^lesson\..*\.title$/.test(k)).map((k) => k.split('.')[1]).sort();
  assert.deepEqual(lessonKeys, [...G.LESSON_KEYS].sort());
});

test('share labels needed by the share card exist in every language', () => {
  for (const l of langs) for (const k of ['share.title', 'share.score', 'share.samples', 'share.conviction',
    'share.review_yes', 'share.review_no', 'share.calibration', 'share.synthetic']) assert.ok(I.LANGS[l][k], `${l}:${k}`);
});

test('t interpolates, falls back to English, then to the key', () => {
  assert.equal(I.t('en', 'play.n', { n: 3, max: 60 }), 'Readings revealed: 3 of 60');
  assert.match(I.t('fr', 'play.n', { n: 3, max: 60 }), /Mesures r\u00e9v\u00e9l\u00e9es : 3 sur 60/);
  assert.equal(I.t('xx', 'play.n', { n: 1, max: 2 }), 'Readings revealed: 1 of 2');
  assert.equal(I.t('en', 'no.such.key'), 'no.such.key');
});

test('detectLang follows navigator.language and defaults to English', () => {
  assert.equal(I.detectLang({ language: 'fr-CA' }), 'fr');
  assert.equal(I.detectLang({ language: 'FR' }), 'fr');
  assert.equal(I.detectLang({ language: 'de-DE' }), 'en');
  assert.equal(I.detectLang({ languages: ['fr-FR', 'en'] }), 'fr');
  assert.equal(I.detectLang(undefined), 'en');
});

test('statements about the generator match the code constants', () => {
  assert.match(I.LANGS.en['review.ref'], /5%/);
  assert.equal(G.REPL_N, 20);
  assert.match(I.LANGS.en['review.ref'], /20 and 20 degrees/);
  assert.ok(Math.abs(G.F95_20_20 - 2.1242) < 1e-9);
});
