import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({ base: process.env.VITE_BASE || '/', plugins: [react()], server: { host: '127.0.0.1', port: 5173,
  proxy: { '/api': 'http://127.0.0.1:8000', '/ws': { target: 'ws://127.0.0.1:8000', ws: true } } },
  build: { outDir: process.env.VITE_STATIC === 'true' ? 'dist-pages' : 'dist', chunkSizeWarningLimit: 5000 } });
