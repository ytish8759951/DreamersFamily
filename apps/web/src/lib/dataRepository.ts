import { localData, type LocalDataRepository } from './localData';
import {
  getSupabaseRuntimeInfo,
  isSupabaseModeRequested,
  subscribeSupabaseRuntimeInfo,
  SupabaseDataRepository,
  type SupabaseRuntimeInfo
} from './supabaseData';

export type DataMode = 'local' | 'supabase';

export const dataMode: DataMode = isSupabaseModeRequested() ? 'supabase' : 'local';
export const dataModeLabel = dataMode === 'supabase' ? 'Supabase' : 'localStorage';
export const dataModeBadgeLabel = dataMode === 'supabase' ? 'SUPABASE MODE' : 'LOCAL MODE';
export const dataRepository: LocalDataRepository =
  dataMode === 'supabase' ? new SupabaseDataRepository() : localData;

export type { SupabaseRuntimeInfo };
export { getSupabaseRuntimeInfo, subscribeSupabaseRuntimeInfo };
