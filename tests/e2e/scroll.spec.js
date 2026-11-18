const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

// Smooth wheel scrolling (Lenis, mouse devices only) must never cap the page at an old height.
test('the wheel scrolls content that arrived just before it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'touch keeps the native scroll; Lenis only runs with a mouse');
  await openPortal(page, '<app-root><div></div><div class="all-page-container"><p>short</p></div></app-root>');
  await expect(page.locator('html')).toHaveClass(/lenis/);
  // The section's content lands, and the wheel turns within Lenis's own 250ms re-measure delay.
  await page.evaluate(() => { const d = document.createElement('div'); d.style.height = '4000px'; document.querySelector('.all-page-container').append(d); });
  await page.mouse.move(400, 300);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
});
