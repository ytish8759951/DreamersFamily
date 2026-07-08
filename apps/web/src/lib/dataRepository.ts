import { type LocalDataRepository } from './localData';
import {
  getSupabaseRuntimeInfo,
  subscribeSupabaseRuntimeInfo,
  SupabaseDataRepository,
  type SupabaseRuntimeInfo
} from './supabaseData';

export type DataMode = 'supabase';

export const dataMode: DataMode = 'supabase';
export const dataModeLabel = 'Supabase';
export const dataModeBadgeLabel = 'SUPABASE MODE';
export const dataRepository: LocalDataRepository = new SupabaseDataRepository();

export type { SupabaseRuntimeInfo };
export { getSupabaseRuntimeInfo, subscribeSupabaseRuntimeInfo };
