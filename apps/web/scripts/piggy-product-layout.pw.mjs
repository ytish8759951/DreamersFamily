import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, '..');
const repoRoot = resolve(appRoot, '..', '..');
const artifactDir = resolve(repoRoot, 'artifacts', 'piggy-product-layout');

const familyId = '00000000-0000-4000-8000-000000000101';
const childId = '00000000-0000-4000-8000-000000000202';

const products = [
  {
    id: '00000000-0000-4000-8000-000000000301',
    family_id: familyId,
    child_id: childId,
    status: 'available',
    affordable: true,
    name: '超長商品名稱測試兩行省略不推擠狀態列',
    price: '$100',
    statusLabel: '購買',
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
    name: '222',
    price: '$999',
    statusLabel: '存款不足',
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
    name: '等待到貨商品',
    price: '$50',
    statusLabel: '等待到貨',
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
    name: '已到貨商品',
    price: '$80',
    statusLabel: '已到貨',
    actionStatus: 'arrived',
    canClick: true,
    imageRatio: 'wide'
  }
];

test.describe('piggy product card layout', () => {
  for (const viewport of [
    { name: 'ipad-landscape', width: 1024, height: 768 },
    { name: 'ipad-portrait', width: 768, height: 1024 }
  ]) {
    test(`${viewport.name} keeps visible status label inside product card`, async ({ page }) => {
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
      );

      await writeFile(resolve(artifactDir, `${viewport.name}-measurements.json`), JSON.stringify(measurements, null, 2), 'utf8');
      expect(measurements.map((item) => item.label)).toEqual(['購買', '存款不足', '等待到貨', '已到貨']);
      expect(measurements.map((item) => item.status)).toEqual(['available', 'insufficient', 'pending', 'arrived']);

      for (const item of measurements) {
        expect(item.image, item.label).not.toBeNull();
        expect(item.name, item.label).not.toBeNull();
        expect(item.price, item.label).not.toBeNull();
        expect(item.action, item.label).not.toBeNull();
        expect(item.labelRect, item.label).not.toBeNull();
        expect(item.image.top, item.label).toBeGreaterThanOrEqual(item.card.top);
        expect(item.image.bottom, item.label).toBeLessThanOrEqual(item.card.bottom);
        expect(item.image.width, item.label).toBeGreaterThan(0);
        expect(item.image.height, item.label).toBe(68);
        expect(item.imageStyle.objectFit, item.label).toBe('contain');
        expect(item.imageStyle.objectPosition, item.label).toBe('50% 50%');
        expect(item.imageStyle.backgroundColor, item.label).toBe('rgb(255, 248, 234)');
        expect(item.name.top, item.label).toBeGreaterThanOrEqual(item.image.bottom);
        expect(item.price.top, item.label).toBeGreaterThanOrEqual(item.name.top);
        expect(item.action.top, item.label).toBeGreaterThanOrEqual(item.card.top);
        expect(item.action.bottom, item.label).toBeLessThanOrEqual(item.card.bottom);
        expect(item.action.width, item.label).toBeGreaterThan(0);
        expect(item.action.height, item.label).toBeGreaterThanOrEqual(32);
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
        expect(parseFloat(item.labelStyle.fontSize), item.label).toBeGreaterThan(0);
      }

      expect(measurements[0].labelStyle.color).toBe('rgb(255, 255, 255)');
      expect(measurements[1].labelStyle.color).toBe('rgb(116, 106, 95)');
      expect(measurements[2].labelStyle.color).toBe('rgb(138, 87, 37)');
      expect(measurements[3].labelStyle.color).toBe('rgb(255, 255, 255)');

      expect(measurements[0].hasButton).toBe(true);
      expect(measurements[1].hasButton).toBe(false);
      expect(measurements[2].hasButton).toBe(false);
      expect(measurements[3].hasButton).toBe(true);
      for (const item of [measurements[0], measurements[3]]) {
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
    .piggy-v2-page { --piggy-v2-scale: 1; --v2-shelf-grid-column-gap: 28px; --v2-shelf-grid-row-gap: 6px; --v2-shelf-grid-w: 286px; --v2-shelf-grid-h: 528px; --piggy-v2-white: #fff; --piggy-v2-line: #eee3d4; --piggy-v2-text: #2e2e2e; --piggy-v2-radius-pill: 999px; --piggy-v2-shadow-hover: 0 14px 30px rgba(77, 59, 35, .1); min-height: 100dvh; }
    .piggy-v2-shelf { position: relative; width: 286px; height: 588px; margin: 32px auto; }
    .piggy-v2-shelf-grid { position: absolute; left: 0; top: 58px; }
  </style>
</head>
<body>
  <section class="piggy-v2-page">
    <section class="piggy-v2-shelf" aria-label="商品架">
      <div class="piggy-v2-shelf-grid" aria-label="商品架清單">
        ${products.map(productCard).join('')}
      </div>
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
