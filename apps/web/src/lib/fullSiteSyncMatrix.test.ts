import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('full-site cross-device sync matrix', () => {
  it('documents every shared parent/child feature area and the required sync dimensions', () => {
    const matrix = readRepoFile('docs/full-site-sync-matrix.md');
    const requiredSections = [
      '任務管理',
      '每日任務',
      '今日分享',
      '撲滿 / 商品兌換',
      '平板時間',
      '成長紀錄',
      '愛的信箱',
      '特別的日子',
      '榮譽牆 / 徽章',
      '孩子個人資料 / 我的家',
      '家長設定'
    ];
    const requiredColumns = [
      'Parent writes',
      'Child writes',
      'Formal tables / RPC',
      'Storage / media reference',
      'Realtime',
      'Refetch',
      'Idempotency',
      'Scope',
      'Offline recovery',
      'Test result'
    ];

    for (const section of requiredSections) expect(matrix).toContain(section);
    for (const column of requiredColumns) expect(matrix).toContain(column);
    expect(matrix).toContain('Follow-Up Required Before Claiming Full Transactional Coverage');
  });

  it('keeps parent Supabase hydrate and Realtime subscribed to formal shared tables', () => {
    const source = readRepoFile('apps/web/src/lib/supabaseData.ts');
    const formalTables = [
      'children',
      'device_bindings',
      'tasks',
      'task_records',
      'stars',
      'piggy_bank_records',
      'store_items',
      'purchases',
      'dreams',
      'dream_funds',
      'shares',
      'share_media',
      'encouragement_cards',
      'special_days',
      'growth_records',
      'tablet_time',
      'badges',
      'child_badges'
    ];

    for (const table of formalTables) {
      expect(source).toContain(`from('${table}')`);
      expect(source).toContain(`table: '${table}'`);
    }
  });

  it('tracks where shared writes are already idempotent and where the audit still requires RPC hardening', () => {
    const matrix = readRepoFile('docs/full-site-sync-matrix.md');
    const source = readRepoFile('apps/web/src/lib/supabaseData.ts');
    const migrations = [
      readRepoFile('supabase/migrations/028_share_encouragement_stars_rpc.sql'),
      readRepoFile('supabase/migrations/029_task_sync_daily_instances.sql'),
      readRepoFile('supabase/migrations/032_task_create_idempotency.sql'),
      readRepoFile('supabase/migrations/033_piggy_transaction_sync.sql')
    ].join('\n');

    expect(source).toContain('client_request_id');
    expect(source).toContain('encourage_share_with_stars');
    expect(migrations).toContain('approve_task_with_stars');
    expect(migrations).toContain('ensure_daily_task_instances');
    expect(migrations).toContain('uq_daily_task_instance');
    expect(matrix).toContain('create_piggy_income_with_deposit');
    expect(matrix).toContain('apply_piggy_purchase_event');
    expect(matrix).toContain('Screen-time star redemption and request approval should write');
  });
});
