import { expect, test } from '@playwright/test';

const baseUrl = process.env.DREAMERSFAMILY_SITE_URL || 'https://dreamersfamily.pages.dev/';
const paths = ['/', '/child/share'];

test.use({ serviceWorkers: 'block' });

for (const path of paths) {
  test(`module import failure recovers once on ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    let failedOnce = false;
    await page.addInitScript(() => {
      localStorage.setItem('little-dreamers-family:e2e-login-marker', 'keep');
    });
    await page.route(/\/assets\/appEntry-[^/]+\.js(?:\?.*)?$/, async (route) => {
      if (!failedOnce) {
        failedOnce = true;
        await route.fulfill({
          status: 404,
          contentType: 'application/javascript; charset=utf-8',
          body: "throw new Error('DreamersFamily asset chunk is no longer available. Please reload the latest build.');"
        });
        return;
      }
      await route.continue();
    });

    await page.goto(new URL(path, baseUrl).toString(), { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => url.searchParams.get('bootRecovery') === 'module-import', { timeout: 15000 });
    await page.waitForLoadState('domcontentloaded');

    const state = await page.evaluate(() => ({
      href: window.location.href,
      guardKeys: Object.keys(sessionStorage).filter((key) => key.includes('boot-module-recovery')),
      marker: localStorage.getItem('little-dreamers-family:e2e-login-marker'),
      rootText: document.getElementById('root')?.textContent ?? ''
    }));

    expect(failedOnce).toBe(true);
    expect(state.href).toContain('bootRecovery=module-import');
    expect(state.guardKeys).toHaveLength(1);
    expect(state.marker).toBe('keep');
    expect(state.rootText).not.toContain('BOOTSTRAP FAILED');
  });
}

test('manual recovery screen is Chinese and keeps reload bounded', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.route(/\/assets\/appEntry-[^/]+\.js(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/javascript; charset=utf-8',
      body: "throw new Error('DreamersFamily asset chunk is no longer available. Please reload the latest build.');"
    });
  });

  await page.goto(new URL('/child/share', baseUrl).toString(), { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.searchParams.get('bootRecovery') === 'module-import', { timeout: 15000 });
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByText('DreamersFamily 載入新版時失敗')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: '重新載入新版' })).toBeVisible();
  const marker = await page.evaluate(() => localStorage.getItem('little-dreamers-family:e2e-login-marker'));
  expect(marker).toBeNull();
});
