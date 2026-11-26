import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Social sites need an absolute link to the preview image. Set VITE_SITE_URL
// (for example https://stockwise.vercel.app) on Vercel and the build fills it in.
function absoluteSocialImage(): Plugin {
  const siteUrl = (process.env.VITE_SITE_URL ?? '').replace(/\/$/, '')
  return {
    name: 'absolute-social-image',
    transformIndexHtml: (html) => html.replaceAll('content="/og-image.jpg"', `content="${siteUrl}/og-image.jpg"`),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    absoluteSocialImage(),
    VitePWA({
      registerType: 'autoUpdate',
      // A new deploy replaces the old cached files straight away, so nobody is
      // stuck on an old version of the landing page or the app.
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        name: 'StockWise',
        short_name: 'StockWise',
        description: 'Stock records and loan-readiness reports for small shops in Rwanda',
        // The installed app opens on the products screen, not the public landing page.
        start_url: '/products',
        scope: '/',
        theme_color: '#1b5e4b',
        background_color: '#f5f6f4',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
