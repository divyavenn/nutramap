import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import svgr from 'vite-plugin-svgr';
import { ImportMeta } from './vite-env';


export default defineConfig(({ mode }) => {
  // Load .env files based on the mode (e.g., .env.development or .env.production)
  let env = loadEnv(mode, process.cwd());
  console.log('Current mode:', mode);
  console.log('API URL:', env.VITE_API_URL);

  return {
    plugins: [react(), svgr()],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: './index.html',
        },
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      host: '0.0.0.0',
      proxy: {
        '/auth': {
          // target: env.VITE_API_URL, // Use the loaded environment variable
          target: 'http://localhost:8000',
          changeOrigin: true,
        },
        '/user': {
          target: env.VITE_API_URL,
          changeOrigin: true,
        },
        '/food': {
          target: env.VITE_API_URL,
          changeOrigin: true,
        },
        '/logs': {
          target: env.VITE_API_URL,
          changeOrigin: true,
        },
        '/requirements': {
          target: env.VITE_API_URL,
          changeOrigin: true,
        },
        '/nutrients': {
          target: env.VITE_API_URL,
          changeOrigin: true,
        },
      },
    },
  };
});