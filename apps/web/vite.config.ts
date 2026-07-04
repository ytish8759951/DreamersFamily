import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: false,
      injectManifest: {
        injectionPoint: 'self.__WB_MANIFEST',
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024
      },
      workbox: {
        cacheId: 'dreamers-family-sw-redirect-v1',
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
        'app-icon-parent-192.png',
        'app-icon-parent-512.png',
        'app-icon-192.png',
        'app-icon-512.png'
      ]
    })
  ]
});
