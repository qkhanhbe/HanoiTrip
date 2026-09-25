import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ['/routes', '/items', '/config', '/health', '/version', '/boom', '/load'].map((path) => [
        path,
        'http://127.0.0.1:8080',
      ]),
    ),
  },
});
