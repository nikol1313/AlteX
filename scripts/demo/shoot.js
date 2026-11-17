// Takes the README screenshots of AlteX on a made-up portal: node scripts/demo/shoot.js
// Writes PNGs to docs/screenshots/. Nothing talks to the real portal.
const path = require('path');
const { chromium, devices } = require('@playwright/test');
const { openPortal } = require('../../tests/e2e/portal');
const { STUDENT } = require('./shell');

const OUT = path.join(__dirname, '..', '..', 'docs', 'screenshots');
const DESKTOP = { viewport: { width: 1440, height: 1180 }, deviceScaleFactor: 1 };
const PHONE = { ...devices['Pixel 7'] };

const SHOTS = [
  { name: 'dashboard-dark', demo: './dashboard', ctx: DESKTOP },
  { name: 'dashboard-light', demo: './dashboard', ctx: DESKTOP, theme: 'light' },
  { name: 'dashboard-phone', demo: './dashboard', ctx: PHONE },
  { name: 'timetable', demo: './timetable', ctx: DESKTOP },
  { name: 'timetable-phone', demo: './timetable', ctx: PHONE },
  { name: 'login', demo: './login', ctx: DESKTOP },
  { name: 'login-phone', demo: './login', ctx: PHONE },
];

(async () => {
  const only = process.argv.slice(2);
  // PW_CHROMIUM: a Chrome binary to use instead of Playwright's own download.
  const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
  for (const shot of SHOTS.filter((s) => !only.length || only.includes(s.name))) {
    const demo = require(shot.demo);
    const ctx = await browser.newContext({ ...shot.ctx, locale: 'ka-GE', timezoneId: 'Asia/Tbilisi', reducedMotion: 'reduce' });
    const p = await ctx.newPage();
    const storage = { ...(demo.STORAGE || {}), ...(shot.theme ? { 'sx-theme': shot.theme } : {}) };
    await openPortal(p, demo.BODY, { url: demo.url, now: demo.NOW, student: demo.student === false ? undefined : STUDENT, storage, api: demo.API || {} });
    await p.waitForTimeout(1500); // API answers, passes, entry animations
    if (demo.ready) await demo.ready(p);
    await p.screenshot({ path: path.join(OUT, `${shot.name}.png`), fullPage: !!shot.full });
    console.log('saved', shot.name);
    await ctx.close();
  }
  await browser.close();
})();
