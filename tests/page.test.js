'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('../build.js');

const root = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');
const SOURCES = ['index.html', 'style.css', 'game.js', 'i18n.js', 'app.js'];
// word lists are assembled from fragments so this file does not contain the words it forbids
const join = (parts) => new RegExp('\\b(' + parts.map((p) => p.join('')).join('|') + ')\\b', 'i');
const BANNED = join([['pro', 'ven'], ['valid', 'ated'], ['production', '-ready'], ['quantum ', 'advantage'], ['real-world ', 'performance']]);
const NAMES = join([['l', 'ee'], ['la', 'ha'], ['bel', 'kadi'], ['ti', 'su']]);
const EMOJI = /\p{Extended_Pictographic}/u;

test('built page is one self-contained file (no external files, no network APIs)', () => {
  const html = build();
  assert.ok(!/<script[^>]*\ssrc=/i.test(html), 'no external script');
  assert.ok(!/<link[^>]*rel=["']stylesheet/i.test(html), 'no external stylesheet');
  assert.ok(!/(fetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts|import\()/.test(html));
  assert.ok(!/https?:\/\/(?!www\.w3\.org\/2000\/svg)[^\s"')]+/.test(html.replace(/<title>[^<]*<\/title>/, '')), 'only the SVG namespace URL appears');
  assert.ok(!/googletagmanager|google-analytics|cdn\.|fonts\.googleapis/i.test(html));
  assert.ok(html.length < 200000, 'small page');
});

test('dist/index.html, when present, matches a fresh build', { skip: !fs.existsSync(path.join(root, 'dist', 'index.html')) }, () => {
  assert.equal(read('dist/index.html'), build());
});

test('no banned wording, emoji or forbidden names anywhere in the shipped sources', () => {
  for (const f of SOURCES.concat(['README.md', 'DESIGN.md', 'CHANGELOG.md', 'CITATION.cff', '.zenodo.json'])) {
    if (!fs.existsSync(path.join(root, f))) continue;
    const s = read(f);
    assert.ok(!BANNED.test(s), `banned word in ${f}`);
    assert.ok(!EMOJI.test(s), `emoji in ${f}`);
    assert.ok(!NAMES.test(s), `forbidden name in ${f}`);
  }
});

test('every element id used by app.js exists in index.html', () => {
  const html = read('index.html'), app = read('app.js');
  const used = new Set();
  for (const m of app.matchAll(/\$\('([\w-]+)'\)/g)) used.add(m[1]);
  for (const m of app.matchAll(/text\('([\w-]+)'/g)) used.add(m[1]);
  for (const id of used) if (!id.endsWith("-")) assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  for (const p of ['plot', 'rplot', 'xplot']) for (const s of ['grid', 'pts', 'axes']) assert.ok(html.includes(`id="${p}-${s}"`));
});

test('every literal i18n key used by app.js exists in English', () => {
  const en = require('../i18n.js').LANGS.en, app = read('app.js');
  const used = new Set();
  for (const m of app.matchAll(/\b(?:text\('[\w-]+',\s*|t\()'([a-z]+\.[\w.]+)'/g)) used.add(m[1]);
  for (const m of app.matchAll(/'((?:help|play|intro|result|review|commit|stats|footer|btn|app|tag|meta|doc)\.[\w]+)'/g)) used.add(m[1]);
  assert.ok(used.size > 40);
  for (const k of used) assert.ok(k in en, `missing key ${k}`);
});

test('accessibility basics: language attribute, viewport, labelled controls, reduced motion', () => {
  const html = read('index.html'), css = read('style.css');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /<label for="commit-slider"/);
  assert.match(html, /<label for="review-slider"/);
  assert.match(html, /role="dialog"[^>]*aria-modal="true"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /:focus-visible/);
  assert.match(html, /class="skip"/);
});

test('brand colours are present (gold on navy, cyan accent)', () => {
  const css = read('style.css').toLowerCase();
  assert.ok(css.includes('#c9a84c'));
  assert.ok(css.includes('#0a1330') || css.includes('#0b1530'));
  assert.ok(css.includes('#40d0e0'));
});

test('the footer states privacy and the synthetic label in every language', () => {
  const I = require('../i18n.js');
  for (const l of Object.keys(I.LANGS)) {
    assert.match(I.LANGS[l]['footer.privacy'], /./);
    assert.match(I.LANGS[l]['footer.disclaimer'], /SYNTH/);
  }
  assert.match(I.LANGS.en['footer.privacy'], /no network calls/);
});
