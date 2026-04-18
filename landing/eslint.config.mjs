// ESLint 9 flat config. Kept deliberately lean — we're adopting lint as a
// warning stream first, not a CI blocker. Existing code keeps shipping while
// warnings get cleaned up in subsequent commits. Promote rules from 'warn'
// to 'error' once `npm run lint` reports zero warnings.
import nextPlugin from '@next/eslint-plugin-next';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'public/**',
      'supabase/**',
      'next-env.d.ts',
      'out/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // Kept as warnings during initial adoption — see header.
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@next/next/no-img-element': 'warn',
      // Fail-fast env policy: callers must import from app/lib/env.ts.
      'no-restricted-properties': [
        'warn',
        {
          object: 'process',
          property: 'env',
          message: 'Import from app/lib/env.ts — gives you Zod-validated access and avoids silent undefined bugs.',
        },
      ],
    },
  },
);
