import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

/**
 * ISCIACUS Monitoring Dashboard - ESLint Configuration
 * =====================================================
 * FAANG-level strict configuration inspired by SellGlow iOS project
 *
 * Philosophy: Architecture-Driven Development (ADD)
 * - All rules are ERROR level (not warning)
 * - Zero tolerance for code quality violations
 * - Rules serve as executable architecture specs
 *
 * Categories:
 * 1. TypeScript Strict Mode
 * 2. React Best Practices
 * 3. Code Style & Complexity
 * 4. Security Rules
 */

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', '*.config.js', '*.config.ts'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      globals: globals.browser,
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      // ===========================================
      // 1. TYPESCRIPT STRICT MODE
      // ===========================================
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', {
        allowExpressions: true,
        allowTypedFunctionExpressions: true,
        allowHigherOrderFunctions: true,
      }],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/strict-boolean-expressions': ['error', {
        allowString: false,
        allowNumber: false,
        allowNullableObject: true,
      }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/prefer-nullish-coalescing': 'error',
      '@typescript-eslint/prefer-optional-chain': 'error',
      '@typescript-eslint/no-unnecessary-condition': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/restrict-template-expressions': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', {
        prefer: 'type-imports',
        fixStyle: 'inline-type-imports',
      }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/naming-convention': [
        'error',
        // Interfaces must be PascalCase
        {
          selector: 'interface',
          format: ['PascalCase'],
        },
        // Types must be PascalCase
        {
          selector: 'typeLike',
          format: ['PascalCase'],
        },
        // Variables and functions camelCase
        {
          selector: 'variableLike',
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
          leadingUnderscore: 'allow',
        },
        // Constants can be UPPER_CASE
        {
          selector: 'variable',
          modifiers: ['const'],
          format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
        },
        // React components must be PascalCase
        {
          selector: 'function',
          format: ['camelCase', 'PascalCase'],
        },
        // Enum members UPPER_CASE
        {
          selector: 'enumMember',
          format: ['UPPER_CASE'],
        },
      ],

      // ===========================================
      // 2. REACT BEST PRACTICES
      // ===========================================
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['error', {
        allowConstantExport: true,
      }],

      // ===========================================
      // 3. CODE STYLE & COMPLEXITY (Architecture-Driven)
      // ===========================================
      // File size limits - forces modular architecture
      'max-lines': ['error', {
        max: 300,
        skipBlankLines: true,
        skipComments: true,
      }],
      // Function size limits - forces single responsibility
      'max-lines-per-function': ['error', {
        max: 80,
        skipBlankLines: true,
        skipComments: true,
      }],
      // Nesting limits - forces flat, readable code
      'max-depth': ['error', 4],
      // Parameter limits - forces clean interfaces
      'max-params': ['error', 5],
      // Complexity limits - forces simple logic
      'complexity': ['error', 15],
      // Statement limits per function
      'max-statements': ['error', 25],
      // Nested callback limits
      'max-nested-callbacks': ['error', 3],
      // Ternary restrictions
      'no-nested-ternary': 'error',
      'no-unneeded-ternary': 'error',
      // Modern JS enforcement
      'prefer-const': 'error',
      'no-var': 'error',
      'prefer-template': 'error',
      'prefer-spread': 'error',
      'prefer-rest-params': 'error',
      'prefer-destructuring': ['error', {
        array: false,
        object: true,
      }],
      // Strict equality
      'eqeqeq': ['error', 'always'],
      'curly': ['error', 'all'],
      // No debugging artifacts
      'no-console': ['error', {
        allow: ['warn', 'error'],
      }],
      'no-debugger': 'error',
      'no-alert': 'error',
      // Array type style
      '@typescript-eslint/array-type': ['error', { default: 'array' }],

      // ===========================================
      // 4. SECURITY RULES
      // ===========================================
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',

      // ===========================================
      // 5. MAGIC NUMBERS (except common values)
      // ===========================================
      'no-magic-numbers': ['error', {
        ignore: [-1, 0, 1, 2, 100],
        ignoreArrayIndexes: true,
        ignoreDefaultValues: true,
        enforceConst: true,
      }],
    },
  },
  // ===========================================
  // FILE-SPECIFIC OVERRIDES
  // Complex legacy components that exceed limits
  // ===========================================
  {
    files: [
      '**/components/audit/AuditResults.tsx',
      '**/services/api.ts',
    ],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'complexity': 'off',
      'no-magic-numbers': 'off',
      '@typescript-eslint/no-unnecessary-condition': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
  {
    files: [
      '**/pages/SettingsPage.tsx',
      '**/components/analytics/funnel/FunnelMetrics.tsx',
    ],
    rules: {
      'max-lines-per-function': 'off',
    },
  },
)
