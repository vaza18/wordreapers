import eslint from '@eslint/js';
import { defineConfig } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import jsdoc from 'eslint-plugin-jsdoc';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

const libFiles = ['lib/**/*.ts'];
const appFiles = [
  'app/**/*.{ts,tsx}',
  'components/**/*.{ts,tsx}',
  'hooks/**/*.{ts,tsx}',
  'constants/**/*.ts',
  'store/**/*.ts',
  'i18n/**/*.ts',
];
const scriptFiles = ['scripts/**/*.ts', 'tests/**/*.{ts,tsx}', 'vitest.config.ts'];

export default defineConfig(
  {
    ignores: [
      'assets/generated/**',
      '.data/**',
      'node_modules/**',
      'docs/**',
      '.expo/**',
      'babel.config.cjs',
      'metro.config.cjs',
      'app.config.js',
      'plugins/**',
      'lib/legal/bundled-legal.ts',
      'functions/lib/**',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  jsdoc.configs['flat/recommended-typescript'],
  prettier,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      'jsdoc/no-types': 'error',
      'jsdoc/require-param': 'off',
      'jsdoc/require-returns': 'off',
      'jsdoc/require-param-description': 'warn',
      'jsdoc/require-returns-description': 'warn',
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: libFiles,
  })),
  {
    files: libFiles,
    languageOptions: {
      parserOptions: {
        project: './tsconfig.node.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/require-await': 'off',
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            ClassDeclaration: true,
            FunctionDeclaration: true,
            MethodDefinition: true,
          },
          contexts: [
            'ExportNamedDeclaration > FunctionDeclaration',
            'ExportNamedDeclaration > ClassDeclaration',
            'ExportNamedDeclaration > TSInterfaceDeclaration',
            'ExportNamedDeclaration > TSTypeAliasDeclaration',
            'MethodDefinition[kind="method"][accessibility!="private"]',
          ],
        },
      ],
    },
  },
  {
    files: appFiles,
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'jsdoc/require-jsdoc': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'expo-file-system/legacy',
              message: 'Use File, Directory, and Paths from expo-file-system instead.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['services/dictionary-service.ts'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      'jsdoc/require-jsdoc': 'off',
    },
  },
  {
    files: [
      'lib/feedback/**/*.ts',
      'lib/firebase/**/*.ts',
      'lib/profile/**/*.ts',
      'store/player-stats-store.ts',
      'lib/online/**/*.ts',
      'lib/native/**/*.ts',
      'lib/settings/**/*.ts',
    ],
    rules: {
      'jsdoc/require-jsdoc': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
  {
    files: scriptFiles,
    rules: {
      'jsdoc/require-jsdoc': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
);
