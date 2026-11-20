'use strict';
// Static checks and unit tests for the extension and the PWA. Run: npm test (no dependencies).
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
let failures = 0, passes = 0;
const test = (name, fn) => {
  try { fn(); passes++; console.log(`  ok  ${name}`); } catch (e) { failures++; console.log(`  FAIL ${name}\n       ${e.message}`); }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const pngSize = (f) => { const b = fs.readFileSync(path.join(ROOT, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };

console.log('extension');
const ext = JSON.parse(read('manifest.json'));
const cs = ext.content_scripts[0];
test('manifest is MV3 and lists files that exist', () => {
  assert(ext.manifest_version === 3, 'manifest_version must be 3');
  for (const f of [...cs.css, ...cs.js]) assert(fs.existsSync(path.join(ROOT, f)), `missing ${f}`);
});
test('every js/, shared/ and css/ file is loaded by the extension or the PWA', () => {
  const pwaHtml = read('pwa/index.html');
  for (const dir of ['js', 'shared', 'css']) {
    for (const f of fs.readdirSync(path.join(ROOT, dir))) {
      const rel = `${dir}/${f}`;
      assert(cs.js.includes(rel) || cs.css.includes(rel) || pwaHtml.includes(`../${rel}`), `${rel} is not loaded anywhere`);
    }
  }
});
test('content scripts compile one by one and together in manifest order (no duplicate globals)', () => {
  for (const f of cs.js) new vm.Script(read(f), { filename: f });
  new vm.Script(cs.js.map(read).join('\n;\n'), { filename: 'content-scripts' });
  assert(cs.js[cs.js.length - 1] === 'js/main.js', 'js/main.js must load last');
  assert(cs.js.indexOf('shared/util.js') === 0, 'shared/util.js must load first');
});
test('every stylesheet has balanced braces (one stray } silently drops the rules after it)', () => {
  for (const f of [...cs.css, 'pwa/app.css']) {
    let depth = 0;
    for (const ch of read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/"[^"]*"/g, '""')) {
      depth += ch === '{' ? 1 : ch === '}' ? -1 : 0;
      assert(depth >= 0, `${f}: unexpected }`);
    }
    assert(depth === 0, `${f}: ${depth} unclosed {`);
  }
});
test('no extension-only APIs in shared code or the PWA', () => {
  for (const f of [...fs.readdirSync(path.join(ROOT, 'shared')).map((x) => `shared/${x}`), 'pwa/app.js', 'pwa/install.js', 'pwa/sw.js']) {
    const src = read(f);
    assert(!/\bchrome\.|\bbrowser\.runtime|Student-Token|\bsession\(|\bapi\(/.test(src), `${f} uses an extension/portal-only API`);
  }
});

console.log('pwa');
const man = JSON.parse(read('pwa/manifest.webmanifest'));
test('web manifest has install-ready fields', () => {
  assert(man.name === 'AlteX Student Portal', 'name');
  assert(man.short_name === 'AlteX', 'short_name');
  assert(man.display === 'standalone', 'display must be standalone');
  for (const k of ['start_url', 'scope', 'theme_color', 'background_color', 'id']) assert(man[k], `missing ${k}`);
  assert(/^#[0-9a-f]{6}$/i.test(man.theme_color) && /^#[0-9a-f]{6}$/i.test(man.background_color), 'colours must be hex');
});
test('icons exist with the declared sizes (192, 512, maskable 512)', () => {
  for (const icon of man.icons) {
    const [w, h] = pngSize(path.join('pwa', icon.src));
    assert(icon.sizes === `${w}x${h}`, `${icon.src} is ${w}x${h}, manifest says ${icon.sizes}`);
  }
  const sizes = man.icons.map((i) => `${i.sizes}/${i.purpose}`);
  for (const s of ['192x192/any', '512x512/any', '512x512/maskable']) assert(sizes.includes(s), `missing icon ${s}`);
  assert(pngSize('pwa/icons/apple-touch-icon.png').join('x') === '180x180', 'apple-touch-icon must be 180x180');
});
test('index.html has the iOS / Android install metadata and a CSP', () => {
  const html = read('pwa/index.html');
  for (const needle of ['rel="manifest"', 'rel="apple-touch-icon"', 'apple-mobile-web-app-capable', 'apple-mobile-web-app-title', 'name="theme-color"', 'viewport-fit=cover', 'Content-Security-Policy']) {
    assert(html.includes(needle), `missing ${needle}`);
  }
  assert(!/<script>|\son[a-z]+="/.test(html), 'no inline scripts or handlers (CSP)');
});
test('service worker only serves its own shell and never caches other requests', () => {
  const sw = read('pwa/sw.js');
  assert(/url\.origin !== self\.location\.origin\) return/.test(sw), 'cross-origin requests must bypass the worker');
  assert(/req\.method !== 'GET'\) return/.test(sw), 'non-GET requests must bypass the worker');
  assert(!/cache\.put|caches\.open\([^)]*\)\.then\([^)]*put/.test(sw), 'no runtime caching (only the precached shell)');
  new vm.Script(sw, { filename: 'sw.js' });
});

console.log('shared logic');
// Load the shared files into a sandbox whose clock is fixed, like a browser on that day.
const sandboxAt = (iso) => {
  const RealDate = Date;
  const fixed = new RealDate(iso).getTime();
  class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [fixed])); } static now() { return fixed; } }
  const ctx = vm.createContext({ Date: FixedDate, localStorage: { getItem: () => null, setItem() {} } });
  for (const f of ['shared/util.js', 'shared/academic-calendar.js']) vm.runInContext(read(f).replace(/^const /gm, 'var '), ctx, { filename: f });
  return ctx;
};
test('midterm retake countdown before it starts', () => {
  const c = sandboxAt('2026-11-12T10:00:00');
  const ex = c.upcomingExams().find((x) => x.e.key === 'retake');
  assert(ex && ex.p.state === 'soon' && ex.p.days === 53, `expected 53 days, got ${ex && ex.p.days}`);
});
test('a running exam period reports "now" and the days left', () => {
  const c = sandboxAt('2026-11-04T09:00:00');
  const ex = c.upcomingExams().find((x) => x.e.key === 'midterm');
  assert(ex.p.state === 'now' && ex.p.left === 3, `got ${JSON.stringify(ex.p)}`);
});
test('spring semester shows only spring exams', () => {
  const c = sandboxAt('2027-03-01T09:00:00');
  const mid = c.upcomingExams().find((x) => x.e.key === 'midterm');
  assert(mid.p.start.getMonth() === 3, 'expected the April midterm');
});
test('next day off and Georgian date ranges', () => {
  const c = sandboxAt('2026-12-30T09:00:00');
  const off = c.nextPeriod(c.DAYS_OFF);
  assert(off.state === 'now', 'New Year holidays are running');
  assert(c.rangeText(c.dayOf('2026-12-27'), c.dayOf('2027-01-03')) === '27 დეკემბერი – 3 იანვარი', 'range text');
  assert(c.daysWord(1) === 'ხვალ' && c.daysWord(5) === '5 დღეში', 'days word');
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
