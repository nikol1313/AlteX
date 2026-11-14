const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

// Dates come from js/academic-calendar.js (2026/2027). The clock is frozen, so these never go stale.
const TIMETABLE = '<student-tables-component><div id="portal-content">ცხრილი</div></student-tables-component>';

test.describe('exam countdown strip on the timetable', () => {
  test('before midterms: counts the days to each exam period of this semester', async ({ page }) => {
    await openPortal(page, TIMETABLE, { now: '2026-10-26T10:00:00+04:00' });

    const strip = page.locator('student-tables-component > .sx-exams');
    await expect(strip).toHaveCount(1);
    const midterm = strip.locator('[data-exam="midterm"]');
    await expect(midterm).toHaveAttribute('data-state', 'soon');
    await expect(midterm).toHaveAttribute('data-next', '1');
    await expect(midterm.locator('.sx-exam-num')).toHaveText('7');
    await expect(strip.locator('[data-exam="final"] .sx-exam-num')).toHaveText('77');
  });

  test('during midterms: shows the period as running, with days left', async ({ page }) => {
    await openPortal(page, TIMETABLE, { now: '2026-11-04T09:00:00+04:00' });

    const midterm = page.locator('[data-exam="midterm"]');
    await expect(midterm).toHaveAttribute('data-state', 'now');
    await expect(midterm.locator('.sx-exam-num')).toHaveText('ახლა');
    await expect(midterm.locator('.sx-exam-sub')).toContainText('დარჩა 3 დღე');
  });

  test('last exam day is called the last day', async ({ page }) => {
    await openPortal(page, TIMETABLE, { now: '2026-11-07T23:30:00+04:00' });

    await expect(page.locator('[data-exam="midterm"] .sx-exam-sub')).toContainText('ბოლო დღე');
  });

  test('a finished exam period is dropped instead of counting to next year', async ({ page }) => {
    await openPortal(page, TIMETABLE, { now: '2026-11-08T00:30:00+04:00' });

    await expect(page.locator('.sx-exams')).toHaveCount(1);
    await expect(page.locator('[data-exam="midterm"]')).toHaveCount(0);
    await expect(page.locator('[data-exam="retake"]')).toHaveCount(1);
  });

  test('second semester counts to its own exams, not the first semester’s', async ({ page }) => {
    await openPortal(page, TIMETABLE, { now: '2027-03-01T12:00:00+04:00' });

    await expect(page.locator('[data-exam="midterm"] .sx-exam-num')).toHaveText('42');
  });

  test('next day off: tomorrow is written as "ხვალ"', async ({ page }) => {
    await openPortal(page, TIMETABLE, { now: '2026-11-22T12:00:00+04:00' });

    const off = page.locator('.sx-exam-off');
    await expect(off.locator('.sx-exam-offname')).toHaveText('გიორგობა');
    await expect(off.locator('.sx-exam-sub')).toContainText('ხვალ');
  });

  test('strip goes first and the portal content stays', async ({ page }) => {
    await openPortal(page, TIMETABLE, { now: '2026-10-26T10:00:00+04:00' });
    await expect(page.locator('.sx-exams')).toHaveCount(1);

    expect(await page.evaluate(() => document.querySelector('student-tables-component').firstElementChild.className)).toBe('sx-exams');
    await expect(page.locator('#portal-content')).toHaveText('ცხრილი');
  });
});
