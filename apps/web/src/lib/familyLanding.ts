import type { LocalDatabaseState } from './localTypes';
import type { SupabaseRuntimeInfo } from './supabaseData';

export function getLoggedInFamilyLandingPath(
  state: Pick<LocalDatabaseState, 'children' | 'currentChildIdentity' | 'deviceBinding' | 'active_child_id'>,
  runtimeInfo?: Pick<SupabaseRuntimeInfo, 'authStatus' | 'familyId' | 'parentId'>
) {
  if (runtimeInfo && runtimeInfo.authStatus !== 'ready') {
    return runtimeInfo.authStatus === 'needs_family' ? '/create-family' : '/login';
  }

  const activeChildId = resolveActiveChildId(state);
  if (activeChildId) {
    return `/child/home?childId=${encodeURIComponent(activeChildId)}`;
  }

  return '/parent';
}

export function resolveActiveChildId(
  state: Pick<LocalDatabaseState, 'children' | 'currentChildIdentity' | 'deviceBinding' | 'active_child_id'>
) {
  const activeChildren = state.children.filter((child) => child.status === 'active');
  const preferredChildId =
    state.currentChildIdentity?.childId ??
    state.deviceBinding ??
    state.active_child_id ??
    null;

  if (preferredChildId && activeChildren.some((child) => child.id === preferredChildId)) {
    return preferredChildId;
  }

  return activeChildren[0]?.id ?? null;
}
