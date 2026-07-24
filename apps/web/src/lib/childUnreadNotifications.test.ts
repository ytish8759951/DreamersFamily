import { describe, expect, it } from 'vitest';
import { formatUnreadBadge, getChildUnreadCounts, getUnreadNotificationIdsForCategory } from './childUnreadNotifications';
import type { LocalDatabaseState } from './localTypes';

const childA = '00000000-0000-4000-8000-000000000101';
const childB = '00000000-0000-4000-8000-000000000102';

function state(overrides: Partial<LocalDatabaseState>): LocalDatabaseState {
  return {
    notifications: [],
    encouragement_cards: [],
    ...overrides
  } as LocalDatabaseState;
}

describe('child unread notification badges', () => {
  it('counts task, share, piggy and true mailbox unread records per child', () => {
    const current = state({
      notifications: [
        notification('task-1', childA, 'task'),
        notification('task-2', childA, 'task'),
        notification('share-1', childA, 'share'),
        notification('piggy-1', childA, 'piggy'),
        notification('read-task', childA, 'task', '2026-07-24T08:00:00.000Z'),
        notification('other-child-task', childB, 'task')
      ],
      encouragement_cards: [
        mailbox('mail-1', childA, 'sent'),
        mailbox('mail-2', childA, 'opened'),
        mailbox('mail-other-child', childB, 'sent')
      ]
    });

    expect(getChildUnreadCounts(current, childA)).toEqual({
      task: 2,
      share: 1,
      piggy: 1,
      mailbox: 1
    });
    expect(getChildUnreadCounts(current, childB)).toEqual({
      task: 1,
      share: 0,
      piggy: 0,
      mailbox: 1
    });
  });

  it('formats bottom-nav badge values and exposes only category ids for bulk clearing', () => {
    const current = state({
      notifications: [
        notification('task-1', childA, 'task'),
        notification('task-2', childA, 'task'),
        notification('mailbox-notification', childA, 'mailbox')
      ]
    });

    expect(formatUnreadBadge(0)).toBe('');
    expect(formatUnreadBadge(9)).toBe('9');
    expect(formatUnreadBadge(10)).toBe('9+');
    expect(getUnreadNotificationIdsForCategory(current, childA, 'task')).toEqual(['task-1', 'task-2']);
  });
});

function notification(id: string, childId: string, sourceType: string, readAt: string | null = null) {
  return {
    id,
    family_id: 'family',
    child_id: childId,
    type: sourceType === 'task' ? 'new_task' : sourceType === 'share' ? 'share_encouraged' : 'piggy_updated',
    title: 'test',
    body: null,
    audience: 'child',
    source_type: sourceType,
    source_id: id,
    read_at: readAt,
    created_at: '2026-07-24T08:00:00.000Z'
  } as LocalDatabaseState['notifications'][number];
}

function mailbox(id: string, childId: string, status: 'sent' | 'opened') {
  return {
    id,
    family_id: 'family',
    child_id: childId,
    sender_user_id: 'parent',
    sender_role: 'parent',
    title: null,
    message: null,
    card_type: 'image',
    template_key: null,
    media_bucket: 'family-media',
    media_path: 'mailbox/test.jpg',
    media_id: null,
    media_mime_type: 'image/jpeg',
    local_data_url: null,
    status,
    scheduled_at: null,
    sent_at: '2026-07-24T08:00:00.000Z',
    opened_at: status === 'opened' ? '2026-07-24T08:01:00.000Z' : null,
    archived_at: null,
    created_at: '2026-07-24T08:00:00.000Z',
    updated_at: '2026-07-24T08:00:00.000Z'
  } as LocalDatabaseState['encouragement_cards'][number];
}
