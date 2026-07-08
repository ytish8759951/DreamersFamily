/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  readonly VITE_DATA_MODE?: 'local' | 'supabase';
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

interface Window {
  __APP_VERSION__?: {
    commit: string;
    buildTime: string;
    bundleHash: string | null;
  };
}
