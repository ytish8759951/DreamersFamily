import { localData, type LocalDataRepository } from './localData';
import { isSupabaseModeEnabled, SupabaseDataRepository } from './supabaseData';

export type DataMode = 'local' | 'supabase';

export const dataMode: DataMode = isSupabaseModeEnabled() ? 'supabase' : 'local';
export const dataRepository: LocalDataRepository =
  dataMode === 'supabase' ? new SupabaseDataRepository() : localData;
