import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['node_modules/**/*', 'dist/**/*', 'src/generated/**/*'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      'strict': ['error', 'global'],
    },
  },
]; 