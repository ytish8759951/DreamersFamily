import { describe, expect, it } from 'vitest';
import migration from '../../../../supabase/migrations/017_atomic_child_device_token_binding.sql?raw';

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
});
