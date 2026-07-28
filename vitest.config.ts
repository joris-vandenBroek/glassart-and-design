import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    exclude: ['**/node_modules/**', '**/.worktrees/**', '**/.claude/worktrees/**'],
    // All API-route tests share one real MySQL database (the mijn.host staging DB) with
    // blanket `DELETE FROM table` cleanup in beforeEach — running test files in parallel
    // causes cross-file interference (one file's cleanup wiping another's in-flight rows).
    fileParallelism: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
