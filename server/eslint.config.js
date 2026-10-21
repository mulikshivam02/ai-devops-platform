import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import unusedImports from 'eslint-plugin-unused-imports';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**', '*.mjs', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { project: './tsconfig.eslint.json', tsconfigRootDir: import.meta.dirname }
    },
    plugins: { 'unused-imports': unusedImports },
    rules: {
      // Dead code: autofixable, so `eslint --fix` strips the 25 unused imports.
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // Async correctness. Catches unawaited save()/create() calls.
      '@typescript-eslint/no-floating-promises': 'error',
      // Promote to 'error' in Phase 5 (remediation.executor / mockProvider are
      // declared async but never await -- that is a design signal, see review 3.6).
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',

      // Catches the `if (a) return true; if (!b) return false; return true;` shape
      // in ai/responseValidator.ts and similar always-true/always-false conditions.
      '@typescript-eslint/no-unnecessary-condition': 'warn',

      // Type-safety escape hatches should be visible, not silent.
      // Baseline as warnings so CI is green today. Promote to 'error' as the
      // corresponding review findings are closed:
      //   no-unsafe-*            -> Phase 3 (typed request validation / zod)
      //   no-restricted-properties -> Phase 5.6 (config/env.ts consolidation)
      //   no-base-to-string      -> Phase 4 (Loki label handling, review 4.8)
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-base-to-string': 'warn',
      '@typescript-eslint/no-unsafe-enum-comparison': 'warn',
      '@typescript-eslint/unbound-method': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',

      // process.env must only be read in config/env.ts. This is the rule that would
      // have caught the wrong-model-name bug in investigationService.ts and the
      // AI_PROVIDER read in ai/provider.ts.
      'no-restricted-properties': [
        'warn',
        {
          object: 'process',
          property: 'env',
          message: 'Read configuration from config/env.ts, never from process.env directly. See review 5.5.'
        }
      ]
    }
  },
  {
    // config/env.ts is the one place allowed to touch process.env.
    files: ['src/config/env.ts'],
    rules: { 'no-restricted-properties': 'off' }
  },
  {
    files: ['tests/**/*.ts'],
    rules: {
      'no-restricted-properties': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off'
    }
  },
  prettier
);
