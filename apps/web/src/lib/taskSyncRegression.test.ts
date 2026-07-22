import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const appRoot = resolve(repoRoot, 'apps', 'web');
const migration029 = readFileSync(resolve(repoRoot, 'supabase', 'migrations', '029_task_sync_daily_instances.sql'), 'utf8');
const supabaseData = readFileSync(resolve(appRoot, 'src', 'lib', 'supabaseData.ts'), 'utf8');
const childPage = readFileSync(resolve(appRoot, 'src', 'pages', 'child', 'ChildPage.tsx'), 'utf8');
const parentTasks = readFileSync(resolve(appRoot, 'src', 'pages', 'parent', 'ParentFeaturePages.tsx'), 'utf8');
const taskRules = readFileSync(resolve(appRoot, 'src', 'lib', 'taskRules.ts'), 'utf8');

describe('task sync and daily task regression guards', () => {
  it('keeps daily task instances unique by template, child, and Taipei occurrence date', () => {
    expect(migration029).toContain('daily_template_id');
    expect(migration029).toContain('occurrence_date');
    expect(migration029).toContain('daily_template_active');
    expect(migration029).toContain('create unique index if not exists uq_daily_task_instance');
    expect(migration029).toContain('on public.tasks(family_id, child_id, daily_template_id, occurrence_date)');
    expect(migration029).toContain("timezone('Asia/Taipei', now())");
  });

  it('backfills parent repository snapshot tasks into formal Supabase tasks', () => {
    expect(migration029).toContain("parent_row.settings -> 'repository_state' -> 'tasks'");
    expect(migration029).toContain('jsonb_populate_recordset');
    expect(migration029).toContain('on conflict (id) do nothing');
  });

  it('uses controlled RPCs for parent task creation, daily ensure, and task approval stars', () => {
    expect(migration029).toContain('create or replace function public.upsert_parent_task_from_repository');
    expect(migration029).toContain('create or replace function public.ensure_daily_task_instances');
    expect(migration029).toContain('create or replace function public.approve_task_with_stars');
    expect(migration029).toContain('transaction_type, reason, task_id');
    expect(migration029).toContain("'task_reward'");
    expect(migration029).toContain("v_key := 'task:' || v_task.id::text || ':stars'");
  });

  it('ensures child scoped task reads are bound to the verified child and generate daily instances first', () => {
    expect(migration029).toContain('create or replace function public.get_child_scoped_repository_state');
    expect(migration029).toContain('perform public._ensure_daily_task_instances(v_child.family_id, v_child.id, null)');
    expect(migration029).toContain('task_row.family_id = v_child.family_id and task_row.child_id = v_child.id');
  });

  it('front-end task dates use Asia/Taipei and do not show a false 0/0 while loading', () => {
    expect(taskRules).toContain("timeZone: 'Asia/Taipei'");
    expect(parentTasks).toContain('getTodayTaskDate()');
    expect(childPage).toContain('taskSnapshotReady');
    expect(childPage).toContain('今日冒險（載入中）');
    expect(childPage).toContain('任務載入中，請稍候');
  });

  it('Supabase repository writes task rows through RPC instead of relying only on parent snapshots', () => {
    expect(supabaseData).toContain('upsert_parent_task_from_repository');
    expect(supabaseData).toContain('approve_task_with_stars');
    expect(supabaseData).toContain('ensure_daily_task_instances');
  });
});
