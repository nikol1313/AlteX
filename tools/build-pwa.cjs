'use strict';
// Production build of the PWA into dist/ (no dependencies). The layout mirrors the repo
// (dist/pwa, dist/shared, dist/css, dist/fonts) so the same relative paths work in dev and production.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
const fail = (msg) => { console.error('build failed:', msg); process.exit(1); };

const sw = fs.readFileSync(path.join(ROOT, 'pwa/sw.js'), 'utf8');
const list = /const SHELL = \[([\s\S]*?)\];/.exec(sw);
if (!list) fail('SHELL list not found in pwa/sw.js');
const shell = [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((p) => p !== './');
const files = shell.map((p) => path.normalize(path.join('pwa', p)));
for (const f of files) if (!fs.existsSync(path.join(ROOT, f))) fail(`precached file missing: ${f}`);

// Everything index.html references must be precached, or the app breaks offline.
const html = fs.readFileSync(path.join(ROOT, 'pwa/index.html'), 'utf8');
for (const [, ref] of html.matchAll(/(?:src|href)="([^"#:]+)"/g)) {
  if (!shell.includes(ref)) fail(`index.html references ${ref}, which is not in the SHELL list of sw.js`);
}

const hash = crypto.createHash('sha256');
for (const f of files.sort()) hash.update(f).update(fs.readFileSync(path.join(ROOT, f)));
const version = hash.digest('hex').slice(0, 10);

fs.rmSync(OUT, { recursive: true, force: true });
for (const f of [...files, 'fonts/OFL-FiraGO.txt']) {
  fs.mkdirSync(path.dirname(path.join(OUT, f)), { recursive: true });
  fs.copyFileSync(path.join(ROOT, f), path.join(OUT, f));
}
fs.writeFileSync(path.join(OUT, 'pwa/sw.js'), sw.replace("const VERSION = 'dev';", `const VERSION = '${version}';`));
fs.writeFileSync(path.join(OUT, 'index.html'),
  '<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=pwa/"><title>AlteX</title><a href="pwa/">AlteX Student Portal</a>\n');
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');
console.log(`PWA built: dist/ (version ${version}, ${files.length + 2} files). Serve dist/ over HTTPS and open /pwa/.`);
