// @ts-nocheck
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readRepoFile(relativePath: string) {
  return readFileSync(resolve(process.cwd(), '..', '..', relativePath), 'utf8');
}

describe('test data cleanup safety', () => {
  it('qualifies family_id references in the latest cleanup RPC migration', () => {
    const sql = readRepoFile('supabase/migrations/023_fix_test_data_cleanup_fk_order.sql');

    expect(sql).not.toMatch(/\bwhere\s+family_id\s*=/i);
    expect(sql).not.toMatch(/\bon\s+family_id\s*=/i);
    expect(sql).not.toMatch(/\bselect\s+family_id\b/i);
    expect(sql).toContain('delete from public.tasks as t where t.family_id = v_target_family_id');
    expect(sql.indexOf('delete from public.piggy_banks as pb where pb.family_id = v_target_family_id')).toBeGreaterThan(-1);
    expect(sql.indexOf('delete from public.piggy_banks as pb')).toBeLessThan(sql.indexOf('delete from public.children as c'));
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

  it('closes the cleanup modal and restores document interaction after cleanup outcomes', () => {
    const source = readRepoFile('apps/web/src/pages/parent/Settings.tsx');
    const touchInteractions = readRepoFile('apps/web/src/lib/touchInteractions.ts');

    expect(source).toContain('function restoreCleanupModalInteractionState()');
    expect(source).toContain("document.querySelectorAll('.settings-modal-backdrop')");
    expect(source).toContain("element.removeAttribute('inert')");
    expect(source).toContain("element.removeAttribute('aria-hidden')");
    expect(source).toContain("document.body.classList.remove('modal-open')");
    expect(source).toContain("if (document.body.style.overflow === 'hidden') document.body.style.overflow = ''");
    expect(source).toContain('const closeCleanupDialog = () =>');
    expect(source).toContain('closeCleanupDialog();');
    expect(source).toContain('return restoreCleanupModalInteractionState');
    expect(source).toContain('withCleanupTimeout(settingsRepository.executeTestDataCleanup');
    expect(source).toContain('CLEANUP_OPERATION_TIMEOUT_MS');
    expect(touchInteractions).toContain("'.settings-modal-backdrop'");
  });

  it('keeps the settings page interactive before the cleanup dialog is opened', () => {
    const source = readRepoFile('apps/web/src/pages/parent/Settings.tsx');

    expect(source).toContain('const [cleanupOpen, setCleanupOpen] = useState(false)');
    expect(source).toContain('{cleanupOpen ? (');
    expect(source).toContain('<div className="settings-page">');
    expect(source).not.toContain('<form className="settings-page"');
    expect(source).toContain('type="button" onClick={saveSettings}');
    expect(source).toContain('SETTINGS INTERACTION DIAGNOSTICS');
    expect(source).toContain('getSettingsInteractionDiagnostics');
    expect(source).toContain('settingsBackdropCount');
    expect(source).toContain('fixedOverlays');
  });
});
