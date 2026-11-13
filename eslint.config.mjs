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
 */
const featuresPattern = {
  group: ['**/features/**'],
  message: 'core and shared must not import features (docs/professionalization-plan.md, rule #1).',
};
const vendorPattern = {
  group: ['@supabase/*', 'posthog-js', 'posthog-js/*'],
  message: 'Vendor SDKs are imported only in src/app/core/adapters (docs/adr/0003-ports-and-adapters.md).',
};
/** Ratchet: files that still import a vendor SDK directly. Shrinks as each capability moves behind a port. */
const legacyVendorFiles = [];

export default tseslint.config(
  {
    ignores: [
      'dist/',
      '.angular/',
      'node_modules/',
      'public/',
      'coverage/',
      'src/app/core/adapters/supabase/database.types.ts',
    ],
  },

  // Application TypeScript: type-aware rules over everything in tsconfig.eslint.json.
  {
    files: ['src/**/*.ts'],
    extends: [eslint.configs.recommended, ...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json', './tsconfig.spec.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { '@angular-eslint': angularPlugin },
    rules: {
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
  // Vendor boundary (ADR 0003): vendor SDKs are imported only inside core/adapters. Files still using one directly
  // are listed in `legacyVendorFiles`; each is removed from the list when its capability moves behind a port.
  {
    files: ['src/app/core/**/*.ts', 'src/app/shared/**/*.ts'],
    ignores: ['src/app/core/adapters/**', ...legacyVendorFiles],
    rules: { 'no-restricted-imports': ['error', { patterns: [featuresPattern, vendorPattern] }] },
  },
  {
    files: ['src/app/core/adapters/**/*.ts', ...legacyVendorFiles.filter((file) => file.startsWith('src/app/core/'))],
    rules: { 'no-restricted-imports': ['error', { patterns: [featuresPattern] }] },
  },
  {
    files: ['src/**/*.ts'],
    ignores: ['src/app/core/**', 'src/app/shared/**', ...legacyVendorFiles],
    rules: { 'no-restricted-imports': ['error', { patterns: [vendorPattern] }] },
  },

  // Browser boundary (ADR 0003): storage, time, randomness and runtime config are reached through ports.
  // Only core/adapters/browser touches the globals; specs may use them to set up a test.
  {
    files: ['src/**/*.ts'],
    ignores: ['src/app/core/adapters/browser/**', 'src/**/*.spec.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'localStorage',
          message: 'Inject LOCAL_STORE (core/ports/key-value-store.port.ts) instead of using localStorage.',
        },
        {
          name: 'sessionStorage',
          message: 'Inject SESSION_STORE (core/ports/key-value-store.port.ts) instead of using sessionStorage.',
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Inject CLOCK (core/ports/clock.port.ts) and call clock.now().' },
        {
          object: 'Math',
          property: 'random',
          message: 'Inject RANDOM (core/ports/random.port.ts) and call random.next().',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: 'Inject CLOCK (core/ports/clock.port.ts) and call clock.date() or clock.iso().',
        },
        {
          selector: "MemberExpression[property.name='randomUUID']",
          message: 'Inject RANDOM (core/ports/random.port.ts) and call random.uuid().',
        },
        {
          selector: "MemberExpression[property.name='__SETPOINT_CONFIG__']",
          message: 'Inject APP_CONFIG (core/ports/app-config.port.ts) instead of reading window.__SETPOINT_CONFIG__.',
        },
        {
          selector: "MemberExpression[property.name='getRandomValues']",
          message: 'Inject RANDOM (core/ports/random.port.ts) and call random.int().',
        },
      ],
    },
  },

  // Ratchet: the schedule code still defaults its random source to Math.random (the production draw is wired to the
  // Random port in AppComponent). Remove these files when the schedule moves into domain/ with an injected source.
  {
    files: [
      'src/app/core/schedule.service.ts',
      'src/app/core/group-schedule.service.ts',
      'src/app/core/schedule-shuffle.ts',
    ],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Inject CLOCK (core/ports/clock.port.ts) and call clock.now().' },
      ],
    },
  },

  // Angular templates: accessibility rules from angular-eslint.
  {
    files: ['src/**/*.html'],
    languageOptions: { parser: templateParser },
    plugins: { '@angular-eslint/template': angularTemplatePlugin },
    rules: {
      // angular-eslint 22 no longer ships the `accessibility` preset, so the same rules are listed here.
      '@angular-eslint/template/alt-text': 'error',
      '@angular-eslint/template/click-events-have-key-events': 'error',
      '@angular-eslint/template/elements-content': 'error',
      '@angular-eslint/template/interactive-supports-focus': 'error',
      '@angular-eslint/template/label-has-associated-control': 'error',
      '@angular-eslint/template/mouse-events-have-key-events': 'error',
      '@angular-eslint/template/no-autofocus': 'error',
      '@angular-eslint/template/no-distracting-elements': 'error',
      '@angular-eslint/template/no-positive-tabindex': 'error',
      '@angular-eslint/template/role-has-required-aria': 'error',
      '@angular-eslint/template/table-scope': 'error',
      '@angular-eslint/template/valid-aria': 'error',
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
