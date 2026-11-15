import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'StockWise',
        short_name: 'StockWise',
        theme_color: '#0E1B2E',
        background_color: '#F3F6F5',
        display: 'standalone',
      },
    }),
  ],
})
