import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // `_name` means "required by the signature, deliberately unused" — the
      // shape of an interface method (`insert(selection, id, _cursor)`), the
      // second parameter of a `forwardRef` render function (React WARNS if it
      // is dropped), a destructured key being skipped. Without this the only
      // way to satisfy the rule is a `// eslint-disable-next-line` on each one,
      // which hides real unused variables in the noise of the exemptions.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    // Test files are never hot-reloaded, so `only-export-components` has
    // nothing to protect there — it would only force a suite's fixtures and
    // mount helpers into extra modules for a benefit that does not exist.
    files: ['**/__tests__/**/*.{ts,tsx}', '**/*.{test,spec}.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
