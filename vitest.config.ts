import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'lib/**/__tests__/**/*.test.ts'],
    exclude: process.env.VITEST_RULES ? [] : ['tests/firebase/database.rules.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts'],
      exclude: ['lib/**/__tests__/**', 'lib/legal/bundled-legal.ts'],
      reporter: ['text', 'lcov'],
    },
  },
});
