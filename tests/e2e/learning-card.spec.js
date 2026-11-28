const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

// The portal's student card as it renders it on a wide screen: stats, then one table per semester.
const subject = (name, prof, credit, score, grade) =>
  `<mat-row><mat-cell class="mat-column-bookName">${name}</mat-cell><mat-cell class="mat-column-prof">${prof}</mat-cell><mat-cell class="mat-column-credit">${credit}</mat-cell><mat-cell class="mat-column-score">${score}</mat-cell><mat-cell class="mat-column-result"><span class="result-color">${grade}</span></mat-cell><mat-cell class="mat-column-details"><button>შეფასება</button></mat-cell></mat-row>`;
const parts = (rows) => `<mat-row><mat-cell class="mat-column-expandedDetail"><div class="result-detail-wrapper">${rows.map(([n, v]) => `<div class="result-detail"><div class="result-detail-name">${n}</div><div class="result-detail-result">${v}</div></div>`).join('')}</div></mat-cell></mat-row>`;
const semester = (no, rows) =>
  `<div class="semester-child"><div class="mat-elevation-z8"><mat-table><mat-header-row><mat-header-cell class="mat-column-bookName">${no} სემესტრი</mat-header-cell><mat-header-cell class="mat-column-credit">კრედიტი</mat-header-cell></mat-header-row>${rows.join('')}</mat-table></div></div>`;
const CARD = `<learning-card-component><div class="page-learningCard">
  <div class="semesters-container"><h3 class="commandsh3">სასწავლო ბარათი</h3><div class="semesters">
    <div class="semester-item"><mat-form-field><div class="mat-mdc-text-field-wrapper"><div class="mat-mdc-form-field-flex"><div class="mat-mdc-form-field-infix"><mat-select class="mat-mdc-select"><div class="mat-mdc-select-value">კომპიუტერული მეცნიერება</div></mat-select></div></div></div></mat-form-field></div>
    <div class="semester-item button"><button class="mat-primary"><mat-icon>list</mat-icon></button></div><div class="semester-item button"><button><mat-icon>date_range</mat-icon></button></div>
  </div></div><br>
  <div class="ini-block"><div class="last-stat"><h3><mat-icon>star</mat-icon> GPA: <span>3.42</span></h3><h3><mat-icon>school</mat-icon>მიღებული კრედიტები: 128</h3><h3><mat-icon>grade</mat-icon><span>საშუალო ქულა</span><b>74.6</b></h3></div></div>
  ${semester(3, [subject('ფიზიკა', 'ლ. გიორგაძე', 6, 70, 'C'), subject('ფილოსოფია', 'მ. ჩხეიძე', 6, 80, 'B')])}
  ${semester(5, [subject('მონაცემთა ბაზები', 'ნინო ბერიძე', 6, 86, 'B'), subject('ალგორითმები', 'გიორგი კაპანაძე', 6, 38, 'F'),
    parts([['შუალედური', '24'], ['ქვიზები', '14'], ['დასკვნითი', ''], ['ჯამი', '38'], ['შედეგი', 'F']]), subject('ინგლისური ენა B2', 'ანა წიკლაური', 6, 44, 'FX')])}
  ${semester(4, [subject('კალკულუსი II', 'თამარ ლომიძე', 6, 64, 'D'), subject('ვებ-ტექნოლოგიები', 'ლევან მაისურაძე', 6, 93, 'A')])}
</div></learning-card-component>`;

test.describe('student card', () => {
  test('newest semester first and open, with subject count, credits and credit-weighted average', async ({ page }) => {
    await openPortal(page, CARD, { url: '/learningCard', now: '2026-11-18T10:00:00+04:00' });

    const current = page.locator('.semester-child[data-sx-fold="open"]');
    await expect(current).toHaveCount(1);
    await expect(current.locator('mat-header-row')).toContainText('5 სემესტრი');
    await expect(current.locator('.sx-sem-sum')).toHaveText('3 საგანი · 18 კრედიტი · საშ. 56');
    await expect(page.locator('.semester-child[data-sx-fold="closed"] .sx-sem-sum').first()).toContainText('საშ.');
  });

  test('a course keeps one colour; a running course shows no grade yet; a score bar marks the pass line', async ({ page }) => {
    await openPortal(page, CARD, { url: '/learningCard', now: '2026-11-18T10:00:00+04:00' });

    const algo = page.locator('mat-row', { hasText: 'ალგორითმები' }).first();
    await expect(algo).toHaveAttribute('data-sx-running', '');
    await expect(algo).toHaveAttribute('data-c', /^[0-6]$/);
    await expect(algo.locator('.sx-bar > i')).toHaveAttribute('style', /width: 38%/);
  });

  test('opened subject: the answer first (points, bar with the pass mark, what is still needed), then the parts', async ({ page }) => {
    await openPortal(page, CARD, { url: '/learningCard', now: '2026-11-18T10:00:00+04:00' });

    const sum = page.locator('.result-detail-wrapper > .sx-dsum');
    await expect(sum.locator('.sx-dsum-num')).toHaveText('38');
    await expect(sum.locator('.sx-dsum-bar > i')).toHaveAttribute('style', /width: 38%/);
    await expect(sum.locator('.sx-dsum-pass')).toHaveText('51');
    await expect(sum.locator('.sx-dsum-note')).toHaveText('ჩასაბარებლად კიდევ 13 ქულა გჭირდება');
    await expect(page.locator('.result-detail-wrapper > .result-detail.sx-total')).toBeHidden();
    await expect(page.locator('.result-detail-wrapper > .result-detail')).toHaveCount(5);
  });

  test('stats: each portal heading becomes a label and its number, icon names left out', async ({ page }) => {
    await openPortal(page, CARD, { url: '/learningCard', now: '2026-11-18T10:00:00+04:00' });

    const stats = page.locator('.ini-block .sx-cstat');
    await expect(stats.locator('.sx-cstat-label')).toHaveText(['GPA', 'მიღებული კრედიტები', 'საშუალო ქულა']);
    await expect(stats.locator('.sx-cstat-num')).toHaveText(['3.42', '128', '74.6']);
    await expect(page.locator('.ini-block .last-stat > h3').first()).toBeHidden();
  });

  test('trend: finished semesters only (the running one is still filling up), oldest to newest', async ({ page }) => {
    await openPortal(page, CARD, { url: '/learningCard', now: '2026-11-18T10:00:00+04:00' });

    const trend = page.locator('.ini-block .last-stat > .sx-trend');
    await expect(trend.locator('.sx-trend-pts b')).toHaveText(['75', '79']);
    await expect(trend.locator('.sx-trend-pts small')).toHaveText(['3 სემესტრი', '4 სემესტრი']);
    await expect(trend.locator('.sx-trend-plot > i')).toHaveCount(2);
  });

  test('the opened subject sits in the middle of its row, even inside extra portal wrappers', async ({ page }) => {
    const wrapped = CARD.replace('<div class="result-detail-wrapper">', '<div style="width:60%"><div><div class="result-detail-wrapper" style="width:50%;margin:0">')
      .replace('</div></mat-cell></mat-row>', '</div></div></div></mat-cell></mat-row>');
    await openPortal(page, wrapped, { url: '/learningCard', now: '2026-11-18T10:00:00+04:00' });

    const box = page.locator('.sx-dsum');
    await expect(box).toBeVisible();
    const [row, b] = await page.evaluate(() => [document.querySelector('.semester-child[data-sx-fold="open"] mat-row').getBoundingClientRect().toJSON(), document.querySelector('.sx-dsum').getBoundingClientRect().toJSON()]);
    expect(Math.abs((b.left + b.right) / 2 - (row.left + row.right) / 2)).toBeLessThan(2);
    expect(b.width).toBeGreaterThan(Math.min(row.width * 0.8, 500));
  });

  test('a tapped subject keeps its text visible while its details load and once they come', async ({ page }) => {
    await openPortal(page, CARD, { url: '/learningCard', now: '2026-11-18T10:00:00+04:00' });
    const row = page.locator('.semester-child[data-sx-fold="open"] mat-row', { hasText: 'ინგლისური' });
    await expect.poll(() => row.evaluate((r) => r.getAnimations().every((a) => a.playState === 'finished'))).toBe(true);
    await row.click();
    await expect(row).toHaveAttribute('data-sx-busy', '');
    await row.evaluate((r) => r.insertAdjacentHTML('afterend', '<mat-row><mat-cell class="mat-column-expandedDetail"><div class="result-detail-wrapper"><div class="result-detail"><div class="result-detail-name">ჯამი</div><div class="result-detail-result">44</div></div></div></mat-cell></mat-row>'));
    await expect(row).not.toHaveAttribute('data-sx-busy');
    // The entrance animation is not run again: it started from opacity 0 and the row's text vanished.
    expect(await row.evaluate((r) => getComputedStyle(r).opacity)).toBe('1');
  });

  test('admission: allowed reads green, not allowed red', async ({ page }) => {
    const card = CARD.replace('<div class="result-detail"><div class="result-detail-name">დასკვნითი', '<div class="result-detail"><div class="result-detail-name">დაშვება</div><div class="result-detail-result">დაშვებულია</div></div><div class="result-detail"><div class="result-detail-name">დასკვნითი');
    await openPortal(page, card, { url: '/learningCard', now: '2026-11-18T10:00:00+04:00' });
    const val = page.locator('.result-detail', { hasText: 'დაშვება' }).locator('.result-detail-result');
    await expect(page.locator('.result-detail', { hasText: 'დაშვება' })).toHaveClass(/sx-allowed/);
    const [color, good] = await val.evaluate((v) => [getComputedStyle(v).color, getComputedStyle(document.documentElement).getPropertyValue('--good').trim()]);
    expect(color).toBe(`rgb(${good.slice(1).match(/../g).map((h) => parseInt(h, 16)).join(', ')})`);
  });

  test('tapping a subject leaves no lasting tint on its row (the portal keeps a closed subject\'s details in the page)', async ({ page }) => {
    await openPortal(page, CARD, { url: '/learningCard', now: '2026-11-18T10:00:00+04:00' });

    const bg = (name) => page.locator('.semester-child[data-sx-fold="open"] mat-row', { hasText: name }).first().evaluate((r) => getComputedStyle(r).backgroundColor);
    await page.mouse.move(0, 0);
    expect(await bg('ალგორითმები')).toBe(await bg('მონაცემთა ბაზები'));
  });

  test('no breakdown button; each subject shows a fold arrow that follows whether its details are open', async ({ page }) => {
    await openPortal(page, CARD, { url: '/learningCard', now: '2026-11-18T10:00:00+04:00' });

    const open = page.locator('.semester-child[data-sx-fold="open"]');
    await expect(open.locator('.mat-column-details').first()).toBeHidden();
    const arrow = (name) => open.locator('mat-row', { hasText: name }).first().evaluate((r) => getComputedStyle(r, '::after').transform);
    const algo = open.locator('mat-row', { hasText: 'ალგორითმები' }).first();
    await expect(algo).toHaveAttribute('data-sx-open', '');
    await expect(open.locator('mat-row', { hasText: 'მონაცემთა ბაზები' }).first()).not.toHaveAttribute('data-sx-open', '');
    expect(await arrow('ალგორითმები')).not.toBe(await arrow('მონაცემთა ბაზები'));
    // Closed by the portal: its details stay in the page at zero height.
    await page.evaluate(() => { const d = document.querySelector('.mat-column-expandedDetail'); d.style.cssText = 'height:0!important;overflow:hidden!important;display:block!important'; d.parentElement.style.cssText = 'height:0!important;overflow:hidden!important;min-height:0!important'; });
    await algo.click();
    await expect(algo).not.toHaveAttribute('data-sx-open', '');
  });
});

test('a running subject shows the portal\'s own total, its parts are not added up', async ({ page }) => {
  const api = {
    '/student/card': { card: { books: [{ id: 5, name: 'ალგორითმები', score: 38 }] } },
    '/student/getCardDetails': { data: [{ coId: 2, name: 'შუალედური გამოცდა', componentType: 1, result: '17', items: [] }, { coId: 1, name: 'ქვიზი', componentType: 1, result: '38', items: [] }] },
  };
  await openPortal(page, CARD, { url: '/learningCard', now: '2026-11-18T10:00:00+04:00', student: { id: 1, currentProgram: { eduId: 7 } }, api });
  const algo = page.locator('mat-row', { hasText: 'ალგორითმები' }).first();
  await expect(algo.locator('.sx-bar > i')).toHaveAttribute('style', /width: 38%/);
  await expect(algo.locator('.mat-column-score')).toHaveText('38');
});
