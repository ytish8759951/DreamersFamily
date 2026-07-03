import { localData, type LocalDataRepository } from './localData';
import { isSupabaseModeRequested, SupabaseDataRepository } from './supabaseData';

export type DataMode = 'local' | 'supabase';

export const dataMode: DataMode = isSupabaseModeRequested() ? 'supabase' : 'local';
export const dataRepository: LocalDataRepository =
  dataMode === 'supabase' ? new SupabaseDataRepository() : localData;
