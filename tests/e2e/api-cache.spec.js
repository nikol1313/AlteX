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

test.describe('offline (the Android app)', () => {
  test('reads are answered from the saved copy however old, a failed change keeps it, log out empties it', async ({ page, context }) => {
    await page.addInitScript('window.__altexApp = true');
    const requests = await openPortal(page, '<div></div>', { api: { '/student/program/get': { name: 'CS' }, '/student/program/save': {} } });
    const hits = () => requests.filter((u) => u.endsWith('/student/program/get')).length;
    await page.evaluate(`window.__xhr = ${xhr.toString()}`);
    await page.evaluate(() => window.__xhr('/student/program/get'));
    // Kept in localStorage in the app, so it outlives a restart.
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sx-api-cache'))).toContain('CS');

    // An hour later and offline: too old to be answered online, but offline it is all there is.
    await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 3600 * 1000; });
    await context.setOffline(true);
    expect(await page.evaluate(() => window.__xhr('/student/program/get'))).toMatchObject({ status: 200, body: { name: 'CS' } });
    // A change tried offline never reached the server: the copy stays.
    await page.evaluate(() => window.__xhr('/student/program/save').catch(() => null));
    expect(await page.evaluate(() => window.__xhr('/student/program/get'))).toMatchObject({ body: { name: 'CS' } });
    expect(hits()).toBe(1);

    await context.setOffline(false);
    await page.evaluate(() => document.dispatchEvent(new Event('sx-forget')));
    await expect.poll(() => page.evaluate(() => localStorage.getItem('sx-api-cache'))).toBe('[]');
  });
});

test('an old read whose request fails is answered from the saved copy, even when the browser thinks it is online', async ({ page }) => {
  const requests = await openPortal(page, '<div></div>', { api: { '/student/program/get': { name: 'CS' } } });
  await page.evaluate(`window.__xhr = ${xhr.toString()}`);
  await page.evaluate(() => window.__xhr('/student/program/get'));
  // Wi-Fi switched off without the page noticing: the request fails, navigator.onLine stays true.
  await page.route('**/student/program/get', (route) => route.abort('internetdisconnected'));
  await page.evaluate(() => { const real = Date.now; Date.now = () => real() + 3600 * 1000; });
  expect(await page.evaluate(() => navigator.onLine)).toBe(true);
  expect(await page.evaluate(() => window.__xhr('/student/program/get'))).toMatchObject({ status: 200, body: { name: 'CS' } });
  expect(requests.filter((u) => u.endsWith('/student/program/get')).length).toBe(2);
});

test("a portal frame's reads go into the page's own memory", async ({ page }) => {
  const requests = await openPortal(page, '<iframe src="/tables"></iframe>', { api: { '/student/program/get': { name: 'CS' } } });
  const frame = page.frame({ url: /\/tables$/ });
  await frame.waitForLoadState();
  await frame.evaluate(`window.__xhr = ${xhr.toString()}`);
  await frame.evaluate(() => window.__xhr('/student/program/get'));
  await page.evaluate(`window.__xhr = ${xhr.toString()}`);
  expect(await page.evaluate(() => window.__xhr('/student/program/get'))).toMatchObject({ body: { name: 'CS' } });
  expect(requests.filter((u) => u.endsWith('/student/program/get')).length).toBe(1);
});

test('the app opens the sections in a hidden frame after the first signed-in read, once per login', async ({ page }) => {
  await page.addInitScript('window.__altexApp = true');
  await openPortal(page, '<div></div>', { api: { '/student/program/get': { name: 'CS' } } });
  await page.evaluate(`window.__xhr = ${xhr.toString()}`);
  const warm = page.waitForRequest((r) => r.url().endsWith('/learningCard') && r.resourceType() === 'document', { timeout: 10000 });
  await page.evaluate(() => window.__xhr('/student/program/get'));
  await warm;
  const frame = page.locator('iframe[aria-hidden="true"]');
  await expect(frame).toHaveCount(1);
  await expect(frame).not.toBeVisible();
});

test('after logging in the app also saves every learning card subject, so each opens offline', async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript('window.__altexApp = true');
  const books = [{ id: 11, name: 'Math' }, { id: 12, name: 'Physics' }, { id: 13, name: 'History' }, { id: 14, name: 'Art' }];
  const requests = await openPortal(page, '<div></div>', {
    api: { '/student/card': { card: { books } }, '/student/getCardDetails': { result: 'yes', data: [] } },
  });
  // The portal's own read of the card, as the learning card page makes it.
  await page.evaluate(() => new Promise((resolve) => {
    const x = new XMLHttpRequest();
    x.open('GET', '/student/card');
    x.setRequestHeader('Authorization', 'Bearer t');
    x.addEventListener('loadend', resolve);
    x.send();
  }));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('sx-warmed')), { timeout: 80000 }).not.toBeNull();
  const details = () => requests.filter((u) => u.endsWith('/student/getCardDetails')).length;
  expect(details()).toBe(books.length);

  // Tapping a subject never opened online: answered from the saved copy, offline.
  await page.context().setOffline(true);
  await page.evaluate(`window.__xhr = ${xhr.toString()}`);
  expect(await page.evaluate(() => window.__xhr('/student/getCardDetails', '{"resultId":13}'))).toMatchObject({ status: 200, body: { result: 'yes' } });
  expect(details()).toBe(books.length);
});

test('paged lists (assignments) are reads; marking something seen leaves the memory alone', async ({ page }) => {
  const requests = await openPortal(page, '<div></div>', {
    api: { '/student/tasks/': { data: [{ id: 1 }] }, '/student/program/get': { name: 'CS' }, '/student/hr/calendar/seen': {} },
  });
  const count = (p) => requests.filter((u) => new URL(u).pathname === p).length;
  await page.evaluate(`window.__xhr = ${xhr.toString()}`);
  await page.evaluate(() => window.__xhr('/student/program/get'));
  await page.evaluate(() => window.__xhr('/student/tasks/?page=1&limit=10', '{"listId":5}'));
  await page.evaluate(() => window.__xhr('/student/hr/calendar/seen'));
  expect(await page.evaluate(() => window.__xhr('/student/tasks/?page=1&limit=10', '{"listId":5}'))).toMatchObject({ body: { data: [{ id: 1 }] } });
  await page.evaluate(() => window.__xhr('/student/program/get'));
  expect(count('/student/tasks/')).toBe(1);
  expect(count('/student/program/get')).toBe(1);
});

test("AlteX's own reads (api in js/core.js) go through the same memory", async ({ page }) => {
  const requests = await openPortal(page, '<div></div>', { api: { '/student/card': { card: { books: [] } } } });
  const a = await page.evaluate(() => api({ token: 't' }, '/student/card'));
  const b = await page.evaluate(() => api({ token: 't' }, '/student/card'));
  expect(a).toEqual({ card: { books: [] } });
  expect(b).toEqual(a);
  expect(requests.filter((u) => u.endsWith('/student/card')).length).toBe(1);
});

test('offline, the homework list is found whether or not the portal had added the group id yet', async ({ page, context }) => {
  const requests = await openPortal(page, '<div></div>', {
    api: { '/student/getStudentTaskBooks/': { data: [{ id: 7, name: 'Math' }], total: 1 }, '/student/getCardDetails': { result: 'yes' } },
  });
  await page.evaluate(`window.__xhr = ${xhr.toString()}`);
  await page.evaluate(() => window.__xhr('/student/getStudentTaskBooks/?page=1&limit=10', '{"registrationGroupId":42}'));
  await page.evaluate(() => window.__xhr('/student/getCardDetails', '{"resultId":1}'));
  await context.setOffline(true);
  expect(await page.evaluate(() => window.__xhr('/student/getStudentTaskBooks/?page=1&limit=10', '{}'))).toMatchObject({ body: { total: 1 } });
  expect(requests.filter((u) => u.includes('/student/getStudentTaskBooks/')).length).toBe(1);
  // Only the group id may differ: another subject is not answered from memory with the first one's details.
  await page.evaluate(() => window.__xhr('/student/getCardDetails', '{"resultId":2}').catch(() => null));
  expect(requests.filter((u) => u.endsWith('/student/getCardDetails')).length).toBe(2);
});
