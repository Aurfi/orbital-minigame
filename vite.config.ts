import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@/core': resolve(__dirname, 'src/core'),
      '@/physics': resolve(__dirname, 'src/physics'),
      '@/rendering': resolve(__dirname, 'src/rendering'),
      '@/ui': resolve(__dirname, 'src/ui'),
    },
  },
  server: {
    port: 9876,
    host: true,
  },
  build: {
    target: 'es2020',
    outDir: 'dist',
    sourcemap: true,
  },
});
