// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import angularPlugin from '@angular-eslint/eslint-plugin';
import angularTemplatePlugin from '@angular-eslint/eslint-plugin-template';
import templateParser from '@angular-eslint/template-parser';

/**
 * Ratchet rule (docs/professionalization-plan.md, Working rules): a rule that legacy code
 * cannot pass yet is enabled only for the folders listed in a scoped block below, and the
 * globs widen as code is migrated. Never add eslint-disable comments to make a gate pass.
 *
 * Deferred rules (scheduled in the plan, not silenced):
 * - @typescript-eslint/no-unsafe-* : Phase 3, rules #7 and #8. They come from untyped
 *   Supabase RPC results; generated DB types and Valibot parsers remove them at the source.
 */
const deferredToPhase3 = {
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-argument': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  '@typescript-eslint/no-unsafe-enum-comparison': 'off',
};

export default tseslint.config(
  {
    ignores: ['dist/', '.angular/', 'node_modules/', 'public/', 'coverage/'],
  },

  // Application TypeScript: type-aware rules over everything in tsconfig.eslint.json.
  {
    files: ['src/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@angular-eslint': angularPlugin },
    rules: {
      ...deferredToPhase3,
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-empty': ['error', { allowEmptyCatch: false }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/only-throw-error': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      // `_`-prefixed names and rest-sibling destructuring (`({ photo: _photo, ...rest })`) are intentional.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },

  // End-to-end tests (Playwright): same type-aware rules as the app, with the tsconfig of e2e/.
  {
    files: ['e2e/**/*.ts', 'playwright.config.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        project: ['./tsconfig.e2e.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      // Playwright fixtures that need no other fixture are declared as `async ({}, use)`.
      'no-empty-pattern': ['error', { allowObjectPatternsAsParameters: true }],
    },
  },

  // Angular components: OnPush and standalone, enforced where the code already complies.
  {
    files: ['src/app/features/**/*.ts'],
    rules: {
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
    },
  },

  // Layering (plan rule #1): core and shared never depend on feature components.
  {
    files: ['src/app/core/**/*.ts', 'src/app/shared/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/features/**'],
              message: 'core and shared must not import features (docs/professionalization-plan.md, rule #1).',
            },
          ],
        },
      ],
    },
  },

  // Angular templates: accessibility rules from angular-eslint.
  {
    files: ['src/**/*.html'],
    languageOptions: { parser: templateParser },
    plugins: { '@angular-eslint/template': angularTemplatePlugin },
    rules: {
      ...angularTemplatePlugin.configs.accessibility.rules,
    },
  },

  // Repository tooling, CommonJS scripts.
  {
    files: ['scripts/**/*.cjs'],
    extends: [eslint.configs.recommended],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
  },

  // Repository tooling, ESM configs.
  {
    files: ['*.config.mjs', 'eslint.config.mjs'],
    extends: [eslint.configs.recommended],
    languageOptions: { globals: globals.node, sourceType: 'module' },
  },
);
