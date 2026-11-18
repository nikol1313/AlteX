const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

// The portal's homework page: one row per course (id, name, open button); AlteX folds the latest assignments under each.
const course = (id, name) => `<mat-row><mat-cell class="mat-column-id">${id}</mat-cell><mat-cell class="mat-column-name">${name}</mat-cell><mat-cell class="mat-column-lecturer">ნინო ბერიძე, ლექტორი</mat-cell><mat-cell class="mat-column-actions"><mat-button-toggle><button class="mat-button-toggle-button"><span class="mat-button-toggle-label-content"><mat-icon>visibility</mat-icon></span></button></mat-button-toggle></mat-cell></mat-row>`;
const PAGE = `<tasks-mini-component><div class="width"><mat-table class="mat-elevation-z8"><mat-header-row></mat-header-row>${course(11, 'მონაცემთა ბაზები')}${course(12, 'ალგორითმები')}</mat-table></div></tasks-mini-component>`;
const API = {
  '/student/getStudentTaskBooks/': { data: [{ id: 11, listId: 'a' }, { id: 12, listId: 'b' }] },
  '/student/tasks/': { data: [
    { name: 'ლაბორატორიული 4: SQL JOIN-ები', text: '<p>ჩააბარეთ ფაილი <b>PDF</b> ფორმატში.</p>', created_at: '2026-11-16 10:00:00', endDate: '2026-11-23 23:59:00', files: [{ address: 'https://students.alte.edu.ge/f/lab4.pdf', fileName: 'lab4.pdf' }] },
    { name: 'ქვიზი 3', text: 'https://forms.example.org/quiz3', created_at: '2026-11-09 09:00:00', endDate: '2026-11-10 12:00:00', files: [] },
  ] },
};
const student = { studentId: 1, firstName: 'ტესტ' };

test.describe('homework page', () => {
  test('each course gets its colour and a fold with its latest assignments', async ({ page }) => {
    await openPortal(page, PAGE, { url: '/tasks-books', student, api: API, now: '2026-11-18T10:00:00+04:00' });

    const rows = page.locator('tasks-mini-component mat-row');
    await expect(rows.first()).toHaveAttribute('data-c', /^[0-6]$/);
    const fold = rows.first().locator('.sx-tf');
    await expect(fold.locator('.sx-tf-count')).toHaveText('2');
    await fold.locator('.sx-tf-sum').click();
    await expect(fold.locator('.sx-tf-item')).toHaveCount(2);
    await expect(fold.locator('.sx-tf-due').first()).not.toHaveClass(/sx-past/);
    await expect(fold.locator('.sx-tf-due').nth(1)).toHaveClass(/sx-past/);
    await expect(fold.locator('.sx-tf-text').first()).toHaveText('ჩააბარეთ ფაილი PDF ფორმატში.');
  });

  test('text never ends up in a sliver: an extra portal cell and the assignment text get real width', async ({ page }) => {
    await openPortal(page, PAGE, { url: '/tasks-books', student, api: API, now: '2026-11-18T10:00:00+04:00' });

    const row = page.locator('tasks-mini-component mat-row').first();
    await row.locator('.sx-tf-sum').click();
    const rowW = (await row.boundingBox()).width;
    expect((await row.locator('.mat-column-lecturer').boundingBox()).width).toBeGreaterThan(rowW * 0.6);
    expect((await row.locator('.sx-tf-name').first().boundingBox()).width).toBeGreaterThan(rowW * 0.4);
    expect((await row.locator('.sx-tf-text').first().boundingBox()).width).toBeGreaterThan(rowW * 0.6);
  });
});
