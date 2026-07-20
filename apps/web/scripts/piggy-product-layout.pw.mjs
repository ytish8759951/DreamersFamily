import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const repoRoot = resolve(appRoot, '..', '..');
const artifactDir = resolve(repoRoot, 'artifacts', 'piggy-product-layout');

test.describe('piggy product card layout', () => {
  for (const viewport of [
    { name: 'ipad-landscape', width: 1024, height: 768 },
    { name: 'ipad-portrait', width: 768, height: 1024 }
  ]) {
    test(`${viewport.name} keeps status action inside product card`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mkdir(artifactDir, { recursive: true });
      const css = await readFile(resolve(appRoot, 'src', 'styles', 'index.css'), 'utf8');
      const fixturePath = resolve(artifactDir, `${viewport.name}.html`);
      await writeFile(fixturePath, buildFixture(css), 'utf8');

      await page.goto(pathToFileURL(fixturePath).href);
      await page.screenshot({ path: resolve(artifactDir, `${viewport.name}.png`), fullPage: true });

      const measurements = await page.$$eval('.piggy-v2-product-card', (cards) =>
        cards.map((card) => {
          const round = (value) => Math.round(value * 100) / 100;
          const rect = (domRect) => ({
            top: round(domRect.top),
            right: round(domRect.right),
            bottom: round(domRect.bottom),
            left: round(domRect.left),
            width: round(domRect.width),
            height: round(domRect.height)
          });
          const action = card.querySelector('.piggy-v2-product-action');
          const button = action?.querySelector('button');
          const cardRect = card.getBoundingClientRect();
          const actionRect = action?.getBoundingClientRect();
          const buttonRect = button?.getBoundingClientRect();
          const actionStyle = action ? getComputedStyle(action) : null;
          const buttonStyle = button ? getComputedStyle(button) : null;
          return {
            label: button?.textContent?.trim() ?? '',
            card: rect(cardRect),
            action: actionRect ? rect(actionRect) : null,
            button: buttonRect ? rect(buttonRect) : null,
            actionStyle: actionStyle ? {
              display: actionStyle.display,
              visibility: actionStyle.visibility,
              opacity: actionStyle.opacity
            } : null,
            buttonStyle: buttonStyle ? {
              display: buttonStyle.display,
              visibility: buttonStyle.visibility,
              opacity: buttonStyle.opacity
            } : null
          };
        })
      );

      await writeFile(resolve(artifactDir, `${viewport.name}-measurements.json`), JSON.stringify(measurements, null, 2), 'utf8');
      expect(measurements.map((item) => item.label)).toEqual(['購買', '存款不足', '等待到貨', '已到貨']);

      for (const item of measurements) {
        expect(item.action, item.label).not.toBeNull();
        expect(item.button, item.label).not.toBeNull();
        expect(item.action.top, item.label).toBeGreaterThanOrEqual(item.card.top);
        expect(item.action.bottom, item.label).toBeLessThanOrEqual(item.card.bottom);
        expect(item.action.width, item.label).toBeGreaterThan(0);
        expect(item.action.height, item.label).toBeGreaterThan(0);
        expect(item.button.top, item.label).toBeGreaterThanOrEqual(item.card.top);
        expect(item.button.bottom, item.label).toBeLessThanOrEqual(item.card.bottom);
        expect(item.button.width, item.label).toBeGreaterThan(0);
        expect(item.button.height, item.label).toBeGreaterThan(0);
        expect(item.actionStyle.display, item.label).not.toBe('none');
        expect(item.actionStyle.visibility, item.label).not.toBe('hidden');
        expect(Number(item.actionStyle.opacity), item.label).not.toBe(0);
        expect(item.buttonStyle.display, item.label).not.toBe('none');
        expect(item.buttonStyle.visibility, item.label).not.toBe('hidden');
        expect(Number(item.buttonStyle.opacity), item.label).not.toBe(0);
      }
    });
  }
});

function buildFixture(appCss) {
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>${appCss}</style>
  <style>
    body { margin: 0; background: #fff7ed; }
    .piggy-v2-page { --piggy-v2-scale: 1; --v2-shelf-grid-column-gap: 28px; --v2-shelf-grid-row-gap: 6px; --v2-shelf-grid-w: 286px; --v2-shelf-grid-h: 528px; --piggy-v2-white: #fff; --piggy-v2-line: #eee3d4; --piggy-v2-text: #2e2e2e; --piggy-v2-radius-pill: 999px; --piggy-v2-shadow-hover: 0 14px 30px rgba(77, 59, 35, .1); min-height: 100dvh; }
    .piggy-v2-shelf { position: relative; width: 286px; height: 588px; margin: 32px auto; }
    .piggy-v2-shelf-grid { position: absolute; left: 0; top: 58px; }
    .piggy-v2-product-card img { background: linear-gradient(135deg, #f6d365, #fda085); }
  </style>
</head>
<body>
  <section class="piggy-v2-page">
    <section class="piggy-v2-shelf" aria-label="商品架">
      <div class="piggy-v2-shelf-grid" aria-label="展示商品">
        ${productCard('超長商品名稱測試兩行省略仍顯示按鈕', '$100', '購買', '')}
        ${productCard('222', '$999', '存款不足', '')}
        ${productCard('等待商品', '$50', '等待到貨', 'is-purchased')}
        ${productCard('到貨商品', '$80', '已到貨', '')}
      </div>
    </section>
  </section>
</body>
</html>`;
}

function productCard(name, price, label, stateClass) {
  const disabled = label === '存款不足' || label === '等待到貨' ? ' disabled' : '';
  return `<article class="piggy-v2-product-card ${stateClass}">
    <img alt="${name}" />
    <strong title="${name}" aria-label="${name}">${name}</strong>
    <span>${price}</span>
    <div class="piggy-v2-product-action"><button type="button"${disabled}>${label}</button></div>
  </article>`;
}
