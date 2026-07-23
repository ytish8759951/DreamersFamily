import { test, expect } from '@playwright/test';

const sharedFeatures = [
  { key: 'tasks', label: '任務管理', countLabel: '任務數' },
  { key: 'shares', label: '今日分享', countLabel: '分享數' },
  { key: 'piggy', label: '撲滿／商品兌換', countLabel: '交易數' },
  { key: 'tablet', label: '平板時間', countLabel: '時間紀錄' },
  { key: 'growth', label: '成長紀錄', countLabel: '紀錄數' },
  { key: 'mailbox', label: '愛的信箱', countLabel: '訊息數' },
  { key: 'specialDays', label: '特別的日子', countLabel: '日子數' },
  { key: 'badges', label: '榮譽牆／徽章', countLabel: '徽章數' },
  { key: 'profile', label: '孩子個人資料與我的家', countLabel: '設定數' }
];

function appHtml(role) {
  return `<!doctype html>
    <html lang="zh-Hant">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>full-site-sync-${role}</title>
        <style>
          body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
          main { padding: 16px; }
          article { border: 1px solid #d8dde8; border-radius: 8px; padding: 10px; margin: 8px 0; }
          button { min-height: 40px; margin-right: 8px; }
          .pending { color: #8a5b00; }
          .stale { color: #a12828; }
        </style>
      </head>
      <body>
        <main>
          <h1>${role === 'parent' ? '家長端' : '孩子端'}同步稽核</h1>
          <div id="summary"></div>
          <button id="simulate-offline">Realtime 暫停</button>
          <button id="simulate-online">重新連線補抓</button>
          <section id="features"></section>
        </main>
        <script>
          const childId = 'child-0720';
          const secondChildId = 'child-second';
          const role = ${JSON.stringify(role)};
          const features = ${JSON.stringify(sharedFeatures)};
          let realtime = true;
          const seenRequests = new Set();
          let pendingFormalSnapshot = null;
          const state = {
            tasks: [],
            shares: [],
            piggy: [],
            tablet: [],
            growth: [],
            mailbox: [],
            specialDays: [],
            badges: [],
            profile: []
          };

          function snapshot(formal = pendingFormalSnapshot) {
            if (!formal) return;
            pendingFormalSnapshot = formal;
            for (const feature of features) {
              state[feature.key] = formal[feature.key].filter((item) => item.child_id === childId && !item.deleted_at);
            }
            render();
          }

          function render() {
            const featureHtml = features.map((feature) => {
              const items = state[feature.key];
              return '<article data-feature="' + feature.key + '">' +
                '<strong>' + feature.label + '</strong>' +
                '<p>' + feature.countLabel + ': <span data-count="' + feature.key + '">' + items.length + '</span></p>' +
                '<button data-add="' + feature.key + '">新增</button>' +
                '<button data-retry="' + feature.key + '">相同 request 重送</button>' +
                '<ul>' + items.map((item) => '<li data-formal-id="' + item.id + '">' + item.title + '</li>').join('') + '</ul>' +
              '</article>';
            }).join('');
            document.querySelector('#features').innerHTML = featureHtml;
            document.querySelector('#summary').textContent = features
              .map((feature) => feature.key + ':' + state[feature.key].length)
              .join(',');
          }

          function addFeature(featureKey, requestId) {
            if (seenRequests.has(requestId)) return;
            seenRequests.add(requestId);
            window.__formalStore_write(featureKey, {
              id: featureKey + '-' + requestId,
              child_id: childId,
              family_id: 'family-a',
              title: featureKey + ' 正式資料',
              client_request_id: requestId,
              media: featureKey === 'shares' || featureKey === 'growth' ? {
                bucket: 'family-media',
                object_path: 'families/family-a/children/child-0720/' + featureKey + '.jpg',
                signed_url_state: 'refreshable'
              } : null,
              updated_at: new Date().toISOString()
            });
          }

          document.addEventListener('click', (event) => {
            const addKey = event.target.dataset.add;
            const retryKey = event.target.dataset.retry;
            if (addKey) addFeature(addKey, addKey + '-request-1');
            if (retryKey) {
              addFeature(retryKey, retryKey + '-request-1');
              addFeature(retryKey, retryKey + '-request-1');
            }
          });

          window.__receiveFormalSnapshot = (formal) => {
            pendingFormalSnapshot = formal;
            if (realtime) snapshot(formal);
            else document.body.classList.add('stale');
          };
          document.querySelector('#simulate-offline').addEventListener('click', () => {
            realtime = false;
            document.body.classList.add('pending');
          });
          document.querySelector('#simulate-online').addEventListener('click', () => {
            realtime = true;
            document.body.classList.remove('pending', 'stale');
            snapshot();
          });
          render();
        </script>
      </body>
    </html>`;
}

test('iPad WebKit full-site sync audit uses formal ids across parent and child contexts', async ({ browser }) => {
  const formalStore = {
    data: Object.fromEntries(sharedFeatures.map((feature) => [feature.key, []])),
    listeners: [],
    get() {
      return JSON.parse(JSON.stringify(this.data));
    },
    write(featureKey, row) {
      const rows = this.data[featureKey];
      if (!rows.some((item) => item.client_request_id === row.client_request_id)) rows.push(row);
      for (const listener of this.listeners) listener();
    },
    subscribe(listener) {
      this.listeners.push(listener);
    }
  };

  const parentContext = await browser.newContext({
    viewport: { width: 1024, height: 1366 },
    isMobile: true,
    hasTouch: true
  });
  const childContext = await browser.newContext({
    viewport: { width: 1024, height: 1366 },
    isMobile: true,
    hasTouch: true
  });

  const parent = await parentContext.newPage();
  const child = await childContext.newPage();
  for (const page of [parent, child]) {
    page.on('console', (message) => {
      if (message.type() === 'error') throw new Error(message.text());
    });
    await page.exposeFunction('__formalStore_write', (featureKey, row) => formalStore.write(featureKey, row));
  }

  await parent.setContent(appHtml('parent'));
  await child.setContent(appHtml('child'));
  const sendSnapshot = async (page) => {
    await page.evaluate((formal) => window.__receiveFormalSnapshot(formal), formalStore.get());
  };
  formalStore.subscribe(() => {
    void sendSnapshot(parent);
    void sendSnapshot(child);
  });
  await sendSnapshot(parent);
  await sendSnapshot(child);

  for (const feature of sharedFeatures) {
    await parent.locator(`[data-feature="${feature.key}"] [data-add="${feature.key}"]`).click();
    await expect(parent.locator(`[data-count="${feature.key}"]`)).toHaveText('1');
    await expect(child.locator(`[data-count="${feature.key}"]`)).toHaveText('1');
    await expect(parent.locator(`[data-formal-id="${feature.key}-${feature.key}-request-1"]`)).toHaveCount(1);
    await expect(child.locator(`[data-formal-id="${feature.key}-${feature.key}-request-1"]`)).toHaveCount(1);

    await parent.locator(`[data-feature="${feature.key}"] [data-retry="${feature.key}"]`).click();
    await expect(parent.locator(`[data-count="${feature.key}"]`)).toHaveText('1');
    await expect(child.locator(`[data-count="${feature.key}"]`)).toHaveText('1');
  }

  await child.locator('#simulate-offline').click();
  formalStore.write('tasks', {
    id: 'tasks-request-2',
    child_id: 'child-0720',
    family_id: 'family-a',
    title: 'offline recovery task',
    client_request_id: 'tasks-request-2',
    updated_at: new Date().toISOString()
  });
  await expect(parent.locator('[data-count="tasks"]')).toHaveText('2');
  await expect(child.locator('[data-count="tasks"]')).toHaveText('1');
  await child.locator('#simulate-online').click();
  await expect(child.locator('[data-count="tasks"]')).toHaveText('2');

  formalStore.write('tasks', {
    id: 'other-child-task',
    child_id: 'child-second',
    family_id: 'family-a',
    title: 'second child task',
    client_request_id: 'other-child-task',
    updated_at: new Date().toISOString()
  });
  await expect(parent.locator('[data-formal-id="other-child-task"]')).toHaveCount(0);
  await expect(child.locator('[data-formal-id="other-child-task"]')).toHaveCount(0);

  await parentContext.close();
  await childContext.close();
});
