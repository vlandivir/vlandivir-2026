import { defineConfig } from 'vite';
import path from 'node:path';

const host = process.env.TAURI_DEV_HOST;
const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: 'ws', host, port: 1421 }
      : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
    fs: {
      allow: [repoRoot],
    },
  },
  resolve: {
    alias: {
      '@shared': path.resolve(repoRoot, 'web/shared'),
    },
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true,
  },
});
