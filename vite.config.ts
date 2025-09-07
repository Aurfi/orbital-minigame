import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Base path for assets. For GitHub Pages deployments we pass VITE_BASE
  // as "/<repo-name>/" via CI; locally it stays "/".
  base: process.env.VITE_BASE || '/',
  esbuild: {
    // drop console/debugger in production builds to keep bundles clean
    pure: process.env.NODE_ENV === 'production' ? ['console.log', 'console.debug'] : [],
  },
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
