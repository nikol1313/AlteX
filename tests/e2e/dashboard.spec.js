const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

const student = { id: 1, firstName: 'Nika', currentProgram: { eduId: 7 } };
const NOW = '2026-11-16T12:00:00+04:00';
const dashboard = `<dashboard-component><div><div class="dashboard-item-container">
  ${['/tables', '/tasks-books', '/learningCard'].map((h) => `<a class="dashboard-item-wrapper" href="${h}"><div class="dashboard-item"></div></a>`).join('')}
</div></div></dashboard-component>`;
const box = (page, href) => page.locator(`a[href="${href}"] .sx-data`);

// One subject: a quiz (4) entered after the midterm (15), total 19.
const part = (coId, name, value, sub) => ({ coId, name, componentType: 1, result: value, updated_at: '2026-11-15T09:00:00.000000Z', items: value ? [{ key: 0, value }] : [], data: { items: [{ name: sub }] } });
const grades = {
  '/student/card': { card: { books: [{ id: 10, name: 'AI', score: 19, semester: 5, prof: 'ლაშა დალაქიშვილი' }] } },
  '/student/getCardDetails': { data: [part(9, 'ქვიზი', '4', 'ქვიზი 1'), part(2, 'შუალედური გამოცდა', '15', null), { coId: 6, name: 'ჯამი', componentType: 3, result: '<b>19</b>', items: [] }] },
};

test.describe('latest grade', () => {
  test('shows the grade that was entered, not the whole change of the total', async ({ page }) => {
    await openPortal(page, dashboard, { student, now: NOW, api: grades, storage: { 'sx-grades:1': JSON.stringify({ v: 2, scores: { 10: 15 } }) } });
    const card = box(page, '/learningCard');
    await expect(card.locator('.sx-gr-name')).toHaveText('AI');
    await expect(card).not.toContainText('შეიტანა ქულა');
    await expect(card.locator('.sx-gr-change')).toHaveText('+4 ქვიზი 1');
    await expect(card.locator('.sx-gr-when')).toHaveText('შეტანილია გუშინ');
    await expect(card.locator('.sx-gr-num')).toHaveText('19 / 100');
    await expect(card).not.toContainText('+19');
  });

  test('a total saved by an older version becomes one grade, never a list of past ones', async ({ page }) => {
    const last = { name: 'AI', score: 19, delta: 19, at: Date.parse('2026-11-10T09:00:00+04:00') };
    await openPortal(page, dashboard, { student, now: NOW, api: grades, storage: { 'sx-grades:1': JSON.stringify({ scores: { 10: 19 }, last }) } });
    const card = box(page, '/learningCard');
    await expect(card.locator('.sx-gr-change')).toHaveText('+4 ქვიზი 1');
    await expect(card).not.toContainText('+15');
    await expect(card).not.toContainText('+19');
  });
});

test('latest grade: a list saved by the previous version is cut to one grade', async ({ page }) => {
  const last = { id: 10, name: 'AI', score: 19, delta: 19, at: Date.parse('2026-11-16T09:00:00+04:00'), parts: [{ name: 'ქვიზი 1', d: 4 }, { name: 'შუალედური გამოცდა', d: 15 }] };
  await openPortal(page, dashboard, { student, now: NOW, api: grades, storage: { 'sx-grades:1': JSON.stringify({ scores: { 10: 19 }, last }) } });
  const card = box(page, '/learningCard');
  await expect(card.locator('.sx-gr-change')).toHaveText('+4 ქვიზი 1');
  await expect(card.locator('.sx-gr-when')).toHaveText('შეტანილია დღეს');
  await expect(card).not.toContainText('+15');
});

test('latest grade: a subject the card leaves at 0 takes its total from the breakdown', async ({ page }) => {
  const api = { ...grades, '/student/card': { card: { books: [{ id: 10, name: 'AI', score: 0, semester: 5 }] } } };
  await openPortal(page, dashboard, { student, now: NOW, api, storage: { 'sx-grades:1': JSON.stringify({ v: 2, scores: { 10: 15 } }) } });
  const card = box(page, '/learningCard');
  await expect(card.locator('.sx-gr-num')).toHaveText('19 / 100');
  await expect(card.locator('.sx-gr-change')).toHaveText('+4 ქვიზი 1');
});

test('latest grade: totals saved before parts were added up are taken as they are, not as a new grade', async ({ page }) => {
  // The portal prints 15 for AI; its parts add up to 19. The saved grade came from the short total.
  const api = { ...grades, '/student/card': { card: { books: [{ id: 10, name: 'AI', score: 15, semester: 5 }] } } };
  const last = { id: 10, name: 'AI', score: 15, delta: 15, at: Date.parse('2026-11-16T09:00:00+04:00') };
  await openPortal(page, dashboard, { student, now: NOW, api, storage: { 'sx-grades:1': JSON.stringify({ scores: { 10: 15 }, last }) } });
  const card = box(page, '/learningCard');
  await expect(card).toContainText('ახალი შეფასება ჯერ არ დადებულა');
  await expect(card.locator('.sx-gr-change')).toHaveCount(0);
});

test.describe('next lecture', () => {
  const lesson = (h, m) => ({ data: { h, m, duration: 90, profName: 'ლაშა დალაქიშვილი', activity_type: 'lecture_seminar', auditorium: { name: '204' } }, item: { book: { name: 'AI' } } });
  const tables = (h, m) => ({
    '/student/registration/group/getGroupForRegistration': { selectedGroupId: 3 },
    '/student/registration/getStudentTables': { data: [[lesson(h, m)]] }, // Monday; NOW is a Monday
  });

  test('more than three hours ahead: the start time, no countdown', async ({ page }) => {
    await openPortal(page, dashboard, { student, now: NOW, api: tables(16, 0) });
    const card = box(page, '/tables');
    await expect(card.locator('.sx-val').first()).toHaveText('დღეს, 16:00');
    await expect(card.locator('.sx-lec-bar')).toHaveCount(0);
    await expect(card.locator('.sx-lec-who')).toHaveText('ლექციას ატარებს ლაშა დალაქიშვილი');
    await expect(page.locator('.sx-hello-line')).toContainText('დღეს გაქვს 1 ლექცია');
  });

  test('within three hours: the countdown runs', async ({ page }) => {
    await openPortal(page, dashboard, { student, now: NOW, api: tables(14, 30) });
    const card = box(page, '/tables');
    await expect(card.locator('.sx-val').first()).toHaveText('2 სთ 30 წთ-ში');
    await expect(card.locator('.sx-lec-bar')).toHaveCount(1);
  });

  test('nothing is said about lectures that are over', async ({ page }) => {
    await openPortal(page, dashboard, { student, now: NOW, api: tables(9, 0) });
    await expect(box(page, '/tables')).toBeVisible();
    await expect(page.locator('.sx-hello')).toBeVisible();
    await expect(page.locator('body')).not.toContainText('გქონდა');
  });
});

test('assignments box: the button opens that course\'s assignments and the assignment itself', async ({ page }) => {
  await openPortal(page, dashboard, { student, now: NOW, api: {
    '/student/getStudentTaskBooks/': { data: [{ id: 5, listId: 6014, name: 'Theory' }] },
    '/student/tasks/': { data: [{ id: 34485, listId: 6014, name: 'დავალება 5', text: 'წაიკითხეთ', created_at: '2026-11-16T08:26:14.000000Z', endDate: null, files: [] }] },
  } });
  const open = box(page, '/tasks-books').locator('.sx-taskbox .sx-task-open');
  await expect(open).toHaveText('დავალების გახსნა');
  await open.click();
  await expect(page).toHaveURL(/\/tasks\/6014$/);

  // The portal then draws the course's list: the row of that assignment is tapped, the others are not.
  await page.evaluate(() => {
    window.tapped = [];
    const row = (id) => `<mat-row><mat-cell class="mat-column-id"> ${id} </mat-cell><mat-cell class="mat-column-actions"><button onclick="tapped.push(${id})"></button></mat-cell></mat-row>`;
    document.body.innerHTML = `<tasks-mini-component>${row(34400)}${row(34485)}</tasks-mini-component>`;
  });
  await expect.poll(() => page.evaluate(() => window.tapped)).toEqual([34485]);
});

test('beside the greeting: final exams (not the nearer midterm retakes) and the next day off', async ({ page }) => {
  await openPortal(page, dashboard, { student, now: NOW });
  const chips = page.locator('.sx-hello-chips .sx-hello-exam');
  await expect(chips).toHaveCount(2);
  await expect(chips.nth(0)).toContainText('დასკვნითი გამოცდები');
  await expect(chips.nth(0).locator('.sx-hello-exam-val')).toHaveText('56 დღეში');
  await expect(chips.nth(1).locator('.sx-hello-exam-val')).toHaveText('7 დღეში');
  await expect(chips.nth(1).locator('.sx-hello-exam-sub')).toHaveText('გიორგობა · 23 ნოემბერი');
  await expect(page.locator('.sx-hello')).not.toContainText('გადაბარება');
});
