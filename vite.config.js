import { defineConfig } from 'vite';

export default defineConfig({
  base: '/animation/',
  server: {
    open: false,
    port: 5173,
  },
  build: {
    target: 'esnext',
  },
});
