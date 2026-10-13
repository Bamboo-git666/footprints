import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Windows 安全的 file URL → 路径（不依赖 @types/node）
const srcAlias = decodeURIComponent(
  new URL('./src', import.meta.url).pathname.replace(/^\/([a-zA-Z]:)/, '$1')
)

// 应用版本：主版本随功能迭代推进；构建时间每次 vite build 自动刷新，
// 注入到设置页（__APP_VERSION__）、窗口标题与 PWA manifest（快捷方式名称）
const APP_VERSION = '2.3'

// GitHub Pages 项目站点部署在 <用户名>.github.io/<仓库名>/ 子路径下，
// base 必须与仓库名保持一致（默认仓库名 footprints）
const BASE = '/footprints/'
const now = new Date()
const pad = (n: number) => String(n).padStart(2, '0')
const BUILD_STAMP = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`

// Footprints — local-first, no server component required.
export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    // 窗口标题注入版本（安装为 PWA 后窗口标题同步）
    {
      name: 'footprints:version-title',
      transformIndexHtml: (html) =>
        html.replace(
          'Footprints · 我的世界影像地图</title>',
          `Footprints · 我的世界影像地图 v${APP_VERSION}</title>`
        )
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: `Footprints · 我的世界影像地图 v${APP_VERSION}`,
        short_name: `Footprints v${APP_VERSION}`,
        description: '让每一张照片在世界地图上找到自己的位置',
        theme_color: '#090C11',
        background_color: '#090C11',
        display: 'standalone',
        orientation: 'any',
        start_url: '.',
        icons: [
          { src: 'favicon.svg', type: 'image/svg+xml', sizes: 'any', purpose: 'any' },
          { src: 'icon-192.png', type: 'image/png', sizes: '192x192', purpose: 'any' },
          { src: 'icon-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
          { src: 'icon-maskable-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^https?:\/\/.*/],
        runtimeCaching: [
          {
            // 地图瓦片缓存，便于离线浏览已访问区域
            urlPattern: ({ url }) =>
              url.hostname.endsWith('openfreemap.org') ||
              url.hostname.endsWith('openstreetmap.org') ||
              url.hostname.endsWith('cartocdn.com'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'footprints-map-tiles',
              expiration: { maxEntries: 4000, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': srcAlias
    }
  },
  define: {
    __APP_VERSION__: JSON.stringify(`v${APP_VERSION} · 构建 ${BUILD_STAMP}`)
  },
  build: {
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          motion: ['framer-motion'],
          db: ['dexie'],
          exif: ['exifreader'],
          cluster: ['supercluster'],
          zip: ['jszip']
        }
      }
    }
  }
})
