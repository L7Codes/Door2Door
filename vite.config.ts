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
        // Map pictures are deliberately not stored by the app: Safari counts them as far bigger than they are.
      }
    })
  ]
});
