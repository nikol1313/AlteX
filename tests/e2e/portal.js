// Test harness: serves a fake portal page at the real origin with AlteX in its <head>: the stylesheets and
// content scripts from manifest.json, in order, running before the body exists (as at document_start, and
// as the Android app injects them).
// Nothing here talks to the real students.alte.edu.ge.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ORIGIN = 'https://students.alte.edu.ge';
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const { js, css } = manifest.content_scripts[0];
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');
const SCRIPT = js.map(read).join('\n;\n');
const STYLES = css.map(read).join('\n');

// A portal login token as core.js reads it: a JWT whose payload carries the student.
const token = (claims) => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'none' })}.${b64(claims)}.x`;
};

/**
 * Opens a fake portal page with AlteX injected.
 * @param {import('@playwright/test').Page} page
 * @param {string} body  the portal markup under test
 * @param {{ url?: string, now?: string, student?: object }} [options]
 * @returns {Promise<string[]>} every URL the page requested (filled in as requests happen)
 */
async function openPortal(page, body, { url = '/', now, student } = {}) {
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  const init = student ? `<script>localStorage.setItem('Student-Token', ${JSON.stringify(token(student))})</script>` : '';
  await page.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.origin !== ORIGIN) return route.abort();
    if (route.request().resourceType() === 'document') {
      return route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>portal</title>${init}<style>${STYLES}</style><script>${SCRIPT.replace(/<\/script/gi, '<\\/script')}</script></head><body>${body}</body></html>` });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  if (now) await page.clock.setFixedTime(new Date(now));
  await page.goto(ORIGIN + url);
  return requests;
}

module.exports = { openPortal, ORIGIN };
