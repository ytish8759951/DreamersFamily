import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const styles = await readFile(resolve(appRoot, 'src', 'styles', 'index.css'), 'utf8');

const viewports = [
  { name: 'iphone-portrait', width: 390, height: 844, isMobile: true },
  { name: 'ipad-portrait', width: 820, height: 1180, isMobile: true },
  { name: 'ipad-landscape', width: 1180, height: 820, isMobile: false }
];

for (const viewport of viewports) {
  test(`piggy product dialog submit is fully tappable on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.setContent(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>${styles}</style>
        </head>
        <body>
          <div class="ds-shell">
            <main class="ds-parent-main">
              <div class="local-form-backdrop">
                <section class="local-form-dialog piggy-product-dialog" role="dialog" aria-modal="true">
                  <header><div><small>Supabase</small><h2>新增商品</h2></div><button type="button">x</button></header>
                  <form>
                    <div class="piggy-product-form-scroll">
                      <label class="is-full">商品名稱<input value="E2E 商品" /></label>
                      <label>價格<input value="100" /></label>
                      <label>狀態<select><option>商品架</option></select></label>
                      <label class="is-full piggy-upload-field">主圖<input type="file" /></label>
                      <figure class="piggy-selected-photo-preview">
                        <img alt="preview" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 90'%3E%3Crect width='120' height='90' fill='%23698f6b'/%3E%3C/svg%3E" />
                        <figcaption><b>ios-camera.jpg</b><small>128 KB · 1/1</small></figcaption>
                      </figure>
                      <label class="is-full piggy-upload-field">其他圖片，最多 5 張<input type="file" /></label>
                      <div style="height: 620px"></div>
                      <p class="local-form-status">5 張其他圖片已選擇</p>
                      <div class="piggy-product-form-bottom-spacer" aria-hidden="true"></div>
                    </div>
                    <footer>
                      <button type="button">取消</button>
                      <button class="ds-primary-button piggy-product-save-button" type="submit">儲存商品</button>
                    </footer>
                  </form>
                </section>
              </div>
            </main>
            <nav class="ds-bottom-nav"><a>首頁</a><a class="is-active">撲滿</a><a>設定</a></nav>
          </div>
        </body>
      </html>
    `);

    const submit = page.getByRole('button', { name: '儲存商品' });
    await expect(submit).toBeVisible();
    const result = await submit.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const points = [
        [rect.left + rect.width / 2, rect.top + rect.height / 2],
        [rect.left + 6, rect.top + 6],
        [rect.right - 6, rect.top + 6],
        [rect.left + 6, rect.bottom - 6],
        [rect.right - 6, rect.bottom - 6]
      ];
      const topElements = points.map(([x, y]) => document.elementFromPoint(x, y));
      return {
        rect: { top: rect.top, bottom: rect.bottom, height: rect.height, width: rect.width },
        visibleHeight: window.innerHeight,
        allPointsHitButton: topElements.every((element) => element === button || button.contains(element)),
        pointerEvents: getComputedStyle(button).pointerEvents
      };
    });
    const layering = await page.evaluate(() => ({
      backdropZ: Number(getComputedStyle(document.querySelector('.local-form-backdrop')).zIndex),
      navZ: Number(getComputedStyle(document.querySelector('.ds-bottom-nav')).zIndex || 0),
      footerZ: Number(getComputedStyle(document.querySelector('.piggy-product-dialog footer')).zIndex)
    }));

    expect(result.rect.height).toBeGreaterThanOrEqual(52);
    expect(result.rect.bottom).toBeLessThanOrEqual(result.visibleHeight);
    expect(layering.backdropZ).toBeGreaterThan(layering.navZ);
    expect(layering.footerZ).toBeGreaterThanOrEqual(4);
    expect(result.pointerEvents).toBe('auto');
    expect(result.allPointsHitButton).toBe(true);
  });
}

test('completed child tasks render as image-only thumbnails without card shell', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.setContent(`
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>${styles}</style>
      </head>
      <body>
        <main class="v1-page v2-task-page">
          <section class="v1-panel child-task-history child-completed-task-history">
            <header class="v1-section-heading"><h2>完成的任務</h2></header>
            <div class="child-completed-task-grid child-task-carousel" aria-label="完成的任務">
              <article class="child-completed-task-card">
                <button type="button" class="child-completed-task-image-button" aria-label="查看完成任務圖片">
                  <span class="child-completed-task-media v1-tone-yellow">
                    <img alt="任務圖片" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23698f6b'/%3E%3C/svg%3E" />
                  </span>
                </button>
                <strong>不應顯示</strong><span class="child-completed-check">完成</span><time>今天</time>
              </article>
            </div>
          </section>
        </main>
      </body>
    </html>
  `);

  const card = page.locator('.child-completed-task-card').first();
  const media = page.locator('.child-completed-task-media').first();
  const hiddenText = page.locator('.child-completed-task-card strong').first();
  const cardStyles = await card.evaluate((element) => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      background: style.backgroundColor,
      borderWidth: style.borderWidth,
      boxShadow: style.boxShadow,
      paddingTop: style.paddingTop,
      width: rect.width,
      height: rect.height
    };
  });
  const mediaStyles = await media.evaluate((element) => {
    const style = getComputedStyle(element);
    const imgStyle = getComputedStyle(element.querySelector('img'));
    const rect = element.getBoundingClientRect();
    return {
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity,
      width: rect.width,
      height: rect.height,
      borderRadius: style.borderRadius,
      objectFit: imgStyle.objectFit
    };
  });

  expect(cardStyles.background).toBe('rgba(0, 0, 0, 0)');
  expect(cardStyles.borderWidth).toBe('0px');
  expect(cardStyles.boxShadow).toBe('none');
  expect(cardStyles.paddingTop).toBe('0px');
  expect(Math.abs(cardStyles.width - cardStyles.height)).toBeLessThanOrEqual(1);
  expect(Math.abs(mediaStyles.width - mediaStyles.height)).toBeLessThanOrEqual(1);
  expect(mediaStyles.display).not.toBe('none');
  expect(mediaStyles.visibility).not.toBe('hidden');
  expect(mediaStyles.opacity).not.toBe('0');
  expect(mediaStyles.width).toBeGreaterThanOrEqual(110);
  expect(mediaStyles.width).toBeLessThanOrEqual(130);
  expect(mediaStyles.objectFit).toBe('cover');
  await expect(hiddenText).toBeHidden();
});
