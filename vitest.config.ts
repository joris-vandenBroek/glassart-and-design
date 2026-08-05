import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    // tests/regression holds the heavier, opt-in staging regression suite (creates and
    // tears down real klanten/kunstenaars/bestellingen/drukkers) -- run it explicitly via
    // `npm run test:regression`, not as part of every default `npm test`.
    exclude: ['**/node_modules/**', '**/.worktrees/**', '**/.claude/worktrees/**', 'tests/regression/**'],
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
