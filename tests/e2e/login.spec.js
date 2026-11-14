const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

const LOGIN = `
  <login-component>
    <form class="login-form">
      <input formcontrolname="username">
      <input formcontrolname="password" type="password">
      <button type="submit">შესვლა</button>
    </form>
  </login-component>`;

test.describe('login page', () => {
  test('gets the AlteX brand panel next to the portal form', async ({ page }) => {
    await openPortal(page, LOGIN);

    await expect(page.locator('html')).toHaveClass(/\bsx\b/);
    await expect(page.locator('html')).toHaveClass(/\bsx-login\b/);
    const art = page.locator('login-component > .sx-login-art');
    await expect(art).toHaveCount(1);
    await expect(art.locator('.sx-la-brand')).toHaveText('AlteX');
    await expect(art.locator('.sx-la-col')).toHaveCount(5);
  });

  test('brand panel is decorative: hidden from screen readers', async ({ page }) => {
    await openPortal(page, LOGIN);

    await expect(page.locator('.sx-login-art')).toHaveAttribute('aria-hidden', 'true');
  });

  test('brand panel is mounted once, however often the portal re-renders', async ({ page }) => {
    await openPortal(page, LOGIN);
    await expect(page.locator('.sx-login-art')).toHaveCount(1);

    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => document.querySelector('.login-form').append(document.createElement('span')));
      await page.waitForTimeout(450); // one full pass gap (400 ms on phones)
    }

    await expect(page.locator('.sx-login-art')).toHaveCount(1);
  });

  test('the portal form itself is left in place and usable', async ({ page }) => {
    await openPortal(page, LOGIN);
    await expect(page.locator('.sx-login-art')).toHaveCount(1);

    await page.locator('input[formcontrolname="username"]').fill('01000000000');
    await page.locator('input[formcontrolname="password"]').fill('not-a-real-password');

    await expect(page.locator('input[formcontrolname="username"]')).toHaveValue('01000000000');
    await expect(page.getByRole('button', { name: 'შესვლა' })).toBeEnabled();
  });

  test('login page classes are removed when the portal leaves the login page', async ({ page }) => {
    await openPortal(page, LOGIN);
    await expect(page.locator('html')).toHaveClass(/\bsx-login\b/);

    await page.evaluate(() => document.querySelector('login-component').remove());

    await expect(page.locator('html')).not.toHaveClass(/\bsx-login\b/);
  });
});
