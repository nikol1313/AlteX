'use strict';
// End-to-end checks of the built PWA in Chromium on phone viewports (needs Playwright; run: npm run test:e2e).
const { chromium, devices } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const serve = require('../tools/serve.cjs');

const DIST = path.join(__dirname, '../dist');
const PORT = 8765;
const URL0 = `http://localhost:${PORT}/pwa/`;
const SHOTS = process.env.SHOTS;
let failures = 0;
const check = (cond, name) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}`); if (!cond) failures++; };

const noHorizontalScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const smallTargets = (page) => page.evaluate(() => [...document.querySelectorAll('a, button')]
  .filter((e) => e.offsetParent && !e.closest('[hidden]'))
  .map((e) => { const r = e.getBoundingClientRect(); return { t: (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 30), w: r.width, h: r.height }; })
  .filter((r) => r.w < 43.5 || r.h < 43.5)); // sub-pixel tolerance (animations in flight)

(async () => {
  const server = await serve(DIST, PORT);
  const browser = await chromium.launch();

  for (const [label, device] of [['Android (Pixel 7)', devices['Pixel 7']], ['iPhone 13', devices['iPhone 13']]]) {
    console.log(label);
    const ctx = await browser.newContext({ ...device });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(URL0);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    check(await page.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
    const manifest = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); return (await fetch(l.href)).json(); });
    check(manifest.display === 'standalone' && manifest.icons.length >= 3, 'manifest served and parsed');
    check((await page.locator('#exam-strip .sx-exam').count()) >= 1, 'exam countdowns rendered from shared logic');

    for (const view of ['home', 'calendar', 'portal', 'about']) {
      await page.goto(URL0 + '#' + view);
      await page.waitForTimeout(150);
      check(await noHorizontalScroll(page), `#${view}: no horizontal scroll`);
      const small = await smallTargets(page);
      check(!small.length, `#${view}: touch targets >= 44px ${small.length ? JSON.stringify(small) : ''}`);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${label.split(' ')[0]}-${view}.png`), fullPage: true });
    }
    check((await page.locator('#portal-links a[target=_blank][href^="https://students.alte.edu.ge/"]').count()) === 10, 'portal links open the real portal in the browser');

    await ctx.setOffline(true);
    await page.goto(URL0 + '#calendar');
    check((await page.locator('.agenda-item').count()) > 10, 'opens offline from the cache (calendar rendered)');
    check(await page.locator('#net').isVisible(), 'offline badge shown');
    await ctx.setOffline(false);
    check(!errors.length, `no console errors ${errors.join(' | ')}`);
    await ctx.close();
  }

  console.log('install experience');
  {
    // Android/Chrome: beforeinstallprompt -> our banner -> prompt; "dismissed" is remembered.
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await ctx.newPage();
    await page.goto(URL0);
    check(await page.locator('#install-banner').isHidden(), 'no banner before the browser says installable');
    const fire = () => page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__prompted = true; };
      e.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(e);
    });
    await fire();
    check(await page.locator('#install-banner').isVisible(), 'banner appears on beforeinstallprompt');
    await page.click('#install-go');
    await page.waitForTimeout(100);
    check(await page.evaluate(() => window.__prompted === true), 'install button opens the browser prompt');
    await page.reload();
    await fire();
    check(await page.locator('#install-banner').isHidden(), 'after dismissing, the banner is not shown again');
    await page.goto(URL0 + '#about');
    await page.evaluate(() => { window.__prompted = false; });
    await page.click('#install-manual');
    await page.waitForTimeout(100);
    check(await page.evaluate(() => window.__prompted === true), 'ინფო → install still works after dismissing the banner');
    await ctx.close();
  }
  {
    // iOS Safari: no prompt API, so a banner opens the Share -> Add to Home Screen steps.
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    const page = await ctx.newPage();
    await page.goto(URL0);
    check(await page.locator('#install-banner').isVisible(), 'iOS Safari: banner with instructions');
    await page.click('#install-go');
    const steps = await page.locator('#sheet-steps').innerText();
    check(/Add to Home Screen/.test(steps), 'iOS Safari: Add to Home Screen steps');
    await page.click('#sheet-close');
    await page.click('#install-dismiss');
    await page.reload();
    check(await page.locator('#install-banner').isHidden(), 'iOS: dismissed banner stays hidden');
    await ctx.close();
  }
  {
    // Already installed (standalone): nothing to install.
    const ctx = await browser.newContext({ ...devices['iPhone 13'] });
    await ctx.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => true }));
    const page = await ctx.newPage();
    await page.goto(URL0 + '#about');
    check(await page.locator('#install-banner').isHidden() && await page.locator('#install-manual').isHidden(), 'standalone: no install UI');
    await ctx.close();
  }

  console.log('updates');
  {
    const ctx = await browser.newContext({ ...devices['Pixel 7'] });
    const page = await ctx.newPage();
    await page.goto(URL0);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    const v1 = await page.evaluate(() => caches.keys());
    // Ship a new version: change a shell file and rebuild the worker.
    const swPath = path.join(DIST, 'pwa/sw.js');
    const original = fs.readFileSync(swPath, 'utf8');
    fs.writeFileSync(swPath, original.replace(/const VERSION = '([^']+)'/, "const VERSION = '$1-next'"));
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));
    await page.locator('#update-toast').waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    check(await page.locator('#update-toast').isVisible(), 'new version is offered, not forced');
    await Promise.all([page.waitForEvent('load'), page.click('#update-go')]);
    await page.waitForTimeout(300);
    const v2 = await page.evaluate(() => caches.keys());
    check(v2.length === 1 && v2[0].endsWith('-next') && v2[0] !== v1[0], `old cache removed, new one active (${v1} -> ${v2})`);
    fs.writeFileSync(swPath, original);
    await ctx.close();
  }

  await browser.close();
  server.close();
  console.log(failures ? `\n${failures} e2e check(s) failed` : '\nall e2e checks passed');
  process.exit(failures ? 1 : 0);
})();
