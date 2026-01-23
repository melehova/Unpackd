import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: {
        enabled: true,
        suppressWarnings: true,
        type: 'module'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: '/index.html',
      },
      includeAssets: ['icon.png', 'pwa-assets/favicon-196.png', 'pwa-assets/apple-icon-180.png', 'pwa-assets/*'],
      manifest: {
        id: 'unpackd',
        name: 'Unpackd',
        short_name: 'Unpackd',
        description: 'Track moving inventory via NTAG215 stickers',
        start_url: '/#/',
        scope: '/',
        theme_color: '#121212',
        background_color: '#121212',
        display: 'standalone',
        icons: [
          { src: '/pwa-assets/manifest-icon-192.maskable.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: '/pwa-assets/manifest-icon-512.maskable.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      }
    })
  ],
  server: {
    host: '0.0.0.0',
    port: 5173
  }
});
