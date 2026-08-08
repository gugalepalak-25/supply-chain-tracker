import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The demo API server runs on :4000 (see src/api-server.ts). In dev, proxy
// /api requests there so the app is same-origin.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
})
