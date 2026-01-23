import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Per mobile dev constraints, enable dev SW unconditionally
  const devSW = true;
  return {
  base: '/Unpackd/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Make dev SW opt-in to avoid caching/HMR issues on mobile
      devOptions: {
        enabled: devSW,
        suppressWarnings: true,
        type: 'module'
      },
      workbox: {
        // Ensure manifest and PNG/SVG assets are precached for port forwarding
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        runtimeCaching: [
          {
            // Always fetch HTML navigations from network in dev to avoid stale index.html
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkOnly',
          },
          {
            // JS/CSS assets: prefer network, fallback to short-lived cache
            urlPattern: ({ url }) => url.pathname.endsWith('.js') || url.pathname.endsWith('.css') || url.pathname.startsWith('/assets/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'dev-assets',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 50, maxAgeSeconds: 60 },
            },
          },
        ],
      },
      includeAssets: ['icon.png', 'pwa-assets/favicon-196.png', 'pwa-assets/apple-icon-180.png', 'pwa-assets/*'],
      manifest: {
        id: 'unpackd',
        name: 'Unpackd',
        short_name: 'Unpackd',
        description: 'Track moving inventory via NTAG215 stickers',
        start_url: '/Unpackd/#/',
        scope: '/Unpackd/',
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
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
  }
};
});
