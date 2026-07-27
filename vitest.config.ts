import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Vitest configuration.
 * Kept separate from vite.config.ts so the production build is not affected
 * (vite.config.ts uses a function form and injects API keys, not needed for tests).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
