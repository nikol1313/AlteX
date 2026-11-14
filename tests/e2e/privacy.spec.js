const { test, expect } = require('@playwright/test');
const { openPortal, ORIGIN } = require('./portal');

const PAGES = {
  login: '<login-component><form class="login-form"><input formcontrolname="username"><input formcontrolname="password"></form></login-component>',
  timetable: '<student-tables-component></student-tables-component>',
  dashboard: '<user-menu-component></user-menu-component><dashboard-component><div class="dashboard-item-container"><a class="dashboard-item-wrapper" href="/calendar">ცხრილი</a></div></dashboard-component>',
};

test.describe('privacy: AlteX only talks to the portal', () => {
  for (const [name, body] of Object.entries(PAGES)) {
    test(`${name}: no request leaves ${new URL(ORIGIN).host}`, async ({ page }) => {
      const student = name === 'login' ? undefined : { id: 1, firstName: 'Test', currentProgram: { eduId: 1 } };
      const requests = await openPortal(page, body, { student });
      await expect(page.locator('html')).toHaveClass(/\bsx\b/);
      await page.waitForTimeout(1000);

      // chrome-extension: is AlteX's own bundled font files (fonts.css), not a network host.
      const local = ['chrome-extension:', 'data:', 'blob:'];
      const outside = requests.filter((u) => !u.startsWith(ORIGIN + '/') && !local.some((scheme) => u.startsWith(scheme)));
      expect(outside).toEqual([]);
    });
  }

  test('no page errors on a page AlteX does not know', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await openPortal(page, '<main><h1>Unknown page</h1></main>', { url: '/something-new' });
    await expect(page.locator('html')).toHaveClass(/\bsx\b/);
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
    await expect(page.locator('h1')).toHaveText('Unknown page');
  });
});
