import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../backend/static', // Output directory where FastAPI will serve from
    emptyOutDir: true
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000', // Proxy API requests to FastAPI server
    }
  }
})
