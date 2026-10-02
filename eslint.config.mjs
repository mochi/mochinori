// Adapted from the Lexical monorepo's eslint.config.mjs
// (https://github.com/facebook/lexical), MIT licensed.

import {fixupPluginRules} from '@eslint/compat';
import js from '@eslint/js';
import lexicalPlugin from '@lexical/eslint-plugin';
import mochinoriInternalPlugin from '@mochinori/eslint-plugin-internal';
import prettierConfig from 'eslint-config-prettier';
import compat from 'eslint-plugin-compat';
import importXPlugin from 'eslint-plugin-import-x';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import _noFunctionDeclareAfterReturn from 'eslint-plugin-no-function-declare-after-return';
import noOnlyTests from 'eslint-plugin-no-only-tests';
import _reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import _sortKeysFix from 'eslint-plugin-sort-keys-fix';
import globals from 'globals';
import {createRequire} from 'module';
import tseslint from 'typescript-eslint';

const require = createRequire(import.meta.url);
const restrictedGlobals = require('confusing-browser-globals');

// Wrap legacy plugins that use removed ESLint APIs (context.getScope, etc.)
const reactPlugin = fixupPluginRules(_reactPlugin);
const sortKeysFix = fixupPluginRules(_sortKeysFix);
const noFunctionDeclareAfterReturn = fixupPluginRules(
  _noFunctionDeclareAfterReturn,
);

const OFF = 0;
const WARN = 1;
const ERROR = 2;

export default [
  {
    ignores: [
      '**/dist/',
      '**/build/',
      '**/*.d.ts',
      '**/node_modules/',
      '**/.docusaurus/',
      '**/.alchemy/',
      '**/.wrangler/',
      'coverage/',
      'test-results/',
    ],
  },

  js.configs.recommended,

  mochinoriInternalPlugin.configs['flat/all'],

  // Base configuration for all files
  {
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.node,
        JSX: true,
      },
      sourceType: 'module',
    },

    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },

    plugins: {
      'import-x': importXPlugin,
      'jsx-a11y': fixupPluginRules(jsxA11yPlugin),
      'no-function-declare-after-return': noFunctionDeclareAfterReturn,
      'no-only-tests': noOnlyTests,
      react: reactPlugin,
      'simple-import-sort': simpleImportSort,
      'sort-keys-fix': sortKeysFix,
    },

    rules: {
      'accessor-pairs': OFF,
      'consistent-return': OFF,
      curly: [ERROR, 'all'],
      'dot-location': [ERROR, 'property'],
      'dot-notation': [ERROR, {allowPattern: '^(error|warn)$'}],
      'eol-last': ERROR,
      eqeqeq: [ERROR, 'allow-null'],
      'import-x/first': ERROR,
      'import-x/newline-after-import': ERROR,
      'import-x/no-duplicates': ERROR,
      indent: OFF,
      'jsx-a11y/alt-text': ERROR,
      'jsx-a11y/aria-props': WARN,
      'jsx-a11y/aria-role': WARN,
      'jsx-a11y/no-noninteractive-tabindex': WARN,
      'jsx-a11y/role-has-required-aria-props': WARN,
      'jsx-a11y/role-supports-aria-props': WARN,
      'jsx-a11y/tabindex-no-positive': WARN,
      'jsx-quotes': [ERROR, 'prefer-double'],
      'keyword-spacing': [ERROR, {after: true, before: true}],
      'max-len': OFF,
      'no-array-constructor': ERROR,
      'no-bitwise': OFF,
      'no-caller': ERROR,
      'no-console': [ERROR, {allow: ['warn', 'error', 'time', 'timeEnd']}],
      'no-debugger': ERROR,
      'no-eval': ERROR,
      'no-extend-native': WARN,
      'no-extra-bind': WARN,
      'no-function-declare-after-return/no-function-declare-after-return':
        ERROR,
      'no-implied-eval': ERROR,
      'no-inner-declarations': [ERROR, 'functions'],
      'no-label-var': WARN,
      'no-labels': [ERROR, {allowLoop: true, allowSwitch: true}],
      'no-lone-blocks': WARN,
      'no-multi-spaces': ERROR,
      'no-multi-str': ERROR,
      'no-new': WARN,
      'no-new-func': ERROR,
      'no-new-object': WARN,
      'no-new-wrappers': WARN,
      'no-octal-escape': WARN,
      'no-only-tests/no-only-tests': ERROR,
      'no-proto': ERROR,
      'no-restricted-globals': [ERROR].concat(restrictedGlobals),
      'no-restricted-syntax': [ERROR, 'WithStatement'],
      'no-script-url': ERROR,
      'no-self-compare': WARN,
      'no-sequences': WARN,
      'no-shadow': ERROR,
      'no-throw-literal': ERROR,
      'no-unneeded-ternary': WARN,
      'no-unused-expressions': ERROR,
      'no-unused-vars': [
        WARN,
        {
          args: 'none',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-use-before-define': OFF,
      'no-useless-call': WARN,
      'no-var': ERROR,
      'one-var': [WARN, {initialized: 'never'}],
      'operator-assignment': [WARN, 'always'],
      'prefer-const': ERROR,
      quotes: [
        ERROR,
        'single',
        {allowTemplateLiterals: true, avoidEscape: true},
      ],
      radix: WARN,
      'react/jsx-boolean-value': [ERROR, 'always'],
      'react/jsx-key': ERROR,
      'react/jsx-no-undef': ERROR,
      'react/jsx-tag-spacing': ERROR,
      'react/jsx-uses-react': OFF,
      'react/jsx-wrap-multilines': [
        ERROR,
        {assignment: false, declaration: false},
      ],
      'react/react-in-jsx-scope': OFF,
      'react/self-closing-comp': ERROR,
      'simple-import-sort/exports': ERROR,
      'simple-import-sort/imports': [
        ERROR,
        {
          groups: [['^.*\\u0000$'], ['^\\u0000'], ['^@?\\w'], ['^'], ['^\\.']],
        },
      ],
      'sort-keys-fix/sort-keys-fix': ERROR,
      'space-before-blocks': ERROR,
      'valid-typeof': [ERROR, {requireStringLiterals: true}],
    },
  },

  {
    plugins: {
      'react-hooks': reactHooksPlugin,
    },
    rules: {
      ...reactHooksPlugin.configs.recommended.rules,
      // react-hooks/refs has too many false positives (in ^7.0.1)
      'react-hooks/refs': OFF,
    },
  },

  // TypeScript
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
  })),
  lexicalPlugin.configs['flat/all'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint.plugin,
    },
    rules: {
      '@lexical/rules-of-lexical': WARN,
      '@typescript-eslint/array-type': [ERROR, {default: 'array'}],
      '@typescript-eslint/ban-ts-comment': OFF,
      // Type-only imports must say so, so that no type import ever emits a
      // runtime dependency (the packages build with verbatimModuleSyntax).
      '@typescript-eslint/consistent-type-imports': [
        ERROR,
        {disallowTypeAnnotations: false, fixStyle: 'separate-type-imports'},
      ],
      '@typescript-eslint/no-shadow': [
        ERROR,
        {
          ignoreFunctionTypeParameterNameValueShadow: false,
          ignoreTypeValueShadow: false,
        },
      ],
      '@typescript-eslint/no-this-alias': OFF,
      '@typescript-eslint/no-unused-vars': [
        ERROR,
        {
          args: 'none',
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-shadow': OFF,
      'no-unused-vars': OFF,
    },
  },

  // Scripts and config files may log
  {
    files: ['scripts/**', '**/alchemy.run.ts', '*.mjs', '*.mts'],
    rules: {
      'no-console': OFF,
    },
  },

  // Library sources: ban direct `document.X` and `window.X` member access so
  // editors inside Shadow DOM or iframes use the correct realm. See AGENTS.md.
  {
    files: ['packages/*/src/**'],
    ignores: ['packages/**/__tests__/**', 'packages/mochinori-website/**'],
    rules: {
      '@lexical/no-document-in-dom-methods': ERROR,
      'no-restricted-syntax': [
        ERROR,
        'WithStatement',
        {
          message:
            'Use $getDocument(), ownerDocument, or getRootOwnerDocument() instead of document.* for Shadow DOM / iframe safety. See AGENTS.md.',
          selector: 'MemberExpression[object.name="document"]',
        },
        {
          message:
            'Use getDefaultView() or the editor window instead of window.* for Shadow DOM / iframe safety. See AGENTS.md.',
          selector: 'MemberExpression[object.name="window"]',
        },
      ],
    },
  },

  // Public entry points use named exports only
  {
    files: ['packages/*/src/index.ts', 'packages/*/src/index.tsx'],
    rules: {
      'no-restricted-exports': [
        ERROR,
        {
          restrictDefaultExports: {
            defaultFrom: true,
            direct: true,
            named: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
    },
  },

  // Tests may import their own package and use test-only React patterns
  {
    files: ['**/__tests__/**'],
    rules: {
      '@mochinori/internal/no-imports-from-self': OFF,
      'react-hooks/globals': OFF,
      'react-hooks/immutability': OFF,
    },
  },

  // Docusaurus resolves `@site/`, `@theme/` and `@docusaurus/` aliases and
  // pages are default exports by convention.
  {
    files: ['packages/mochinori-website/**'],
    rules: {
      'no-restricted-syntax': OFF,
    },
  },

  // Prettier must be last to override formatting rules
  prettierConfig,

  // Compatibility with browserslist, for code that ships to browsers
  {
    ...compat.configs['flat/recommended'],
    files: ['packages/*/src/**'],
  },
];
