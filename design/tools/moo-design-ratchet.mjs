#!/usr/bin/env node
/**
 * moo-design-ratchet — o portão que pode ficar verde HOJE sem baixar o limiar.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 * ---------------------------
 * O `MOO_LIMIAR` é 8. O índice medido a 2026-08-27, depois de o portão passar a
 * medir a sério, é 3,18. Ligar `moo-design-check --ci` ao CI hoje deixa o `main`
 * vermelho de forma permanente — e um CI cronicamente vermelho é um CI que se
 * aprende a ignorar, que é o mesmo destino do `<router-hint>` a 0,23%.
 *
 * A saída fácil seria pôr `MOO_LIMIAR=3`. A decisão de 2026-08-27 proíbe-o em
 * texto: «os limiares do portão sobem quando as verificações `n/d` passarem a
 * medir — nunca por conveniência de uma onda».
 *
 * Então não se mexe no limiar. Acrescenta-se uma segunda regra, mais fraca mas
 * vinculativa desde o primeiro dia, que é a régua que este repo já usa noutros
 * sítios (`wave-gate.mjs`: «a suite não pode piorar»; `docs-hygiene --ratchet`):
 *
 *     o índice NUNCA desce, e nenhuma verificação perde pontos.
 *
 * O limiar 8 continua a ser o alvo publicado e por atingir. A linha de base está
 * em `design/.design-baseline.json`, é dados, e só se actualiza para CIMA — a
 * subida é um commit deliberado, com o número antes e depois à vista.
 *
 *   node design/tools/moo-design-ratchet.mjs             # relatório
 *   node design/tools/moo-design-ratchet.mjs --ci        # sai 1 se piorou
 *   node design/tools/moo-design-ratchet.mjs --promover  # sobe a base (só sobe)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESIGN = resolve(AQUI, '..');
const BASE = join(DESIGN, '.design-baseline.json');
const RELATORIO = join(DESIGN, '.design-check.json');

/** Corre o portão de verdade — o ratchet nunca inventa números próprios. */
export function medir({ execImpl = execFileSync } = {}) {
  execImpl(process.execPath, [join(AQUI, 'moo-design-check.mjs')], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  return JSON.parse(readFileSync(RELATORIO, 'utf8'));
}

/**
 * Compara. `n/d` não é regressão: uma verificação que deixou de medir não pode
 * ser tratada como uma que perdeu pontos — seria a mesma confusão entre
 * ignorância e falha que o `n/d` existe para evitar. Mas É reportada, porque
 * passar tudo a `n/d` é a outra forma de fugir ao portão.
 */
export function comparar(base, agora) {
  const quedas = [];
  const subidas = [];
  const perdeuMedicao = [];
  const porId = new Map(agora.verificacoes.map(v => [v.id, v]));

  for (const [id, pontosBase] of Object.entries(base.verificacoes ?? {})) {
    const v = porId.get(id);
    if (!v) { perdeuMedicao.push({ id, porque: 'verificação desapareceu do portão' }); continue; }
    if (v.pontos === null) {
      if (pontosBase !== null) perdeuMedicao.push({ id, porque: 'passou a n/d — deixou de medir o que já media' });
      continue;
    }
    if (pontosBase === null) { subidas.push({ id, de: 'n/d', para: v.pontos }); continue; }
    if (v.pontos < pontosBase - 1e-9) quedas.push({ id, de: pontosBase, para: v.pontos });
    else if (v.pontos > pontosBase + 1e-9) subidas.push({ id, de: pontosBase, para: v.pontos });
  }

  const indiceBase = base.indice_coerencia_visual;
  const indiceAgora = agora.indice_coerencia_visual;
  const desceu = indiceAgora !== null && indiceBase !== null && indiceAgora < indiceBase - 1e-9;

  return {
    indice_base: indiceBase,
    indice_agora: indiceAgora,
    delta: indiceAgora === null || indiceBase === null ? null : +(indiceAgora - indiceBase).toFixed(2),
    desceu, quedas, subidas, perdeu_medicao: perdeuMedicao,
    limiar: agora.limiar,
    falta_para_limiar: indiceAgora === null ? null : +(agora.limiar - indiceAgora).toFixed(2),
    piorou: desceu || quedas.length > 0 || perdeuMedicao.length > 0,
  };
}

export function instantaneo(rel) {
  return {
    gerado_em: rel.gerado_em,
    tokens_versao: rel.tokens_versao,
    indice_coerencia_visual: rel.indice_coerencia_visual,
    limiar_alvo: rel.limiar,
    nota: 'Linha de base do ratchet. NUNCA desce. O alvo publicado continua a ser `limiar_alvo`; '
        + 'esta linha existe só para que uma regressão fique vermelha antes de o alvo ser atingido.',
    verificacoes: Object.fromEntries(rel.verificacoes.map(v => [v.id, v.pontos])),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const agora = medir();

  if (!existsSync(BASE)) {
    writeFileSync(BASE, JSON.stringify(instantaneo(agora), null, 2) + '\n');
    console.log(`\n  linha de base criada em design/.design-baseline.json — índice ${agora.indice_coerencia_visual}\n`);
    process.exit(0);
  }

  const base = JSON.parse(readFileSync(BASE, 'utf8'));
  const r = comparar(base, agora);

  if (process.argv.includes('--promover')) {
    if (r.piorou) {
      console.error('\n  ❌ não promovo uma base que piorou. Corrige primeiro.\n');
      process.exit(1);
    }
    if (!r.subidas.length) { console.log('\n  nada a promover — o índice não subiu.\n'); process.exit(0); }
    writeFileSync(BASE, JSON.stringify(instantaneo(agora), null, 2) + '\n');
    console.log(`\n  base promovida ${r.indice_base} → ${r.indice_agora} (${r.subidas.length} verificação(ões) a subir)\n`);
    process.exit(0);
  }

  const seta = r.delta === null ? '' : r.delta > 0 ? ` ▲ +${r.delta}` : r.delta < 0 ? ` ▼ ${r.delta}` : ' =';
  console.log(`\n  🐮 RATCHET DO DESIGN   base ${r.indice_base}  →  agora ${r.indice_agora}${seta}`);
  console.log(`     alvo publicado ${r.limiar} · faltam ${r.falta_para_limiar} pontos\n  ${'─'.repeat(62)}`);
  for (const q of r.quedas) console.log(`  ❌ ${q.id.padEnd(20)} ${q.de} → ${q.para}   PERDEU PONTOS`);
  for (const p of r.perdeu_medicao) console.log(`  ❌ ${p.id.padEnd(20)} ${p.porque}`);
  for (const s of r.subidas) console.log(`  ✅ ${s.id.padEnd(20)} ${s.de} → ${s.para}`);
  if (!r.piorou && !r.subidas.length) console.log('     sem alterações.');
  if (r.subidas.length && !r.piorou) {
    console.log('\n     subiu — corre `npm run design:promover` para travar o novo mínimo.');
  }
  console.log('');

  if (process.argv.includes('--ci') && r.piorou) process.exit(1);
}
