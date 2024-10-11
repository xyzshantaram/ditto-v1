import js from '@eslint/js';
import typescriptPlugin from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import type { Linter } from 'eslint';

export default [
  js.configs.recommended,
  {
    ignores: ['public/'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: parser,
    },
    plugins: {
      '@typescript-eslint': typescriptPlugin,
    },
    rules: {
      ...typescriptPlugin.configs.recommended.rules,
      'sort-imports': 'error',
    },
  },
] satisfies Linter.Config[];
