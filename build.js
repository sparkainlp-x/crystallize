#!/usr/bin/env node
/* Inlines style.css, i18n.js, game.js and app.js into dist/index.html (one self-contained file). */
'use strict';
const fs = require('fs');
const path = require('path');
const root = __dirname;
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

function build() {
  let html = read('index.html');
  html = html.replace('<link rel="stylesheet" href="style.css">', () => '<style>\n' + read('style.css') + '</style>');
  html = html.replace(/<script src="([\w.-]+\.js)"><\/script>/g, (m, f) =>
    '<script>\n' + read(f).replace(/<\/script/gi, '<\\/script') + '</script>');
  return html;
}

if (require.main === module) {
  fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
  const out = build();
  fs.writeFileSync(path.join(root, 'dist', 'index.html'), out);
  console.log('dist/index.html', out.length, 'bytes');
}
module.exports = { build };
