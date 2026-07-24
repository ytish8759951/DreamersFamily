import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const styles = await readFile(resolve(appRoot, 'src', 'styles', 'index.css'), 'utf8');

const viewports = [
  { name: 'iphone-320', width: 320, height: 568, expectedColumns: 2 },
  { name: 'iphone-375', width: 375, height: 667, expectedColumns: 2 },
  { name: 'iphone-390', width: 390, height: 844, expectedColumns: 2 },
  { name: 'iphone-430', width: 430, height: 932, expectedColumns: 2 },
  { name: 'ipad-portrait', width: 768, height: 1024, expectedColumns: 2 },
  { name: 'ipad-landscape', width: 1024, height: 768, expectedColumns: 4 }
];

for (const viewport of viewports) {
  test(`drawing share layout fits ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.setContent(html());
    await expect(page.getByRole('button', { name: /畫板分享/ })).toBeVisible();

    const geometry = await page.evaluate(() => {
      const doc = document.documentElement;
      const cards = [...document.querySelectorAll('.v1-share-action')].map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), width: Math.round(rect.width) };
      });
      const firstRowTop = cards[0].top;
      const firstRowCount = cards.filter((card) => Math.abs(card.top - firstRowTop) <= 2).length;
      const canvas = document.querySelector('.child-drawing-canvas-wrap canvas');
      const canvasStyle = window.getComputedStyle(canvas);
      const wrap = document.querySelector('.child-drawing-canvas-wrap').getBoundingClientRect();
      const submit = document.querySelector('.child-drawing-header .ds-primary-button').getBoundingClientRect();
      return {
        clientWidth: doc.clientWidth,
        scrollWidth: doc.scrollWidth,
        firstRowCount,
        cards,
        canvasTouchAction: canvasStyle.touchAction,
        canvasRatio: Number((wrap.width / wrap.height).toFixed(2)),
        submitHeight: submit.height
      };
    });

    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    expect(geometry.firstRowCount).toBe(viewport.expectedColumns);
    expect(geometry.canvasTouchAction).toBe('none');
    expect(geometry.canvasRatio).toBeCloseTo(4 / 3, 1);
    expect(geometry.submitHeight).toBeGreaterThanOrEqual(44);
    for (const card of geometry.cards) {
      expect(card.left).toBeGreaterThanOrEqual(0);
      expect(card.right).toBeLessThanOrEqual(geometry.clientWidth);
      expect(card.width).toBeGreaterThan(90);
    }
  });
}

function html() {
  return `
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>${styles}</style>
      </head>
      <body>
        <div class="v1-page v2-share-page">
          <section class="v1-panel v2-share-actions-panel">
            <div class="v1-share-actions">
              ${card('📷', '照片分享', '選擇本機照片', 'blue')}
              ${card('🎤', '語音分享', '直接錄音分享', 'green')}
              ${card('🎬', '影片分享', '選擇本機影片', 'yellow')}
              ${card('🎨', '畫板分享', '自由畫畫、蓋印章並分享作品', 'pink')}
            </div>
          </section>
          <section class="child-drawing-board">
            <header class="child-drawing-header">
              <button type="button">返回分享頁</button>
              <div><small>畫板分享</small><h2>自由畫畫、蓋印章並分享作品</h2></div>
              <button type="button" class="ds-primary-button">送出分享</button>
            </header>
            <div class="child-drawing-layout">
              <aside class="child-drawing-tools"><button>一般畫筆</button><button>印章</button></aside>
              <main class="child-drawing-workspace">
                <div class="child-drawing-canvas-wrap"><canvas></canvas></div>
              </main>
            </div>
          </section>
        </div>
      </body>
    </html>
  `;
}

function card(art, title, subtitle, tone) {
  return `
    <button type="button" class="v1-share-action v1-tone-${tone}">
      <span class="v2-action-art"><b>${art}</b></span>
      <strong>${title}</strong>
      <small>${subtitle}</small>
    </button>
  `;
}
