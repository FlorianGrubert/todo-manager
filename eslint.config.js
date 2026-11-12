import js from '@eslint/js';
import vueI18n from '@intlify/eslint-plugin-vue-i18n';
import pluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/dist-check/**', '**/node_modules/**', '**/coverage/**', 'data/**', 'server/data/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, extraFileExtensions: ['.vue'] },
      globals: globals.browser,
    },
  },
  {
    files: ['server/**/*.ts', 'shared/**/*.ts', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['web/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
    },
  },
  // All user-visible texts must come from the translation files (§13).
  {
    files: ['web/**/*.vue'],
    plugins: { '@intlify/vue-i18n': vueI18n },
    settings: { 'vue-i18n': { localeDir: './web/src/locales/*.json', messageSyntaxVersion: '^11.0.0' } },
    rules: {
      '@intlify/vue-i18n/no-raw-text': ['error', { ignorePattern: '^[-–—•·☰×✓✕+/:#()\\s\\d]+$' }],
      '@intlify/vue-i18n/no-missing-keys': 'error',
    },
  },
);
