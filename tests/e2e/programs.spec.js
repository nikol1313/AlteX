const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

// 2 modules × 4 groups × 10 courses = 80 rows: four quarters of two groups each.
const programme = (wrap = (x) => x) => wrap(`<program-view><div class="program-wrapper">${[0, 1].map((m) => `
  <div class="program-module" id="m${m}"><div class="module-header">M${m}</div>${[0, 1, 2, 3].map((g) => `
    <div class="program-group" id="g${m}${g}"><div class="group-header">G${m}${g}</div>
      ${'<div class="program-book-wrapper">course</div>'.repeat(10)}</div>`).join('')}</div>`).join('')}</div></program-view>`);

// The portal's answer: 2 modules × 4 groups × 10 courses = 80 courses, parsed by "Angular" (a stand-in zone).
const parseProgramme = (page) => page.evaluate(() => {
  window.Zone = function () {};
  Zone.current = { name: 'angular', run: (f) => f() };
  const books = () => Array.from({ length: 10 }, (_, i) => ({ id: i, book: { name: 'c' } }));
  const text = JSON.stringify({ program: {}, special: {}, modules: [0, 1].map((m) => ({ id: m, groups: [0, 1, 2, 3].map((g) => ({ id: g, books: books() })) })) });
  window.data = JSON.parse(text);
  document.querySelector('program-view').append(document.createElement('div')); // Angular renders it
  return window.data.modules.map((m) => m.groups.length);
});
const shownCourses = (page) => page.evaluate(() => data.modules.flatMap((m) => m.groups).reduce((n, g) => n + g.books.length, 0));

test('the portal gets the programme a quarter at a time', async ({ page }) => {
  await openPortal(page, '<div class="page-program"><program-view></program-view></div>', { url: '/programs' });
  expect(await parseProgramme(page)).toEqual([2]);
  expect(await shownCourses(page)).toBe(20);
  const more = page.locator('.sx-prog-more');
  await expect(more).toHaveText(/\(60\)/);

  await more.click();
  expect(await shownCourses(page)).toBe(40);
  await more.click();
  expect(await page.evaluate(() => data.modules.map((m) => m.groups.length))).toEqual([4, 2]);
  await more.click();
  expect(await shownCourses(page)).toBe(80);
  await expect(more).toBeHidden();
});

test('outside the programme page the answer is left whole', async ({ page }) => {
  await openPortal(page, '<registration-routes-component><program-view></program-view></registration-routes-component>', { url: '/registration' });
  expect(await parseProgramme(page)).toEqual([4, 4]);
  await expect(page.locator('.sx-prog-more')).toHaveCount(0);
});

test('back-to-top shows a screen down, scrolls up, and leaves with the page', async ({ page }) => {
  await openPortal(page, programme((x) => `<div class="page-program">${x}<div style="height:5000px"></div></div>`));
  const top = page.locator('.sx-prog-top');
  await expect(top).toBeHidden();
  await page.evaluate(() => scrollTo(0, innerHeight * 2));
  await expect(top).toBeVisible();
  await top.click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await expect(top).toBeHidden();
  await page.evaluate(() => document.querySelector('program-view').remove());
  await expect(top).toHaveCount(0);
});
