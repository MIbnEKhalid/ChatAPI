import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3030',
      '/mbkauthe': 'http://localhost:3030',
      '/icon.svg': 'http://localhost:3030',
      '/assets': 'http://localhost:3030',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
})
