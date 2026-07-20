import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const repoRoot = resolve(appRoot, '..', '..');
const artifactDir = resolve(repoRoot, 'artifacts', 'piggy-product-layout');

const t = {
  longName: '\u8d85\u9577\u5546\u54c1\u540d\u7a31\u6e2c\u8a66\u5169\u884c\u7701\u7565\u4e0d\u63a8\u64e0\u72c0\u614b\u5217',
  shortName: '222',
  pendingName: '\u7b49\u5f85\u5230\u8ca8\u5546\u54c1',
  arrivedName: '\u5df2\u5230\u8ca8\u5546\u54c1',
  buy: '\u8cfc\u8cb7',
  insufficient: '\u5b58\u6b3e\u4e0d\u8db3',
  pending: '\u7b49\u5f85\u5230\u8ca8',
  arrived: '\u5df2\u5230\u8ca8',
  shelf: '\u5546\u54c1\u67b6',
  shelfList: '\u5546\u54c1\u67b6\u6e05\u55ae'
};

const familyId = '00000000-0000-4000-8000-000000000101';
const childId = '00000000-0000-4000-8000-000000000202';

const products = [
  {
    id: '00000000-0000-4000-8000-000000000301',
    family_id: familyId,
    child_id: childId,
    status: 'available',
    affordable: true,
    name: t.longName,
    price: '$100',
    statusLabel: t.buy,
    actionStatus: 'available',
    canClick: true,
    imageRatio: 'wide'
  },
  {
    id: '00000000-0000-4000-8000-000000000302',
    family_id: familyId,
    child_id: childId,
    status: 'available',
    affordable: false,
    name: t.shortName,
    price: '$999',
    statusLabel: t.insufficient,
    actionStatus: 'insufficient',
    canClick: false,
    imageRatio: 'tall'
  },
  {
    id: '00000000-0000-4000-8000-000000000303',
    family_id: familyId,
    child_id: childId,
    status: 'pendingPurchase',
    affordable: true,
    name: t.pendingName,
    price: '$50',
    statusLabel: t.pending,
    actionStatus: 'pending',
    canClick: false,
    imageRatio: 'square'
  },
  {
    id: '00000000-0000-4000-8000-000000000304',
    family_id: familyId,
    child_id: childId,
    status: 'arrived',
    affordable: true,
    name: t.arrivedName,
    price: '$80',
    statusLabel: t.arrived,
    actionStatus: 'arrived',
    canClick: true,
    imageRatio: 'wide'
  },
  {
    id: '00000000-0000-4000-8000-000000000305',
    family_id: familyId,
    child_id: childId,
    status: 'available',
    affordable: true,
    name: '\u7b2c\u4e94\u500b\u5546\u54c1',
    price: '$30',
    statusLabel: t.buy,
    actionStatus: 'available',
    canClick: true,
    imageRatio: 'tall'
  },
  {
    id: '00000000-0000-4000-8000-000000000306',
    family_id: familyId,
    child_id: childId,
    status: 'available',
    affordable: false,
    name: '\u7b2c\u516d\u500b\u5546\u54c1',
    price: '$300',
    statusLabel: t.insufficient,
    actionStatus: 'insufficient',
    canClick: false,
    imageRatio: 'square'
  }
];

test.describe('piggy product card layout', () => {
  for (const viewport of [
    { name: 'ipad-landscape', width: 1024, height: 768 },
    { name: 'ipad-portrait', width: 768, height: 1024 }
  ]) {
    test(`${viewport.name} enlarges the two-column shelf without cropping product images`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await mkdir(artifactDir, { recursive: true });
      const css = await readFile(resolve(appRoot, 'src', 'styles', 'index.css'), 'utf8');
      const fixturePath = resolve(artifactDir, `${viewport.name}.html`);
      await writeFile(fixturePath, buildFixture(css), 'utf8');

      await page.goto(pathToFileURL(fixturePath).href);
      await page.screenshot({ path: resolve(artifactDir, `${viewport.name}.png`), fullPage: true });

      const measurements = await page.evaluate(() => {
        const round = (value) => Math.round(value * 100) / 100;
        const rect = (domRect) => ({
          top: round(domRect.top),
          right: round(domRect.right),
          bottom: round(domRect.bottom),
          left: round(domRect.left),
          width: round(domRect.width),
          height: round(domRect.height)
        });
        const scene = document.querySelector('.piggy-v2-scene');
        const shelf = document.querySelector('.piggy-v2-shelf');
        const shelfGrid = document.querySelector('.piggy-v2-shelf-grid');
        const bank = document.querySelector('.piggy-v2-bank');
        const coinDock = document.querySelector('.piggy-v2-coin-dock');
        return {
          scene: rect(scene.getBoundingClientRect()),
          shelf: rect(shelf.getBoundingClientRect()),
          shelfGrid: rect(shelfGrid.getBoundingClientRect()),
          bank: rect(bank.getBoundingClientRect()),
          coinDock: rect(coinDock.getBoundingClientRect()),
          products: [...document.querySelectorAll('.piggy-v2-product-card')].map((card) => {
            const action = card.querySelector('.piggy-v2-product-action');
            const image = card.querySelector('img');
            const name = card.querySelector('strong');
            const price = card.querySelector('span:not(.piggy-v2-product-status-label)');
            const label = action?.querySelector('.piggy-v2-product-status-label');
            const button = action?.querySelector('.piggy-v2-product-action-button');
            const cardRect = card.getBoundingClientRect();
            const imageRect = image?.getBoundingClientRect();
            const nameRect = name?.getBoundingClientRect();
            const priceRect = price?.getBoundingClientRect();
            const actionRect = action?.getBoundingClientRect();
            const labelRect = label?.getBoundingClientRect();
            const buttonRect = button?.getBoundingClientRect();
            const imageStyle = image ? getComputedStyle(image) : null;
            const actionStyle = action ? getComputedStyle(action) : null;
            const labelStyle = label ? getComputedStyle(label) : null;
            const buttonStyle = button ? getComputedStyle(button) : null;
            return {
              label: label?.textContent?.trim() ?? '',
              status: action?.getAttribute('data-status') ?? '',
              hasButton: Boolean(button),
              card: rect(cardRect),
              image: imageRect ? rect(imageRect) : null,
              name: nameRect ? rect(nameRect) : null,
              price: priceRect ? rect(priceRect) : null,
              action: actionRect ? rect(actionRect) : null,
              labelRect: labelRect ? rect(labelRect) : null,
              button: buttonRect ? rect(buttonRect) : null,
              imageStyle: imageStyle ? {
                display: imageStyle.display,
                width: imageStyle.width,
                height: imageStyle.height,
                objectFit: imageStyle.objectFit,
                objectPosition: imageStyle.objectPosition,
                backgroundColor: imageStyle.backgroundColor
              } : null,
              actionStyle: actionStyle ? {
                display: actionStyle.display,
                visibility: actionStyle.visibility,
                opacity: actionStyle.opacity,
                color: actionStyle.color,
                fontSize: actionStyle.fontSize
              } : null,
              labelStyle: labelStyle ? {
                display: labelStyle.display,
                visibility: labelStyle.visibility,
                opacity: labelStyle.opacity,
                color: labelStyle.color,
                fontSize: labelStyle.fontSize
              } : null,
              buttonStyle: buttonStyle ? {
                display: buttonStyle.display,
                visibility: buttonStyle.visibility,
                opacity: buttonStyle.opacity
              } : null
            };
          })
        };
      });

      await writeFile(resolve(artifactDir, `${viewport.name}-measurements.json`), JSON.stringify(measurements, null, 2), 'utf8');
      expect(measurements.products).toHaveLength(6);
      expect(measurements.products.map((item) => item.label)).toEqual([
        t.buy,
        t.insufficient,
        t.pending,
        t.arrived,
        t.buy,
        t.insufficient
      ]);
      expect(measurements.products.map((item) => item.status)).toEqual([
        'available',
        'insufficient',
        'pending',
        'arrived',
        'available',
        'insufficient'
      ]);

      expect(measurements.shelf.left).toBeGreaterThanOrEqual(measurements.bank.right);
      expect(measurements.shelf.right).toBeLessThanOrEqual(measurements.scene.right);
      expect(measurements.shelfGrid.bottom).toBeLessThanOrEqual(measurements.coinDock.top);
      expect(measurements.shelfGrid.width).toBeGreaterThanOrEqual(334);
      expect(measurements.shelfGrid.height).toBeGreaterThanOrEqual(620);

      for (const item of measurements.products) {
        expect(item.card.width, item.label).toBeGreaterThanOrEqual(158);
        expect(item.card.height, item.label).toBeGreaterThanOrEqual(204);
        expect(item.image, item.label).not.toBeNull();
        expect(item.name, item.label).not.toBeNull();
        expect(item.price, item.label).not.toBeNull();
        expect(item.action, item.label).not.toBeNull();
        expect(item.labelRect, item.label).not.toBeNull();
        expect(item.image.top, item.label).toBeGreaterThanOrEqual(item.card.top);
        expect(item.image.bottom, item.label).toBeLessThanOrEqual(item.card.bottom);
        expect(item.image.width, item.label).toBeGreaterThanOrEqual(142);
        expect(item.image.height, item.label).toBeGreaterThanOrEqual(84);
        expect(item.imageStyle.objectFit, item.label).toBe('contain');
        expect(item.imageStyle.objectPosition, item.label).toBe('50% 50%');
        expect(item.imageStyle.backgroundColor, item.label).toBe('rgb(255, 248, 234)');
        expect(item.name.top, item.label).toBeGreaterThanOrEqual(item.image.bottom);
        expect(item.price.top, item.label).toBeGreaterThanOrEqual(item.name.top);
        expect(item.action.top, item.label).toBeGreaterThanOrEqual(item.card.top);
        expect(item.action.bottom, item.label).toBeLessThanOrEqual(item.card.bottom);
        expect(item.action.width, item.label).toBeGreaterThan(0);
        expect(item.action.height, item.label).toBeGreaterThanOrEqual(38);
        expect(item.labelRect.top, item.label).toBeGreaterThanOrEqual(item.card.top);
        expect(item.labelRect.bottom, item.label).toBeLessThanOrEqual(item.card.bottom);
        expect(item.labelRect.width, item.label).toBeGreaterThan(0);
        expect(item.labelRect.height, item.label).toBeGreaterThan(0);
        expect(item.actionStyle.display, item.label).toBe('flex');
        expect(item.actionStyle.visibility, item.label).toBe('visible');
        expect(Number(item.actionStyle.opacity), item.label).toBe(1);
        expect(item.labelStyle.visibility, item.label).toBe('visible');
        expect(Number(item.labelStyle.opacity), item.label).toBe(1);
        expect(item.labelStyle.color, item.label).not.toBe('transparent');
        expect(item.labelStyle.color, item.label).not.toBe('rgba(0, 0, 0, 0)');
        expect(parseFloat(item.labelStyle.fontSize), item.label).toBeGreaterThanOrEqual(15);
      }

      expect(measurements.products[0].labelStyle.color).toBe('rgb(255, 255, 255)');
      expect(measurements.products[1].labelStyle.color).toBe('rgb(116, 106, 95)');
      expect(measurements.products[2].labelStyle.color).toBe('rgb(138, 87, 37)');
      expect(measurements.products[3].labelStyle.color).toBe('rgb(255, 255, 255)');

      expect(measurements.products[0].hasButton).toBe(true);
      expect(measurements.products[1].hasButton).toBe(false);
      expect(measurements.products[2].hasButton).toBe(false);
      expect(measurements.products[3].hasButton).toBe(true);
      for (const item of [measurements.products[0], measurements.products[3], measurements.products[4]]) {
        expect(item.button, item.label).not.toBeNull();
        expect(item.button.top, item.label).toBeGreaterThanOrEqual(item.action.top);
        expect(item.button.bottom, item.label).toBeLessThanOrEqual(item.action.bottom);
        expect(item.button.width, item.label).toBeGreaterThan(0);
        expect(item.button.height, item.label).toBeGreaterThan(0);
        expect(item.buttonStyle.display, item.label).not.toBe('none');
        expect(item.buttonStyle.visibility, item.label).toBe('visible');
        expect(Number(item.buttonStyle.opacity), item.label).toBe(0);
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
    .piggy-v2-page {
      --piggy-v2-scale: 1;
      --piggy-v2-scene-w: 1440px;
      --piggy-v2-scene-h: 1024px;
      --piggy-v2-white: #fff;
      --piggy-v2-line: #eee3d4;
      --piggy-v2-text: #2e2e2e;
      --piggy-v2-radius-pill: 999px;
      --piggy-v2-shadow-hover: 0 14px 30px rgba(77, 59, 35, .1);
      --v2-piggy-x: 470px;
      --v2-piggy-y: 168px;
      --v2-piggy-w: 548px;
      --v2-piggy-h: 632px;
      --v2-piggy-z: 14;
      --v2-coin-dock-x: 282px;
      --v2-coin-dock-y: 798px;
      --v2-coin-dock-w: 875px;
      --v2-coin-dock-h: 118px;
      --v2-coin-dock-z: 12;
      min-height: 100dvh;
    }
    .piggy-v2-scene { margin: 0 auto; }
    .piggy-v2-bank { background: rgba(117, 168, 107, .12); }
    .piggy-v2-coin-dock { background: rgba(244, 119, 115, .12); }
  </style>
</head>
<body>
  <section class="piggy-v2-page">
    <section class="piggy-v2-scene">
      <div class="piggy-v2-bank"></div>
      <div class="piggy-v2-coin-dock"></div>
      <section class="piggy-v2-shelf" aria-label="${t.shelf}">
        <div class="piggy-v2-shelf-grid" aria-label="${t.shelfList}">
          ${products.map(productCard).join('')}
        </div>
      </section>
    </section>
  </section>
</body>
</html>`;
}

function productCard(product) {
  const stateClass = product.status === 'pendingPurchase' ? 'is-purchased' : product.affordable ? 'is-affordable' : '';
  const button = product.canClick
    ? `<button type="button" class="piggy-v2-product-action-button" aria-label="${product.statusLabel} ${escapeHtml(product.name)}"></button>`
    : '';
  return `<article class="piggy-v2-product-card ${stateClass}" data-product-id="${product.id}" data-family-id="${product.family_id}" data-child-id="${product.child_id}" data-product-status="${product.status}" data-affordable="${product.affordable}">
    <img src="${imageDataUri(product.imageRatio)}" alt="${escapeHtml(product.name)}" />
    <strong title="${escapeHtml(product.name)}" aria-label="${escapeHtml(product.name)}">${escapeHtml(product.name)}</strong>
    <span>${product.price}</span>
    <div class="piggy-v2-product-action" data-status="${product.actionStatus}">
      <span class="piggy-v2-product-status-label">${product.statusLabel}</span>
      ${button}
    </div>
  </article>`;
}

function imageDataUri(ratio) {
  const size = ratio === 'tall'
    ? { width: 240, height: 640 }
    : ratio === 'square'
      ? { width: 420, height: 420 }
      : { width: 720, height: 240 };
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}">
    <rect width="100%" height="100%" fill="#f7c96f"/>
    <circle cx="${size.width / 2}" cy="${size.height / 2}" r="${Math.min(size.width, size.height) / 3}" fill="#f47773"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
