import { describe, expect, it } from 'vitest';
import migration from '../../../../supabase/migrations/017_atomic_child_device_token_binding.sql?raw';
import hardeningMigration from '../../../../supabase/migrations/018_harden_child_binding_anon_table_access.sql?raw';
import ambiguousColumnFixMigration from '../../../../supabase/migrations/019_fix_child_binding_rpc_ambiguous_columns.sql?raw';
import childLoginConflictFixMigration from '../../../../supabase/migrations/024_fix_child_login_challenge_conflict_ambiguity.sql?raw';
import childScopedRepositorySyncMigration from '../../../../supabase/migrations/025_child_scoped_repository_sync.sql?raw';

describe('Supabase child binding migration', () => {
  it('adds the production-missing token binding columns', () => {
    expect(migration).toContain('add column if not exists token text');
    expect(migration).toContain('add column if not exists child_name text');
    expect(migration).toContain('add column if not exists expires_at timestamptz');
    expect(migration).toContain('add column if not exists used_at timestamptz');
    expect(migration).toContain('add column if not exists revoked_at timestamptz');
    expect(migration).toContain('create index if not exists idx_device_bindings_token');
  });

  it('binds child devices through a minimum-surface RPC for anonymous tablets', () => {
    expect(migration).toContain('create or replace function public.bind_child_device_with_token');
    expect(migration).toContain('security definer');
    expect(migration).toContain('grant execute on function public.bind_child_device_with_token(text, uuid, text) to anon, authenticated');
    expect(migration).toContain('revoke select, insert, update, delete on public.device_bindings from anon');
    expect(migration).toContain('drop policy if exists repository_foundation_all on public.device_bindings');
    expect(migration).toContain('for update');
    expect(migration).toContain("qr_token_status = 'consumed'");
    expect(migration).toContain("binding_status = 'bound'");
  });

  it('removes direct anonymous table access after RPC binding is available', () => {
    expect(hardeningMigration).toContain('revoke all privileges on table public.device_bindings from anon');
    expect(hardeningMigration).toContain('revoke all privileges on table public.children from anon');
    expect(hardeningMigration).toContain('drop policy if exists repository_foundation_all on public.device_bindings');
    expect(hardeningMigration).toContain('drop policy if exists repository_foundation_all on public.children');
    expect(hardeningMigration).toContain('grant execute on function public.bind_child_device_with_token(text, uuid, text) to anon, authenticated');
  });

  it('qualifies child token columns that overlap with RPC output names', () => {
    expect(ambiguousColumnFixMigration).toContain('from public.children as child_row');
    expect(ambiguousColumnFixMigration).toContain('update public.children as child_row');
    expect(ambiguousColumnFixMigration).toContain('coalesce(child_row.child_token_consumed_at, v_now)');
    expect(ambiguousColumnFixMigration).not.toContain('coalesce(child_token_consumed_at, v_now)');
  });

  it('uses a named constraint for child login device binding upserts', () => {
    expect(childLoginConflictFixMigration).toContain('create or replace function public.complete_child_login_challenge');
    expect(childLoginConflictFixMigration).toContain('on conflict on constraint device_bindings_child_device_key');
    expect(childLoginConflictFixMigration).toContain('returning public.device_bindings.id into v_binding_id');
    expect(childLoginConflictFixMigration).not.toMatch(/\bon conflict\s*\(\s*child_id\s*,\s*device_id\s*\)/i);
    expect(childLoginConflictFixMigration).not.toMatch(/\bwhere\s+(child_id|device_id|family_id|status)\s*=/i);
  });

  it('hydrates and syncs repository data through an active child device binding', () => {
    expect(childScopedRepositorySyncMigration).toContain('create or replace function public.get_child_scoped_repository_state');
    expect(childScopedRepositorySyncMigration).toContain('create or replace function public.sync_child_scoped_repository_delta');
    expect(childScopedRepositorySyncMigration).toContain('security definer');
    expect(childScopedRepositorySyncMigration).toContain("binding_row.child_id = p_child_id");
    expect(childScopedRepositorySyncMigration).toContain("binding_row.device_id = p_device_id");
    expect(childScopedRepositorySyncMigration).toContain("binding_row.binding_status = 'bound'");
    expect(childScopedRepositorySyncMigration).toContain("coalesce(binding_row.device_binding_status, 'active') = 'active'");
    expect(childScopedRepositorySyncMigration).toContain('binding_row.revoked_at is null');
    expect(childScopedRepositorySyncMigration).toContain('binding_row.replaced_at is null');
    expect(childScopedRepositorySyncMigration).toContain('task_row.family_id = v_child.family_id and task_row.child_id = v_child.id');
    expect(childScopedRepositorySyncMigration).toContain('store_row.family_id = v_child.family_id and store_row.child_id = v_child.id');
    expect(childScopedRepositorySyncMigration).toContain('purchase_row.family_id = v_child.family_id and purchase_row.child_id = v_child.id');
    expect(childScopedRepositorySyncMigration).toContain('where task_row.family_id = v_family_id and task_row.child_id = p_child_id');
    expect(childScopedRepositorySyncMigration).toContain('grant execute on function public.get_child_scoped_repository_state(uuid, text, uuid) to anon, authenticated');
    expect(childScopedRepositorySyncMigration).toContain('grant execute on function public.sync_child_scoped_repository_delta(uuid, text, uuid, jsonb) to anon, authenticated');
  });
});
