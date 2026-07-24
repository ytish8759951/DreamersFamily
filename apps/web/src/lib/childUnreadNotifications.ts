import type { LocalDatabaseState, LocalMailboxMessage, LocalNotification, UUID } from './localTypes';

export type ChildUnreadCategory = 'task' | 'share' | 'piggy' | 'mailbox';

export type ChildUnreadCounts = Record<ChildUnreadCategory, number>;

const EMPTY_COUNTS: ChildUnreadCounts = {
  task: 0,
  share: 0,
  piggy: 0,
  mailbox: 0
};

export function getChildUnreadCounts(state: LocalDatabaseState, childId: UUID | null | undefined): ChildUnreadCounts {
  if (!childId) return { ...EMPTY_COUNTS };
  const counts = { ...EMPTY_COUNTS };
  state.notifications
    .filter((notification) => isUnreadChildNotification(notification, childId))
    .forEach((notification) => {
      const category = notificationCategory(notification);
      if (category && category !== 'mailbox') counts[category] += 1;
    });

  counts.mailbox = state.encouragement_cards.filter((message) => isUnreadMailboxMessage(message, childId)).length;
  return counts;
}

export function getUnreadNotificationIdsForCategory(
  state: LocalDatabaseState,
  childId: UUID,
  category: Exclude<ChildUnreadCategory, 'mailbox'>
): UUID[] {
  return state.notifications
    .filter((notification) => isUnreadChildNotification(notification, childId) && notificationCategory(notification) === category)
    .map((notification) => notification.id);
}

export function formatUnreadBadge(count: number): string {
  if (count <= 0) return '';
  return count > 9 ? '9+' : String(count);
}

function isUnreadChildNotification(notification: LocalNotification, childId: UUID) {
  return notification.audience === 'child' && notification.child_id === childId && !notification.read_at;
}

function isUnreadMailboxMessage(message: LocalMailboxMessage, childId: UUID) {
  return message.child_id === childId
    && !message.archived_at
    && (message.sender_role ?? 'parent') === 'parent'
    && message.status !== 'opened';
}

function notificationCategory(notification: LocalNotification): ChildUnreadCategory | null {
  if (notification.source_type === 'task') return 'task';
  if (notification.source_type === 'share') return 'share';
  if (notification.source_type === 'piggy') return 'piggy';
  if (notification.source_type === 'mailbox') return 'mailbox';
  if (notification.type === 'new_task' || notification.type === 'task_approved' || notification.type === 'stars_awarded') {
    return notification.source_type === 'share' ? 'share' : 'task';
  }
  if (notification.type === 'mailbox_new_message') return 'mailbox';
  return null;
}
