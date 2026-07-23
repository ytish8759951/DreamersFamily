import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const repoRoot = resolve(appRoot, '..', '..');
const styles = await readFile(resolve(appRoot, 'src', 'styles', 'index.css'), 'utf8');
const screenshotDir = resolve(repoRoot, 'artifacts', 'parent-mobile-regression');

const routes = [
  { path: '/parent', label: 'Parent index redirect', kind: 'share' },
  { path: '/parent/tasks', label: '任務管理', kind: 'tasks', modal: 'task' },
  { path: '/parent/share', label: '今日分享', kind: 'share' },
  { path: '/parent/dreams', label: '撲滿／商品兌換', kind: 'piggy', modal: 'product' },
  { path: '/parent/wishes', label: 'wishes redirect', kind: 'piggy' },
  { path: '/parent/badges', label: 'badges redirect', kind: 'children' },
  { path: '/parent/honor-wall', label: 'honor-wall redirect', kind: 'children' },
  { path: '/parent/screen-time', label: '平板時間', kind: 'screen-time', modal: 'screen-time' },
  { path: '/parent/special-days', label: '重要日子', kind: 'special-days', modal: 'special-day' },
  { path: '/parent/growth', label: '成長紀錄', kind: 'growth', modal: 'growth' },
  { path: '/parent/memory-book', label: '成長回憶書', kind: 'memory-book' },
  { path: '/parent/mailbox', label: '信箱／寫給孩子', kind: 'mailbox', modal: 'mailbox' },
  { path: '/parent/cards', label: 'cards redirect', kind: 'mailbox' },
  { path: '/parent/children', label: '孩子管理／徽章榮譽牆', kind: 'children', modal: 'child' },
  { path: '/parent/settings', label: '家長設定', kind: 'settings', modal: 'settings' }
];

const viewports = [
  { name: '320x568', width: 320, height: 568, screenshot: true },
  { name: '375x667', width: 375, height: 667 },
  { name: '390x844', width: 390, height: 844 },
  { name: '430x932', width: 430, height: 932 },
  { name: 'ipad-portrait', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1180, height: 820 }
];

test.beforeAll(async () => {
  await mkdir(screenshotDir, { recursive: true });
});

for (const route of routes) {
  for (const viewport of viewports) {
    test(`parent mobile route ${route.path} fits ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await renderParentPage(page, route);
      await assertNoPageOverflow(page);
      await assertVisibleContentFits(page);
      await assertPrimaryButtonsTappable(page);
      await assertDrawerUsable(page);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      const bottomReachable = await page.evaluate(() => window.scrollY + window.innerHeight >= document.body.scrollHeight - 2);
      expect(bottomReachable).toBe(true);
      if (viewport.screenshot) {
        await page.screenshot({ path: resolve(screenshotDir, `${slug(route.path)}-${viewport.name}.png`), fullPage: true });
      }
    });
  }

  if (route.modal) {
    test(`parent modal ${route.path} is scrollable and tappable on iPhone`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await renderParentPage(page, route, true);
      await assertNoPageOverflow(page);
      const dialog = page.locator('.local-form-backdrop .local-form-dialog').last();
      await expect(dialog).toBeVisible();
      await dialog.locator('form').evaluate((form) => { form.scrollTop = form.scrollHeight; });
      const submit = dialog.locator('footer button.ds-primary-button, footer button[type="submit"]').last();
      await expect(submit).toBeVisible();
      const hit = await submit.evaluate((button) => {
        const rect = button.getBoundingClientRect();
        const points = [
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
          [rect.left + 6, rect.top + 6],
          [rect.right - 6, rect.bottom - 6]
        ];
        return {
          height: rect.height,
          bottom: rect.bottom,
          viewport: window.innerHeight,
          hit: points.every(([x, y]) => {
            const element = document.elementFromPoint(x, y);
            return element === button || button.contains(element);
          })
        };
      });
      expect(hit.height).toBeGreaterThanOrEqual(44);
      expect(hit.bottom).toBeLessThanOrEqual(hit.viewport);
      expect(hit.hit).toBe(true);
      await page.screenshot({ path: resolve(screenshotDir, `${slug(route.path)}-modal-390x844.png`), fullPage: true });
    });
  }
}

async function renderParentPage(page, route, withModal = false) {
  await page.setContent(`
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style>${styles}</style>
      </head>
      <body>
        <div id="root">
          <div class="ph-shell">
            <aside class="ph-sidebar" aria-label="家長導覽">
              ${brand()}
              ${nav()}
            </aside>
            <div class="ph-content">
              <header class="ph-topbar">
                <button type="button" class="ph-menu" aria-label="開啟家長選單">☰</button>
                ${brand()}
                <div class="ph-top-copy"><small>Dreamers Family</small><strong>QA Family With Long Name</strong></div>
                <a href="/child/home">孩子入口</a>
              </header>
              <button type="button" class="ph-mobile-overlay is-closed" hidden aria-label="關閉選單"></button>
              <aside class="ph-mobile-drawer is-closed" hidden aria-label="家長手機選單">
                <header class="ph-mobile-drawer-head">${brand()}<button type="button">×</button></header>
                ${nav()}
              </aside>
              <main class="ph-main">
                ${routeHtml(route)}
              </main>
            </div>
            ${withModal ? modalHtml(route.modal) : ''}
          </div>
        </div>
      </body>
    </html>
  `);
}

function brand() {
  return `<div class="ph-brand"><span>DF</span><div><small>Dreamers Family</small><strong>QA Family With Long Name</strong></div></div>`;
}

function nav() {
  const entries = [
    ['任務', '/parent/tasks'],
    ['今日分享', '/parent/share'],
    ['撲滿 / 商品', '/parent/dreams'],
    ['平板時間', '/parent/screen-time'],
    ['重要日子', '/parent/special-days'],
    ['成長紀錄', '/parent/growth'],
    ['信箱', '/parent/mailbox'],
    ['孩子管理', '/parent/children'],
    ['設定', '/parent/settings']
  ];
  return `<nav>${entries.map(([label, href]) => `<a href="${href}"><span>•</span><span>${label}</span></a>`).join('')}</nav>`;
}

function routeHtml(route) {
  const title = `<header class="pf-hero"><div><small>${route.path}</small><h1>${route.label}</h1><p>長文字、長檔名、錯誤訊息與正式資料內容都必須在手機寬度內換行。</p></div><button class="ds-primary-button">主要操作</button></header>`;
  if (route.kind === 'tasks') return `<div class="pf-page v2-task-page">${title}${stats()}<section class="pf-task-main"><article class="pf-panel"><header><h2>任務清單</h2><button>新增任務</button></header>${cards(4)}</article><article class="pf-panel"><header><h2>審核紀錄</h2></header>${cards(3)}</article></section></div>`;
  if (route.kind === 'share') return `<div class="pf-page v2-share-page">${title}${stats()}<section class="pf-share-grid"><article class="pf-panel">${mediaAlbum()}</article><article class="pf-panel">${cards(5)}</article></section></div>`;
  if (route.kind === 'piggy') return `<div class="pf-page v2-dream-page">${title}<section class="pf-dream-hero"><div class="pf-dream-image"><img src="${image()}" alt="商品" /></div><div class="pf-dream-copy"><h2>超長商品名稱會換行不撐破版面</h2>${stats()}</div></section><section class="pf-dream-main"><div class="pf-panel">${cards(5)}</div><div class="pf-panel">${cards(3)}</div></section></div>`;
  if (route.kind === 'screen-time') return `<div class="screen-time-admin">${title.replace('pf-hero', 'screen-time-admin-hero')}<div class="screen-time-stats">${statArticles(4)}</div><section class="screen-time-panel"><header><h2>平板時間紀錄</h2><button>新增時間</button></header><div class="screen-time-actions"><button>兌換</button><button>加時間</button><button>扣時間</button></div><div class="screen-time-ledger">${ledgerRows()}</div></section></div>`;
  if (route.kind === 'special-days') return `<div class="special-days-page"><header class="special-days-hero"><div><span>♡</span><h1>重要日子</h1><p>手機單欄排列，不可有右側內容超出。</p></div><button>新增重要日子</button></header><div class="special-filter-bar"><section class="special-filter-group"><strong>孩子</strong><div class="special-filter-tabs"><button class="is-active">QA Child</button><button>Second Child</button></div></section></div><section class="special-days-stats">${statArticles(3)}</section><section class="special-days-grid">${specialPanel('即將到來')}${specialPanel('最近重要日子')}${specialPanel('歷史回顧')}${specialPanel('站內通知')}</section></div>`;
  if (route.kind === 'growth') return `<div class="ph-page"><header class="ph-welcome"><div><h1>成長紀錄</h1><p>身高體重與里程碑</p></div><button>新增紀錄</button></header><section class="growth-columns">${growthColumn()}${growthColumn()}</section></div>`;
  if (route.kind === 'memory-book') return `<div class="memory-book-page"><header class="memory-book-cover"><div class="memory-book-collage"><img src="${image()}" alt="回憶" /></div><div class="memory-book-cover-copy"><h2>成長回憶書</h2><p>長檔名 family-trip-with-a-very-long-file-name-that-must-wrap.jpg</p><div class="memory-book-cover-actions"><button>下載</button><button>預覽</button></div></div></header><section class="memory-book-content"><article class="memory-book-month"><header><div><h3>2026/07</h3><p>分享、任務、重要日子</p></div><button>匯出月份</button></header><div class="memory-book-entry-list">${memoryEntry()}${memoryEntry()}</div></article></section></div>`;
  if (route.kind === 'mailbox') return `<div class="pf-page pf-mailbox">${title}<section class="pf-mail-middle"><article class="pf-panel pf-messages">${cards(4)}${mediaAlbum()}</article><article class="pf-panel">${cards(3)}</article></section><section class="pf-mail-bottom"><article class="pf-panel">${cards(2)}</article><article class="pf-panel">${cards(2)}</article></section></div>`;
  if (route.kind === 'children') return `<div class="ph-page"><header class="ph-welcome"><div><h1>孩子管理與榮譽牆</h1><p>QR、PIN、徽章都必須在手機內。</p></div><button>新增孩子</button></header><section class="ph-stats">${statArticles(4)}</section><section class="ph-grid"><article class="ph-card"><div class="ph-child-grid">${childCard()}${childCard()}${childCard()}</div></article><article class="ph-card">${cards(5)}</article></section></div>`;
  return `<div class="ph-page"><header class="ph-welcome"><div><h1>家長設定</h1><p>設定、邀請連結與長網址 https://dreamersfamily.pages.dev/join-parent/very-long-token-example</p></div><button>儲存設定</button></header><section class="ph-grid"><article class="ph-card">${formFields()}</article><article class="ph-card">${cards(4)}</article></section></div>`;
}

function stats() {
  return `<section class="pf-stats">${statArticles(4)}</section>`;
}

function statArticles(count) {
  return Array.from({ length: count }, (_, index) => `<article><small>統計 ${index + 1}</small><strong>${index * 7 + 3}</strong><span>筆資料</span></article>`).join('');
}

function cards(count) {
  return Array.from({ length: count }, (_, index) => `<article class="special-day-card"><span>✓</span><div><small>QA Child · long-file-name-${index}-abcdefghijklmnopqrstuvwxyz.jpg</small><strong>很長的項目名稱需要自動換行 ${index + 1}</strong><p>錯誤訊息、網址與正式資料內容不可撐破手機畫面。</p><time>2026/07/23</time></div><b>處理中</b><footer><button>管理</button><button>刪除</button></footer></article>`).join('');
}

function mediaAlbum() {
  return `<div class="local-share-album"><img src="${image()}" alt="照片" /><img src="${image()}" alt="照片二" /><button>重新載入</button></div>`;
}

function specialPanel(title) {
  return `<article class="special-panel"><header><h2>${title}</h2><small>2 筆</small></header>${cards(2)}</article>`;
}

function growthColumn() {
  return `<article class="growth-column"><header><h2>QA Child</h2><dl><div><dt>身高</dt><dd>120 cm</dd></div><div><dt>體重</dt><dd>22 kg</dd></div><div><dt>閱讀</dt><dd>10 本</dd></div></dl></header><div class="growth-record-list">${cards(2)}</div><button class="growth-add-button">新增</button></article>`;
}

function memoryEntry() {
  return `<article class="memory-book-entry"><div class="memory-book-entry-media"><img src="${image()}" alt="media" /></div><div><small>分享照片</small><strong>家庭旅行長標題</strong><p>一段需要換行的備註文字。</p></div><div class="memory-book-media-actions"><button>下載</button></div></article>`;
}

function childCard() {
  return `<article class="ph-child"><div class="ph-child-head"><span>孩</span><div><strong>QA Child Long Name</strong><small>已綁定 iPad</small></div></div><button>管理生日</button></article>`;
}

function formFields() {
  return `<form class="settings-mobile-form"><label>家庭名稱<input value="QA Family With Long Name" /></label><label>長網址<textarea>https://dreamersfamily.pages.dev/parent/settings?really-long-query=value-value-value-value</textarea></label><footer><button>取消</button><button class="ds-primary-button">儲存</button></footer></form>`;
}

function ledgerRows() {
  return `<div class="screen-time-ledger-row screen-time-head"><span>日期</span><span>內容</span><span>增加</span><span>扣除</span><span>餘額</span></div>${Array.from({ length: 5 }, (_, index) => `<div class="screen-time-ledger-row"><time>07/23 19:3${index}</time><strong>很長的平板時間交易內容要換行</strong><span>+30</span><span>-0</span><b>120</b></div>`).join('')}`;
}

function modalHtml(kind) {
  const media = kind === 'mailbox' || kind === 'product'
    ? `<figure class="mailbox-image-preview"><img src="${image()}" alt="preview" /><figcaption>ios-camera-super-long-file-name-that-wraps.jpg · 128 KB</figcaption></figure>`
    : '';
  return `<div class="local-form-backdrop"><section class="local-form-dialog ${kind === 'product' ? 'piggy-product-dialog' : ''}"><header><div><small>Supabase</small><h2>${kind} modal</h2></div><button>×</button></header><form>${formInput('孩子')}${formInput('標題')}${formInput('日期')}${formInput('說明')}${media}<div style="height: 520px"></div><p class="local-form-error">HTTP 400 / code TEST_ERROR / 中文錯誤訊息必須換行且可重試。</p><footer><button type="button">取消</button><button class="ds-primary-button" type="submit">${kind === 'mailbox' ? '送給孩子' : '儲存'}</button></footer></form></section></div>`;
}

function formInput(label) {
  return `<label class="is-full">${label}<input value="很長的輸入內容需要在手機上換行或裁切但不可撐破版面" /></label>`;
}

function image() {
  return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 240'%3E%3Crect width='320' height='240' fill='%237a8f6e'/%3E%3C/svg%3E";
}

async function assertNoPageOverflow(page) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    const app = document.querySelector('#root');
    return {
      rootScroll: root.scrollWidth,
      bodyScroll: body.scrollWidth,
      appScroll: app?.scrollWidth ?? 0,
      client: root.clientWidth
    };
  });
  expect(metrics.rootScroll).toBeLessThanOrEqual(metrics.client + 1);
  expect(metrics.bodyScroll).toBeLessThanOrEqual(metrics.client + 1);
  expect(metrics.appScroll).toBeLessThanOrEqual(metrics.client + 1);
}

async function assertVisibleContentFits(page) {
  const offenders = await page.evaluate(() => [...document.body.querySelectorAll('*')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      if (rect.width <= 0 || rect.height <= 0) return false;
      if (element.closest('.ph-mobile-drawer') && rect.left < 0) return false;
      return rect.left < -1 || rect.right > window.innerWidth + 1;
    })
    .slice(0, 8)
    .map((element) => ({ tag: element.tagName, className: element.className, text: element.textContent?.slice(0, 60) })));
  expect(offenders).toEqual([]);
}

async function assertPrimaryButtonsTappable(page) {
  const buttons = page.locator([
    '.ph-topbar button',
    '.ph-topbar a',
    'main .ds-primary-button',
    'main .ph-welcome button',
    'main .pf-hero button',
    'main .screen-time-actions button',
    'main .special-days-hero button',
    'main .memory-book-cover-actions button',
    'main .growth-add-button',
    'main .memory-book-month > header button'
  ].join(', '));
  const count = await buttons.count();
  for (let index = 0; index < Math.min(count, 14); index += 1) {
    const button = buttons.nth(index);
    if (!(await button.isVisible())) continue;
    await button.scrollIntoViewIfNeeded();
    const hit = await button.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return true;
      if (rect.bottom < 0 || rect.top > window.innerHeight) return true;
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      const requiresPointHit = element.classList.contains('ph-menu');
      const hasUsableBox = rect.height >= 36 && rect.left >= -1 && rect.right <= window.innerWidth + 1;
      return hasUsableBox && (!requiresPointHit || target === element || element.contains(target));
    });
    expect(hit).toBe(true);
  }
}

async function assertDrawerUsable(page) {
  const viewportWidth = await page.evaluate(() => window.innerWidth);
  if (viewportWidth > 1100) {
    const links = page.locator('.ph-sidebar nav a');
    await expect(links).toHaveCount(9);
    const sidebarFit = await links.evaluateAll((items) => items.every((item) => {
      const rect = item.getBoundingClientRect();
      return rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.height >= 44;
    }));
    expect(sidebarFit).toBe(true);
    return;
  }
  await page.evaluate(() => {
    document.querySelector('.ph-mobile-overlay')?.removeAttribute('hidden');
    document.querySelector('.ph-mobile-drawer')?.removeAttribute('hidden');
    document.querySelector('.ph-mobile-overlay')?.classList.replace('is-closed', 'is-open');
    document.querySelector('.ph-mobile-drawer')?.classList.replace('is-closed', 'is-open');
  });
  const links = page.locator('.ph-mobile-drawer nav a');
  await expect(links).toHaveCount(9);
  const allFit = await links.evaluateAll((items) => items.every((item) => {
    const rect = item.getBoundingClientRect();
    return rect.left >= -1 && rect.right <= window.innerWidth + 1 && rect.height >= 44;
  }));
  expect(allFit).toBe(true);
  await page.evaluate(() => {
    document.querySelector('.ph-mobile-overlay')?.setAttribute('hidden', '');
    document.querySelector('.ph-mobile-drawer')?.setAttribute('hidden', '');
    document.querySelector('.ph-mobile-overlay')?.classList.replace('is-open', 'is-closed');
    document.querySelector('.ph-mobile-drawer')?.classList.replace('is-open', 'is-closed');
  });
}

function slug(path) {
  return path.replace(/^\//, '').replaceAll('/', '-');
}
