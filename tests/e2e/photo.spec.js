const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

const IMG = '<img alt="" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" style="width:100%;height:100%">';
const PAGES = {
  registration: `<registration-routes-component><div class="student-avatar" style="width:120px;height:150px">${IMG}</div></registration-routes-component>`,
  profile: `<personal-data-component><div class="user-avatar-image" style="width:64px;height:64px">${IMG}</div></personal-data-component>`,
};

for (const [name, body] of Object.entries(PAGES)) {
  test(`${name}: the photo is blurred until its eye is pressed, and can be hidden again`, async ({ page }) => {
    await openPortal(page, body);
    const img = page.locator('img');
    const eye = page.locator('.sx-photo-eye');
    const blur = () => img.evaluate((i) => getComputedStyle(i).filter);

    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    expect(await blur()).toContain('blur');

    await eye.click();
    await expect(eye).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(blur).toBe('none');

    await eye.click();
    await expect(eye).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(blur).toContain('blur');
  });
}

test('the photo is blurred by the stylesheet alone, before any script touches it', async ({ page }) => {
  await openPortal(page, PAGES.registration);
  await page.evaluate(() => document.querySelector('.sx-photo-eye').remove());
  expect(await page.locator('img').evaluate((i) => getComputedStyle(i).filter)).toContain('blur');
});

test.describe('profile QR lightbox', () => {
  // The portal's button adds and removes the code box; here a stand-in does the same.
  const QR = `<personal-data-component><div class="card"><div class="doc-links"><span id="id">ID: 1</span><br><span id="group">ჯგუფი:</span><span></span></div><app-student-card-qr><div class="student-card-qr">
    <button type="button" onclick="const c = this.parentElement.querySelector('.student-card-qr__code'); if (c) c.remove(); else this.insertAdjacentHTML('afterend', '<div class=&quot;student-card-qr__code&quot;><qrcode><div class=&quot;qrcode&quot;><canvas width=&quot;180&quot; height=&quot;180&quot;></canvas></div></qrcode><div class=&quot;student-card-qr__note&quot;><span>note</span></div></div>')">QR</button>
  </div></app-student-card-qr></div></personal-data-component>`;

  test('opens over the whole page; a press on the code keeps it, a press beside it closes it', async ({ page }) => {
    await openPortal(page, QR);
    await page.locator('app-student-card-qr button').click();
    const veil = page.locator('.student-card-qr__code');
    await expect(veil).toHaveCSS('position', 'fixed');
    const size = page.viewportSize();
    const box = await veil.boundingBox();
    expect(Math.round(box.width)).toBe(size.width);
    expect(Math.round(box.height)).toBe(size.height);

    await page.locator('canvas').click();
    await expect(veil).toHaveCount(1);

    await page.mouse.click(8, 8);
    await expect(veil).toHaveCount(0);
  });

  test('Escape closes it; the empty group line is not shown', async ({ page }) => {
    await openPortal(page, QR);
    await expect(page.locator('#id')).toBeVisible();
    await expect(page.locator('#group')).toBeHidden();
    await page.locator('app-student-card-qr button').click();
    await expect(page.locator('.student-card-qr__code')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.student-card-qr__code')).toHaveCount(0);
  });
});
