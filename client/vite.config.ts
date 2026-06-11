import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// During `npm run dev` the Vite dev server proxies /api to the Express
// backend on :8080 so the frontend and API share an origin.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
    },
  },
  build: {
    outDir: 'dist',
  },
});
