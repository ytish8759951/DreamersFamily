import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const appRoot = resolve(repoRoot, 'apps', 'web');
const migration029 = readFileSync(resolve(repoRoot, 'supabase', 'migrations', '029_task_sync_daily_instances.sql'), 'utf8');
const migration030 = readFileSync(resolve(repoRoot, 'supabase', 'migrations', '030_task_media_and_daily_canonicalization.sql'), 'utf8');
const migration031 = readFileSync(resolve(repoRoot, 'supabase', 'migrations', '031_child_scoped_active_task_filter.sql'), 'utf8');
const supabaseData = readFileSync(resolve(appRoot, 'src', 'lib', 'supabaseData.ts'), 'utf8');
const childPage = readFileSync(resolve(appRoot, 'src', 'pages', 'child', 'ChildPage.tsx'), 'utf8');
const parentTasks = readFileSync(resolve(appRoot, 'src', 'pages', 'parent', 'ParentFeaturePages.tsx'), 'utf8');
const taskRules = readFileSync(resolve(appRoot, 'src', 'lib', 'taskRules.ts'), 'utf8');

describe('task sync and daily task regression guards', () => {
  it('keeps daily task instances unique by template, child, and Taipei occurrence date', () => {
    expect(migration029).toContain('daily_template_id');
    expect(migration030).toContain('drop index if exists public.uq_daily_task_instance');
    expect(migration030).toContain('coalesce(daily_template_active, false) = false');
    expect(migration030).toContain('on public.tasks(family_id, child_id, daily_template_id, occurrence_date)');
    expect(migration029).toContain("timezone('Asia/Taipei', now())");
  });

  it('backfills parent repository snapshot task media into formal Supabase tasks', () => {
    expect(migration030).toContain("parent_row.settings -> 'repository_state' -> 'tasks'");
    expect(migration030).toContain('task_image_media_id');
    expect(migration030).toContain('thumbnail_media_id');
    expect(migration030).toContain('update public.media_assets as media');
  });

  it('uses controlled RPCs for parent task creation, daily ensure, and task approval stars', () => {
    expect(migration030).toContain('create or replace function public.upsert_parent_task_from_repository');
    expect(migration030).toContain('create or replace function public._ensure_daily_task_instances');
    expect(migration029).toContain('create or replace function public.approve_task_with_stars');
    expect(migration029).toContain("'task_reward'");
    expect(migration029).toContain("v_key := 'task:' || v_task.id::text || ':stars'");
  });

  it('ensures child scoped task reads are bound to the verified child and generate daily instances first', () => {
    expect(migration031).toContain('create or replace function public.get_child_scoped_repository_state');
    expect(migration031).toContain('perform public._ensure_daily_task_instances(v_child.family_id, v_child.id, v_today)');
    expect(migration031).toContain('task_row.family_id = v_child.family_id');
    expect(migration031).toContain("task_row.status not in ('cancelled', 'expired')");
    expect(migration031).toContain("task_row.category <> 'daily'");
    expect(migration031).toContain('task_row.occurrence_date = v_today');
  });

  it('front-end task dates use Asia/Taipei and do not show a false 0/0 while loading', () => {
    expect(taskRules).toContain("timeZone: 'Asia/Taipei'");
    expect(parentTasks).toContain('getTodayTaskDate()');
    expect(childPage).toContain('taskSnapshotReady');
    expect(childPage).toContain('今日冒險（載入中）');
    expect(childPage).toContain('任務載入中，請稍候');
  });

  it('treats formal task rows as source of truth and does not let stale snapshots override them', () => {
    expect(supabaseData).toContain('const remoteTasks = mergeTasks(');
    expect(supabaseData).toContain('[],');
    expect(supabaseData).toContain('const tableTaskIds = new Set(tableTasks.map((task) => task.id))');
    expect(supabaseData).toContain('tableTasks.forEach((task) => merge(task, true))');
    expect(supabaseData).toContain('task_image_media_id: row.task_image_media_id ?? null');
    expect(supabaseData).toContain('thumbnail_media_id: row.thumbnail_media_id ?? null');
  });
});
