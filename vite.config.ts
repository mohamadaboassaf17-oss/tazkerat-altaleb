import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// PWA: autoUpdate SW registration is injected into index.html by the plugin
// ('auto' injectRegister default) — main.tsx stays free of SW code.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'robots.txt',
        'llms.txt',
        'sitemap.xml',
        'icons/pwa-72.png',
        'icons/pwa-96.png',
        'icons/pwa-128.png',
        'icons/pwa-144.png',
        'icons/pwa-152.png',
        'icons/pwa-180.png',
        'icons/pwa-192.png',
        'icons/pwa-384.png',
        'icons/pwa-512.png',
        'icons/pwa-512-maskable.png',
      ],
      manifest: {
        name: 'تذكرة الطالب',
        short_name: 'تذكرة',
        description:
          'مرجعك الشخصي في رحلة طلب العلم — تتبّع، ملاحظات، خريطة معرفية، ومراجعة مبرمجة',
        lang: 'ar',
        dir: 'rtl',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        id: '/',
        theme_color: '#1e6f50',
        background_color: '#fafaf9', // neutral-50
        orientation: 'any',
        display_override: ['window-controls-overlay'],
        handle_links: 'preferred',
        categories: ['education', 'productivity'],
        shortcuts: [
          {
            name: 'مراجعة اليوم',
            short_name: 'مراجعة',
            description: 'ابدأ مراجعة اليوم',
            url: '/review',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192' }],
          },
          {
            name: 'الخريطة المعرفية',
            short_name: 'الخريطة',
            description: 'افتح الخريطة الكاملة',
            url: '/graph',
            icons: [{ src: '/icons/pwa-192.png', sizes: '192x192' }],
          },
        ],
        screenshots: [
          {
            src: '/screenshots/narrow.png',
            sizes: '1080x1920',
            type: 'image/png',
            form_factor: 'narrow',
            label: 'لوحة التحكم — تذكرة الطالب',
          },
          {
            src: '/screenshots/wide.png',
            sizes: '1920x1080',
            type: 'image/png',
            form_factor: 'wide',
            label: 'الخريطة المعرفية — تذكرة الطالب',
          },
        ],
        icons: [
          { src: '/icons/pwa-72.png', sizes: '72x72', type: 'image/png' },
          { src: '/icons/pwa-96.png', sizes: '96x96', type: 'image/png' },
          { src: '/icons/pwa-128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icons/pwa-144.png', sizes: '144x144', type: 'image/png' },
          { src: '/icons/pwa-152.png', sizes: '152x152', type: 'image/png' },
          { src: '/icons/pwa-180.png', sizes: '180x180', type: 'image/png' },
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/pwa-384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: '/icons/pwa-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff,woff2,svg,png,jpg}'],
        navigateFallback: '/index.html',
        maximumFileSizeToCacheInBytes: 3_000_000,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'media-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 30 * 24 * 60 * 60 },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 50, maxAgeSeconds: 5 * 60 },
            },
          },
        ],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('react-force-graph') || id.includes('d3-') || id.includes('force-graph')) {
            return 'vendor-graph';
          }
          if (id.includes('node_modules')) {
            if (id.includes('dexie')) return 'vendor-dexie';
            if (id.includes('supabase')) return 'vendor-supabase';
            if (id.includes('react-router')) return 'vendor-router';
          }
          return undefined;
        },
      },
    },
  },
});
