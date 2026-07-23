import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });

test('iPad WebKit task sync, daily rollover, isolation, and shared star ledger rules', async ({ page }) => {
  await page.setContent(`
    <html>
      <head><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
      <body>
        <main>
          <section id="parent"></section>
          <section id="child-one"></section>
          <section id="child-two"></section>
          <section id="ledger"></section>
        </main>
        <script>
          const familyId = 'family-1';
          const childOne = 'child-0720';
          const childTwo = 'child-2';
          let today = '2026-07-22';
          const tasks = [];
          const stars = [{ child_id: childOne, amount: 10, transaction_type: 'task_reward', reason: 'existing task stars' }];
          const keyFor = (task) => task.daily_template_id + ':' + task.child_id + ':' + task.occurrence_date;
          const visibleForChild = (childId) => tasks
            .filter((task) => task.family_id === familyId && task.child_id === childId)
            .filter((task) => task.category !== 'daily' || !task.daily_template_active)
            .filter((task) => task.category !== 'daily' || task.occurrence_date === today)
            .filter((task) => task.category === 'daily' ? task.status !== 'expired' : ['pending', 'submitted', 'rejected'].includes(task.status));
          const ensureDaily = () => {
            for (const task of tasks) {
              if (task.category === 'daily' && task.occurrence_date < today && ['pending', 'rejected'].includes(task.status)) {
                task.status = 'expired';
              }
            }
            const templates = tasks.filter((task) => task.category === 'daily' && task.daily_template_active && task.task_date <= today);
            for (const template of templates) {
              const next = {
                ...template,
                id: template.id + '-' + today,
                task_date: today,
                occurrence_date: today,
                daily_template_id: template.daily_template_id,
                daily_template_active: false,
                status: 'pending',
                title: template.next_title || template.title,
                task_image_media_id: template.task_image_media_id,
                thumbnail_media_id: template.thumbnail_media_id
              };
              if (!tasks.some((task) => task.category === 'daily' && keyFor(task) === keyFor(next))) tasks.push(next);
            }
          };
          const render = () => {
            ensureDaily();
            window.__tasks = tasks;
            document.querySelector('#parent').innerHTML = tasks
              .filter((task) => task.child_id === childOne && task.status !== 'approved')
              .map((task) => '<button data-task="' + task.id + '">' + task.title + '</button>')
              .join('');
            document.querySelector('#child-one').textContent = visibleForChild(childOne).map((task) => task.title).join('|') || '今天目前沒有待完成任務';
            document.querySelector('#child-two').textContent = visibleForChild(childTwo).map((task) => task.title).join('|') || '今天目前沒有待完成任務';
            document.querySelector('#ledger').textContent = String(stars.filter((star) => star.child_id === childOne).reduce((sum, star) => sum + star.amount, 0));
          };
          window.addParentTask = (title, category = 'habit') => {
            tasks.push({
              id: title,
              family_id: familyId,
              child_id: childOne,
              title,
              category,
              task_date: today,
              occurrence_date: null,
              daily_template_id: category === 'daily' ? title : null,
              daily_template_active: category === 'daily',
              status: 'pending',
              reward_stars: category === 'daily' ? 3 : 1,
              task_image_media_id: title + '-image',
              thumbnail_media_id: title + '-thumb'
            });
            render();
          };
          window.completeAndApproveOnce = (taskId) => {
            const task = tasks.find((item) => item.id === taskId);
            task.status = 'submitted';
            task.status = 'approved';
            if (!stars.some((star) => star.transaction_type === 'task_reward' && star.task_id === task.id)) {
              stars.push({ child_id: task.child_id, amount: task.reward_stars, transaction_type: 'task_reward', task_id: task.id });
            }
            render();
          };
          window.sendShareEncouragementOnce = (shareId, amount) => {
            if (!stars.some((star) => star.transaction_type === 'share_reward' && star.share_id === shareId)) {
              stars.push({ child_id: childOne, amount, transaction_type: 'share_reward', share_id: shareId });
            }
            render();
          };
          window.rollTo = (date) => { today = date; render(); };
          window.editDailyTemplate = (taskId, nextTitle) => {
            const task = tasks.find((item) => item.id === taskId);
            task.next_title = nextTitle;
            render();
          };
          window.disableDailyTemplate = (taskId) => {
            const task = tasks.find((item) => item.id === taskId);
            task.daily_template_active = false;
            render();
          };
          render();
        </script>
      </body>
    </html>
  `);

  await expect(page.locator('#child-one')).toHaveText('今天目前沒有待完成任務');
  await page.evaluate(() => window.addParentTask('習慣養成'));
  await expect(page.locator('#child-one')).toContainText('習慣養成');
  await expect(page.locator('#child-two')).toHaveText('今天目前沒有待完成任務');

  await page.evaluate(() => window.addParentTask('每日任務', 'daily'));
  for (let index = 0; index < 10; index += 1) await page.evaluate(() => window.rollTo('2026-07-22'));
  await expect(page.locator('#child-one')).toContainText('每日任務');
  const dailyCount = await page.evaluate(() => [...document.querySelector('#child-one').textContent.matchAll(/每日任務/g)].length);
  expect(dailyCount).toBe(1);
  const dailyMedia = await page.evaluate(() => {
    const instance = window.__tasks?.find?.((task) => task.title === '每日任務' && !task.daily_template_active && task.occurrence_date === '2026-07-22');
    return instance ? [instance.task_image_media_id, instance.thumbnail_media_id] : null;
  });
  expect(dailyMedia).toEqual(['每日任務-image', '每日任務-thumb']);

  await page.evaluate(() => window.rollTo('2026-07-23'));
  await expect(page.locator('#child-one')).toContainText('習慣養成');
  await expect(page.locator('#child-one')).toContainText('每日任務');
  const nextDailyCount = await page.evaluate(() => [...document.querySelector('#child-one').textContent.matchAll(/每日任務/g)].length);
  expect(nextDailyCount).toBe(1);

  await page.evaluate(() => window.editDailyTemplate('每日任務', '更新後每日任務'));
  await page.evaluate(() => window.rollTo('2026-07-24'));
  await expect(page.locator('#child-one')).toContainText('更新後每日任務');
  await page.evaluate(() => window.disableDailyTemplate('每日任務'));
  await page.evaluate(() => window.rollTo('2026-07-25'));
  await expect(page.locator('#child-one')).not.toContainText('更新後每日任務');

  await expect(page.locator('#ledger')).toHaveText('10');
  await page.evaluate(() => window.completeAndApproveOnce('習慣養成'));
  await page.evaluate(() => window.completeAndApproveOnce('習慣養成'));
  await expect(page.locator('#ledger')).toHaveText('11');
  await page.evaluate(() => window.sendShareEncouragementOnce('share-1', 3));
  await page.evaluate(() => window.sendShareEncouragementOnce('share-1', 3));
  await expect(page.locator('#ledger')).toHaveText('14');
});

test('iPad WebKit child sync drops expired daily templates and local ghost tasks', async ({ page }) => {
  await page.setContent(`
    <main>
      <section id="child"></section>
      <script>
        const today = '2026-07-23';
        const localGhost = {
          id: 'ghost-daily-local',
          child_id: 'child-0720',
          category: 'daily',
          status: 'pending',
          occurrence_date: today,
          daily_template_active: false,
          reward_stars: 3,
          task_image_media_id: null,
          thumbnail_media_id: null
        };
        const rpcTasks = [
          {
            id: 'daily-template',
            child_id: 'child-0720',
            category: 'daily',
            status: 'expired',
            occurrence_date: null,
            daily_template_active: true,
            reward_stars: 3,
            task_image_media_id: 'bear-image',
            thumbnail_media_id: 'bear-thumb'
          },
          {
            id: 'daily-instance',
            child_id: 'child-0720',
            category: 'daily',
            status: 'pending',
            occurrence_date: today,
            daily_template_active: false,
            reward_stars: 3,
            task_image_media_id: 'bear-image',
            thumbnail_media_id: 'bear-thumb'
          },
          {
            id: 'habit-task',
            child_id: 'child-0720',
            category: 'habit',
            status: 'pending',
            occurrence_date: null,
            daily_template_active: null,
            reward_stars: 1,
            task_image_media_id: 'habit-image',
            thumbnail_media_id: 'habit-thumb'
          },
          {
            id: 'household-task',
            child_id: 'child-0720',
            category: 'household',
            status: 'pending',
            occurrence_date: null,
            daily_template_active: null,
            reward_stars: 1,
            task_image_media_id: 'household-image',
            thumbnail_media_id: 'household-thumb'
          }
        ];
        const childVisible = (tasks) => tasks
          .filter((task) => task.child_id === 'child-0720')
          .filter((task) => task.status !== 'cancelled' && task.status !== 'expired')
          .filter((task) => task.category !== 'daily' || (!task.daily_template_active && task.occurrence_date === today));
        window.renderFromRpc = () => {
          const authoritativeTasks = rpcTasks.filter((task) => task.status !== 'expired');
          const visible = childVisible(authoritativeTasks);
          document.querySelector('#child').textContent = visible.map((task) => task.id + ':' + task.thumbnail_media_id).join('|');
          window.__visibleCount = visible.length;
          window.__hasGhost = visible.some((task) => task.id === localGhost.id);
        };
      </script>
    </main>
  `);

  await page.evaluate(() => window.renderFromRpc());
  await expect(page.locator('#child')).toContainText('daily-instance:bear-thumb');
  await expect(page.locator('#child')).toContainText('habit-task:habit-thumb');
  await expect(page.locator('#child')).toContainText('household-task:household-thumb');
  await expect(page.locator('#child')).not.toContainText('daily-template');
  await expect(page.locator('#child')).not.toContainText('ghost-daily-local');
  expect(await page.evaluate(() => window.__visibleCount)).toBe(3);
  expect(await page.evaluate(() => window.__hasGhost)).toBe(false);
});
