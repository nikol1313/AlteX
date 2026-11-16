const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

const HEADER = '<user-menu-component><div class="user-area-wrapper navbar"><a class="user-area" href="/dashboard"><div class="company-logo"></div></a><div class="user-menu-top"><div class="user-menu" onclick="window.menuOpened = true"><span class="userName">Nika</span></div></div></div></user-menu-component>';

test.describe('light / dark switch', () => {
  test('dark by default; every press flips at once, however fast', async ({ page }) => {
    await openPortal(page, HEADER);
    const html = page.locator('html');
    const sw = page.locator('.sx-theme');
    await expect(html).toHaveAttribute('data-sx-theme', 'dark');
    await expect(sw).toHaveAttribute('aria-checked', 'false');

    await sw.click();
    await expect(html).toHaveAttribute('data-sx-theme', 'light');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)).toBe('light');

    for (let i = 0; i < 7; i++) await sw.dispatchEvent('pointerdown', { button: 0 });
    await expect(html).toHaveAttribute('data-sx-theme', 'dark');
    expect(await page.evaluate(() => window.menuOpened)).toBeUndefined();
  });

  test('the choice is kept for the next visit', async ({ page }) => {
    await openPortal(page, HEADER, { storage: { 'sx-theme': 'light' } });
    await expect(page.locator('html')).toHaveAttribute('data-sx-theme', 'light');
    await expect(page.locator('.sx-theme')).toHaveAttribute('aria-checked', 'true');
  });
});
