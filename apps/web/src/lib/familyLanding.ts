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

  return '/create-child';
}

export function resolveActiveChildId(
  state: Pick<LocalDatabaseState, 'children' | 'currentChildIdentity' | 'deviceBinding' | 'active_child_id'>
) {
  const activeChildren = state.children.filter((child) => child.status === 'active');
  return activeChildren[0]?.id ?? null;
}
