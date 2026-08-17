#!/bin/bash
cd "$HOME/frugal" || exit 1
echo "═══ âncora estática: instalar eslint (isolado em tools/ancora) ═══"
mkdir -p tools/ancora && cd tools/ancora || exit 1
if [ ! -d node_modules/eslint ]; then
  cat > package.json <<'PJ'
{ "name": "moo-ancora", "private": true, "version": "0.0.0", "type": "module" }
PJ
  echo "→ npm install (eslint + regras de segurança)..."
  npm install --no-audit --no-fund --silent eslint@9 eslint-plugin-security 2>&1 | tail -5
fi
echo "eslint: $(./node_modules/.bin/eslint --version 2>/dev/null || echo 'FALHOU')"
cat > eslint.config.mjs <<'CFG'
import security from 'eslint-plugin-security';
export default [
  { ignores: ['**/node_modules/**','**/dist/**','**/*.min.js','**/packs/**','**/docs/archive/**'] },
  {
    files: ['**/*.js','**/*.mjs','**/*.cjs'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module' },
    plugins: { security },
    rules: {
      'no-empty': ['warn', { allowEmptyCatch: false }],   // catch vazio = erro engolido
      'no-unused-vars': 'off',
      'no-undef': 'off',
      'require-atomic-updates': 'warn',                    // corrida
      'no-fallthrough': 'warn',
      'no-constant-condition': 'warn',
      'security/detect-non-literal-fs-filename': 'warn',
      'security/detect-child-process': 'warn',
      'security/detect-unsafe-regex': 'warn',
      'security/detect-object-injection': 'off'            // ruidoso demais
    }
  }
];
CFG
cd "$HOME/frugal"
echo ""
echo "═══ correr sobre o código do runner + tools ═══"
./tools/ancora/node_modules/.bin/eslint \
  --no-config-lookup -c tools/ancora/eslint.config.mjs \
  --format json -o "$HOME/.mooter/ancora-eslint.json" \
  tools/cockpit tools/router tools/*.js 2>&1 | tail -5
python3 - <<'PY'
import json,os,collections
p=os.path.expanduser('~/.mooter/ancora-eslint.json')
try: d=json.load(open(p))
except Exception as e: print('sem output:',e); raise SystemExit
tot=0; byrule=collections.Counter(); hits=[]
for f in d:
    for m in f.get('messages',[]):
        tot+=1; byrule[m.get('ruleId')]+=1
        hits.append((f['filePath'].split('frugal/')[-1], m.get('line'), m.get('ruleId'), m.get('message')[:80]))
print(f"\n✅ ÂNCORA VIVA: {tot} ocorrências reais encontradas pelo analisador")
for r,c in byrule.most_common(8): print(f"   {c:4}  {r}")
print("\n--- amostra (ficheiro:linha  regra) ---")
for h in hits[:10]: print(f"   {h[0]}:{h[1]}  [{h[2]}] {h[3]}")
print(f"\n→ gravado em ~/.mooter/ancora-eslint.json (o runner pode consumir isto)")
PY
echo "(janela 45s)"; sleep 45
