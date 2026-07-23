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

for (const viewport of viewports) {
  test(`parent mailbox submit button is fully tappable on ${viewport.name}`, async ({ page }) => {
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
                <section class="local-form-dialog mailbox-form-dialog" role="dialog" aria-modal="true">
                  <header><div><small>Supabase</small><h2>發送圖片訊息</h2></div><button type="button">x</button></header>
                  <form>
                    <label>收件孩子<select><option>QA Child</option></select></label>
                    <label>訊息類型<select><option>圖片訊息</option></select></label>
                    <label class="is-full">標題<input /></label>
                    <label class="is-full">內容<textarea rows="3"></textarea></label>
                    <label class="is-full">圖片拍照／圖庫選取<input type="file" /></label>
                    <figure class="mailbox-image-preview">
                      <img alt="preview" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 240'%3E%3Crect width='320' height='240' fill='%237a8f6e'/%3E%3C/svg%3E" />
                      <figcaption>ios-camera.jpg · 128 KB</figcaption>
                    </figure>
                    <p class="local-form-status">圖片上傳中</p>
                    <div style="height: 520px"></div>
                    <footer>
                      <button type="button">取消</button>
                      <button class="ds-primary-button" type="submit">送給孩子</button>
                    </footer>
                  </form>
                </section>
              </div>
            </main>
            <nav class="ds-bottom-nav"><a>首頁</a><a class="is-active">信箱</a></nav>
          </div>
        </body>
      </html>
    `);

    const submit = page.getByRole('button', { name: '送給孩子' });
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
      return {
        rect: { bottom: rect.bottom, height: rect.height },
        visibleHeight: window.innerHeight,
        pointerEvents: getComputedStyle(button).pointerEvents,
        allPointsHitButton: points.every(([x, y]) => {
          const element = document.elementFromPoint(x, y);
          return element === button || button.contains(element);
        })
      };
    });

    expect(result.rect.height).toBeGreaterThanOrEqual(52);
    expect(result.rect.bottom).toBeLessThanOrEqual(result.visibleHeight);
    expect(result.pointerEvents).toBe('auto');
    expect(result.allPointsHitButton).toBe(true);
  });
}

const specialDayViewports = [
  { name: '320x568', width: 320, height: 568, mobile: true },
  { name: '375x667', width: 375, height: 667, mobile: true },
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '430x932', width: 430, height: 932, mobile: true },
  { name: 'ipad-portrait', width: 820, height: 1180, mobile: false },
  { name: 'ipad-landscape', width: 1180, height: 820, mobile: false }
];

for (const viewport of specialDayViewports) {
  test(`parent special days layout has no horizontal overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.setContent(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <style>${styles}</style>
        </head>
        <body>
          <main class="special-days-page">
            <header class="special-days-hero">
              <div><span>♡</span><h1>重要日子</h1><p>記錄家庭旅行、表演日與生日提醒</p></div>
              <button type="button">新增重要日子</button>
            </header>
            <div class="special-filter-bar">
              <section class="special-filter-group">
                <strong>孩子</strong>
                <div class="special-filter-tabs"><button class="is-active">QA Child</button><button>Second Child</button></div>
              </section>
            </div>
            <section class="special-days-stats">
              <article class="is-green"><span>📅</span><small>即將到來</small><strong>2 筆</strong></article>
              <article class="is-blue"><span>🕰</span><small>歷史回顧</small><strong>1 筆</strong></article>
              <article class="is-pink"><span>⭐</span><small>最近重要日子</small><strong>3 筆</strong></article>
            </section>
            <section class="special-days-grid">
              <article class="special-panel special-upcoming">
                <header><h2>即將到來</h2><small>2 筆</small></header>
                <section class="special-day-card is-family_event">
                  <img alt="trip" src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 120 120'%3E%3Crect width='120' height='120' fill='%23d27a5f'/%3E%3C/svg%3E" />
                  <div><small>家庭活動 · QA Child · 家長新增</small><strong>家庭旅行與很長很長的活動名稱</strong><p>手機上文字要自然換行，不能遮住倒數。</p><time>2026-08-01</time></div>
                  <b>9 天</b>
                  <footer><button>管理生日</button><button>刪除</button></footer>
                </section>
              </article>
              <article class="special-panel special-recent">
                <header><h2>最近重要日子</h2><small>3 筆</small></header>
                <section class="special-day-card is-other"><span>⭐</span><div><small>其他 · QA Child</small><strong>我的表演日</strong><p>備註文字</p><time>2026-07-23</time></div><b>今天</b><footer><button>管理生日</button></footer></section>
              </article>
              <article class="special-panel special-history">
                <header><h2>歷史回顧</h2><small>1 筆</small></header>
                <section class="special-day-card is-anniversary"><span>🕰</span><div><small>紀念日 · QA Child</small><strong>上次露營</strong><p>歷史內容</p><time>2026-01-10</time></div><b>已過</b><footer><button>管理生日</button></footer></section>
              </article>
              <article class="special-panel special-notifications">
                <header><h2>站內通知</h2><small>1 則</small></header>
                <section class="special-day-card is-other"><span>🔔</span><div><small>QA Child</small><strong>家長新增了一個重要日子</strong><p>通知內容在手機版不可超出。</p><time>2026-07-23</time></div></section>
              </article>
            </section>
          </main>
        </body>
      </html>
    `);

    const metrics = await page.evaluate((isMobile) => {
      const documentElement = document.documentElement;
      const body = document.body;
      const panels = [...document.querySelectorAll('.special-panel')].map((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width, top: rect.top };
      });
      window.scrollTo(0, document.body.scrollHeight);
      return {
        scrollWidth: Math.max(documentElement.scrollWidth, body.scrollWidth),
        clientWidth: documentElement.clientWidth,
        panels,
        mobileOrderOk: !isMobile || panels.every((panel, index) => index === 0 || panel.top >= panels[index - 1].top),
        bottomReachable: window.scrollY + window.innerHeight >= document.body.scrollHeight - 2
      };
    }, viewport.mobile);

    const buttons = page.locator('.special-day-card footer button');
    for (let index = 0; index < await buttons.count(); index += 1) {
      const button = buttons.nth(index);
      await button.scrollIntoViewIfNeeded();
      const hit = await button.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return rect.width > 0 && rect.height > 0 && (target === element || element.contains(target));
      });
      expect(hit).toBe(true);
    }

    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1);
    expect(metrics.panels.every((panel) => panel.left >= -1 && panel.right <= metrics.clientWidth + 1)).toBe(true);
    expect(metrics.mobileOrderOk).toBe(true);
    expect(metrics.bottomReachable).toBe(true);
  });
}
