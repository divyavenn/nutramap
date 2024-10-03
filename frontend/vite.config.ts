import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  build: {
    // Adjust this path to where you want to output your build files
    outDir: '../static/js', // Adjust based on your project structure
    emptyOutDir: true, // Cleans the output directory before building
  }
})