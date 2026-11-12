// Renders pwa/icons/icon.svg to the PNG sizes the manifest and iOS need. Run: npm run icons (needs Playwright).
'use strict';
const { chromium } = require('playwright');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const dir = path.join(__dirname, '../pwa/icons/');
(async () => {
const svg = await readFile(dir + 'icon.svg', 'utf8');
// [file, size, inner scale]: "any" icons fill the tile; maskable keeps the mark inside the 80% safe zone.
const outputs = [['icon-192.png', 192, 1], ['icon-512.png', 512, 1], ['maskable-512.png', 512, 0.8], ['apple-touch-icon.png', 180, 1], ['favicon-32.png', 32, 1]];
const browser = await chromium.launch();
for (const [file, size, scale] of outputs) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const mark = svg.replace('<g ', `<g transform="translate(256 256) scale(${scale}) translate(-256 -256)" `);
  await page.setContent(`<style>html,body{margin:0;background:#1C1E1F}svg{display:block;width:${size}px;height:${size}px}</style>${mark}`);
  await page.screenshot({ path: dir + file, omitBackground: false });
  await page.close();
}
await browser.close();
console.log('icons written to', dir);
})();
