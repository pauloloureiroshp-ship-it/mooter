import security from 'eslint-plugin-security';
const rules = {
  'no-empty': ['warn', { allowEmptyCatch: false }],  // catch vazio = erro engolido
  'no-unused-vars': 'off', 'no-undef': 'off',
  'require-atomic-updates': 'warn',                  // corrida real
  'no-fallthrough': 'warn', 'no-constant-condition': 'warn',
  'no-unsafe-negation': 'warn', 'no-unreachable': 'warn',
  'no-dupe-keys': 'warn', 'no-self-compare': 'warn',
  'security/detect-unsafe-regex': 'warn',
  'security/detect-child-process': 'warn',
  'security/detect-non-literal-fs-filename': 'off',  // 1270 hits = ruído puro num CLI de ficheiros
  'security/detect-object-injection': 'off',
};
export default [
  { ignores: ['**/node_modules/**','**/dist/**','**/*.min.js','**/packs/**','**/docs/archive/**','**/*.test.*'] },
  { files: ['**/*.js','**/*.cjs'], languageOptions:{ ecmaVersion:2023, sourceType:'commonjs' }, plugins:{security}, rules },
  { files: ['**/*.mjs'],           languageOptions:{ ecmaVersion:2023, sourceType:'module'   }, plugins:{security}, rules },
];
