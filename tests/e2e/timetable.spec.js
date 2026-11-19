const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

// The portal's lecture week, as it renders it: one .headInfo per day, lessons as "<b>label</b>: value<br>" pairs.
const lesson = (time, course, room, dur = 90, type = 'ლექცია', lecturer = 'ნინო ბერიძე') =>
  `<div class="day-item"><b>საათი</b>: ${time}<br><b>სასწ.კურსი</b>: ${course}<br><b>ჯგუფი</b>: 101<br><b>ლექტორი</b>: ${lecturer}<br><b>აუდიტორია</b>: ${room}<br><b>ტიპი</b>: ${type}<br><b>ხანგრძლივობა</b>: ${dur}<br></div>`;
const DAYS = ['ორშაბათი', 'სამშაბათი', 'ოთხშაბათი', 'ხუთშაბათი', 'პარასკევი', 'შაბათი', 'კვირა'];
const WEEK = [
  [lesson('10:00', 'მონაცემთა ბაზები', '204'), lesson('12:00', 'ალგორითმები', '310')],
  [lesson('09:00', 'კალკულუსი II', '105', 120), lesson('14:00', 'ინგლისური ენა B2', '017', 90, 'სემინარი')],
  [lesson('10:00', 'მონაცემთა ბაზები', '204', 90, 'პრაქტიკული'), lesson('10:30', 'ალგორითმები', '311', 60, 'სემინარი')],
  [lesson('16:00', 'ვებ-ტექნოლოგიები', '402', 120)],
  [],
  [],
  [],
];
// An empty Sunday comes without its lesson list, as on the real portal.
const week = (today, sunday = []) => `
<tables-dashboard-component><div class="width"><div class="tables-dashboard"><ul class="tables-tab-menu">
  <li><a href="/tables/learningTables" class="active">ლექციები</a></li><li><a href="/tables/ac-tables/1">შუალედური</a></li>
</ul></div></div></tables-dashboard-component>
<student-tables-component><div>
  <div class="calendar-navigation"><div class="monthName">ნოემბერი 2026</div></div>
  <div class="calendar"><div class="weeklist-container">
    ${DAYS.map((d, i) => `<div class="headInfo${i === today ? ' now' : ''}"><button class="day-title"><span class="mdc-button__label"><div class="day-name">${d}</div><div class="day-number"><div>${16 + i}</div></div></span></button>${i === 6 && !sunday.length ? '' : `<div class="weeklist">${(i === 6 ? sunday : WEEK[i]).join('')}</div>`}</div>`).join('')}
  </div></div>
</div></student-tables-component>`;

test.describe('lecture timetable as a time grid', () => {
  test('places lessons by start time and length on an hour axis', async ({ page }) => {
    await openPortal(page, week(2), { url: '/tables/learningTables', now: '2026-11-18T10:45:00+04:00' });

    const grid = page.locator('.weeklist-container');
    await expect(grid).toHaveCSS('--t0', '540');
    await expect(grid).toHaveCSS('--t1', '1080');
    await expect(grid.locator('.sx-tt-axis > .sx-hour').first()).toHaveText('09:00');
    await expect(grid.locator('.sx-tt-axis > .sx-hour')).toHaveCount(10);

    const mon = grid.locator('[data-day="mon"] .sx-lesson');
    await expect(mon).toHaveCount(2);
    await expect(mon.first().locator('.sx-time')).toHaveText('10:00–11:30');
    const [a, b] = [await mon.nth(0).boundingBox(), await mon.nth(1).boundingBox()];
    expect(b.y - a.y).toBeGreaterThanOrEqual(119); // two hours apart, at 1px+ per minute
    await expect(page.locator('.sx-tt-sum')).toHaveText('7 ლექცია · 11 სთ ამ კვირაში');
  });

  test('today: overlapping lessons stack full width, the live one fills, a now line shows the time', async ({ page }) => {
    await openPortal(page, week(2), { url: '/tables/learningTables', now: '2026-11-18T10:45:00+04:00' });

    const wed = page.locator('[data-day="wed"]');
    await expect(wed).toHaveAttribute('data-when', 'today');
    const [db, algo] = [wed.locator('.sx-lesson').nth(0), wed.locator('.sx-lesson').nth(1)];
    // Both read in one go: the page scrollbar can appear between two separate reads and narrow the columns.
    const [d, g] = await wed.locator('.sx-lesson').evaluateAll((ls) => ls.map((l) => l.getBoundingClientRect().toJSON()));
    expect(g.top).toBeGreaterThanOrEqual(d.bottom); // under it, not beside it
    expect(g.width).toBe(d.width);
    await expect(db).toHaveAttribute('data-status', 'live');
    await expect(db).toHaveCSS('--p', '0.500');
    await expect(db.locator('.sx-status')).toHaveText('ახლა');
    await expect(page.locator('.sx-now-tag')).toHaveText('10:45');
    await expect(page.locator('.sx-now')).toHaveCount(1);
  });

  test('same course keeps its colour all week; empty weekends are hidden, empty weekdays say so', async ({ page }) => {
    await openPortal(page, week(2), { url: '/tables/learningTables', now: '2026-11-18T10:45:00+04:00' });

    const c = (day, n) => page.locator(`[data-day="${day}"] .sx-lesson`).nth(n).getAttribute('data-c');
    expect(await c('mon', 0)).toBe(await c('wed', 0));
    await expect(page.locator('[data-day="sat"]')).toBeHidden();
    await expect(page.locator('[data-day="fri"] .sx-empty')).toHaveText('თავისუფალი დღე');
  });
  test('the whole week fits the window; countdowns take a free Sunday (columns layout), else come under it', async ({ page, isMobile }) => {
    await openPortal(page, week(2), { url: '/tables/learningTables', now: '2026-11-18T10:45:00+04:00' });

    const grid = page.locator('.weeklist-container');
    await expect(grid.locator('.sx-lesson').first()).toBeVisible();
    await expect.poll(async () => (await grid.boundingBox()).y + (await grid.boundingBox()).height).toBeLessThanOrEqual(page.viewportSize().height);
    await expect(page.locator('[data-day="sun"]')).toBeHidden();
    if (isMobile) {
      const strip = await page.locator('.sx-exams').boundingBox();
      expect(strip.y).toBeGreaterThan((await grid.boundingBox()).y + (await grid.boundingBox()).height);
    } else {
      await expect(grid.locator(':scope > .sx-exams[data-col]')).toBeVisible();
      // The last column of the week, right after Friday (Saturday is free too), as tall as the days.
      const offset = async () => { // polled: the columns slide in
        const [strip, fri] = [await grid.locator('.sx-exams').boundingBox(), await page.locator('[data-day="fri"]').boundingBox()];
        return Math.max(Math.abs(strip.x - (fri.x + fri.width)), Math.abs(strip.height - fri.height));
      };
      await expect.poll(offset).toBeLessThan(2);
    }
  });

  test('after a reload the countdowns wait for the week instead of flashing at the top', async ({ page, isMobile }) => {
    test.skip(isMobile, 'phones keep the countdowns at the top');
    // The portal paints its calendar before the week's lessons arrive.
    const html = week(2);
    const empty = html.replace(/<div class="weeklist-container">[\s\S]*<\/div><\/div>\n<\/div><\/student-tables-component>/, '<div class="weeklist-container"></div></div>\n</div></student-tables-component>');
    await openPortal(page, empty, { url: '/tables/learningTables', now: '2026-11-18T10:45:00+04:00' });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    await expect(page.locator('.sx-exams')).toHaveCount(0);

    await page.evaluate((w) => { document.querySelector('.weeklist-container').outerHTML = new DOMParser().parseFromString(w, 'text/html').querySelector('.weeklist-container').outerHTML; }, html);
    await expect(page.locator('.weeklist-container > .sx-exams[data-col]')).toBeVisible();
    await expect(page.locator('student-tables-component > .sx-exams')).toHaveCount(0);
  });

  test('a Sunday with lessons keeps its column; the countdowns then come under the week', async ({ page }) => {
    await openPortal(page, week(2, [lesson('11:00', 'ფილოსოფია', '120')]), { url: '/tables/learningTables', now: '2026-11-18T10:45:00+04:00' });

    const grid = page.locator('.weeklist-container');
    await expect(page.locator('[data-day="sun"] .sx-lesson')).toHaveCount(1);
    await expect(grid.locator('.sx-exams')).toHaveCount(0);
    const strip = await page.locator('.sx-exams').boundingBox();
    expect(strip.y).toBeGreaterThan((await grid.boundingBox()).y + (await grid.boundingBox()).height);
  });

  test('hover: finished lessons stay dimmed until hovered; a stacked lesson opens to show all of it', async ({ page }) => {
    await openPortal(page, week(2), { url: '/tables/learningTables', now: '2026-11-18T12:15:00+04:00' });

    const algo = page.locator('[data-day="wed"] .sx-lesson').nth(1);
    await expect(algo).toHaveAttribute('data-status', 'done');
    await expect(algo).toHaveCSS('opacity', '0.5');
    const short = (await algo.boundingBox()).height;
    await algo.hover();
    await expect(algo).toHaveCSS('opacity', '1');
    await expect.poll(async () => (await algo.boundingBox()).height).toBeGreaterThan(short + 20);
  });
});
