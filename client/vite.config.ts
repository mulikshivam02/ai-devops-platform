import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// In development the app calls the relative URL /api (see services/api.ts), and this forwards it to
// the API, so the browser sees one origin and CORS never comes into it -- the same shape as production,
// where nginx does the forwarding.
const apiTarget = process.env.VITE_DEV_API_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': { target: apiTarget, changeOrigin: false } } },
  preview: { proxy: { '/api': { target: apiTarget, changeOrigin: false } } },
  test: {
    environment: 'jsdom',
    globals: false,
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts']
  }
});
