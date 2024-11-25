import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import svgr from 'vite-plugin-svgr';

export default defineConfig({
  plugins: [react(), svgr()],
  build: {
    // Adjust this path to where you want to output your build files
    outDir: 'dist', // Adjust based on your project structure
    emptyOutDir: true, // Cleans the output directory before building
    rollupOptions: {
      input: {
        main: './index.html',        // Home page
      },
    },
  },
  server: {
    port: 5173, // Explicitly set the server port
    strictPort: true,
    host: '0.0.0.0', // Allows external access (useful for Docker)
    proxy: {
      // Proxy API requests to the backend (FastAPI in this case)
      '/api': {
        target: import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000/', // The backend server address
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''), // Remove '/api' prefix from the request
      },
      '/auth': {
        target: import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000/', // The backend server address
        changeOrigin: true,
      },
      '/user': {
        target: import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000/', // The backend server address
        changeOrigin: true,
      },
      '/food': {
        target: import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000/', // The backend server address
        changeOrigin: true,
      },
      '/logs': {
        target: import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000/', // The backend server address
        changeOrigin: true,
      },
      '/requirements': {
        target: import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000/', // The backend server address
        changeOrigin: true,
      },
      '/nutrients': {
        target: import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8000/', // The backend server address
        changeOrigin: true,
      },
    },
  },
})