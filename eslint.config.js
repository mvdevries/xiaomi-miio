import tseslint from 'typescript-eslint';

export default tseslint.config(
  tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['tsconfig.json', 'tsconfig.test.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow explicit type annotations even when inferred (useful for public APIs)
      '@typescript-eslint/no-inferrable-types': 'off',
      // Allow non-null assertions where protocol guarantees correctness
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Enforce consistent type imports
      '@typescript-eslint/consistent-type-imports': 'error',
      // Disallow unused variables (allow underscore prefix)
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Require explicit return types on public API functions
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
      }],
      // Allow numbers in template literals (common for protocol error messages)
      '@typescript-eslint/restrict-template-expressions': ['error', {
        allowNumber: true,
      }],
      // Allow static-only classes (used for protocol namespacing: MiioPacket, MiioProtocol)
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
  {
    // Relaxed rules for test files
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      // node:test describe/it return promises that don't need to be awaited
      '@typescript-eslint/no-floating-promises': 'off',
      '@typescript-eslint/no-confusing-void-expression': 'off',
    },
  },
  {
    ignores: ['dist/', 'dist-test/'],
  },
);
