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
