import { useEffect, useState } from 'react';
import { dataMode, getSupabaseRuntimeInfo, subscribeSupabaseRuntimeInfo } from './dataRepository';

export function useSupabaseRuntimeInfo() {
  const [info, setInfo] = useState(getSupabaseRuntimeInfo);

  useEffect(() => {
    if (dataMode !== 'supabase') return;
    return subscribeSupabaseRuntimeInfo(setInfo);
  }, []);

  return info;
}
