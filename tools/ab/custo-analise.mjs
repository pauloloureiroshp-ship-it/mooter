#!/usr/bin/env node
/**
 * custo-analise.mjs — a análise congelada do teste de custo (custo-2026-09-10).
 *
 *   node tools/ab/custo-analise.mjs [--prereg f] [--ledger f] [--out f]
 *
 * Escrito e commitado ANTES da corrida, como o pré-registo exige (CUSTO-17).
 * Lê SÓ o pré-registo e o ledger. Produz SEMPRE todos os campos do resultado,
 * independentemente da direcção. Nunca imputa: ausente é `null` e propaga-se —
 * uma razão com null no numerador é null; um braço com 0 aceites tem
 * «por aceite» INDEFINIDO, nunca zero nem infinito.
 *
 * O que é uma tentativa: um evento `tentativa_fim` do ledger. O que é aceite,
 * quanto custou e quanto demorou vem TODO desse evento; este ficheiro não
 * recalcula aceitação, não relê worktrees, não corre testes. Se o ledger não
 * tem, o resultado não tem.
 *
 * Tokens de Opus: SÓ de `modelUsage` cujas chaves comecem por `claude-opus`.
 * `usage` é o total da invocação (todos os modelos) e serve de reconciliação:
 * se `usage.output_tokens` for menor do que a soma dos `outputTokens` de todos
 * os modelos, a extracção está errada e o par é marcado.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { wilson, tangoIC, arred } from './custo-stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ── leitura ────────────────────────────────────────────────────────────────

export function lerLedger(texto) {
  const eventos = [];
  const linhasInvalidas = [];
  texto.split('\n').forEach((l, i) => {
    if (!l.trim()) return;
    try { eventos.push(JSON.parse(l)); } catch (e) { linhasInvalidas.push({ linha: i + 1, erro: e.message }); }
  });
  return { eventos, linhasInvalidas };
}

// ── tokens ─────────────────────────────────────────────────────────────────

const ehOpus = (chave) => typeof chave === 'string' && chave.startsWith('claude-opus');

/**
 * Tokens de Opus de UMA tentativa, por categoria. `null` se a tentativa não
 * trouxe `modelUsage` (timeout sem JSON, por exemplo): consumo DESCONHECIDO.
 */
export function tokensOpusDaTentativa(t) {
  const mu = t && t.modelUsage;
  if (!mu || typeof mu !== 'object') return null;
  const cats = { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
  const modelos = [];
  let custoCli = 0;
  for (const [k, v] of Object.entries(mu)) {
    if (!ehOpus(k) || !v) continue;
    modelos.push(k);
    cats.input += Number(v.inputTokens) || 0;
    cats.output += Number(v.outputTokens) || 0;
    cats.cache_creation += Number(v.cacheCreationInputTokens) || 0;
    cats.cache_read += Number(v.cacheReadInputTokens) || 0;
    custoCli += Number(v.costUSD) || 0;
  }
  // A divisao 1h/5m da criacao de cache so existe ao nivel da invocacao
  // (`usage.cache_creation`), nao por modelo. Reparte-se PROPORCIONALMENTE e
  // diz-se que foi assim; se `usage` nao trouxer a divisao, fica null.
  const cc = t.usage && t.usage.cache_creation;
  let cache_1h = null, cache_5m = null, reparticao = 'n/d';
  if (cc && Number.isFinite(cc.ephemeral_1h_input_tokens) && Number.isFinite(cc.ephemeral_5m_input_tokens)) {
    const tot = cc.ephemeral_1h_input_tokens + cc.ephemeral_5m_input_tokens;
    if (tot === 0) { cache_1h = 0; cache_5m = 0; reparticao = 'sem criacao'; }
    else if (cc.ephemeral_5m_input_tokens === 0) { cache_1h = cats.cache_creation; cache_5m = 0; reparticao = 'toda 1h'; }
    else if (cc.ephemeral_1h_input_tokens === 0) { cache_1h = 0; cache_5m = cats.cache_creation; reparticao = 'toda 5m'; }
    else {
      const f = cc.ephemeral_1h_input_tokens / tot;
      cache_1h = Math.round(cats.cache_creation * f); cache_5m = cats.cache_creation - cache_1h; reparticao = 'proporcional';
    }
  }
  return { ...cats, cache_creation_1h: cache_1h, cache_creation_5m: cache_5m, reparticao_cache: reparticao,
    total: cats.input + cats.output + cats.cache_creation + cats.cache_read, modelos, custo_cli_usd: custoCli };
}

/** Reconciliacao `usage` vs soma de `modelUsage`. */
export function reconciliar(t) {
  const mu = t && t.modelUsage, u = t && t.usage;
  if (!mu || !u) return { ok: null, motivo: 'sem usage ou modelUsage' };
  const somaOut = Object.values(mu).reduce((s, v) => s + (Number(v && v.outputTokens) || 0), 0);
  const somaIn = Object.values(mu).reduce((s, v) => s + (Number(v && v.inputTokens) || 0), 0);
  if ((Number(u.output_tokens) || 0) < somaOut) return { ok: false, motivo: `usage.output ${u.output_tokens} < soma modelUsage ${somaOut}` };
  if ((Number(u.input_tokens) || 0) < somaIn) return { ok: false, motivo: `usage.input ${u.input_tokens} < soma modelUsage ${somaIn}` };
  return { ok: true, motivo: null };
}

// ── valorizacao ────────────────────────────────────────────────────────────

/** Valorizacao teorica de uma tentativa aos precos e multiplicadores do prereg. null se tokens null. */
export function valorizar(tok, precos) {
  if (!tok) return null;
  const { input, output } = precos.opus_usd_por_Mtok;
  const m = precos.cache_multiplicadores;
  const cc1h = tok.cache_creation_1h === null ? null : tok.cache_creation_1h;
  const cc5m = tok.cache_creation_5m === null ? null : tok.cache_creation_5m;
  if (cc1h === null || cc5m === null) return null;   // sem reparticao nao se valoriza
  const usd = (tok.input * input + tok.output * output + cc1h * input * m.cache_creation_1h
    + cc5m * input * m.cache_creation_5m + tok.cache_read * input * m.cache_read) / 1e6;
  return usd;
}

// ── agregacao ──────────────────────────────────────────────────────────────

const somaOuNull = (xs) => (xs.some((x) => x === null || x === undefined) ? null : xs.reduce((a, b) => a + b, 0));
const razaoOuIndef = (num, den) => (num === null ? null : den === 0 ? 'INDEFINIDO' : num / den);

export function analisar(prereg, eventos, { agora = null } = {}) {
  const precos = prereg.metricas.yardstick_custo;
  const tarefasPrereg = prereg.corpus.tarefas;
  const ordemIds = tarefasPrereg.map((t) => t.task_id);

  const porTipo = (tipo) => eventos.filter((e) => e.evento === tipo);
  const tentativas = porTipo('tentativa_fim');
  const excluidas = porTipo('tarefa_excluida');
  const invalidos = porTipo('par_invalido');
  const paragens = porTipo('paragem');
  const preVoos = porTipo('pre_voo');

  const marcas = [];   // pares/tentativas marcados, com motivo — nunca escondidos

  // tarefas efectivamente em jogo: as do prereg menos as excluidas, mais suplentes usados
  const substituicoes = Object.fromEntries(excluidas.filter((e) => e.suplente_usado).map((e) => [e.task_id, e.suplente_usado]));
  const idsEmJogo = ordemIds.map((id) => substituicoes[id] || id).filter((id) => !excluidas.some((e) => e.task_id === id && !e.suplente_usado));

  const porTarefa = [];
  for (const id of idsEmJogo) {
    const meta = tarefasPrereg.find((t) => t.task_id === id) || { tier_classificado: null, ordem_dos_bracos: null };
    const ts = tentativas.filter((t) => t.task_id === id);
    const braco = (b) => {
      const xs = ts.filter((t) => t.braco === b).sort((p, q) => (p.tentativa || 0) - (q.tentativa || 0));
      if (xs.length === 0) return { tentativas: 0, aceite: null, tokens: null, valorizacao_usd: null, custo_cli_usd: null, duration_ms: null, arrancou: null, escalou: false, tecto: null };
      const toks = xs.map(tokensOpusDaTentativa);
      const arrancou = xs.every((t) => t.arrancou === true);
      for (const [i, t] of xs.entries()) {
        const rec = reconciliar(t);
        if (rec.ok === false) marcas.push({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'reconciliacao', motivo: rec.motivo });
        if (toks[i] === null && t.arrancou) marcas.push({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'consumo_desconhecido', motivo: 'sem modelUsage — timeout ou sem JSON' });
        if (t.tokens_transcript && toks[i] && toks[i].total > 0) {
          const d = Math.abs(t.tokens_transcript - toks[i].total) / toks[i].total;
          if (d > 0.01) marcas.push({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'divergencia_json_vs_transcript', motivo: `${(d * 100).toFixed(1)}%`, json: toks[i].total, transcript: t.tokens_transcript });
        }
      }
      const soma = (campo) => somaOuNull(toks.map((k) => (k === null ? null : k[campo])));
      const tokens = toks.some((k) => k === null) ? null : {
        input: soma('input'), output: soma('output'), cache_creation: soma('cache_creation'),
        cache_creation_1h: soma('cache_creation_1h'), cache_creation_5m: soma('cache_creation_5m'),
        cache_read: soma('cache_read'), total: soma('total'),
      };
      return {
        tentativas: xs.length,
        aceite: xs.some((t) => t.aceite === true),
        arrancou,
        escalou: xs.some((t) => t.e_escalacao === true),
        tokens,
        valorizacao_usd: somaOuNull(toks.map((k) => valorizar(k, precos))),
        custo_cli_usd: somaOuNull(toks.map((k) => (k === null ? null : k.custo_cli_usd))),
        duration_ms: somaOuNull(xs.map((t) => (Number.isFinite(t.duration_ms) ? t.duration_ms : null))),
        tecto: xs.map((t) => (t.tecto_do_orcamento === undefined ? null : t.tecto_do_orcamento)),
        tokens_locais: somaOuNull(xs.map((t) => (t.executor === 'router-execute' ? (Number.isFinite(t.tokens_locais) ? t.tokens_locais : null) : 0))),
        modelo_local: xs.filter((t) => t.executor === 'router-execute').map((t) => t.modelo_reportado || null),
      };
    };
    const A = braco('A'), B = braco('B');
    const invalido = invalidos.find((e) => e.task_id === id) || null;
    porTarefa.push({
      task_id: id, tier: meta.tier_classificado, ordem_dos_bracos: meta.ordem_dos_bracos,
      pre_voo_falhou: (() => { const p = preVoos.find((e) => e.task_id === id); return p ? p.falhou === true : null; })(),
      par_valido: !invalido && A.arrancou === true && B.arrancou === true,
      invalido: invalido ? { braco_que_nao_arrancou: invalido.braco, motivo: invalido.motivo } : null,
      A, B,
    });
  }

  const validos = porTarefa.filter((t) => t.par_valido);
  const n = validos.length;

  // ── primaria ─────────────────────────────────────────────────────────────
  const aceitesA = validos.filter((t) => t.A.aceite).length;
  const aceitesB = validos.filter((t) => t.B.aceite).length;
  const celula = (fa, fb) => validos.filter((t) => t.A.aceite === fa && t.B.aceite === fb).map((t) => t.task_id);
  const tabela = { ambos: celula(true, true), so_A: celula(true, false), so_B: celula(false, true), nenhum: celula(false, false) };
  const ic = n > 0 ? tangoIC(tabela.so_A.length, tabela.so_B.length, n) : tangoIC(0, 0, 0);
  const limiar = prereg.metricas.primaria.criterio;   // 'LIMIAR DESCRITIVO: aceites_B >= aceites_A - 2'
  const margem = 2;
  const primaria = {
    n_pares_validos: n,
    aceites_A: aceitesA, aceites_B: aceitesB,
    wilson_A: n > 0 ? wilson(aceitesA, n) : null,
    wilson_B: n > 0 ? wilson(aceitesB, n) : null,
    tabela_2x2: tabela,
    diferenca_emparelhada_A_menos_B: ic.diferenca === null ? null : arred.prop(ic.diferenca),
    ic95_tango: ic.lo === null ? null : { lo: arred.prop(ic.lo), hi: arred.prop(ic.hi) },
    criterio: limiar,
    limiar_descritivo_cumprido: n > 0 ? aceitesB >= aceitesA - margem : null,
    AVISO: 'limiar descritivo, nao inferencia. Ver prereg.metricas.primaria.o_que_o_nome_NAO_e.',
  };

  // ── secundaria ───────────────────────────────────────────────────────────
  const vistas = (lista, label) => {
    const porBraco = (b) => {
      const toks = lista.map((t) => t[b].tokens);
      const total = toks.some((k) => k === null) ? null : toks.reduce((s, k) => s + k.total, 0);
      const cats = (campo) => (toks.some((k) => k === null || k[campo] === null) ? null : toks.reduce((s, k) => s + k[campo], 0));
      const aceites = lista.filter((t) => t[b].aceite).length;
      const ambos = lista.filter((t) => t.A.aceite && t.B.aceite);
      const toksAmbos = ambos.map((t) => t[b].tokens);
      const totalAmbos = toksAmbos.length === 0 ? null : toksAmbos.some((k) => k === null) ? null : toksAmbos.reduce((s, k) => s + k.total, 0);
      return {
        tokens_opus_total: total,
        por_tarefa_atribuida: lista.length === 0 ? null : (total === null ? null : total / lista.length),
        por_aceite: razaoOuIndef(total, aceites),
        so_aceites_por_ambos: { n: ambos.length, tokens_total: totalAmbos, por_tarefa: ambos.length === 0 ? null : (totalAmbos === null ? null : totalAmbos / ambos.length) },
        por_categoria: { input: cats('input'), output: cats('output'), cache_creation_1h: cats('cache_creation_1h'), cache_creation_5m: cats('cache_creation_5m'), cache_read: cats('cache_read') },
        aceites,
        escalacoes: lista.filter((t) => t[b].escalou).length,
        tokens_locais_a_parte: somaOuNull(lista.map((t) => t[b].tokens_locais)),
      };
    };
    return { estrato: label, n: lista.length, A: porBraco('A'), B: porBraco('B') };
  };
  const secundaria = { global: vistas(validos, 'todos'), por_tier: {} };
  for (const tier of [...new Set(validos.map((t) => t.tier).filter(Boolean))].sort()) {
    secundaria.por_tier[tier] = vistas(validos.filter((t) => t.tier === tier), tier);
  }

  // ── valorizacao ──────────────────────────────────────────────────────────
  const valor = (b) => ({
    valorizacao_teorica_usd: somaOuNull(validos.map((t) => t[b].valorizacao_usd)),
    estimativa_cli_usd: somaOuNull(validos.map((t) => t[b].custo_cli_usd)),
  });
  const valorizacao = {
    ROTULO_OBRIGATORIO: precos.rotulo_obrigatorio_em_qualquer_visualizacao,
    precos_de_lista: { fonte: precos.fonte, sha256: precos.pricing_sha256, opus_usd_por_Mtok: precos.opus_usd_por_Mtok, cache_multiplicadores: precos.cache_multiplicadores },
    A: valor('A'), B: valor('B'),
    NAO_E: precos.O_QUE_NAO_E,
  };

  // ── velocidade (fora do criterio) ────────────────────────────────────────
  const velocidade = {
    AVISO: 'reportada, fora do criterio',
    A: { tempo_total_ms: somaOuNull(validos.map((t) => t.A.duration_ms)) },
    B: { tempo_total_ms: somaOuNull(validos.map((t) => t.B.duration_ms)) },
    por_tarefa: validos.map((t) => ({ task_id: t.task_id, A_ms: t.A.duration_ms, B_ms: t.B.duration_ms })),
  };

  // ── fiabilidade: pares invalidos com o consumo que ficou ─────────────────
  const fiabilidade = {
    pares_invalidos: porTarefa.filter((t) => !t.par_valido).map((t) => ({
      task_id: t.task_id, tier: t.tier,
      braco_que_nao_arrancou: t.invalido ? t.invalido.braco_que_nao_arrancou : (t.A.arrancou === false ? 'A' : t.B.arrancou === false ? 'B' : 'n/d'),
      motivo: t.invalido ? t.invalido.motivo : 'n/d',
      consumo_A_tokens: t.A.tokens ? t.A.tokens.total : null, consumo_B_tokens: t.B.tokens ? t.B.tokens.total : null,
      custo_cli_A_usd: t.A.custo_cli_usd, custo_cli_B_usd: t.B.custo_cli_usd,
    })),
    tarefas_excluidas_antes_de_correr: excluidas.map((e) => ({ task_id: e.task_id, motivo: e.motivo, suplente_usado: e.suplente_usado || null })),
    AVISO: 'CUSTO-10: o consumo dos pares invalidos NAO e apagado; esta aqui.',
  };

  // ── paragem / prefixo ────────────────────────────────────────────────────
  const fechou = validos.length + fiabilidade.pares_invalidos.length >= idsEmJogo.length && paragens.length === 0;
  const paragem = paragens.length > 0 ? paragens[paragens.length - 1] : null;

  const resultado = {
    schema: 'mooter/custo-analysis/1',
    experiment_id: prereg.experiment_id,
    gerado_em: agora || new Date().toISOString(),
    prereg_sha256: prereg.__sha256 || null,
    corrida_fechou_os_pares: fechou,
    motivo_de_paragem: paragem ? { ts: paragem.ts, motivo: paragem.motivo, ultima_tarefa: paragem.ultima_tarefa || null } : null,
    prefixo_executado: { tarefas_com_alguma_tentativa: porTarefa.filter((t) => t.A.tentativas + t.B.tentativas > 0).length, de: idsEmJogo.length },
    primaria,
    secundaria,
    valorizacao,
    velocidade,
    fiabilidade,
    por_tarefa: porTarefa.map((t) => ({
      task_id: t.task_id, tier: t.tier, ordem_dos_bracos: t.ordem_dos_bracos, pre_voo_falhou: t.pre_voo_falhou, par_valido: t.par_valido,
      A: { tentativas: t.A.tentativas, aceite: t.A.aceite, tokens_opus: t.A.tokens ? t.A.tokens.total : null, duration_ms: t.A.duration_ms, tecto_do_orcamento: t.A.tecto, escalou: t.A.escalou },
      B: { tentativas: t.B.tentativas, aceite: t.B.aceite, tokens_opus: t.B.tokens ? t.B.tokens.total : null, duration_ms: t.B.duration_ms, tecto_do_orcamento: t.B.tecto, escalou: t.B.escalou, tokens_locais: t.B.tokens_locais, modelo_local: t.B.modelo_local },
    })),
    marcas,
    linhas_de_ledger_invalidas: null,   // preenchido pelo main
    O_QUE_ISTO_NAO_CONCLUI: prereg.o_que_este_protocolo_NAO_promete,
  };
  return resultado;
}

// ── main ───────────────────────────────────────────────────────────────────

function arg(nome, defeito) {
  const i = process.argv.indexOf(nome);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : defeito;
}

const invocadoDirectamente = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invocadoDirectamente) {
  const preregPath = arg('--prereg', path.join(HERE, 'custo-prereg.json'));
  const ledgerPath = arg('--ledger', path.join(HERE, 'custo-ledger.jsonl'));
  const outPath = arg('--out', path.join(HERE, 'custo-analysis.json'));
  if (!fs.existsSync(preregPath)) { console.error(`falta o pre-registo: ${preregPath}`); process.exit(2); }
  if (!fs.existsSync(ledgerPath)) { console.error(`falta o ledger: ${ledgerPath}\nEsta analise nao inventa dados: sem ledger nao ha resultado.`); process.exit(2); }
  const preregTxt = fs.readFileSync(preregPath, 'utf8');
  const prereg = JSON.parse(preregTxt);
  prereg.__sha256 = crypto.createHash('sha256').update(preregTxt).digest('hex');
  const { eventos, linhasInvalidas } = lerLedger(fs.readFileSync(ledgerPath, 'utf8'));
  const r = analisar(prereg, eventos);
  r.linhas_de_ledger_invalidas = linhasInvalidas;
  fs.writeFileSync(outPath, JSON.stringify(r, null, 2) + '\n');
  const p = r.primaria;
  console.log(`custo-analise: ${r.corrida_fechou_os_pares ? 'corrida FECHADA' : 'corrida NAO fechou — prefixo ' + r.prefixo_executado.tarefas_com_alguma_tentativa + '/' + r.prefixo_executado.de}`);
  console.log(`  pares validos ${p.n_pares_validos} · aceites A ${p.aceites_A} B ${p.aceites_B} · limiar descritivo ${p.limiar_descritivo_cumprido === null ? 'n/d' : p.limiar_descritivo_cumprido ? 'cumprido' : 'NAO cumprido'}`);
  console.log(`  tokens Opus total A ${r.secundaria.global.A.tokens_opus_total ?? 'n/d'} B ${r.secundaria.global.B.tokens_opus_total ?? 'n/d'} · marcas ${r.marcas.length} · invalidos ${r.fiabilidade.pares_invalidos.length}`);
  console.log(`  escrito: ${outPath}`);
}
