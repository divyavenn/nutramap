import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  build: {
    // Adjust this path to where you want to output your build files
    outDir: '../dist', // Adjust based on your project structure
    emptyOutDir: true, // Cleans the output directory before building
    rollupOptions: {
      input: {
        main: './index.html',        // Home page
        dashboard: './templates/dashboard.html',       // About page
      },
    },
  },
  server: {
    proxy: {
      // Proxy API requests to the backend (FastAPI in this case)
      '/api': {
        target: 'http://127.0.0.1:8000/', // The backend server address
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''), // Remove '/api' prefix from the request
      },
      '/auth': {
        target: 'http://127.0.0.1:8000/', // Proxy auth-related routes
        changeOrigin: true,
      },
      '/user': {
        target: 'http://127.0.0.1:8000/', // Proxy auth-related routes
        changeOrigin: true,
      },
    },
  },
})