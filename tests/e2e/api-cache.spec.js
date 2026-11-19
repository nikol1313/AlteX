const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

// The portal's reads (POST …/get…) as Angular's HttpClient makes them: XMLHttpRequest, text body parsed by the caller.
const xhr = (path, body = '{}') => new Promise((resolve, reject) => {
  const x = new XMLHttpRequest();
  x.open('POST', path);
  x.setRequestHeader('Authorization', 'Bearer t');
  x.setRequestHeader('Content-Type', 'application/json');
  x.addEventListener('load', () => resolve({ status: x.status, body: JSON.parse(x.responseText), type: x.getResponseHeader('content-type') }));
  x.addEventListener('error', reject);
  x.send(body);
});

test.describe('portal reads answered from memory', () => {
  test('a repeat read is answered without the server; identical reads in flight share one request', async ({ page }) => {
    const requests = await openPortal(page, '<div></div>', { api: { '/student/program/get': { name: 'CS' }, '/student/program/save': {} } });
    const hits = () => requests.filter((u) => u.endsWith('/student/program/get')).length;

    await page.evaluate(`window.__xhr = ${xhr.toString()}`);
    const pair = await page.evaluate(() => Promise.all([window.__xhr('/student/program/get'), window.__xhr('/student/program/get')]));
    expect(pair.map((r) => r.body.name)).toEqual(['CS', 'CS']);
    expect(hits()).toBe(1);

    const again = await page.evaluate(() => window.__xhr('/student/program/get'));
    expect(again).toMatchObject({ status: 200, body: { name: 'CS' } });
    expect(again.type).toContain('json');
    expect(hits()).toBe(1);

    // A different body is a different read.
    await page.evaluate(() => window.__xhr('/student/program/get', '{"year":2}'));
    expect(hits()).toBe(2);

    // A change (a POST that is not a get…) empties the memory: the next read asks the server again.
    await page.evaluate(() => window.__xhr('/student/program/save'));
    await page.evaluate(() => window.__xhr('/student/program/get'));
    expect(hits()).toBe(3);
  });
});

test('<html data-sx-waiting> is set only while a portal request waits on the server', async ({ page }) => {
  await openPortal(page, '<div></div>', { api: { '/student/program/get': { name: 'CS' } } });
  await page.evaluate(`window.__xhr = ${xhr.toString()}`);
  const during = await page.evaluate(() => {
    const p = window.__xhr('/student/program/get');
    const set = document.documentElement.hasAttribute('data-sx-waiting');
    return p.then(() => set);
  });
  expect(during).toBe(true);
  await expect(page.locator('html')).not.toHaveAttribute('data-sx-waiting', '');
});
