import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: false,
      workbox: {
        cacheId: 'dreamers-family-supabase-cache-v3',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigateFallbackDenylist: [/^\/api\//]
      },
      includeAssets: [
        'manifest-parent.webmanifest',
        'manifest-child.webmanifest',
        'app-icon.svg',
        'app-icon-parent.svg',
        'app-icon-child.svg',
        'app-icon-parent.png',
        'app-icon-child.png',
        'app-icon-192.png',
        'app-icon-512.png'
      ]
    })
  ]
});
