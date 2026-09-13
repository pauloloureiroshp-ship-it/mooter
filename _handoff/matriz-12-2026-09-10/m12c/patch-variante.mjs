// patch-variante.mjs — aplica a emenda 1 (variantes c1/c2) ao m12c.mjs. Idempotente: recusa se já aplicado.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const p = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'm12c.mjs');
let s = fs.readFileSync(p, 'utf8');
if (s.includes('VARIANTE')) { console.log('já aplicado'); process.exit(0); }
const rep = (a, b) => { if (!s.includes(a)) { console.error('ANCORA AUSENTE:', a.slice(0, 70)); process.exit(1); } s = s.replace(a, b); };

rep(`const M = path.join(AQUI, 'm12c');
const RES0 = path.join(AQUI, 'results');
const JUZ0 = path.join(AQUI, 'juizes');
const RES = path.join(M, 'results');
const JUZ = path.join(M, 'juizes');
const SANDBOX = path.join(M, 'sandbox');`,
`// Variante (emenda 1): c1 = chave presente + arbiter DESLIGADO (mede «o T1 existe»);
// c2 = chave presente + arbiter ligado (mede o arbiter por cima da c1).
const VARIANTE = (process.argv.find((a) => a.startsWith('--variante=')) || '--variante=c2').slice(11);
if (!['c1', 'c2'].includes(VARIANTE)) { console.error('--variante=c1|c2'); process.exit(2); }
const M = path.join(AQUI, 'm12c', VARIANTE);
const RES0 = path.join(AQUI, 'results');
const JUZ0 = path.join(AQUI, 'juizes');
const RES = path.join(M, 'results');
const JUZ = path.join(M, 'juizes');
const SANDBOX = path.join(AQUI, 'm12c', 'sandbox');`);

rep(`  delete env.MOOTER_ARBITER_DISABLE; delete env.FRUGAL_V07_DISABLE; delete env.MOOTER_V07_DISABLE;`,
`  delete env.MOOTER_ARBITER_DISABLE; delete env.FRUGAL_V07_DISABLE; delete env.MOOTER_V07_DISABLE;
  if (VARIANTE === 'c1') env.MOOTER_ARBITER_DISABLE = '1';`);

rep(`    pergunta: 'Com o arbiter de Haiku ACTIVO (via o hook real), quantos dos prompts ambíguos mudam de degrau, para onde, e o que isso faz aos pontos e ao custo do braço B?',`,
`    variante: VARIANTE,
    pergunta: VARIANTE === 'c1'
      ? 'Com ANTHROPIC_API_KEY presente no env do hook real e o arbiter DESLIGADO, quais prompts deixam de ser rebaixados de T1 para T0 (classify.js:901), e o que isso faz aos pontos e ao custo do braço B?'
      : 'Com o arbiter de Haiku ACTIVO (via o hook real), por cima da c1, quantos dos prompts ambíguos mudam de degrau, para onde, e o que isso faz aos pontos e ao custo do braço B?',`);

rep(`    unica_variavel: 'o braço B passa por tools/router/inject_context.js com ANTHROPIC_API_KEY presente; o arbiter (arbiter.js) deixa de ser no-op. Tudo o resto — prompts, modelos por degrau, tecto 2048, system prompt local COMO ESTÁ (com «3 frases»), juízes, sorteio, respostas de A/C/D — igual à corrida principal.',`,
`    unica_variavel: VARIANTE === 'c1'
      ? 'o braço B passa por tools/router/inject_context.js com ANTHROPIC_API_KEY presente e MOOTER_ARBITER_DISABLE=1. O único efeito esperado é o T1 deixar de degradar para T0. Tudo o resto — prompts, modelos por degrau, tecto 2048, system prompt local COMO ESTÁ, juízes, sorteio, respostas de A/C/D — igual à corrida principal.'
      : 'o braço B passa por tools/router/inject_context.js com ANTHROPIC_API_KEY presente e o arbiter ligado; comparação primária contra a c1 (mesma chave, arbiter desligado), secundária contra a corrida principal. Ver AMENDMENT-1.md.',`);

rep(`    previsoes: {
      [\`o arbiter corre nos \${ambiguos.length} prompts do gatilho\`]: 'SIM',`,
`    previsoes: VARIANTE === 'c1' ? {
      'exactamente os 4 prompts que a regra classifica como T1 (LEGAL-1, LEGAL-3, DEV-2, MKT-4) sobem para T1/Haiku; os outros 8 não mudam': 'SIM',
      'nenhuma linha ARBITER no hint (kill-switch respeitado)': 'SIM',
      'B(c1) > B (56,5) nos 12': 'SIM',
      'B(c1) ≥ C (80,5) nos 12': 'NÃO',
      'nos 4 que sobem, B(c1) fica a ≤ 2 pontos de C (é o mesmo modelo, Haiku)': 'SIM',
      'custo imputado de B(c1) > custo de C (0,1527)': 'SIM (os 2 Opus dos T3 pesam)',
    } : {
      [\`o arbiter corre nos \${ambiguos.length} prompts do gatilho\`]: 'SIM',`);

rep(`  if (!k) falhas.push('ANTHROPIC_API_KEY ausente (env e ~/.claude/tools/router/.env): sem arbiter não há M12-c');`,
`  if (!k) falhas.push('ANTHROPIC_API_KEY ausente: sem chave não há M12-c (nem c1 nem c2)');
  if (k && VARIANTE === 'c2') {
    // O arbiter falha em silêncio sem saldo (medido: outcome:failed em 62 ms, nada no hint).
    // Uma sonda de 5 tokens ANTES decide se a corrida mede o arbiter ou mede nada.
    const r = spawnSync(process.execPath, ['-e', "fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':process.env.K,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:5,messages:[{role:'user',content:'ok'}]})}).then(async r=>{const j=await r.json();console.log(r.status+' '+(r.ok?'ok':(j.error&&j.error.message||'').slice(0,80)));process.exit(r.ok?0:1)})"],
      { encoding: 'utf8', timeout: 30000, env: { ...process.env, K: k.valor } });
    if (r.status !== 0) falhas.push('sonda de saldo falhou: ' + String(r.stdout || r.stderr).trim().slice(0, 100) + ' — a c2 não corre sem saldo');
  }`);

rep("  const out = ['# M12-c — o arbiter ligado, via o hook real', '', `Pré-registo: \\`m12c/protocol.json\\` (${prereg.congelado_em}). Gerado por \\`m12c.mjs comparar\\`.`, ''];",
    "  const out = [VARIANTE === 'c1' ? '# M12-c1 — a chave presente, o arbiter desligado: o T1 passa a existir' : '# M12-c2 — o arbiter ligado, por cima da c1', '', `Pré-registo: \\`m12c/${VARIANTE}/protocol.json\\` (${prereg.congelado_em}). Gerado por \\`m12c.mjs comparar --variante=${VARIANTE}\\`.`, ''];");

s = s.split("braco: 'B_m12c'").join("braco: 'B_m12' + VARIANTE");

rep(`  out.push('## Previsões pré-registadas');`,
`  if (VARIANTE === 'c1') {
    const r4 = ['LEGAL-1', 'LEGAL-3', 'DEV-2', 'MKT-4'];
    const subiram = Object.entries(rotas).filter(([, r]) => r.tier === 'T1').map(([id]) => id).sort();
    const semArb = Object.values(rotas).every((r) => /não correu/.test(r.arbiter));
    out.push('## Previsões pré-registadas (c1)'); out.push(''); out.push('| previsão | registado | resultado |'); out.push('|---|---|---|');
    out.push(\`| exactamente LEGAL-1, LEGAL-3, DEV-2, MKT-4 sobem para T1; os outros 8 não mudam | SIM | \${JSON.stringify(subiram) === JSON.stringify(r4.slice().sort()) && acc.mudaram === 4 ? 'SIM' : 'NÃO'} (\${subiram.join(', ')}; mudaram \${acc.mudaram}) |\`);
    out.push(\`| nenhuma linha ARBITER no hint | SIM | \${semArb ? 'SIM' : 'NÃO'} |\`);
    out.push(\`| B(c1) > B | SIM | \${acc.B1 > acc.B0 ? 'SIM' : 'NÃO'} (\${f(acc.B1)} vs \${f(acc.B0)}) |\`);
    out.push(\`| B(c1) ≥ C | NÃO | \${acc.B1 >= acc.C ? 'SIM' : 'NÃO'} (\${f(acc.B1)} vs \${f(acc.C)}) |\`);
    out.push(\`| custo B(c1) > custo C (0,1527) | SIM | \${acc.cB1 > 0.1527 ? 'SIM' : 'NÃO'} (\${acc.cB1.toFixed(4)}) |\`);
    out.push(\`| paragem: B(c1) ≥ A (\${f(acc.A)}) | — | \${acc.B1 >= acc.A ? '**DISPAROU — investigar**' : 'não disparou'} |\`);
    fs.writeFileSync(path.join(M, 'COMPARACAO.md'), out.join('\\n') + '\\n'); console.log(out.join('\\n')); process.exit(0);
  }
  out.push('## Previsões pré-registadas');`);

fs.writeFileSync(p, s);
console.log('patch aplicado; ocorrências de VARIANTE:', (s.match(/VARIANTE/g) || []).length);
