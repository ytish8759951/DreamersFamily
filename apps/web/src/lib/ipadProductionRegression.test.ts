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
    expect(styles).toContain('.v2-task-page .child-completed-task-media img');
    expect(styles).toContain('object-fit: cover');
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
});
