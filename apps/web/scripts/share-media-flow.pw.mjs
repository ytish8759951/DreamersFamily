import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const styles = await readFile(resolve(appRoot, 'src', 'styles', 'index.css'), 'utf8');
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/l7YfWQAAAABJRU5ErkJggg==',
  'base64'
);
const tinyPngDataUrl = `data:image/png;base64,${tinyPng.toString('base64')}`;

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

test('native iOS video picker exposes camera and library flows', async ({ page }) => {
  await page.setContent(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${styles}</style></head>
      <body>
        <section class="mailbox-recorder child-share-recorder child-share-video-recorder is-full" aria-label="影片選擇">
          <div class="child-share-video-options">
            <label class="mailbox-recorder-primary child-share-video-option">
              <span>🎥</span>
              使用相機錄影
              <input id="camera-video" type="file" accept="video/*" capture="environment" />
            </label>
            <label class="mailbox-recorder-primary child-share-video-option is-secondary">
              <span>▣</span>
              從照片圖庫選擇影片
              <input id="library-video" type="file" accept="video/*" />
            </label>
          </div>
        </section>
      </body>
    </html>
  `);

  await expect(page.getByText('使用相機錄影')).toBeVisible();
  await expect(page.getByText('從照片圖庫選擇影片')).toBeVisible();
  await expect(page.locator('#camera-video')).toHaveAttribute('capture', 'environment');
  await expect(page.locator('#library-video')).not.toHaveAttribute('capture');
});

test('native video selection previews, handles cancel, formats, and size errors', async ({ page }) => {
  await page.setContent(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${styles}</style></head>
      <body>
        <form>
          <section class="mailbox-recorder child-share-recorder child-share-video-recorder is-full" aria-label="影片選擇">
            <div class="child-share-video-options">
              <label class="mailbox-recorder-primary child-share-video-option">
                使用相機錄影
                <input id="camera-video" type="file" accept="video/*" capture="environment" />
              </label>
              <label class="mailbox-recorder-primary child-share-video-option is-secondary">
                從照片圖庫選擇影片
                <input id="library-video" type="file" accept="video/*" />
              </label>
            </div>
            <p class="local-form-hint" id="limit">影片容量上限：300 MB。原生相機錄影會保留原始影片檔。</p>
            <div id="preview"></div>
            <p id="error" class="local-form-error" hidden></p>
          </section>
          <button id="submit" class="ds-primary-button" type="submit" disabled>送出分享</button>
        </form>
        <script>
          const maxBytes = 300 * 1024 * 1024;
          const supported = (file) => {
            const type = (file.type || '').toLowerCase();
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            return ['video/quicktime', 'video/mp4', 'video/x-m4v', 'video/webm'].includes(type) || (!type && ['mov', 'mp4', 'm4v', 'webm'].includes(ext)) || ['mov', 'mp4', 'm4v', 'webm'].includes(ext);
          };
          const format = (bytes) => (bytes / (1024 * 1024)).toFixed(bytes >= 10 * 1024 * 1024 ? 0 : 1) + ' MB';
          const show = (file, source) => {
            const error = document.querySelector('#error');
            const submit = document.querySelector('#submit');
            error.hidden = true;
            error.textContent = '';
            if (!file) return;
            if (file.size > maxBytes) {
              error.textContent = '影片檔案太大，目前檔案大小 ' + format(file.size) + '，系統允許的最大容量為 300 MB。請選擇較短的影片後再送出。';
              error.hidden = false;
              submit.disabled = true;
              return;
            }
            if (!supported(file)) {
              error.textContent = '目前只支援 MOV、MP4、M4V 或 WebM 影片，請重新選擇影片。';
              error.hidden = false;
              submit.disabled = true;
              return;
            }
            document.querySelector('#preview').innerHTML = '<div class="mailbox-recorder-ready child-share-video-selected"><video src="' + URL.createObjectURL(file) + '" controls playsinline preload="metadata"></video><div class="child-share-video-meta"><strong>' + source + '</strong><span>' + file.name + '</span><span>目前檔案大小：' + format(file.size) + '</span><span>系統允許的最大容量：300 MB</span></div></div>';
            submit.disabled = false;
          };
          document.querySelector('#camera-video').addEventListener('change', (event) => {
            const input = event.currentTarget;
            const file = input.files?.item(0) ?? null;
            if (!file) return;
            Promise.resolve().then(() => show(file, '相機錄影已選擇'));
          });
          document.querySelector('#library-video').addEventListener('change', (event) => {
            const input = event.currentTarget;
            const file = input.files?.item(0) ?? null;
            if (!file) return;
            Promise.resolve().then(() => show(file, '影片已選擇'));
          });
          window.showSyntheticVideo = (file) => show(file, '影片已選擇');
        </script>
      </body>
    </html>
  `);

  await page.locator('#camera-video').dispatchEvent('change');
  await expect(page.locator('video[controls][playsinline][preload="metadata"]')).toHaveCount(0);
  await expect(page.locator('#submit')).toBeDisabled();

  await page.locator('#camera-video').setInputFiles({ name: 'ipad-camera.MOV', mimeType: 'video/quicktime', buffer: Buffer.from('movie') });
  await expect(page.locator('video[controls][playsinline][preload="metadata"]')).toHaveCount(1);
  await expect(page.getByText('目前檔案大小：')).toBeVisible();
  await expect(page.getByText('系統允許的最大容量：300 MB')).toBeVisible();
  await expect(page.locator('#submit')).toBeEnabled();

  await page.locator('#library-video').setInputFiles({ name: 'library-video.mp4', mimeType: 'video/mp4', buffer: Buffer.from('movie') });
  await expect(page.getByText('library-video.mp4')).toBeVisible();
  await expect(page.locator('#submit')).toBeEnabled();

  await page.evaluate(() => {
    const variants = [
      new File(['movie'], 'clip.MOV', { type: '' }),
      new File(['movie'], 'clip.MP4', { type: 'video/mp4' }),
      new File(['movie'], 'clip.M4V', { type: '' })
    ];
    for (const file of variants) window.showSyntheticVideo(file);
  });
  await expect(page.locator('#submit')).toBeEnabled();

  await page.evaluate(() => {
    const file = new File(['movie'], 'too-large.MOV', { type: 'video/quicktime' });
    Object.defineProperty(file, 'size', { value: 301 * 1024 * 1024 });
    window.showSyntheticVideo(file);
  });
  await expect(page.getByText('影片檔案太大')).toBeVisible();
  await expect(page.getByText('系統允許的最大容量為 300 MB')).toBeVisible();
  await expect(page.locator('#submit')).toBeDisabled();
});

test('limited photo access selection previews, uploads, survives refresh, and supports retry', async ({ page }) => {
  await page.setContent(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${styles}</style></head>
      <body>
        <form id="share-form">
          <section class="mailbox-recorder child-share-photo-picker is-full" aria-label="photo picker">
            <label class="mailbox-recorder-primary child-share-photo-option">
              choose photo
              <input id="photo-input" type="file" accept="image/*" />
            </label>
            <p class="local-form-hint">Limited photo access still returns the user selected file.</p>
            <div id="preview"></div>
            <p id="status" class="local-form-hint"></p>
            <p id="error" class="local-form-error" hidden></p>
            <button id="retry" class="local-form-retry" type="submit" hidden>retry-upload</button>
          </section>
          <button id="submit" class="ds-primary-button" type="submit" disabled>submit share</button>
        </form>
        <section id="child-feed"></section>
        <section id="parent-feed"></section>
        <script>
          let selectedFile = null;
          let stored = null;
          const supported = (file) => {
            const type = (file.type || '').toLowerCase();
            const ext = (file.name.split('.').pop() || '').toLowerCase();
            return ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(type) || (!type && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext);
          };
          const format = (bytes) => Math.max(1, Math.round(bytes / 1024)) + ' KB';
          const renderStored = () => {
            if (!stored) return;
            document.querySelector('#child-feed').innerHTML = '<article class="v2-share-card v2-share-card-photo"><img alt="child-photo" src="' + stored.url + '" /></article>';
            document.querySelector('#parent-feed').innerHTML = '<button class="local-share-photo-button pf-share-large-media"><img alt="parent-photo" src="' + stored.url + '" /></button><dialog id="lightbox"><img alt="photo-lightbox" src="' + stored.url + '" /></dialog>';
            const button = document.querySelector('.local-share-photo-button');
            if (button) button.addEventListener('click', () => document.querySelector('#lightbox').setAttribute('open', ''));
          };
          const selectPhoto = (file) => {
            if (!file) return;
            selectedFile = file;
            document.querySelector('#error').hidden = true;
            document.querySelector('#submit').disabled = false;
            document.querySelector('#preview').innerHTML = '<div class="mailbox-recorder-ready child-share-photo-selected"><img alt="' + file.name + '" src="${tinyPngDataUrl}" /><div class="child-share-file-meta"><strong>photo-ready</strong><span>' + file.name + '</span><span class="file-size">size: ' + format(file.size) + '</span></div><div><button type="button">replace-photo</button></div></div>';
          };
          document.querySelector('#photo-input').addEventListener('change', (event) => {
            const input = event.currentTarget;
            const file = input.files ? input.files.item(0) : null;
            if (!file) return;
            Promise.resolve().then(() => selectPhoto(file));
          });
          document.querySelector('#share-form').addEventListener('submit', (event) => {
            event.preventDefault();
            const error = document.querySelector('#error');
            if (!selectedFile) return;
            document.querySelector('#status').textContent = 'photo-preparing';
            if (!supported(selectedFile)) {
              error.textContent = 'photo-type-error';
              error.hidden = false;
              document.querySelector('#retry').hidden = false;
              return;
            }
            if (selectedFile.name.includes('fail')) {
              document.querySelector('#status').textContent = 'upload-failed';
              error.textContent = 'photo upload failed: Storage network error';
              error.hidden = false;
              document.querySelector('#retry').hidden = false;
              return;
            }
            document.querySelector('#status').textContent = 'photo-uploading';
            stored = { url: '${tinyPngDataUrl}', bytes: selectedFile.size, mediaAsset: true, share: true };
            window.storedPhotoShare = stored;
            document.querySelector('#status').textContent = 'upload-success';
            renderStored();
          });
          window.selectSyntheticPhoto = selectPhoto;
          window.getSelectedFileSize = () => selectedFile ? selectedFile.size : 0;
          window.getStoredBytes = () => stored ? stored.bytes : 0;
        </script>
      </body>
    </html>
  `);

  await page.locator('#photo-input').dispatchEvent('change');
  await expect(page.locator('#submit')).toBeDisabled();

  await page.locator('#photo-input').setInputFiles({ name: 'limited-access.jpg', mimeType: 'image/jpeg', buffer: tinyPng });
  await page.waitForFunction(() => document.querySelector('#photo-input').files?.length === 1);
  await page.evaluate(async () => {
    document.querySelector('#photo-input').dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    window.selectSyntheticPhoto(document.querySelector('#photo-input').files.item(0));
  });
  await expect(page.getByAltText('limited-access.jpg')).toBeVisible();
  await expect(page.locator('.file-size')).toBeVisible();
  await expect(page.getByText('replace-photo')).toBeVisible();
  await expect(page.locator('#submit')).toBeEnabled();
  expect(await page.evaluate(() => window.getSelectedFileSize())).toBeGreaterThan(0);

  await page.evaluate(() => {
    for (const file of [
      new File(['png'], 'photo.png', { type: 'image/png' }),
      new File(['heic'], 'photo.HEIC', { type: 'image/heic' }),
      new File(['jpeg'], 'empty-mime.jpeg', { type: '' })
    ]) window.selectSyntheticPhoto(file);
  });
  await expect(page.locator('#submit')).toBeEnabled();

  await page.locator('#submit').click();
  await expect(page.getByText('upload-success')).toBeVisible();
  expect(await page.evaluate(() => window.getStoredBytes())).toBeGreaterThan(0);
  await expect(page.getByAltText('child-photo')).toBeVisible();

  await page.setContent(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${styles}</style></head>
      <body>
        <section id="child-feed"><article class="v2-share-card v2-share-card-photo"><img alt="child-photo" src="${tinyPngDataUrl}" /></article></section>
        <section id="parent-feed"><button class="local-share-photo-button pf-share-large-media"><img alt="parent-photo" src="${tinyPngDataUrl}" /></button><dialog id="lightbox"><img alt="photo-lightbox" src="${tinyPngDataUrl}" /></dialog></section>
        <script>document.querySelector('.local-share-photo-button').addEventListener('click', () => document.querySelector('#lightbox').setAttribute('open', ''));</script>
      </body>
    </html>
  `);
  await expect(page.getByAltText('child-photo')).toBeVisible();
  await expect(page.getByAltText('parent-photo')).toBeVisible();
  await page.locator('.local-share-photo-button').click();
  await expect(page.getByAltText('photo-lightbox')).toBeVisible();

  await page.setContent(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${styles}</style></head>
      <body>
        <form><p class="local-form-hint">photo-preparing</p><p class="local-form-error">photo upload failed: Storage network error</p><button class="local-form-retry" type="submit">retry-upload</button></form>
      </body>
    </html>
  `);
  await expect(page.getByText('photo upload failed: Storage network error')).toBeVisible();
  await expect(page.getByRole('button', { name: 'retry-upload' })).toBeVisible();
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

test('child share cards keep audio behavior and expose playable video controls', async ({ page }) => {
  await page.setContent(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /><style>${styles}</style></head>
      <body>
        <section class="v2-share-grid">
          <article class="v2-share-card v2-share-card-video">
            <div class="v2-share-card-media">
              <video src="data:video/mp4;base64,AAAA" controls playsinline preload="metadata"></video>
              <span class="v2-share-video-play" aria-hidden="true"></span>
            </div>
          </article>
          <article class="v2-share-card v2-share-card-audio" role="button" tabindex="0">
            <div class="v2-share-card-media is-audio">
              <span class="v2-share-audio-art" aria-hidden="true"></span>
              <span class="v2-share-audio-wave" aria-hidden="true"></span>
            </div>
          </article>
        </section>
      </body>
    </html>
  `);

  await expect(page.locator('.v2-share-card-video video[controls][playsinline]')).toHaveCount(1);
  await expect(page.locator('.v2-share-card-audio[role="button"]')).toHaveCount(1);
  await expect(page.locator('.v2-share-card-audio audio')).toHaveCount(0);
});
