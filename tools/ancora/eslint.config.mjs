import security from 'eslint-plugin-security';
const rules = {
  // allowEmptyCatch passou a TRUE a 2026-08-17, outra vez por veredicto do moo:
  // dos 58 no-empty, 41 eram `catch {}` e o juiz rejeitou-os todos com a mesma
  // razao — "e o padrao intencional deste repo para degradar sem rebentar".
  // Ficam so os blocos vazios que NAO sao catch, onde o vazio e mesmo suspeito.
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-unused-vars': 'off', 'no-undef': 'off',
  'require-atomic-updates': 'warn',                  // corrida real
  'no-fallthrough': 'warn', 'no-constant-condition': 'warn',
  'no-unsafe-negation': 'warn', 'no-unreachable': 'warn',
  'no-dupe-keys': 'warn', 'no-self-compare': 'warn',
  // DESLIGADA a 2026-08-17 pelo veredicto do proprio moo: das primeiras rondas
  // ancoradas, quase todos os apontamentos desta regra vieram FALSO POSITIVO com
  // justificacao boa ("este regex le padroes de linguagem natural, nao input
  // externo"). Num repo cujo trabalho E classificar prompts por regex, a regra
  // gera 63 avisos e nenhum defeito. O loop de feedback fechou: o juiz aperta o detetor.
  'security/detect-unsafe-regex': 'off',
  'security/detect-child-process': 'warn',
  'security/detect-non-literal-fs-filename': 'off',  // 1270 hits = ruído puro num CLI de ficheiros
  'security/detect-object-injection': 'off',
};
export default [
  { linterOptions: { reportUnusedDisableDirectives: 'off' } },
  { ignores: ['**/node_modules/**','**/dist/**','**/*.min.js','**/packs/**','**/docs/archive/**','**/*.test.*'] },
  { files: ['**/*.js','**/*.cjs'], languageOptions:{ ecmaVersion:2023, sourceType:'commonjs' }, plugins:{security}, rules },
  { files: ['**/*.mjs'],           languageOptions:{ ecmaVersion:2023, sourceType:'module'   }, plugins:{security}, rules },
];
