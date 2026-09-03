import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { globalIgnores } from 'eslint/config'

export default tseslint.config([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs['recommended-latest'],
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Context providers ship next to the hook that reads them — splitting the
    // two across files to satisfy Fast Refresh would make the API worse for a
    // dev-only concern. Whitelist the hooks instead of silencing the rule.
    files: ['src/store/*.tsx', 'src/components/ui/Toast.tsx', 'src/components/layout/AppShell.tsx'],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        {
          allowConstantExport: true,
          allowExportNames: [
            'useAppState',
            'useActions',
            'useSelector',
            'useTheme',
            'useChartMode',
            'useToast',
            'useQuickAdd',
          ],
        },
      ],
    },
  },
])
