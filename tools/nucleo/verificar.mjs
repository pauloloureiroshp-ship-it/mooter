#!/usr/bin/env node
/**
 * verificar.mjs — o portao. Sai 0 se e so se TODAS as condicoes passarem; 1 caso
 * contrario, nomeando o que falhou. Zero opiniao, zero LLM.
 *
 *   node tools/nucleo/verificar.mjs .mooter/medicoes/ledger.jsonl
 *
 * As condicoes sao pregadas em prereg.mjs (CRITERIOS) junto com o corpus, ANTES
 * de qualquer corrida.
 *
 * O que e GATE e o que e REPORTADO, e porque a distincao importa:
 *   gate      — C1..C6. O ledger e valido ou nao e.
 *   reportado — `separa_modelos` e `separa_skill`. Se o corpus separar a skill
 *               mas nao os modelos, ISSO E O RESULTADO e publica-se. Transformar
 *               isto em gate convidaria a apertar o corpus ate o numero sair
 *               bonito, que e fabricar discriminacao.
 *   (A primeira versao deste ficheiro tinha um C4 que passava com discriminacao
 *   no eixo errado — a skill — e deixava passar por bom um corpus incapaz de
 *   distinguir dois modelos. Esta a corrigir isso.)
 *
 * LIMITES DECLARADOS (o que este portao NAO prova):
 *  1. Adulteracao: apanha (a) campo alterado com hash intacto e (b) campo
 *     alterado com hash recalculado — parte no elo seguinte. NAO apanha (c)
 *     reescrita integral a partir do ponto adulterado, porque nada aqui esta
 *     ancorado fora do proprio ficheiro. `ancora_externa: "n/d"`.
 *  2. PROVENIENCIA: a cadeia prova "ninguem editou isto depois de selado". NAO
 *     prova "esta medicao aconteceu" — quem tem o repo corre `selar()` e fabrica
 *     um ledger internamente coerente. O que a C8 acrescenta e mais fraco e
 *     honesto: o veredito e RE-DERIVAVEL da saida guardada, logo um `sucesso`
 *     nao pode divergir do que o grader diria. Fabricar continua possivel;
 *     mentir sobre o grader deixou de ser. `proveniencia: "n/d"`.
 */

import {
  lerLedger, hashEsperado, avaliar, carregarCorpus,
  CAMPOS_OBRIGATORIOS, CAMPOS_NUMERICOS, CLASSES_CANDIDATO, SCHEMA,
} from './nucleo.mjs';

/** Pares (candidato_a, candidato_b) numa tarefa em que um acertou e o outro falhou. */
function tarefasQueSeparam(registos, filtro) {
  const porTarefa = new Map();
  for (const r of registos.filter(filtro)) {
    if (!porTarefa.has(r.tarefa_id)) porTarefa.set(r.tarefa_id, new Map());
    porTarefa.get(r.tarefa_id).set(r.candidato_id, r.sucesso);
  }
  return [...porTarefa.entries()]
    .filter(([, m]) => {
      const v = [...m.values()];
      return v.includes(true) && v.includes(false);
    })
    .map(([id]) => id);
}

export function verificar(registos, corpus) {
  const falhas = [];
  if (!corpus) throw new Error('verificar() exige o corpus: sem ele nao se pode conferir o sha nem re-derivar os vereditos');
  const porId = new Map((corpus.tarefas || []).map((t) => [t.id, t]));

  // C1 — todo registo valida measurement_v2.
  registos.forEach((r, i) => {
    for (const campo of CAMPOS_OBRIGATORIOS) {
      if (!(campo in r)) falhas.push(`C1 linha ${i + 1} (seq ${r.seq ?? '?'}): falta o campo "${campo}"`);
    }
    if (r.schema !== SCHEMA) falhas.push(`C1 seq ${r.seq}: schema "${r.schema}" != "${SCHEMA}"`);
    const classe = CLASSES_CANDIDATO[r.classe_candidato];
    if (!classe) falhas.push(`C1 seq ${r.seq}: classe_candidato "${r.classe_candidato}" desconhecida`);
    else if (!classe.suportada) falhas.push(`C1 seq ${r.seq}: classe_candidato "${r.classe_candidato}" nao e suportada — ${classe.o_que_e}`);
    if (!r.tarefa_id) falhas.push(`C1 seq ${r.seq}: tarefa_id vazio — sem ele duas skills sao indistinguiveis`);
    if (!r.dificuldade) falhas.push(`C1 seq ${r.seq}: sem dificuldade declarada`);
    if (!(r.sucesso === true || r.sucesso === false || r.sucesso === null)) {
      falhas.push(`C1 seq ${r.seq}: sucesso "${r.sucesso}" nao e ternario (true|false|null)`);
    }
    if (r.classe_candidato === 'skill_prefixo' && !r.skill_sha) falhas.push(`C1 seq ${r.seq}: skill sem skill_sha`);
    if (r.classe_candidato === 'modelo' && r.skill_sha !== null) falhas.push(`C1 seq ${r.seq}: modelo com skill_sha`);
    // Campo presente com valor lixo passaria no `in`; as projeccoes somam isto.
    for (const campo of CAMPOS_NUMERICOS) {
      const v = r[campo];
      if (v !== null && !Number.isFinite(v)) falhas.push(`C1 seq ${r.seq}: ${campo} = ${JSON.stringify(v)} nao e numero nem null`);
    }
  });

  // C2 — cadeia intacta.
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

  // C4 — o corpus nao e inerte (o defeito dos 72/72 pass:true).
  const separamTodos = tarefasQueSeparam(registos, () => true);
  if (separamTodos.length === 0) {
    falhas.push('C4: nenhuma tarefa separou candidatos — o corpus mede custo, nao qualidade');
  }

  // C5 — o que nao foi medido esta declarado, nao prometido.
  for (const r of registos) {
    if (r.seed !== 'n/d') falhas.push(`C5 seq ${r.seq}: seed "${r.seed}" — nenhuma seed foi enviada nem verificada`);
    if (r.determinismo !== 'n/d') falhas.push(`C5 seq ${r.seq}: determinismo "${r.determinismo}" — nunca foi medido`);
  }

  // C6 — categoria e tier nao estao confundidos.
  const tiersPorCat = new Map();
  const catsPorTier = new Map();
  for (const r of registos) {
    (tiersPorCat.get(r.categoria) ?? tiersPorCat.set(r.categoria, new Set()).get(r.categoria)).add(r.tier);
    (catsPorTier.get(r.tier) ?? catsPorTier.set(r.tier, new Set()).get(r.tier)).add(r.categoria);
  }
  const catMulti = [...tiersPorCat.entries()].filter(([, s]) => s.size >= 2).map(([c]) => c);
  const tierMulti = [...catsPorTier.entries()].filter(([, s]) => s.size >= 2).map(([t]) => t);
  if (catMulti.length === 0) falhas.push('C6: nenhuma categoria abrange >=2 tiers — categoria e tier estao confundidos');
  if (tierMulti.length === 0) falhas.push('C6: nenhum tier contem >=2 categorias — categoria e tier estao confundidos');

  // C7 — o ledger foi medido contra ESTE corpus. Sem isto, a regra anti-cherry-pick
  // do prereg era decorativa: bastava apertar o corpus depois e ninguem notava.
  const shaNoLedger = registos[0]?.ambiente?.corpus_sha;
  if (shaNoLedger !== corpus.corpus_sha) {
    falhas.push(`C7: o ledger foi medido contra o corpus ${String(shaNoLedger).slice(0, 12)}, mas o corpus em disco e ${corpus.corpus_sha.slice(0, 12)} — o corpus mudou depois da corrida`);
  }
  for (const r of registos) {
    if (r.ambiente?.corpus_sha !== shaNoLedger) falhas.push(`C7 seq ${r.seq}: corpus_sha diverge do resto do ledger`);
  }

  // C8 — o veredito e re-derivavel: recorrer o grader sobre a saida guardada tem
  // de dar o mesmo `sucesso`. Nao prova que a medicao aconteceu (ver cabecalho),
  // mas impede que um `sucesso` diga o contrario do que o grader diria.
  for (const r of registos) {
    const tarefa = porId.get(r.tarefa_id);
    if (!tarefa) { falhas.push(`C8 seq ${r.seq}: tarefa "${r.tarefa_id}" nao existe no corpus`); continue; }
    // Execucao falhada nao tem saida para re-derivar; fica de fora, e visivel.
    if (r.sucesso === null && /^execucao falhou:/.test(String(r.motivo))) continue;
    const rederivado = avaliar(tarefa.verificacao, r.saida);
    if (rederivado.sucesso !== r.sucesso) {
      falhas.push(`C8 seq ${r.seq} (${r.tarefa_id}): ledger diz sucesso=${r.sucesso}, re-derivar da saida da ${rederivado.sucesso}`);
    }
  }

  // REPORTADO, nunca gated: em que eixo o corpus separa.
  const soModelos = tarefasQueSeparam(registos, (r) => r.classe_candidato === 'modelo');
  const modelos = new Set(registos.filter((r) => r.classe_candidato === 'modelo').map((r) => r.candidato_id));

  return {
    ok: falhas.length === 0,
    falhas,
    resumo: {
      registos: registos.length,
      ancora_externa: 'n/d',
      proveniencia: 'n/d',
      corpus_sha: corpus.corpus_sha.slice(0, 12),
      truncados: registos.filter((r) => r.truncado).map((r) => `${r.candidato_id}/${r.tarefa_id}`),
      candidatos: [...candidatos],
      tarefas: new Set(registos.map((r) => r.tarefa_id)).size,
      separa_modelos: modelos.size >= 2
        ? { separa: soModelos.length > 0, modelos_comparados: [...modelos], tarefas: soModelos }
        : { separa: 'n/d', porque: `so ${modelos.size} modelo(s) medido(s); e preciso >=2 para a pergunta fazer sentido` },
      separa_algum_par: { separa: separamTodos.length > 0, tarefas: separamTodos },
      categorias_multi_tier: catMulti,
    },
  };
}

if (process.argv[1]?.endsWith('verificar.mjs')) {
  const caminho = process.argv[2];
  if (!caminho) { process.stderr.write('uso: node tools/nucleo/verificar.mjs <ledger.jsonl>\n'); process.exit(1); }
  let r;
  try {
    r = verificar(lerLedger(caminho), carregarCorpus());
  } catch (e) {
    process.stderr.write(`ledger ilegivel: ${e.message}\n`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(r.resumo, null, 2) + '\n');
  if (r.ok) {
    const sm = r.resumo.separa_modelos.separa;
    process.stdout.write(`\nOK — cadeia integra, nada prometido por medir. Separa modelos: ${sm === true ? 'SIM' : sm === false ? 'NAO (e este e o resultado)' : 'n/d'}\n`);
    process.exit(0);
  }
  process.stderr.write('\nRECUSADO:\n  - ' + r.falhas.join('\n  - ') + '\n');
  process.exit(1);
}
