import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    open: false,
    port: 5173,
  },
  build: {
    target: 'esnext',
  },
});
