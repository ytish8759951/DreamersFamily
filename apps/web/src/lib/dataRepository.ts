import { type LocalDataRepository } from './localData';
import {
  getSupabaseRuntimeInfo,
  subscribeSupabaseRuntimeInfo,
  SupabaseDataRepository,
  type SupabaseRuntimeInfo
} from './supabaseData';
import { startupTrace } from './startupTrace';

export type DataMode = 'supabase';

export const dataMode: DataMode = 'supabase';
export const dataModeLabel = 'Supabase';
export const dataModeBadgeLabel = 'SUPABASE MODE';
startupTrace('Repository.init start', { dataMode });
export const dataRepository: LocalDataRepository = new SupabaseDataRepository();
startupTrace('Repository.init finish', { repositoryName: dataRepository.constructor.name });

export type { SupabaseRuntimeInfo };
export { getSupabaseRuntimeInfo, subscribeSupabaseRuntimeInfo };
