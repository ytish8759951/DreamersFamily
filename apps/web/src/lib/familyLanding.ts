import type { LocalDatabaseState } from './localTypes';
import type { SupabaseRuntimeInfo } from './supabaseData';

export function getLoggedInFamilyLandingPath(
  state: Pick<LocalDatabaseState, 'children' | 'currentChildIdentity' | 'deviceBinding' | 'active_child_id'>,
  runtimeInfo?: Pick<SupabaseRuntimeInfo, 'authStatus' | 'familyId' | 'parentId'>
) {
  let path: string;
  if (runtimeInfo && runtimeInfo.authStatus !== 'ready') {
    path = runtimeInfo.authStatus === 'needs_family' ? '/create-family' : '/login';
    console.log('[auth trace] getLoggedInFamilyLandingPath()', { runtimeInfo, path });
    return path;
  }

  const activeChildId = resolveActiveChildId(state);
  path = activeChildId ? `/child/home?childId=${encodeURIComponent(activeChildId)}` : '/create-child';
  console.log('[auth trace] getLoggedInFamilyLandingPath()', {
    activeChildId,
    runtimeInfo,
    path
  });
  return path;
}

export function resolveActiveChildId(
  state: Pick<LocalDatabaseState, 'children' | 'currentChildIdentity' | 'deviceBinding' | 'active_child_id'>
) {
  const activeChildren = state.children.filter((child) => child.status === 'active');
  return activeChildren[0]?.id ?? null;
}
