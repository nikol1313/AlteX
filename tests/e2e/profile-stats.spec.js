const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

// The portal's phone layout as seen on a phone: narrow fixed cards in a row, nudged over each other.
const ring = (v, label, style = '') => `<div class="card stat" style="width:48px;height:300px;${style}"><mat-progress-spinner style="width:150px;height:150px;display:block"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45"/></svg></mat-progress-spinner><div class="spinner-value">${v}</div><div class="status-text">${label}</div></div>`;
const BODY = `<personal-data-component><div class="profile"><div class="listMenu" style="display:flex;position:relative">
  <h3>ბაკალავრიატი</h3>
  ${ring('3', 'მიმდინარე სემესტრი', 'width:160px')}
  ${ring('1.815', 'GPA', 'margin-left:-60px;margin-top:-40px')}
  ${ring('115', 'კრედიტი', 'position:relative;top:-40px')}
  ${ring('115', 'პროგრამის კრედიტი', 'transform:translateY(-40px)')}
  ${ring('63/D', 'საშუალო შედეგი')}
</div></div></personal-data-component>`;

test('profile ring stats sit in two clean columns on a phone', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openPortal(page, BODY, { url: '/personal-data', student: { id: 1, firstName: 'Test', currentProgram: { eduId: 1 } } });
  await expect(page.locator('.listMenu')).toHaveClass(/sx-stats/);
  await expect(page.locator('.sx-stat')).toHaveCount(5);

  const boxes = await page.locator('.listMenu > *').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlap(boxes[i], boxes[j]), `boxes ${i} and ${j}`).toBe(false);
  for (const b of boxes) { expect(b.left).toBeGreaterThanOrEqual(0); expect(b.right).toBeLessThanOrEqual(390); }

  // Each ring fits inside its card.
  const fits = await page.locator('.sx-stat').evaluateAll((cards) => cards.every((c) => {
    const r = c.querySelector('mat-progress-spinner').getBoundingClientRect(), b = c.getBoundingClientRect();
    return r.left >= b.left - 1 && r.right <= b.right + 1;
  }));
  expect(fits).toBe(true);
});

// The real profile markup, with the portal's own phone CSS (unlayered, so it beats AlteX's layered rules unless
// they are !important): each stat box becomes display:inline-grid at 992px and below.
const PORTAL_PHONE_CSS = `<style>@media (max-width: 992px) {
  .listMenu { flex-direction: column !important; align-items: center; }
  .personlData { width: 100% !important; margin-right: 0 !important; text-align: center; }
  .personalDataList { display: inline-grid; width: 100% !important; text-align: center; margin-right: 0 !important; }
}</style>`;
const stat = (v, l) => `<div class="personalDataList" style="width:168px;margin-right:20px"><h3 class="card-title">ბაკალავრი</h3><div class="card" style="flex-direction:column;display:flex"><div class="spinner-value">${v}</div><mat-progress-spinner style="width:100px;height:100px;display:block"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="45"/></svg></mat-progress-spinner><div class="status-text">${l}</div></div></div>`;
const REAL = `${PORTAL_PHONE_CSS}<personal-data-component><div class="page-personalData"><div class="width"><div class="listMenu" style="flex-direction:row;display:flex">
  <div class="personlData personalDataList" style="width:365px"><h3 class="card-title">პირადი</h3><div class="card card--auto-height">x</div></div>
  ${stat(5, 'მიმდინარე სემესტრი')}${stat(1.81, 'GPA')}${stat(115, 'კრედიტი')}${stat(115, 'პროგრამის კრედიტი')}${stat('63/D', 'საშუალო შედეგი')}
</div></div></div></personal-data-component>`;

test('real profile stat cards: one heading, 3 + 2 cards, nothing overlapping, despite the portal phone CSS', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await openPortal(page, REAL, { url: '/personal-data', student: { id: 1, firstName: 'Test', currentProgram: { eduId: 1 } } });
  await expect(page.locator('.sx-stat')).toHaveCount(5);
  await expect(page.locator('.listMenu > .personalDataList:not(.personlData) > h3:visible')).toHaveCount(1);

  const cards = await page.locator('.listMenu > .personalDataList:not(.personlData) > .card').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
  const rows = [...new Set(cards.map((c) => Math.round(c.top)))];
  expect(rows).toHaveLength(2);
  expect(cards.filter((c) => Math.round(c.top) === rows[0])).toHaveLength(3);
  const overlap = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) expect(overlap(cards[i], cards[j])).toBe(false);
  for (const c of cards) expect(c.right).toBeLessThanOrEqual(390);
  expect(new Set(cards.slice(0, 3).map((c) => Math.round(c.height))).size).toBe(1); // a two-line label does not make one card stick out
});
