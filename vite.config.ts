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
      includeAssets: ['favicon.svg', 'icons/pwa-192.png', 'icons/pwa-512.png'],
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
        theme_color: '#1e6f50',
        background_color: '#fafaf9', // neutral-50
        categories: ['education', 'productivity'],
        icons: [
          { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
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
      },
    }),
  ],
});
