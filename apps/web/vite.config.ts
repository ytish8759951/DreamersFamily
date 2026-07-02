import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      includeAssets: [
        'manifest-parent.webmanifest',
        'manifest-child.webmanifest',
        'app-icon.svg',
        'app-icon-parent.svg',
        'app-icon-child.svg',
        'app-icon-192.png',
        'app-icon-512.png'
      ]
    })
  ]
});
