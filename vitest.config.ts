import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': rootDir,
      'react-native': 'react-native-web',
    },
  },
  test: {
    include: [
      'tests/**/*.test.ts',
      'tests/**/*.test.tsx',
      'lib/**/__tests__/**/*.test.ts',
      'components/**/__tests__/**/*.test.tsx',
    ],
    exclude: process.env.VITEST_RULES ? [] : ['tests/firebase/database.rules.test.ts'],
    setupFiles: ['tests/setup/vitest-react-native.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['lib/**/*.ts', 'functions/src/**/*.ts'],
      exclude: ['lib/**/__tests__/**', 'lib/legal/bundled-legal.ts'],
      reporter: ['text', 'lcov'],
      thresholds: {
        statements: 53,
        branches: 50,
        functions: 62,
        lines: 53,
      },
    },
  },
});
