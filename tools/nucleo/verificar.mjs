#!/usr/bin/env node
/**
 * verificar.mjs — o portao. Sai 0 se e so se TODAS as condicoes passarem; 1 caso
 * contrario, nomeando o que falhou. Zero opiniao, zero LLM.
 *
 *   node tools/nucleo/verificar.mjs .mooter/medicoes/ledger.jsonl
 *
 * As condicoes foram fixadas ANTES da primeira corrida. Se a C4 der vermelho, o
 * resultado publica-se vermelho: apertar o corpus depois de ver o resultado seria
 * fabricar discriminacao para caber na narrativa.
 *
 * LIMITE DECLARADO da C2: a cadeia apanha (a) campo alterado com hash intacto e
 * (b) campo alterado com hash recalculado — nesse caso parte no elo seguinte. NAO
 * apanha (c) reescrita integral do ficheiro a partir do ponto adulterado, porque
 * nada aqui e ancorado fora do proprio ficheiro. Detectar (c) exige publicar o
 * hash da cabeca noutro sitio. Isso nao esta feito: `ancora_externa: "n/d"`.
 */

import { lerLedger, hashEsperado, CAMPOS_OBRIGATORIOS, SCHEMA } from './nucleo.mjs';

const TIPOS = new Set(['modelo', 'skill']);

function verificar(registos) {
  const falhas = [];

  // C1 — todo registo valida measurement_v1 (com tarefa_id; sem seed numerica).
  registos.forEach((r, i) => {
    for (const campo of CAMPOS_OBRIGATORIOS) {
      if (!(campo in r)) falhas.push(`C1 linha ${i + 1} (seq ${r.seq ?? '?'}): falta o campo "${campo}"`);
    }
    if (r.schema !== SCHEMA) falhas.push(`C1 seq ${r.seq}: schema "${r.schema}" != "${SCHEMA}"`);
    if (!TIPOS.has(r.tipo)) falhas.push(`C1 seq ${r.seq}: tipo "${r.tipo}" fora de {modelo, skill}`);
    if (!r.tarefa_id) falhas.push(`C1 seq ${r.seq}: tarefa_id vazio — sem ele duas skills sao indistinguiveis`);
    if (!(r.sucesso === true || r.sucesso === false || r.sucesso === null)) {
      falhas.push(`C1 seq ${r.seq}: sucesso "${r.sucesso}" nao e ternario (true|false|null)`);
    }
    if (r.tipo === 'skill' && !r.skill_sha) falhas.push(`C1 seq ${r.seq}: candidato skill sem skill_sha`);
    if (r.tipo === 'modelo' && r.skill_sha !== null) falhas.push(`C1 seq ${r.seq}: candidato modelo com skill_sha`);
  });

  // C2 — cadeia intacta: seq contiguo, prev_hash liga, record_hash cobre o corpo.
  registos.forEach((r, i) => {
    if (r.seq !== i) falhas.push(`C2 linha ${i + 1}: seq ${r.seq} fora de ordem (esperado ${i})`);
    const esperado = hashEsperado(r);
    if (r.record_hash !== esperado) {
      falhas.push(`C2 seq ${r.seq}: REGISTO ADULTERADO — record_hash ${String(r.record_hash).slice(0, 12)} != ${esperado.slice(0, 12)}`);
    }
    const anterior = i === 0 ? null : registos[i - 1].record_hash;
    if (r.prev_hash !== anterior) {
      falhas.push(`C2 seq ${r.seq}: CADEIA PARTIDA — prev_hash nao liga ao record_hash do seq ${i - 1}`);
    }
  });

  // C3 — ha o que comparar.
  const candidatos = new Set(registos.map((r) => r.candidato_id));
  if (candidatos.size < 2) falhas.push(`C3: so ${candidatos.size} candidato(s) distinto(s); minimo 2`);

  // C4 — anti-72/72: o corpus tem de conseguir SEPARAR candidatos.
  // Bar fixada antes da corrida: >=1 tarefa com true num candidato e false noutro.
  const porTarefa = new Map();
  for (const r of registos) {
    if (!porTarefa.has(r.tarefa_id)) porTarefa.set(r.tarefa_id, new Map());
    porTarefa.get(r.tarefa_id).set(r.candidato_id, r.sucesso);
  }
  const discriminantes = [...porTarefa.entries()].filter(([, m]) => {
    const v = [...m.values()];
    return v.includes(true) && v.includes(false);
  });
  if (discriminantes.length === 0) {
    falhas.push('C4: nenhuma tarefa separou candidatos (sem par true/false) — o corpus mede custo, nao qualidade');
  }

  // C5 — o que nao foi medido esta declarado, nao prometido.
  for (const r of registos) {
    if (r.seed !== 'n/d') falhas.push(`C5 seq ${r.seq}: seed "${r.seed}" — nenhuma seed foi enviada nem verificada`);
    if (r.determinismo !== 'n/d') falhas.push(`C5 seq ${r.seq}: determinismo "${r.determinismo}" — nunca foi medido (1 corrida por par)`);
  }

  // C6 — categoria e tier nao estao confundidos (o defeito do BENCHMARK_v2, onde
  // cada segment vive num unico tier e "categoria" e so outro nome para dificuldade).
  const tiersPorCat = new Map();
  const catsPorTier = new Map();
  for (const r of registos) {
    if (!tiersPorCat.has(r.categoria)) tiersPorCat.set(r.categoria, new Set());
    tiersPorCat.get(r.categoria).add(r.tier);
    if (!catsPorTier.has(r.tier)) catsPorTier.set(r.tier, new Set());
    catsPorTier.get(r.tier).add(r.categoria);
  }
  const catMulti = [...tiersPorCat.entries()].filter(([, s]) => s.size >= 2);
  const tierMulti = [...catsPorTier.entries()].filter(([, s]) => s.size >= 2);
  if (catMulti.length === 0) falhas.push('C6: nenhuma categoria abrange >=2 tiers — categoria e tier estao confundidos');
  if (tierMulti.length === 0) falhas.push('C6: nenhum tier contem >=2 categorias — categoria e tier estao confundidos');

  return {
    ok: falhas.length === 0,
    falhas,
    resumo: {
      registos: registos.length,
      ancora_externa: 'n/d',
      candidatos: [...candidatos],
      tarefas: porTarefa.size,
      tarefas_discriminantes: discriminantes.map(([id]) => id),
      categorias_multi_tier: catMulti.map(([c]) => c),
    },
  };
}

export { verificar };

if (process.argv[1]?.endsWith('verificar.mjs')) {
  const caminho = process.argv[2];
  if (!caminho) { process.stderr.write('uso: node tools/nucleo/verificar.mjs <ledger.jsonl>\n'); process.exit(1); }
  let r;
  try {
    r = verificar(lerLedger(caminho));
  } catch (e) {
    process.stderr.write(`ledger ilegivel: ${e.message}\n`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(r.resumo, null, 2) + '\n');
  if (r.ok) { process.stdout.write('\nOK — cadeia integra, corpus discrimina, nada prometido por medir.\n'); process.exit(0); }
  process.stderr.write('\nRECUSADO:\n  - ' + r.falhas.join('\n  - ') + '\n');
  process.exit(1);
}
