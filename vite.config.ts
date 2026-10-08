import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// BASE is './' so the app works at any address (GitHub Pages sub-path included).
export default defineConfig({
  base: process.env.BASE ?? './',
  build: { outDir: process.env.OUT_DIR ?? 'dist', emptyOutDir: true },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Door2Door',
        short_name: 'Door2Door',
        description: 'Door-to-door knocking tracker',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0e151c',
        theme_color: '#0e151c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      },
      workbox: {
        navigateFallback: 'index.html',
        // Map tiles are cached as you use them, with a hard cap so they never swell.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.hostname.endsWith('tile.openstreetmap.org'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'tiles-street',
              expiration: { maxEntries: 1200, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: ({ url }) => url.hostname === 'server.arcgisonline.com',
            handler: 'CacheFirst',
            options: {
              cacheName: 'tiles-satellite',
              expiration: { maxEntries: 900, maxAgeSeconds: 60 * 60 * 24 * 30, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ]
});
