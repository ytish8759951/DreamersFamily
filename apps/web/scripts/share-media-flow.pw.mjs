import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const styles = await readFile(resolve(appRoot, 'src', 'styles', 'index.css'), 'utf8');

test.use({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });

test('child share dialog keeps submit visible and tappable on iPad WebKit size', async ({ page }) => {
  await page.setContent(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${styles}</style></head>
      <body>
        <div class="ds-shell ds-child-shell ds-share-shell">
          <main class="ds-child-main">
            <div class="local-form-backdrop">
              <section class="local-form-dialog child-share-dialog" role="dialog" aria-modal="true">
                <header><div><small>Supabase</small><h2>新增影片分享</h2></div><button type="button">x</button></header>
                <form>
                  <section class="mailbox-recorder child-share-recorder child-share-video-recorder is-full">
                    <div class="mailbox-recorder-ready">
                      <video controls playsinline src="data:video/mp4;base64,AAAA"></video>
                      <div><button type="button" class="is-selected">已使用這段影片</button></div>
                    </div>
                  </section>
                  <label class="is-full">標題<input value="0720 test" /></label>
                  <label class="is-full">想說的話<textarea rows="3">ready</textarea></label>
                  <p class="local-form-hint">媒體已準備好，可以送出分享。</p>
                  <div style="height: 540px"></div>
                  <footer><button type="button">取消</button><button class="ds-primary-button" type="submit">送出分享</button></footer>
                </form>
              </section>
            </div>
          </main>
          <nav class="ds-bottom-nav"><a>首頁</a><a class="is-active">分享</a><a>信箱</a></nav>
        </div>
      </body>
    </html>
  `);

  const submit = page.getByRole('button', { name: '送出分享' });
  await submit.scrollIntoViewIfNeeded();
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();

  const submitBox = await submit.boundingBox();
  const navBox = await page.locator('.ds-bottom-nav').boundingBox();
  expect(submitBox).toBeTruthy();
  expect(navBox).toBeTruthy();
  expect(submitBox.y + submitBox.height).toBeLessThanOrEqual(page.viewportSize().height);
  expect(submitBox.y + submitBox.height).toBeLessThan(navBox.y);
});

test('parent media cards render real photo audio and video controls', async ({ page }) => {
  const photoSvg = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#8fb3d9"/><circle cx="80" cy="50" r="26" fill="#fff"/></svg>');
  await page.setContent(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${styles}</style></head>
      <body>
        <article class="pf-share-row pf-share-large-card is-photo">
          <button type="button" class="local-share-photo-button pf-share-large-media">
            <img src="data:image/svg+xml,${photoSvg}" alt="share photo" />
          </button>
        </article>
        <article class="pf-share-row pf-share-large-card is-audio">
          <audio class="pf-share-large-audio" src="data:audio/mp4;base64,AAAA" controls preload="metadata"></audio>
        </article>
        <article class="pf-share-row pf-share-large-card is-video">
          <video class="pf-share-large-media" src="data:video/mp4;base64,AAAA" controls playsinline preload="metadata"></video>
        </article>
      </body>
    </html>
  `);

  await expect(page.getByAltText('share photo')).toBeVisible();
  await expect(page.locator('audio[controls]')).toHaveCount(1);
  await expect(page.locator('video[controls][playsinline]')).toHaveCount(1);
  await expect(page.locator('.local-share-media-status')).toHaveCount(0);
});
