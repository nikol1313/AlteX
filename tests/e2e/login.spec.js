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

// The portal's password step: submitting posts to /student/login; on a wrong password it answers without an error
// text and shows nothing.
const PASSWORD_STEP = `
  <login-component>
    <form class="login-form step-2" onsubmit="event.preventDefault(); fetch('/student/login', { method: 'POST' })">
      <input formcontrolname="username" value="01000000000">
      <div class="ini-form-field step-2-form"><input formcontrolname="password" type="password"></div>
      <div class="buttonWrapper"><button type="submit">შესვლა</button></div>
    </form>
  </login-component>`;

test.describe('wrong password', () => {
  test('says the password is wrong once the portal answers, and clears when typing again', async ({ page }) => {
    await openPortal(page, PASSWORD_STEP, { api: { '/student/login': { result: 'no' } } });
    await page.locator('input[formcontrolname="password"]').fill('wrong-test-password');
    await page.getByRole('button', { name: 'შესვლა' }).click();

    const msg = page.getByRole('alert');
    await expect(msg).toHaveText(/პაროლი არასწორია/);
    await page.locator('input[formcontrolname="password"]').press('a');
    await expect(msg).toHaveCount(0);
  });

  test('says the server could not be reached when the portal fails', async ({ page }) => {
    await openPortal(page, PASSWORD_STEP);
    await page.route('**/student/login', (r) => r.fulfill({ status: 502, body: '' }));
    await page.locator('input[formcontrolname="password"]').fill('wrong-test-password');
    await page.getByRole('button', { name: 'შესვლა' }).click();

    await expect(page.getByRole('alert')).toHaveText(/სერვერთან კავშირი/);
  });

  test('stays quiet when the portal shows its own dialog', async ({ page }) => {
    await openPortal(page, PASSWORD_STEP + '<div class="cdk-overlay-container"><div class="cdk-overlay-pane"><p>portal error</p></div></div>', { api: { '/student/login': { error: 'x' } } });
    await page.locator('input[formcontrolname="password"]').fill('wrong-test-password');
    await page.getByRole('button', { name: 'შესვლა' }).click();
    await page.waitForTimeout(1500);

    await expect(page.locator('.sx-login-error')).toHaveCount(0);
  });
});

// After signing in, a scroll lock left behind with nothing open (body overflow hidden, or Material's scroll block)
// kept the page from scrolling until the app restarted.
const DASH = `<user-menu-component></user-menu-component><div class="all-page-container"><dashboard-component>${'<p style="height:200px">row</p>'.repeat(20)}</dashboard-component></div>`;
test.describe('scroll lock after signing in', () => {
  test('is released when no dialog or menu is open', async ({ page }) => {
    await openPortal(page, DASH, { student: { id: 1, firstName: 'T' }, storage: { 'sx-welcome-off:1': '1' } });
    await page.evaluate(() => {
      document.body.style.overflow = 'hidden';
      document.documentElement.classList.add('cdk-global-scrollblock');
      document.body.append(document.createElement('span')); // any portal change runs a pass
    });

    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).toBe('');
    await expect(page.locator('html')).not.toHaveClass(/cdk-global-scrollblock/);
    await page.evaluate(() => window.scrollTo(0, 600));
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(500);
  });

  test('is kept while a portal dialog is open', async ({ page }) => {
    await openPortal(page, DASH + '<div class="cdk-overlay-container"><div class="cdk-overlay-pane"><p>dialog</p></div></div>', { student: { id: 1, firstName: 'T' }, storage: { 'sx-welcome-off:1': '1' } });
    await page.evaluate(() => { document.body.style.overflow = 'hidden'; document.body.append(document.createElement('span')); });
    await page.waitForTimeout(800);

    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  });
});

// The portal shows a wrong ID or password through its alert-dialog ("Ok"), the same component as the notice popup
// AlteX closes on every visit ("ნახვა"). Hiding every alert left the error unseen, and the open dialog kept the
// page from scrolling.
const alert = (title, button) => `<div class="cdk-overlay-container"><div class="cdk-overlay-backdrop cdk-overlay-backdrop-showing"></div><div class="cdk-overlay-pane"><mat-dialog-container class="mat-mdc-dialog-container"><div class="mat-mdc-dialog-surface"><alert-dialog><h3 class="mat-mdc-dialog-title"><span>${title}</span></h3><div class="mat-mdc-dialog-content">პაროლი არასწორია</div><div class="mat-mdc-dialog-actions"><button>${button}</button></div></alert-dialog></div></mat-dialog-container></div></div>`;
test.describe('portal alerts', () => {
  test('an error alert (wrong ID or password) is shown', async ({ page }) => {
    await openPortal(page, PASSWORD_STEP + alert('info', 'Ok'));
    await expect(page.locator('alert-dialog')).toHaveAttribute('data-sx-shown', '');
    await expect(page.locator('.cdk-overlay-container')).toHaveCSS('visibility', 'visible');
    await expect(page.getByRole('button', { name: 'Ok' })).toBeVisible();
  });

  test('the notice popup is closed without ever showing', async ({ page }) => {
    await openPortal(page, DASH + alert('შეტყობინება', 'ნახვა'), { student: { id: 1, firstName: 'T' }, storage: { 'sx-welcome-off:1': '1' } });
    await expect(page.locator('alert-dialog')).toHaveAttribute('data-sx-closed', '');
    await expect(page.locator('.cdk-overlay-container')).toHaveCSS('visibility', 'hidden');
  });
});
