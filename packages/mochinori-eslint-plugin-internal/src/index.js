import noImportsFromSelf from './rules/no-imports-from-self.js';

const rules = {
  'no-imports-from-self': noImportsFromSelf,
};

const plugin = {
  configs: {
    'flat/all': /** @type {any} */ (null),
  },
  meta: {name: '@mochinori/eslint-plugin-internal'},
  rules,
};

// Created after `plugin` so the config can reference it
plugin.configs['flat/all'] = {
  plugins: {
    '@mochinori/internal': plugin,
  },
  rules: {
    '@mochinori/internal/no-imports-from-self': 'error',
  },
};

export default plugin;
