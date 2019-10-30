module.exports = {
  env: {
    commonjs: true,
    es6: true,
    node: true,
  },
  extends: 'eslint:recommended',
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  plugins: ['sort-requires'],
  rules: {
    'no-use-before-define': ['error'],
    'sort-requires/sort-requires': 2,
    'no-var': 2,
    'require-atomic-updates': 0,
  },
}
