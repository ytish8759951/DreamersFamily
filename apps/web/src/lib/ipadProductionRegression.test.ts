import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('iPad production regression hardening', () => {
  it('keeps completed child task cards image-only with no overlay text or completion badge', () => {
    const source = readRepoFile('apps/web/src/pages/child/ChildPage.tsx');
    const completedCard = source.slice(source.indexOf('function CompletedTaskCard'), source.indexOf('function ChildTaskEmpty'));
    const styles = readRepoFile('apps/web/src/styles/index.css');

    expect(completedCard).toContain('child-completed-task-image-button');
    expect(completedCard).not.toContain('task.reward_stars');
    expect(completedCard).not.toContain('child-completed-label');
    expect(completedCard).not.toContain('child-completed-check');
    expect(styles).toContain('Completed child tasks: image-only thumbnails');
    expect(styles).toContain('background: transparent !important');
    expect(styles).toContain('box-shadow: none !important');
    expect(styles).toContain('padding: 0 !important');
    expect(styles).toContain('.v2-task-page .child-completed-task-media img');
    expect(styles).toContain('object-fit: cover');
    expect(styles).not.toContain('.v2-task-page .child-completed-task-card span,\n');
    expect(completedCard).toContain('hasCompletedTaskPhoto');
    expect(completedCard).toContain('if (!mediaId) return null');
  });

  it('keeps the piggy product dialog footer tappable on iPhone Safari', () => {
    const piggyPage = readRepoFile('apps/web/src/pages/PiggyBankPage.tsx');
    const styles = readRepoFile('apps/web/src/styles/index.css');

    expect(piggyPage).toContain('piggy-product-form-scroll');
    expect(piggyPage).toContain('piggy-product-save-button');
    expect(piggyPage).toContain("submitLock.acquire(saveLockKey)");
    expect(styles).toContain('iOS product dialog hit-area safety');
    expect(styles).toContain('100dvh');
    expect(styles).toContain('env(safe-area-inset-bottom');
    expect(styles).toContain('min-height: 52px');
    expect(styles).toContain('pointer-events: auto');
    expect(styles).toContain('grid-template-rows: minmax(0, 1fr) auto');
  });

  it('loads parent share photos from media_asset_id with signed-url reload UI', () => {
    const album = readRepoFile('apps/web/src/components/LocalShareAlbum.tsx');
    const media = readRepoFile('apps/web/src/components/LocalShareMedia.tsx');
    const migration = readRepoFile('supabase/migrations/039_piggy_available_deposit_rpc.sql');

    expect(album).toContain('mediaId={photo.media_asset_id ?? photo.id}');
    expect(media).toContain('照片載入中');
    expect(media).toContain('重新載入');
    expect(media).toContain('setReloadKey((value) => value + 1)');
    expect(migration).toContain('add column if not exists media_asset_id');
  });

  it('locks piggy income, product submit, purchase and status actions before writing', () => {
    const piggyPage = readRepoFile('apps/web/src/pages/PiggyBankPage.tsx');

    expect(piggyPage).toContain('useSubmitLock');
    expect(piggyPage).toContain('piggy-product:create');
    expect(piggyPage).toContain('piggy-income');
    expect(piggyPage).toContain('piggy-buy');
    expect(piggyPage).toContain('處理中');
  });

  it('uses the shared iOS image pipeline for piggy product photos before product RPC', () => {
    const piggyPage = readRepoFile('apps/web/src/pages/PiggyBankPage.tsx');
    const pipeline = readRepoFile('apps/web/src/lib/imageUploadPipeline.ts');

    expect(pipeline).toContain('SUPPORTED_IMAGE_EXTENSIONS');
    expect(pipeline).toContain('image/heic');
    expect(pipeline).toContain('normalizeImageFileName');
    expect(pipeline).toContain('imageOrientation');
    expect(piggyPage).toContain('prepareImageFileForUpload');
    expect(piggyPage).toContain('ownerId,');
    expect(piggyPage).toContain('galleryImages.map((item) => item.file)');
    expect(piggyPage).toContain('商品儲存中');
    expect(piggyPage).toContain('piggyRepository.deleteProductImage');
  });

  it('keeps share multi-photo media asset ids unique and finalizes only after all uploads complete', () => {
    const childSharePage = readRepoFile('apps/web/src/pages/child/ChildPage.tsx');
    const shareRepository = readRepoFile('apps/web/src/lib/shareRepository.ts');
    const localData = readRepoFile('apps/web/src/lib/localData.ts');

    expect(childSharePage).toContain('for (let index = 0; index < total; index += 1)');
    expect(childSharePage).toContain('media_asset_id: uploadedMedia.id');
    expect(childSharePage).toContain('const createdShare = shareRepository.createShare');
    expect(childSharePage.indexOf('mediaInputs.push')).toBeLessThan(childSharePage.indexOf('const createdShare = shareRepository.createShare'));
    expect(childSharePage).toContain('第 ${index + 1} 張照片上傳失敗');
    expect(shareRepository).toContain('media_asset_id: mediaId');
    expect(localData).toContain('media_asset_id: item.media_asset_id ?? mediaId');
  });

  it('exposes parent mailbox and special-day production sync entry points', () => {
    const parentLayout = readRepoFile('apps/web/src/components/layout/ParentLayout.tsx');
    const mailboxPage = readRepoFile('apps/web/src/pages/parent/ParentFeaturePages.tsx');
    const specialDayMigration = readRepoFile('supabase/migrations/040_mailbox_special_day_notifications.sql');
    const supabaseData = readRepoFile('apps/web/src/lib/supabaseData.ts');

    expect(parentLayout).toContain("href: '/parent/mailbox'");
    expect(parentLayout).toContain("href: '/parent/special-days'");
    expect(mailboxPage).toContain("title=\"寫給孩子\"");
    expect(mailboxPage).toContain('ownerId: messageId');
    expect(mailboxPage).toContain('client_request_id: clientRequestId');
    expect(mailboxPage).toContain('prepareImageFileForUpload');
    expect(mailboxPage).toContain('deleteMailboxMedia');
    expect(specialDayMigration).toContain("'notifications'");
    expect(specialDayMigration).toContain('encouragement_card_received');
    expect(specialDayMigration).toContain('special_day_reminder');
    expect(supabaseData).toContain('fromSupabaseNotification');
    expect(supabaseData).toContain("table: 'notifications'");
  });

  it('keeps mailbox and special-day client_request_id idempotency in local cache', () => {
    const localData = readRepoFile('apps/web/src/lib/localData.ts');

    expect(localData).toContain('input.client_request_id ?? id()');
    expect(localData).toContain('item.client_request_id === clientRequestId');
    expect(localData).toContain('input.client_request_id ?? `special-day:create:${specialDayId}`');
    expect(localData).toContain('specialDay.client_request_id = input.client_request_id');
  });

  it('keeps parent mailbox image-only messages submittable on iOS file inputs', () => {
    const mailboxPage = readRepoFile('apps/web/src/pages/parent/ParentFeaturePages.tsx');
    const styles = readRepoFile('apps/web/src/styles/index.css');

    expect(mailboxPage).toContain('captureFirstSelectedFile(input, { clear: false })');
    expect(mailboxPage).toContain('clearFileInput(imageInputRef.current)');
    expect(mailboxPage).toContain("form.type === 'image'");
    expect(mailboxPage).toContain('Boolean(form.file)');
    expect(mailboxPage).toContain('圖片上傳中');
    expect(mailboxPage).toContain('訊息建立中');
    expect(mailboxPage).toContain('重新傳送');
    expect(mailboxPage).toContain('formatStatusCode');
    expect(mailboxPage).toContain('client_request_id: clientRequestId');
    expect(styles).toContain('.mailbox-image-error-actions');
    expect(styles).toContain('.local-form-status');
  });

  it('keeps parent special days mobile layout single-column without desktop overflow', () => {
    const specialDaysPage = readRepoFile('apps/web/src/pages/parent/SpecialDays.tsx');
    const styles = readRepoFile('apps/web/src/styles/index.css');

    expect(specialDaysPage).not.toContain('const nextReminder = upcoming[0] ?? null');
    expect(specialDaysPage).not.toContain('Stat label="下一個提醒"');
    expect(specialDaysPage.indexOf('<h2>即將到來</h2>')).toBeLessThan(specialDaysPage.indexOf('<h2>最近重要日子</h2>'));
    expect(specialDaysPage.indexOf('<h2>最近重要日子</h2>')).toBeLessThan(specialDaysPage.indexOf('<h2>歷史回顧</h2>'));
    expect(specialDaysPage.indexOf('<h2>歷史回顧</h2>')).toBeLessThan(specialDaysPage.indexOf('<h2>站內通知</h2>'));
    expect(styles).toContain('@media (max-width: 767px)');
    expect(styles).toContain('.special-days-grid');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr)');
    expect(styles).toContain('padding-bottom: calc(112px + env(safe-area-inset-bottom))');
    expect(styles).toContain('@media (max-width: 360px)');
  });
});
