// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), '..', '..', relativePath), 'utf8');
}

describe('test data cleanup safety', () => {
  it('qualifies family_id references in the latest cleanup RPC migration', () => {
    const sql = readRepoFile('supabase/migrations/022_fix_test_data_cleanup_family_id_ambiguity.sql');

    expect(sql).not.toMatch(/\bwhere\s+family_id\s*=/i);
    expect(sql).not.toMatch(/\bon\s+family_id\s*=/i);
    expect(sql).not.toMatch(/\bselect\s+family_id\b/i);
    expect(sql).toContain('delete from public.tasks as t where t.family_id = v_target_family_id');
    expect(sql).toContain('delete from public.family_members as fm');
    expect(sql).toContain('v_target_family_id as family_id');
  });

  it('keeps cleanup submit guarded and visibly pending in settings UI', () => {
    const source = readRepoFile('apps/web/src/pages/parent/Settings.tsx');
    const css = readRepoFile('apps/web/src/styles/index.css');

    expect(source).toContain('const [isDeleting, setIsDeleting] = useState(false)');
    expect(source).toContain('if (isDeleting || cleanupConfirmText !== CLEANUP_CONFIRM_TEXT || !cleanupPreview) return');
    expect(source).toContain('正在清空');
    expect(source).toContain('disabled={!canExecuteCleanup}');
    expect(source).not.toContain('建立示範資料');
    expect(source).not.toContain('移除示範資料');
    expect(css).toContain('.settings-cleanup-dialog > footer .is-danger:disabled');
    expect(css).toContain('min-width: 180px');
    expect(css).toContain('settings-spin');
  });
});
