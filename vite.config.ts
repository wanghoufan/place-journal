import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '我的地点 · 私人打卡手账',
        short_name: '我的地点',
        description: '拍照片、说感受，整理成可筛选、可分享的私人地点手账',
        lang: 'zh-CN',
        theme_color: '#f7f1e5',
        background_color: '#f7f1e5',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [{ urlPattern: /^https:\/\/.*\.supabase\.co\/storage.*/, handler: 'CacheFirst', options: { cacheName: 'media-cache', expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 } } }],
      },
    }),
  ],
  server: { port: 5173 },
})
