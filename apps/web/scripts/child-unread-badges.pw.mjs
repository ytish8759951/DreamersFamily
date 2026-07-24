import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const styles = await readFile(resolve(appRoot, 'src', 'styles', 'index.css'), 'utf8');

const viewports = [
  { name: 'iphone-se', width: 320, height: 568 },
  { name: 'iphone-390', width: 390, height: 844 },
  { name: 'iphone-430', width: 430, height: 932 },
  { name: 'ipad-portrait', width: 820, height: 1180 },
  { name: 'ipad-landscape', width: 1180, height: 820 }
];

for (const viewport of viewports) {
  test(`child bottom-nav unread badges fit on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.setContent(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <style>${styles}</style>
        </head>
        <body>
          <div class="ds-shell ds-child-shell">
            <main class="ds-child-main"><section style="min-height: 120vh"></section></main>
            <nav class="ds-bottom-nav" aria-label="孩子導覽">
              ${item('我的家', '')}
              ${item('任務', '1', true)}
              ${item('分享', '9+')}
              ${item('撲滿', '3')}
              ${item('信箱', '7')}
            </nav>
          </div>
        </body>
      </html>
    `);

    const nav = page.locator('.ds-bottom-nav');
    await expect(nav).toBeVisible();
    const geometry = await page.evaluate(() => {
      const navRect = document.querySelector('.ds-bottom-nav').getBoundingClientRect();
      const badges = [...document.querySelectorAll('.child-nav-badge')].map((badge) => {
        const rect = badge.getBoundingClientRect();
        return {
          text: badge.textContent,
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height
        };
      });
      return {
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
        nav: { left: navRect.left, right: navRect.right, top: navRect.top, bottom: navRect.bottom },
        badges
      };
    });

    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
    for (const badge of geometry.badges) {
      expect(badge.width).toBeGreaterThanOrEqual(16);
      expect(badge.height).toBeGreaterThanOrEqual(16);
      expect(badge.left).toBeGreaterThanOrEqual(geometry.nav.left);
      expect(badge.right).toBeLessThanOrEqual(geometry.nav.right);
      expect(badge.top).toBeGreaterThanOrEqual(geometry.nav.top - 2);
      expect(badge.bottom).toBeLessThanOrEqual(geometry.nav.bottom);
    }
    await expect(page.locator('.child-nav-badge', { hasText: '9+' })).toBeVisible();
  });
}

function item(label, badge, active = false) {
  return `
    <a class="${active ? 'is-active' : ''}" aria-label="${badge ? `${label}，${badge} 則未讀` : label}">
      <span class="ds-bottom-nav-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.3"/></svg>
        ${badge ? `<span class="child-nav-badge" aria-hidden="true">${badge}</span>` : ''}
      </span>
      <span>${label}</span>
    </a>
  `;
}
