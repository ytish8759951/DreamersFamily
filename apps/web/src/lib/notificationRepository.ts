import { getChildSession, isChildSessionValid } from './childSessionRepository';
import { getUnreadNotificationIdsForCategory, type ChildUnreadCategory } from './childUnreadNotifications';
import { dataRepository } from './dataRepository';
import { supabaseClient } from './supabaseData';
import type { UUID } from './localTypes';

type ClearableChildUnreadCategory = Exclude<ChildUnreadCategory, 'mailbox'>;

export async function markChildInteractionNotificationsRead(
  childId: UUID,
  category: ClearableChildUnreadCategory
) {
  const state = dataRepository.getState();
  const localIds = getUnreadNotificationIdsForCategory(state, childId, category);
  if (!localIds.length) return 0;

  const session = getChildSession();
  if (supabaseClient) {
    const { error } = await supabaseClient.rpc('mark_child_notifications_read', {
      p_child_id: childId,
      p_category: category,
      p_device_binding_id: isChildSessionValid(session, childId) ? session.deviceBindingId : null,
      p_device_id: isChildSessionValid(session, childId) ? session.deviceId : null
    });
    if (error) throw error;
  }

  localIds.forEach((notificationId) => {
    try {
      dataRepository.markNotificationRead(notificationId);
    } catch {
      // The formal RPC is the source of truth; ignore stale local cache misses.
    }
  });
  return localIds.length;
}
