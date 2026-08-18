#!/bin/bash
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; cd "$REPO" || exit 1
echo "═══ CANÁRIO: o modo diff apanha bugs plantados? ═══"
node --input-type=module -e "
import { DIFF_SYSTEM_PROMPT } from './tools/cockpit/runner/context-pack.mjs';

const casos = [
  { nome: 'condicao invertida', linhas: [
    '  42| function podeApagar(user, ficheiro) {',
    '  43|   if (user.isAdmin || ficheiro.owner !== user.id) {',
    '  44|     return true;',
    '  45|   }',
    '  46|   return false;' ], mudou: '43-44', bug: true },
  { nome: 'off-by-one', linhas: [
    '  10| function ultimos(lista, n) {',
    '  11|   const out = [];',
    '  12|   for (let i = lista.length - n; i <= lista.length; i++) {',
    '  13|     out.push(lista[i]);',
    '  14|   }',
    '  15|   return out;' ], mudou: '12-13', bug: true },
  { nome: 'mudanca CORRECTA (controlo)', linhas: [
    '  20| function soma(a, b) {',
    '  21|   if (!Number.isFinite(a) || !Number.isFinite(b)) return null;',
    '  22|   return a + b;',
    '  23| }' ], mudou: '21-22', bug: false },
];

for (const c of casos) {
  const prompt = [
    'Pilar: P2 — Qualidade & Verificação',
    'Ficheiro: tools/exemplo.js (linhas 1-60 de 60)', '',
    \`MUDARAM as linhas \${c.mudou}. O resto é contexto.\`, '',
    c.linhas.join('\n'), '',
    \`Esta mudança (linhas \${c.mudou}) introduz algum defeito?\`,
  ].join('\n');
  const r = await fetch('http://127.0.0.1:11434/api/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'qwen2.5-coder:14b', system: DIFF_SYSTEM_PROMPT, prompt, stream: false, options: { num_predict: 220 } }),
  });
  const j = await r.json();
  const t = String(j.response || '').trim().replace(/\s+/g, ' ');
  const disse = /ACHADO:/i.test(t) && !/SEM ACHADO/i.test(t);
  const certo = disse === c.bug;
  console.log((certo ? '✅' : '❌') + ' ' + c.nome + '  (esperado: ' + (c.bug ? 'ACHADO' : 'SEM ACHADO') + ')');
  console.log('    ' + t.slice(0, 170));
}
" 2>&1
echo ""
echo "(janela 40s)"; sleep 40
