const { test, expect } = require('@playwright/test');
const { openPortal } = require('./portal');

test.describe('grades and counters', () => {
  test('grade cells are tagged with the letter they show, not the portal class', async ({ page }) => {
    await openPortal(page, `
      <span class="result-color Result-F" id="a"> a </span>
      <span class="result-color Result-A" id="fx">fx</span>`);

    await expect(page.locator('#a')).toHaveAttribute('data-grade', 'A');
    await expect(page.locator('#fx')).toHaveAttribute('data-grade', 'FX');
  });

  test('a grade that changes later is re-tagged', async ({ page }) => {
    await openPortal(page, '<span class="result-color" id="g">B</span>');
    await expect(page.locator('#g')).toHaveAttribute('data-grade', 'B');

    await page.evaluate(() => { document.getElementById('g').textContent = 'C'; });

    await expect(page.locator('#g')).toHaveAttribute('data-grade', 'C');
  });

  test('only zero counters are marked as zero', async ({ page }) => {
    await openPortal(page, `
      <span class="notify" id="zero"> 0 </span>
      <span class="notify" id="three">3</span>
      <span class="mat-badge-content" id="ten">10</span>`);

    await expect(page.locator('#zero')).toHaveAttribute('data-sx-zero', '');
    await expect(page.locator('#three')).not.toHaveAttribute('data-sx-zero');
    await expect(page.locator('#ten')).not.toHaveAttribute('data-sx-zero');
  });

  test('a counter that drops to zero is marked, and unmarked when it rises again', async ({ page }) => {
    await openPortal(page, '<span class="notify" id="n">2</span>');
    const n = page.locator('#n');
    await expect(n).not.toHaveAttribute('data-sx-zero');

    await page.evaluate(() => { document.getElementById('n').textContent = '0'; });
    await expect(n).toHaveAttribute('data-sx-zero', '');

    await page.evaluate(() => { document.getElementById('n').textContent = '1'; });
    await expect(n).not.toHaveAttribute('data-sx-zero');
  });
});

test.describe('page flags', () => {
  for (const [cls, tag] of [['sx-tables', 'student-tables-component'], ['sx-ttdash', 'tables-dashboard-component'], ['sx-program', 'program-view']]) {
    test(`<${tag}> sets ${cls} and it is cleared when the page changes`, async ({ page }) => {
      await openPortal(page, `<${tag}></${tag}>`);
      const html = page.locator('html');
      await expect(html).toHaveClass(new RegExp(`\\b${cls}\\b`));

      await page.evaluate((t) => document.querySelector(t).remove(), tag);

      await expect(html).not.toHaveClass(new RegExp(`\\b${cls}\\b`));
    });
  }
});

test.describe('accessibility', () => {
  test('icon-only buttons get a readable label', async ({ page }) => {
    await openPortal(page, `
      <button id="dl"><mat-icon>download</mat-icon></button>
      <button id="unknown"><mat-icon>arrow_back</mat-icon></button>`);

    await expect(page.locator('#dl')).toHaveAttribute('aria-label', 'ჩამოტვირთვა');
    await expect(page.locator('#unknown')).toHaveAttribute('aria-label', 'arrow back');
  });

  test('buttons with their own text or label are not relabelled', async ({ page }) => {
    await openPortal(page, `
      <button id="text"><mat-icon>download</mat-icon> PDF</button>
      <button id="labelled" aria-label="Mine"><mat-icon>download</mat-icon></button>
      <button id="marker"></button>`);
    await expect(page.locator('html')).toHaveClass(/\bsx\b/);
    await page.waitForTimeout(450);

    await expect(page.locator('#text')).not.toHaveAttribute('aria-label');
    await expect(page.locator('#labelled')).toHaveAttribute('aria-label', 'Mine');
  });

  test('table cells carry their column title, for the card layout on phones', async ({ page }) => {
    await openPortal(page, `
      <student-logs-component>
        <mat-table>
          <mat-header-row>
            <mat-header-cell class="mat-column-date"> თარიღი </mat-header-cell>
            <mat-header-cell class="mat-column-action">მოქმედება</mat-header-cell>
          </mat-header-row>
          <mat-row>
            <mat-cell class="mat-column-date" id="date">11.11.2026</mat-cell>
            <mat-cell class="mat-column-action" id="action">შესვლა</mat-cell>
            <mat-cell class="mat-column-other" id="other">x</mat-cell>
          </mat-row>
        </mat-table>
      </student-logs-component>`);

    await expect(page.locator('mat-table')).toHaveClass(/\bsx-cards\b/);
    await expect(page.locator('#date')).toHaveAttribute('data-label', 'თარიღი');
    await expect(page.locator('#action')).toHaveAttribute('data-label', 'მოქმედება');
    await expect(page.locator('#other')).toHaveAttribute('data-label', '');
  });
});
