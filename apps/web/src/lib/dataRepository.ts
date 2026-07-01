import { localData, type LocalDataRepository } from './localData';

export type DataMode = 'local' | 'supabase';

// MVP is intentionally locked to local mode. When SupabaseDataService is
// implemented, this is the only binding the UI needs to change.
export const dataMode: DataMode = 'local';
export const dataRepository: LocalDataRepository = localData;

