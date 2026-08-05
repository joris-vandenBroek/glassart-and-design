import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// Runs only tests/regression -- the opt-in staging regression suite (see its file header
// for the staging-only/no-real-email safety notes). Invoke via `npm run test:regression`.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    include: ['tests/regression/**/*.test.ts'],
    fileParallelism: false,
    // This suite exists for a human to read while it runs (unlike the default suite,
    // which is optimized for CI-style pass/fail). 'verbose' prints every it() by its full
    // description instead of one collapsed line per file, and disableConsoleIntercept lets
    // this file's own stap()/console.log narration print inline in real time.
    reporters: ['verbose'],
    disableConsoleIntercept: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
