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
 * O que é uma tentativa: um evento `tentativa_fim` do ledger. Este ficheiro
 * não relê worktrees nem corre testes. Confia no `aceite` do ledger SÓ
 * quando ele é coerente com a prova que o próprio ledger carrega
 * (interpretação 19); confia nos tokens SÓ quando `modelUsage` tem a forma
 * e o modelo esperados (18, 20). Se o ledger não tem, o resultado não tem.
 *
 * Tokens de Opus: SÓ de `modelUsage` cujas chaves comecem por `claude-opus`.
 * `usage` é o total da invocação (todos os modelos) e serve de reconciliação:
 * se `usage.output_tokens` for menor do que a soma dos `outputTokens` de todos
 * os modelos, a extracção está errada e o par é marcado.
 *
 * INTERPRETAÇÕES CONGELADAS COM ESTE FICHEIRO. Quatro revisores pré-push
 * construíram ledgers de controlador defeituoso ou morto a meio que saíam
 * com alegação favorável: «corrida FECHADA» com 1/20; «limiar cumprido» com
 * 1/20; passo local «aceite» a poupar 100% em T0; suplente repetido a fechar
 * 19 como 20/20; `aceite: null` em tudo a dar limiar cumprido; `modelUsage`
 * sem Opus a dar B = 0 tokens; `par_invalido` selectivo sobre as falhas de
 * B. O que se segue é o que o código faz, escrito para que a corrida não o
 * descubra depois:
 *
 *  1. Passo local (`executor: 'router-execute'`): tokens de Opus ZERO POR
 *     CONSTRUÇÃO. `usage`/`modelUsage`/`total_cost_usd`/`session_id` são null
 *     e isso NÃO marca. Se trouxer `modelUsage`, marca `local_com_modelUsage`,
 *     os tokens continuam zero. ARRANCOU se `arrancou === true`, ou se
 *     `arrancou` é null e existe `texto_local_sha256`. Sem `tokens_locais` ou
 *     `modelo_reportado`: marca `campo_em_falta`.
 *  2. `arrancou` de um BRAÇO = a última tentativa arrancou. Um passo local
 *     que não arrancou e foi escalado é marca `local_nao_arrancou` — não
 *     invalida o par. Uma tentativa não-local com `arrancou !== true` marca
 *     `tentativa_nao_arrancou` (e `campo_em_falta` se for null). O motivo
 *     reporta o valor REAL do campo.
 *  3. Uma tentativa com `arrancou === false` e sem `modelUsage` consumiu ZERO
 *     Opus, pela definição do pré-registo. Uma que arrancou (ou com
 *     `arrancou` null) e ficou sem JSON tem consumo DESCONHECIDO: se o
 *     ledger trouxer `tokens_transcript` > 0, é essa a fonte — `total` =
 *     transcript, categorias null, valorização null, marca
 *     `consumo_do_transcript`; senão null e marca `consumo_desconhecido`.
 *     `tokens_transcript: 0` é «não encontrado», não zero.
 *  4. «Corrida fechou» = TODAS as tarefas em jogo têm tentativa nos DOIS
 *     braços (ou um evento `par_invalido` que feche o par) E não há evento
 *     `paragem`. Tarefa sem tentativa nem evento vai para `nao_corridas`;
 *     tarefa com um braço só e sem `par_invalido` é par inválido «sem
 *     tentativa registada»; `par_invalido` sem tentativa é par inválido com o
 *     motivo do evento. Tarefa excluída SEM suplente fica em jogo e não
 *     corrida: o denominador é sempre o do pré-registo.
 *  5. «Corrida válida» (`corrida_valida`: true | false | null):
 *     FALSE se alguma condição INVALIDANTE se verificar — as do pré-registo
 *     (`estado_vivo_sha` a mudar; digest do modelo local a mudar;
 *     `sentinela_presente === false`) e as que denunciam controlador
 *     partido (14, 15, 18, 19, 20, 21); NULL (n/d) se nenhuma violação mas a
 *     prova não existe — alguma tentativa sem `sentinela_presente === true`,
 *     ou nenhuma com `estado_vivo_sha`, ou sem tentativas; TRUE só com a
 *     prova completa. As órfãs contam. Cada violação em `corrida_invalida_por`.
 *  6. O VEREDICTO (`limiar_descritivo_cumprido`, global e por tier) só existe
 *     com corrida fechada E `corrida_valida === true` E ≥ 1 par válido no
 *     estrato; senão é null e o CLI diz porquê. Tabela 2x2, Wilson e Tango
 *     são publicados sempre como descritivos do que correu, com `AVISO`.
 *  7. Pré-voo: evento `pre_voo`; `falhou` booleano manda, senão
 *     `exit_code !== 0`. Fica o ÚLTIMO por tarefa. Tarefa que correu (com
 *     tentativa OU `par_invalido`) sem `pre_voo` → marca `pre_voo_ausente` e
 *     par INVÁLIDO; com pré-voo que não falhou → `pre_voo_nao_falhou`, par
 *     INVÁLIDO. As marcas de pré-voo são emitidas SEMPRE.
 *  8. Suplentes: cadeia transitiva com guarda de ciclo. Tier de suplente vem
 *     do `tier_classificado` das suas tentativas, se unânime (senão
 *     `tier_inconsistente`; sem nenhum, `tier_desconhecido`; estrato `n/d`).
 *     Ordem dos braços por `ts_inicio`. `tier_classificado` no ledger
 *     diferente do pré-registo marca `tier_divergente`.
 *  9. Totais da secundária sobre pares VÁLIDOS (null se não há nenhum), MAIS
 *     `…_incluindo_pares_invalidos` e `…_todas_as_tentativas` (órfãs e
 *     duplicadas incluídas). `por_tarefa_atribuida` = total/n válidos;
 *     `por_tarefa_atribuida_sobre_prereg` = total/N do pré-registo.
 * 10. `custo_cli_opus_usd` = Σ `modelUsage[claude-opus-*].costUSD`;
 *     `custo_cli_total_usd` = Σ `total_cost_usd` (a invocação inteira).
 * 11. Órfãs (`task_id` fora do jogo ou `braco` ∉ {A,B}) e duplicadas (fica a
 *     ÚLTIMA) vão para `fiabilidade` com consumo, e marcam. Nada se descarta.
 * 12. `ledger.regra` («campo em falta é null e o par é marcado; nunca se
 *     omite a chave»): chave omitida de `CHAVES_OBRIGATORIAS` marca
 *     `chave_omitida`. Nulls que a análise LÊ marcam `campo_em_falta`
 *     (`aceite`, `arrancou` não-local, `estado_vivo_sha`,
 *     `sentinela_presente`, sub-campos de `modelUsage`, e no passo local
 *     `tokens_locais`/`modelo_reportado`). `aceite: null` torna o par
 *     INVÁLIDO: é o input da primária.
 * 13. Arredondamento SÓ à saída: USD 4 casas, proporções 3, tokens e razões
 *     de tokens inteiros.
 * 14. Passo local com `aceite === true` é IMPOSSÍVEL POR CONSTRUÇÃO
 *     (`DECLARACAO_DE_DEGENERESCENCIA`). Marca `local_aceite`, par INVÁLIDO,
 *     corrida INVÁLIDA.
 * 15. Suplentes fora do protocolo: `suplente_usado` tem de estar em
 *     `corpus.suplentes`, não ser id do corpus, ser usado uma só vez, e a
 *     tarefa excluída NÃO pode ter nenhuma `tentativa_fim` («suplentes nunca
 *     por resultado»). Violação → marca `suplente_fora_do_protocolo`, corrida
 *     INVÁLIDA; `idsEmJogo` nunca tem repetidos.
 * 16. Tentativas fora do protocolo (`desenho`): A com > 1 tentativa ou com
 *     executor ≠ `claude-p`; B com > 2; B em T0/T1 sem passo local na 1.ª;
 *     B em T0/T1 com passo local não aceite e SEM escalação
 *     (`escalacao_em_falta`); B em T2/T3 com > 1 ou com passo local. Marca
 *     `tentativas_fora_do_protocolo`, par INVÁLIDO.
 * 17. NÃO verificado (declarado): ordem de execução das tarefas e tecto de
 *     900 s — são do controlador e do manifesto de execução.
 * 18. CONTRATO DE TIPO (`TIPOS_OBRIGATORIOS`): cada chave tem um tipo, e
 *     null só onde declarado. Violação → marca `tipo_invalido` e par
 *     INVÁLIDO; em `aceite` ou `arrancou` → corrida INVÁLIDA (uma aceitação
 *     que escreve `"true"` ou `1` está partida). `tier_classificado` ∈
 *     {T0,T1,T2,T3}; `executor` ∈ {claude-p, router-execute}; `tentativa` ∈
 *     {1,2}; números nunca negativos.
 * 19. COERÊNCIA DA ACEITAÇÃO (`aceitacao.definicao` do pré-registo):
 *     `aceite: true` exige `exit_code === 0`, `test_file_sha_antes ===
 *     depois`, `tests_passados ≤ tests_corridos`, e — para tarefas do corpus
 *     — `tests_corridos ≥ tests_total_historico` e `tests_passados ≥
 *     tests_total_historico`. `aceite: false` com TODAS essas condições
 *     satisfeitas é o inverso (o controlador recusou um verde). Qualquer
 *     das duas → marca `aceite_contraditorio`, par INVÁLIDO, corrida
 *     INVÁLIDA. Campos null não contradizem (marcam por 12 se lidos).
 * 20. Tentativa `claude-p` que arrancou com `modelUsage` sem NENHUMA chave
 *     `claude-opus` (inclui `{}`) → marca `sem_opus_no_modelUsage`, consumo
 *     DESCONHECIDO, par INVÁLIDO, corrida INVÁLIDA (a flag `--model`
 *     perdeu-se; o executor está mal configurado). Sub-campo de tokens
 *     null/não-numérico → `campo_em_falta`, consumo DESCONHECIDO (não 0).
 * 21. `par_invalido` numa tarefa cujos dois braços têm última tentativa com
 *     `arrancou === true` → marca `par_invalido_contraditorio`, corrida
 *     INVÁLIDA (selecção sobre resultados).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { wilson, tangoIC, arred } from './custo-stats.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** As chaves que o pré-registo (`ledger.campos_obrigatorios_por_tentativa`) obriga em CADA tentativa_fim. */
export const CHAVES_OBRIGATORIAS = [
  'ts_inicio', 'ts_fim', 'task_id', 'braco', 'tentativa', 'e_escalacao',
  'tier_classificado', 'executor', 'modelo_pedido', 'modelo_reportado',
  'arrancou', 'motivo_se_nao',
  'aceite', 'exit_code', 'tests_corridos', 'tests_passados', 'skips', 'test_file_sha_antes', 'test_file_sha_depois',
  'usage', 'modelUsage', 'total_cost_usd', 'duration_ms', 'session_id',
  'tokens_locais', 'texto_local_sha256',
  'estado_vivo_sha', 'tecto_do_orcamento', 'sentinela_presente',
  'worktree_listagem_sha_antes', 'worktree_listagem_sha_depois',
];

/** Contrato de tipo por chave (interpretação 18). `nulo: true` = null aceite; `nao_negativo` para números. */
export const TIPOS_OBRIGATORIOS = {
  ts_inicio: { tipo: 'string' }, ts_fim: { tipo: 'string' },
  task_id: { tipo: 'string' }, braco: { tipo: 'string' },
  tentativa: { tipo: 'number', valores: [1, 2] }, e_escalacao: { tipo: 'boolean' },
  tier_classificado: { tipo: 'string', nulo: true, valores: ['T0', 'T1', 'T2', 'T3'] },
  executor: { tipo: 'string', valores: ['claude-p', 'router-execute'] },
  modelo_pedido: { tipo: 'string', nulo: true }, modelo_reportado: { tipo: 'string', nulo: true },
  arrancou: { tipo: 'boolean', nulo: true }, motivo_se_nao: { tipo: 'string', nulo: true },
  aceite: { tipo: 'boolean', nulo: true },
  exit_code: { tipo: 'number', nulo: true },
  tests_corridos: { tipo: 'number', nulo: true, nao_negativo: true }, tests_passados: { tipo: 'number', nulo: true, nao_negativo: true }, skips: { tipo: 'number', nulo: true, nao_negativo: true },
  test_file_sha_antes: { tipo: 'string', nulo: true }, test_file_sha_depois: { tipo: 'string', nulo: true },
  usage: { tipo: 'object', nulo: true }, modelUsage: { tipo: 'object', nulo: true },
  total_cost_usd: { tipo: 'number', nulo: true, nao_negativo: true }, duration_ms: { tipo: 'number', nulo: true, nao_negativo: true },
  session_id: { tipo: 'string', nulo: true },
  tokens_locais: { tipo: 'number', nulo: true, nao_negativo: true }, texto_local_sha256: { tipo: 'string', nulo: true },
  estado_vivo_sha: { tipo: 'string', nulo: true }, tecto_do_orcamento: { tipo: ['string', 'number'], nulo: true }, sentinela_presente: { tipo: 'boolean', nulo: true },
  worktree_listagem_sha_antes: { tipo: 'string', nulo: true }, worktree_listagem_sha_depois: { tipo: 'string', nulo: true },
};

/** Violações de tipo de uma tentativa: lista de `chave: motivo`. Chaves omitidas não entram (são `chave_omitida`). */
export function violacoesDeTipo(t) {
  const out = [];
  for (const [k, c] of Object.entries(TIPOS_OBRIGATORIOS)) {
    if (!(k in t)) continue;
    const v = t[k];
    if (v === null) { if (!c.nulo) out.push(`${k}: null nao permitido`); continue; }
    const tipos = Array.isArray(c.tipo) ? c.tipo : [c.tipo];
    const tv = typeof v;
    if (!tipos.includes(tv) || (tv === 'object' && Array.isArray(v))) { out.push(`${k}: ${Array.isArray(v) ? 'array' : tv} em vez de ${tipos.join('|')}`); continue; }
    if (tv === 'number' && !Number.isFinite(v)) { out.push(`${k}: nao finito`); continue; }
    if (c.nao_negativo && v < 0) out.push(`${k}: negativo (${v})`);
    if (c.valores && !c.valores.includes(v)) out.push(`${k}: ${JSON.stringify(v)} fora de {${c.valores.join(',')}}`);
  }
  return out;
}

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
const ehLocal = (t) => !!t && t.executor === 'router-execute';
const ehTierLocal = (tier) => tier === 'T0' || tier === 'T1';
const CAMPOS_TOKENS = ['inputTokens', 'outputTokens', 'cacheCreationInputTokens', 'cacheReadInputTokens'];
const ZEROS = (fonte) => ({ input: 0, output: 0, cache_creation: 0, cache_read: 0, cache_creation_1h: 0, cache_creation_5m: 0,
  reparticao_cache: fonte, total: 0, modelos: [], custo_cli_usd: 0, fonte });

/** Problemas do `modelUsage` de uma tentativa claude-p (interpretação 20): sub-campos em falta/não-numéricos, ou nenhum Opus. */
export function problemasDoModelUsage(mu) {
  if (!mu || typeof mu !== 'object') return { sem_opus: false, campos: [] };
  const campos = [];
  let opus = 0;
  for (const [k, v] of Object.entries(mu)) {
    if (!ehOpus(k)) continue;
    opus++;
    if (!v || typeof v !== 'object') { campos.push(`${k}: entrada nao e objecto`); continue; }
    for (const c of CAMPOS_TOKENS) if (!Number.isFinite(v[c])) campos.push(`${k}.${c}`);
  }
  return { sem_opus: opus === 0, campos };
}

/**
 * Tokens de Opus de UMA tentativa, por categoria (interpretações 1, 3 e 20).
 *   fonte: 'json' | 'local' | 'nao arrancou' | 'transcript'
 *   null  = consumo DESCONHECIDO (arrancou, sem JSON utilizável, sem transcript)
 */
export function tokensOpusDaTentativa(t) {
  if (ehLocal(t)) return ZEROS('local');
  const mu = t && t.modelUsage;
  const prob = problemasDoModelUsage(mu);
  const jsonUtil = mu && typeof mu === 'object' && !prob.sem_opus && prob.campos.length === 0;
  if (!jsonUtil) {
    if (t && t.arrancou === false && !mu) return ZEROS('nao arrancou');
    if (t && Number.isFinite(t.tokens_transcript) && t.tokens_transcript > 0) {
      return { input: null, output: null, cache_creation: null, cache_read: null, cache_creation_1h: null, cache_creation_5m: null,
        reparticao_cache: 'n/d', total: t.tokens_transcript, modelos: [], custo_cli_usd: null, fonte: 'transcript' };
    }
    return null;
  }
  const cats = { input: 0, output: 0, cache_creation: 0, cache_read: 0 };
  const modelos = [];
  let custoCli = 0;
  for (const [k, v] of Object.entries(mu)) {
    if (!ehOpus(k)) continue;
    modelos.push(k);
    cats.input += v.inputTokens;
    cats.output += v.outputTokens;
    cats.cache_creation += v.cacheCreationInputTokens;
    cats.cache_read += v.cacheReadInputTokens;
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
    total: cats.input + cats.output + cats.cache_creation + cats.cache_read, modelos, custo_cli_usd: custoCli, fonte: 'json' };
}

/** Reconciliacao `usage` vs soma de `modelUsage`. Passo local: nao se aplica. */
export function reconciliar(t) {
  if (ehLocal(t)) return { ok: null, motivo: 'passo local — nao se aplica' };
  const mu = t && t.modelUsage, u = t && t.usage;
  if (!mu || !u) return { ok: null, motivo: 'sem usage ou modelUsage' };
  const somaOut = Object.values(mu).reduce((s, v) => s + (Number(v && v.outputTokens) || 0), 0);
  const somaIn = Object.values(mu).reduce((s, v) => s + (Number(v && v.inputTokens) || 0), 0);
  if ((Number(u.output_tokens) || 0) < somaOut) return { ok: false, motivo: `usage.output ${u.output_tokens} < soma modelUsage ${somaOut}` };
  if ((Number(u.input_tokens) || 0) < somaIn) return { ok: false, motivo: `usage.input ${u.input_tokens} < soma modelUsage ${somaIn}` };
  return { ok: true, motivo: null };
}

/** ARRANCOU de uma tentativa (interpretacao 1 para o passo local). */
export function arrancouDaTentativa(t) {
  if (!t) return false;
  if (ehLocal(t)) return t.arrancou === true || (t.arrancou == null && typeof t.texto_local_sha256 === 'string');
  return t.arrancou === true;
}

/**
 * Coerência da aceitação (interpretação 19). Devolve null se coerente (ou
 * indecidível), senão o motivo. `historico` = tests_total_historico da tarefa
 * do corpus, ou null para suplentes.
 */
export function aceiteContraditorio(t, historico) {
  if (ehLocal(t) || typeof t.aceite !== 'boolean') return null;
  const provas = [];
  if (Number.isFinite(t.exit_code)) provas.push({ ok: t.exit_code === 0, nome: `exit_code=${t.exit_code}` });
  if (typeof t.test_file_sha_antes === 'string' && typeof t.test_file_sha_depois === 'string') provas.push({ ok: t.test_file_sha_antes === t.test_file_sha_depois, nome: 'test_file_sha antes!=depois' });
  if (Number.isFinite(t.tests_passados) && Number.isFinite(t.tests_corridos)) provas.push({ ok: t.tests_passados <= t.tests_corridos, nome: `tests_passados ${t.tests_passados} > tests_corridos ${t.tests_corridos}` });
  if (Number.isFinite(historico) && Number.isFinite(t.tests_corridos)) provas.push({ ok: t.tests_corridos >= historico, nome: `tests_corridos ${t.tests_corridos} < historico ${historico}` });
  if (Number.isFinite(historico) && Number.isFinite(t.tests_passados)) provas.push({ ok: t.tests_passados >= historico, nome: `tests_passados ${t.tests_passados} < historico ${historico}` });
  if (provas.length === 0) return null;
  const falhas = provas.filter((p) => !p.ok).map((p) => p.nome);
  if (t.aceite === true && falhas.length > 0) return `aceite=true com ${falhas.join(', ')}`;
  // aceite=false so e contraditorio se TODAS as provas disponiveis estao ok E as tres do prereg estao presentes
  const completo = Number.isFinite(t.exit_code) && typeof t.test_file_sha_antes === 'string' && typeof t.test_file_sha_depois === 'string' && Number.isFinite(t.tests_passados) && Number.isFinite(t.tests_corridos) && Number.isFinite(historico);
  if (t.aceite === false && completo && falhas.length === 0) return 'aceite=false com exit_code 0, test_file intacto e testes >= historico';
  return null;
}

// ── valorizacao ────────────────────────────────────────────────────────────

/** Valorizacao teorica de uma tentativa aos precos e multiplicadores do prereg. null se tokens null. */
export function valorizar(tok, precos) {
  if (!tok) return null;
  const { input, output } = precos.opus_usd_por_Mtok;
  const m = precos.cache_multiplicadores;
  const cc1h = tok.cache_creation_1h === null ? null : tok.cache_creation_1h;
  const cc5m = tok.cache_creation_5m === null ? null : tok.cache_creation_5m;
  if (cc1h === null || cc5m === null || tok.input === null || tok.output === null || tok.cache_read === null) return null;   // sem categorias nao se valoriza
  const usd = (tok.input * input + tok.output * output + cc1h * input * m.cache_creation_1h
    + cc5m * input * m.cache_creation_5m + tok.cache_read * input * m.cache_read) / 1e6;
  return usd;
}

// ── agregacao ──────────────────────────────────────────────────────────────

const somaOuNull = (xs) => (xs.some((x) => x === null || x === undefined) ? null : xs.reduce((a, b) => a + b, 0));
const razaoOuIndef = (num, den) => (num === null ? null : den === 0 ? 'INDEFINIDO' : num / den);
const arredRazao = (x) => (x === null || x === 'INDEFINIDO' ? x : arred.tok(x));
const arredWilson = (w) => (w === null ? null : { p: arred.prop(w.p), lo: arred.prop(w.lo), hi: arred.prop(w.hi) });
const MARGEM = 2;   // 'LIMIAR DESCRITIVO: aceites_B >= aceites_A - 2' — o prereg so tem o criterio como texto

/** A primaria de UMA lista de pares validos. Usada para o global e para cada tier (interpretacao 6). */
function primariaDe(validos, criterio, { fechou, valida }) {
  const n = validos.length;
  const aceitesA = validos.filter((t) => t.A.aceite).length;
  const aceitesB = validos.filter((t) => t.B.aceite).length;
  const celula = (fa, fb) => validos.filter((t) => t.A.aceite === fa && t.B.aceite === fb).map((t) => t.task_id);
  const tabela = { ambos: celula(true, true), so_A: celula(true, false), so_B: celula(false, true), nenhum: celula(false, false) };
  const ic = n > 0 ? tangoIC(tabela.so_A.length, tabela.so_B.length, n) : tangoIC(0, 0, 0);
  const haVeredicto = fechou && valida === true && n > 0;
  return {
    n_pares_validos: n,
    aceites_A: aceitesA, aceites_B: aceitesB,
    wilson_A: n > 0 ? arredWilson(wilson(aceitesA, n)) : null,
    wilson_B: n > 0 ? arredWilson(wilson(aceitesB, n)) : null,
    tabela_2x2: tabela,
    diferenca_emparelhada_A_menos_B: ic.diferenca === null ? null : arred.prop(ic.diferenca),
    ic95_tango: ic.lo === null ? null : { lo: arred.prop(ic.lo), hi: arred.prop(ic.hi) },
    criterio,
    limiar_descritivo_cumprido: haVeredicto ? aceitesB >= aceitesA - MARGEM : null,
    veredicto_ausente_porque: haVeredicto ? null
      : !fechou ? 'corrida nao fechou — prefixo, sem veredicto (CUSTO-11)'
      : valida === false ? 'corrida INVALIDA — ver corrida_invalida_por'
      : valida === null ? 'validade da corrida n/d — ver validade_nd_porque'
      : 'sem pares validos',
    AVISO: fechou && valida === true
      ? 'limiar descritivo, nao inferencia. Ver prereg.metricas.primaria.o_que_o_nome_NAO_e.'
      : 'DESCRITIVO DO QUE CORREU. A corrida nao fechou, e invalida ou a validade e n/d: tabela, Wilson e intervalo descrevem o prefixo; nao ha veredicto.',
  };
}

/** Resolve a cadeia de suplentes t2 -> s1 -> s2 ... com guarda de ciclo. */
function resolverSuplente(id, substituicoes) {
  const vistos = new Set([id]);
  let actual = id;
  while (substituicoes[actual] && !vistos.has(substituicoes[actual])) {
    actual = substituicoes[actual];
    vistos.add(actual);
  }
  return actual;
}

const preVooFalhou = (p) => (typeof p.falhou === 'boolean' ? p.falhou : Number.isFinite(p.exit_code) && p.exit_code !== 0);

export function analisar(prereg, eventos, { agora = null } = {}) {
  const precos = prereg.metricas.yardstick_custo;
  const tarefasPrereg = prereg.corpus.tarefas;
  const ordemIds = tarefasPrereg.map((t) => t.task_id);
  const suplentesPrereg = Array.isArray(prereg.corpus.suplentes) ? prereg.corpus.suplentes : [];
  const porTipo = (tipo) => eventos.filter((e) => e.evento === tipo);
  const excluidas = porTipo('tarefa_excluida');
  const invalidos = porTipo('par_invalido');
  const paragens = porTipo('paragem');
  const preVoos = porTipo('pre_voo');

  const marcas = [];   // pares/tentativas marcados, com motivo — nunca escondidos
  const marca = (m) => marcas.push(m);
  const corridaInvalidaPor = [];
  const invalida = (motivo, valor) => {
    const e = corridaInvalidaPor.find((x) => x.motivo === motivo);
    if (e) e.valores.push(valor); else corridaInvalidaPor.push({ motivo, valores: [valor] });
  };
  const ref = (t) => `${t.task_id}/${t.braco}/${t.tentativa ?? 1}`;

  // tentativas: duplicadas (mesmo task/braco/tentativa) — fica a ULTIMA (interpretacao 11)
  const duplicadas = [];
  const tentativas = [];
  for (const t of porTipo('tentativa_fim')) {
    const i = tentativas.findIndex((x) => x.task_id === t.task_id && x.braco === t.braco && (x.tentativa ?? 1) === (t.tentativa ?? 1));
    if (i >= 0) { duplicadas.push(tentativas[i]); tentativas[i] = t; marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'tentativa_duplicada', motivo: 'mesmo task/braco/tentativa escrito 2x — fica a ultima' }); }
    else tentativas.push(t);
  }
  // chaves omitidas (12) e contrato de tipo (18) — sobre TODAS, orfas incluidas
  const tipoInvalidoDe = new Map();
  for (const t of tentativas) {
    const omitidas = CHAVES_OBRIGATORIAS.filter((c) => !(c in t));
    if (omitidas.length) marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'chave_omitida', motivo: omitidas.join(', ') });
    const viol = violacoesDeTipo(t);
    if (viol.length) {
      tipoInvalidoDe.set(t, viol);
      marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'tipo_invalido', motivo: viol.join('; ') });
      if (viol.some((v) => v.startsWith('aceite:') || v.startsWith('arrancou:'))) invalida('tipo invalido em aceite/arrancou — a aceitacao do controlador esta partida (interpretacao 18)', `${ref(t)}: ${viol.filter((v) => /^(aceite|arrancou):/.test(v)).join('; ')}`);
    }
  }

  // suplentes (interpretacoes 8 e 15)
  const substituicoes = {};
  const usos = {};
  for (const e of excluidas) {
    if (tentativas.some((t) => t.task_id === e.task_id)) {
      marca({ task_id: e.task_id, tipo: 'suplente_fora_do_protocolo', motivo: 'tarefa excluida DEPOIS de ter tentativas — substituicao por resultado' });
      invalida('suplente fora do protocolo', `${e.task_id}: excluida depois de correr`);
    }
    if (!e.suplente_usado) continue;
    substituicoes[e.task_id] = e.suplente_usado;
    usos[e.suplente_usado] = (usos[e.suplente_usado] || 0) + 1;
    const problemas = [];
    if (!suplentesPrereg.includes(e.suplente_usado)) problemas.push('nao esta em corpus.suplentes');
    if (ordemIds.includes(e.suplente_usado)) problemas.push('e id do corpus');
    if (usos[e.suplente_usado] > 1) problemas.push('usado mais de uma vez');
    if (problemas.length) {
      marca({ task_id: e.task_id, tipo: 'suplente_fora_do_protocolo', motivo: `${e.suplente_usado}: ${problemas.join('; ')}` });
      invalida('suplente fora do protocolo', `${e.task_id} -> ${e.suplente_usado}: ${problemas.join('; ')}`);
    }
  }
  const idsEmJogo = [...new Set(ordemIds.map((id) => resolverSuplente(id, substituicoes)))];
  if (idsEmJogo.length !== ordemIds.length) invalida('tarefas em jogo repetidas apos suplentes', `${idsEmJogo.length} distintas de ${ordemIds.length}`);

  // tentativas orfas: task_id fora do jogo ou braco fora de {A,B} — nao se descartam (interpretacao 11)
  const orfas = tentativas.filter((t) => !idsEmJogo.includes(t.task_id) || (t.braco !== 'A' && t.braco !== 'B'));
  for (const t of orfas) marca({ task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tipo: 'tentativa_orfa', motivo: !idsEmJogo.includes(t.task_id) ? 'task_id fora das tarefas em jogo' : `braco ${JSON.stringify(t.braco)} fora de {A,B}` });

  const porTarefa = [];
  for (const id of idsEmJogo) {
    const meta = tarefasPrereg.find((t) => t.task_id === id) || null;
    const historico = meta && Number.isFinite(meta.tests_total_historico) ? meta.tests_total_historico : null;
    const ts = tentativas.filter((t) => t.task_id === id && (t.braco === 'A' || t.braco === 'B'));
    // tier: do prereg; para suplentes, do ledger se unanime (interpretacao 8)
    const tiersLedger = [...new Set(ts.map((t) => t.tier_classificado).filter((x) => x != null))];
    let tier = meta ? meta.tier_classificado : null;
    if (meta && ts.length > 0 && tiersLedger.some((x) => x !== meta.tier_classificado)) marca({ task_id: id, tipo: 'tier_divergente', motivo: `prereg ${meta.tier_classificado}, ledger ${tiersLedger.join(', ')}` });
    if (!meta && ts.length > 0) {
      if (tiersLedger.length === 1) tier = tiersLedger[0];
      else if (tiersLedger.length > 1) marca({ task_id: id, tipo: 'tier_inconsistente', motivo: `tiers no ledger: ${tiersLedger.join(', ')}` });
      else marca({ task_id: id, tipo: 'tier_desconhecido', motivo: 'suplente sem tier_classificado em nenhuma tentativa' });
    }
    let ordemDosBracos = meta ? meta.ordem_dos_bracos : null;
    if (!meta && ts.length > 0) {
      const primeira = [...ts].sort((p, q) => String(p.ts_inicio || '').localeCompare(String(q.ts_inicio || '')))[0];
      ordemDosBracos = primeira.braco === 'B' ? 'A-depois-B' : primeira.braco === 'A' ? 'B-depois-A' : null;
    }
    const braco = (b) => {
      const xs = ts.filter((t) => t.braco === b).sort((p, q) => (p.tentativa ?? 0) - (q.tentativa ?? 0));
      if (xs.length === 0) return { tentativas: 0, aceite: null, aceite_indecidivel: false, tokens: null, valorizacao_usd: null, custo_cli_usd: null, custo_cli_total_usd: null, duration_ms: null, duracoes_ms: [], ate_verde_ms: null, arrancou: null, arrancou_valor_ultima: null, motivo_se_nao: null, escalou: false, tecto: [], tokens_locais: null, modelo_local: [], modelos_opus: [], fontes: [], local_aceite: false, fora_do_protocolo: null, contraditorio: null, tipo_invalido: false, sem_opus: false };
      const toks = xs.map(tokensOpusDaTentativa);
      let contraditorio = null;
      let semOpus = false;
      for (const [i, t] of xs.entries()) {
        const rec = reconciliar(t);
        if (rec.ok === false) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'reconciliacao', motivo: rec.motivo });
        const prob = ehLocal(t) ? { sem_opus: false, campos: [] } : problemasDoModelUsage(t.modelUsage);
        if (!ehLocal(t) && t.modelUsage && typeof t.modelUsage === 'object' && prob.sem_opus) {
          semOpus = true;
          marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'sem_opus_no_modelUsage', motivo: `modelUsage sem chave claude-opus*: {${Object.keys(t.modelUsage).join(', ')}} — a flag --model perdeu-se (interpretacao 20)` });
          invalida('tentativa claude-p sem Opus no modelUsage — executor mal configurado (interpretacao 20)', ref(t));
        }
        if (prob.campos.length > 0) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: prob.campos.join(', ') });
        if (toks[i] === null) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'consumo_desconhecido', motivo: prob.sem_opus || prob.campos.length ? 'modelUsage sem Opus utilizavel e sem tokens_transcript > 0' : 'arrancou, sem modelUsage e sem tokens_transcript > 0 — tecto ou morte sem JSON', transcript: Number.isFinite(t.tokens_transcript) ? t.tokens_transcript : null });
        if (toks[i] && toks[i].fonte === 'transcript') marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'consumo_do_transcript', motivo: 'sem JSON; total do transcript e a unica fonte (prereg secundaria.timeout_sem_json)', transcript: t.tokens_transcript });
        if (ehLocal(t)) {
          if (t.modelUsage) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'local_com_modelUsage', motivo: 'passo local trouxe modelUsage — tokens de Opus continuam zero por construcao' });
          const faltam = ['tokens_locais', 'modelo_reportado'].filter((c) => t[c] == null);
          if (faltam.length) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: faltam.join(', ') });
          if (!arrancouDaTentativa(t)) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'local_nao_arrancou', motivo: `arrancou=${JSON.stringify(t.arrancou ?? null)}${t.motivo_se_nao ? ' · ' + t.motivo_se_nao : ''}` });
          if (t.aceite === true) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'local_aceite', motivo: 'passo local ACEITE — impossivel por construcao (DECLARACAO_DE_DEGENERESCENCIA); a aceitacao do controlador esta partida' });
        } else {
          if (!arrancouDaTentativa(t)) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'tentativa_nao_arrancou', motivo: `arrancou=${JSON.stringify(t.arrancou ?? null)}${t.motivo_se_nao ? ' · ' + t.motivo_se_nao : ''}` });
          if (t.arrancou == null) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'arrancou' });
        }
        if (t.aceite == null) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'aceite' });
        const contra = aceiteContraditorio(t, historico);
        if (contra) {
          contraditorio = contraditorio || contra;
          marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'aceite_contraditorio', motivo: contra });
          invalida('aceite contraditorio com a prova registada — a aceitacao do controlador esta partida (interpretacao 19)', `${ref(t)}: ${contra}`);
        }
        if (t.estado_vivo_sha == null) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'estado_vivo_sha' });
        if (t.sentinela_presente !== true && t.sentinela_presente !== false) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'campo_em_falta', motivo: 'sentinela_presente' });
        if (t.tokens_transcript && toks[i] && toks[i].fonte === 'json' && toks[i].total > 0) {
          const d = Math.abs(t.tokens_transcript - toks[i].total) / toks[i].total;
          if (d > 0.01) marca({ task_id: id, braco: b, tentativa: t.tentativa, tipo: 'divergencia_json_vs_transcript', motivo: `${(d * 100).toFixed(1)}%`, json: toks[i].total, transcript: t.tokens_transcript });
        }
      }
      // protocolo de tentativas (interpretacao 16)
      let foraDoProtocolo = null;
      if (b === 'A') {
        if (xs.length > 1) foraDoProtocolo = `A com ${xs.length} tentativas (prereg: 1)`;
        else if (xs.some((t) => t.executor !== 'claude-p')) foraDoProtocolo = `A com executor ${JSON.stringify(xs[0].executor)} (prereg: claude-p)`;
      }
      if (b === 'B') {
        const locais = xs.filter(ehLocal).length;
        if (xs.length > 2) foraDoProtocolo = `B com ${xs.length} tentativas (prereg: <= 2)`;
        else if (ehTierLocal(tier) && !ehLocal(xs[0])) foraDoProtocolo = `B em ${tier} sem passo local na 1.a tentativa`;
        else if (ehTierLocal(tier) && xs.length === 1 && xs[0].aceite !== true) foraDoProtocolo = `B em ${tier} com passo local nao aceite e sem escalacao (escalacao_em_falta)`;
        else if (tier != null && !ehTierLocal(tier) && (xs.length > 1 || locais > 0)) foraDoProtocolo = `B em ${tier} com ${xs.length} tentativas e ${locais} passo(s) local(is) (prereg: 1, sem local)`;
        else if (locais > 1) foraDoProtocolo = `B com ${locais} passos locais`;
      }
      if (foraDoProtocolo) marca({ task_id: id, braco: b, tipo: 'tentativas_fora_do_protocolo', motivo: foraDoProtocolo });
      const soma = (campo) => somaOuNull(toks.map((k) => (k === null ? null : k[campo])));
      const tokens = toks.some((k) => k === null) ? null : {
        input: soma('input'), output: soma('output'), cache_creation: soma('cache_creation'),
        cache_creation_1h: soma('cache_creation_1h'), cache_creation_5m: soma('cache_creation_5m'),
        cache_read: soma('cache_read'), total: soma('total'),
      };
      const duracoes = xs.map((t) => (Number.isFinite(t.duration_ms) ? t.duration_ms : null));
      // tempo-ate-verde: soma das duracoes ate a primeira tentativa aceite, inclusive; null se nunca aceitou
      const iVerde = xs.findIndex((t) => t.aceite === true);
      const ateVerde = iVerde < 0 ? null : somaOuNull(duracoes.slice(0, iVerde + 1));
      const ultima = xs[xs.length - 1];
      return {
        tentativas: xs.length,
        aceite: xs.some((t) => t.aceite === true),
        aceite_indecidivel: xs.some((t) => typeof t.aceite !== 'boolean'),
        local_aceite: xs.some((t) => ehLocal(t) && t.aceite === true),
        fora_do_protocolo: foraDoProtocolo,
        contraditorio,
        tipo_invalido: xs.some((t) => tipoInvalidoDe.has(t)),
        sem_opus: semOpus,
        arrancou: arrancouDaTentativa(ultima),                         // interpretacao 2: a ultima tentativa
        arrancou_valor_ultima: ultima.arrancou === undefined ? null : ultima.arrancou,
        motivo_se_nao: ultima.motivo_se_nao || null,
        escalou: xs.some((t) => t.e_escalacao === true),
        tokens,
        valorizacao_usd: somaOuNull(toks.map((k) => valorizar(k, precos))),
        custo_cli_usd: somaOuNull(toks.map((k) => (k === null ? null : k.custo_cli_usd))),
        custo_cli_total_usd: somaOuNull(xs.map((t, i) => (ehLocal(t) || (toks[i] && toks[i].fonte === 'nao arrancou') ? 0 : Number.isFinite(t.total_cost_usd) ? t.total_cost_usd : null))),
        duration_ms: somaOuNull(duracoes),
        duracoes_ms: duracoes,
        ate_verde_ms: ateVerde,
        tecto: xs.map((t) => (t.tecto_do_orcamento === undefined ? null : t.tecto_do_orcamento)),
        tokens_locais: somaOuNull(xs.map((t) => (ehLocal(t) ? (Number.isFinite(t.tokens_locais) ? t.tokens_locais : null) : 0))),
        modelo_local: xs.filter(ehLocal).map((t) => t.modelo_reportado || null),
        modelos_opus: [...new Set(toks.flatMap((k) => (k === null ? [] : k.modelos)))].sort(),
        fontes: toks.map((k) => (k === null ? 'desconhecido' : k.fonte)),
      };
    };
    const A = braco('A'), B = braco('B');
    const invalido = invalidos.find((e) => e.task_id === id) || null;
    const temTentativas = A.tentativas + B.tentativas > 0;
    const correu = temTentativas || !!invalido;
    // par_invalido contraditorio (interpretacao 21): os dois bracos arrancaram
    if (invalido && A.tentativas > 0 && B.tentativas > 0 && A.arrancou === true && B.arrancou === true) {
      marca({ task_id: id, tipo: 'par_invalido_contraditorio', motivo: `evento par_invalido (${invalido.motivo}) numa tarefa em que os dois bracos arrancaram` });
      invalida('par_invalido contraditorio — seleccao sobre resultados (interpretacao 21)', id);
    }
    // pre-voo (interpretacao 7): o ULTIMO evento; marcas SEMPRE, para tudo o que correu
    const pvs = preVoos.filter((e) => e.task_id === id);
    const pv = pvs.length ? pvs[pvs.length - 1] : null;
    const preVooOk = pv ? preVooFalhou(pv) : null;
    if (correu) {
      if (!pv) marca({ task_id: id, tipo: 'pre_voo_ausente', motivo: 'tarefa correu sem evento pre_voo' });
      else if (!preVooOk) marca({ task_id: id, tipo: 'pre_voo_nao_falhou', motivo: `pre-voo nao falhou (exit_code=${JSON.stringify(pv.exit_code ?? null)}, falhou=${JSON.stringify(pv.falhou ?? null)}) — tarefa ja verde, aceitacao nao mede nada` });
    }
    // validade do par: por ordem de gravidade, o primeiro motivo fica
    const valor = (x) => JSON.stringify(x.arrancou_valor_ultima);
    let bracoQueNaoArrancou = null, motivoInvalido = null;
    if (invalido) { bracoQueNaoArrancou = invalido.braco; motivoInvalido = invalido.motivo; }
    else if (temTentativas && A.tentativas === 0) { bracoQueNaoArrancou = 'A'; motivoInvalido = 'sem tentativa registada no braco A'; }
    else if (temTentativas && B.tentativas === 0) { bracoQueNaoArrancou = 'B'; motivoInvalido = 'sem tentativa registada no braco B'; }
    else if (temTentativas && A.arrancou !== true) { bracoQueNaoArrancou = 'A'; motivoInvalido = `ultima tentativa com arrancou=${valor(A)} sem evento par_invalido${A.motivo_se_nao ? ' · ' + A.motivo_se_nao : ''}`; }
    else if (temTentativas && B.arrancou !== true) { bracoQueNaoArrancou = 'B'; motivoInvalido = `ultima tentativa com arrancou=${valor(B)} sem evento par_invalido${B.motivo_se_nao ? ' · ' + B.motivo_se_nao : ''}`; }
    else if (temTentativas && (A.tipo_invalido || B.tipo_invalido)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = 'tipo invalido em campo obrigatorio (interpretacao 18)'; }
    else if (temTentativas && (A.aceite_indecidivel || B.aceite_indecidivel)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = 'aceite null — o input da primaria esta em falta (interpretacao 12)'; }
    else if (temTentativas && (A.local_aceite || B.local_aceite)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = 'passo local aceite — impossivel por construcao (interpretacao 14)'; }
    else if (temTentativas && (A.contraditorio || B.contraditorio)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = `aceite contraditorio: ${A.contraditorio || B.contraditorio} (interpretacao 19)`; }
    else if (temTentativas && (A.sem_opus || B.sem_opus)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = 'tentativa claude-p sem Opus no modelUsage (interpretacao 20)'; }
    else if (temTentativas && (A.fora_do_protocolo || B.fora_do_protocolo)) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = `tentativas fora do protocolo: ${A.fora_do_protocolo || B.fora_do_protocolo}`; }
    else if (temTentativas && !pv) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = 'pre-voo ausente'; }
    else if (temTentativas && !preVooOk) { bracoQueNaoArrancou = 'n/a'; motivoInvalido = 'pre-voo nao falhou (tarefa ja verde)'; }
    const parValido = correu && motivoInvalido === null;
    // par fechado: os dois bracos tem tentativa, ou um evento par_invalido fechou-o (interpretacao 4)
    const parFechado = !!invalido || (A.tentativas > 0 && B.tentativas > 0);
    porTarefa.push({
      task_id: id, tier, ordem_dos_bracos: ordemDosBracos,
      suplente: !meta,
      pre_voo_falhou: preVooOk,
      correu, par_valido: parValido, par_fechado: parFechado,
      invalido: !parValido && correu ? { braco_que_nao_arrancou: bracoQueNaoArrancou, motivo: motivoInvalido } : null,
      A, B,
    });
  }

  const validos = porTarefa.filter((t) => t.par_valido);
  const invalidosComConsumo = porTarefa.filter((t) => !t.par_valido && t.correu);
  const naoCorridas = porTarefa.filter((t) => !t.correu);

  // ── validade da corrida (interpretacao 5) — sobre TODAS as tentativas, orfas incluidas ──
  const shasEstadoVivo = [...new Set(tentativas.map((t) => t.estado_vivo_sha).filter((x) => x != null))];
  if (shasEstadoVivo.length > 1) corridaInvalidaPor.push({ motivo: 'estado_vivo_sha mudou entre tentativas', valores: shasEstadoVivo });
  const modelosLocais = [...new Set(tentativas.filter(ehLocal).map((t) => t.modelo_reportado).filter((x) => x != null))];
  if (modelosLocais.length > 1) corridaInvalidaPor.push({ motivo: 'modelo local (nome+digest) mudou entre passos locais', valores: modelosLocais });
  const semSentinela = tentativas.filter((t) => t.sentinela_presente === false).map(ref);
  if (semSentinela.length > 0) corridaInvalidaPor.push({ motivo: 'sentinela D15 ausente em tentativas', valores: semSentinela });
  const locaisAceites = tentativas.filter((t) => ehLocal(t) && t.aceite === true).map(ref);
  if (locaisAceites.length > 0) corridaInvalidaPor.push({ motivo: 'passo local aceite — a aceitacao do controlador esta partida (interpretacao 14)', valores: locaisAceites });
  const validadeNdPorque = [];
  if (tentativas.length > 0 && tentativas.some((t) => t.sentinela_presente !== true)) validadeNdPorque.push('tentativas sem sentinela_presente === true');
  if (tentativas.length > 0 && shasEstadoVivo.length === 0) validadeNdPorque.push('nenhuma tentativa traz estado_vivo_sha');
  if (tentativas.length === 0) validadeNdPorque.push('sem tentativas');
  const corridaValida = corridaInvalidaPor.length > 0 ? false : validadeNdPorque.length > 0 ? null : true;

  // ── paragem / prefixo ────────────────────────────────────────────────────
  const fechou = porTarefa.every((t) => t.par_fechado) && paragens.length === 0;
  const paragem = paragens.length > 0 ? paragens[paragens.length - 1] : null;
  const estado = { fechou, valida: corridaValida };

  // ── primaria ─────────────────────────────────────────────────────────────
  const criterio = prereg.metricas.primaria.criterio;
  const primaria = primariaDe(validos, criterio, estado);

  // ── secundaria ───────────────────────────────────────────────────────────
  const totalDe = (lista, b) => {
    const toks = lista.map((t) => t[b].tokens);
    return lista.length === 0 ? null : toks.some((k) => k === null) ? null : toks.reduce((s, k) => s + k.total, 0);
  };
  const tokensDeSoltas = (lista, b) => somaOuNull(lista.filter((t) => t.braco === b).map((t) => { const k = tokensOpusDaTentativa(t); return k ? k.total : null; }));
  const vistas = (lista, label, listaInvalidos, soltas) => {
    const porBraco = (b) => {
      const toks = lista.map((t) => t[b].tokens);
      const total = totalDe(lista, b);
      const cats = (campo) => (lista.length === 0 || toks.some((k) => k === null || k[campo] === null) ? null : toks.reduce((s, k) => s + k[campo], 0));
      const aceites = lista.filter((t) => t[b].aceite).length;
      const ambos = lista.filter((t) => t.A.aceite && t.B.aceite);
      const totalAmbos = totalDe(ambos, b);
      // interpretacao 9: as outras leituras do total (0 valido e 0 invalido = 0, nao null: nao ha nada desconhecido)
      const totalInvalidos = listaInvalidos.length === 0 ? 0 : somaOuNull(listaInvalidos.map((t) => (t[b].tentativas === 0 ? 0 : t[b].tokens ? t[b].tokens.total : null)));
      const totalSoltas = tokensDeSoltas(soltas, b);
      const base = lista.length === 0 ? 0 : total;
      const comInvalidos = base === null || totalInvalidos === null ? null : base + totalInvalidos;
      return {
        tokens_opus_total: total,
        tokens_opus_total_incluindo_pares_invalidos: comInvalidos,
        tokens_opus_total_todas_as_tentativas: comInvalidos === null || totalSoltas === null ? null : comInvalidos + totalSoltas,
        por_tarefa_atribuida: lista.length === 0 ? null : (total === null ? null : arred.tok(total / lista.length)),
        por_tarefa_atribuida_sobre_prereg: total === null ? null : arred.tok(total / ordemIds.length),
        por_aceite: arredRazao(razaoOuIndef(total, aceites)),
        so_aceites_por_ambos: { n: ambos.length, tokens_total: totalAmbos, por_tarefa: ambos.length === 0 ? null : (totalAmbos === null ? null : arred.tok(totalAmbos / ambos.length)) },
        por_categoria: { input: cats('input'), output: cats('output'), cache_creation_1h: cats('cache_creation_1h'), cache_creation_5m: cats('cache_creation_5m'), cache_read: cats('cache_read') },
        aceites,
        escalacoes: lista.filter((t) => t[b].escalou).length,
        tokens_locais_a_parte: lista.length === 0 ? null : somaOuNull(lista.map((t) => t[b].tokens_locais)),
        modelos_opus_vistos: [...new Set(lista.flatMap((t) => t[b].modelos_opus))].sort(),
      };
    };
    return { estrato: label, n: lista.length, A: porBraco('A'), B: porBraco('B') };
  };
  const soltas = [...orfas, ...duplicadas];
  const tierDe = (t) => (t.tier == null ? 'n/d' : t.tier);
  const secundaria = { global: vistas(validos, 'todos', invalidosComConsumo, soltas), por_tier: {} };
  for (const tier of [...new Set(porTarefa.map(tierDe))].sort()) {
    const v = validos.filter((t) => tierDe(t) === tier);
    const idsDoTier = new Set(porTarefa.filter((t) => tierDe(t) === tier).map((t) => t.task_id));
    secundaria.por_tier[tier] = { ...vistas(v, tier, invalidosComConsumo.filter((t) => tierDe(t) === tier), soltas.filter((t) => idsDoTier.has(t.task_id))), primaria: primariaDe(v, criterio, estado) };
  }

  // ── valorizacao ──────────────────────────────────────────────────────────
  const valor = (b) => ({
    valorizacao_teorica_usd: validos.length === 0 ? null : arred.usd(somaOuNull(validos.map((t) => t[b].valorizacao_usd))),
    custo_cli_opus_usd: validos.length === 0 ? null : arred.usd(somaOuNull(validos.map((t) => t[b].custo_cli_usd))),
    custo_cli_total_usd: validos.length === 0 ? null : arred.usd(somaOuNull(validos.map((t) => t[b].custo_cli_total_usd))),
  });
  const valorizacao = {
    ROTULO_OBRIGATORIO: precos.rotulo_obrigatorio_em_qualquer_visualizacao,
    precos_de_lista: { fonte: precos.fonte, sha256: precos.pricing_sha256, opus_usd_por_Mtok: precos.opus_usd_por_Mtok, cache_multiplicadores: precos.cache_multiplicadores },
    A: valor('A'), B: valor('B'),
    NOTA: 'custo_cli_opus_usd = so modelUsage[claude-opus-*].costUSD; custo_cli_total_usd = total_cost_usd da invocacao inteira (subagentes incluidos). Divergem quando ha subagentes. Sobre pares validos; os invalidos estao em fiabilidade.',
    NAO_E: precos.O_QUE_NAO_E,
  };

  // ── velocidade (fora do criterio) ────────────────────────────────────────
  const velocidade = {
    AVISO: 'reportada, fora do criterio',
    A: { tempo_total_ms: validos.length === 0 ? null : somaOuNull(validos.map((t) => t.A.duration_ms)) },
    B: { tempo_total_ms: validos.length === 0 ? null : somaOuNull(validos.map((t) => t.B.duration_ms)) },
    por_tarefa: validos.map((t) => ({
      task_id: t.task_id, A_ms: t.A.duration_ms, B_ms: t.B.duration_ms,
      A_duracoes_ms: t.A.duracoes_ms, B_duracoes_ms: t.B.duracoes_ms,
      A_ate_verde_ms: t.A.ate_verde_ms, B_ate_verde_ms: t.B.ate_verde_ms,
    })),
  };

  // ── fiabilidade: pares invalidos com o consumo que ficou ─────────────────
  const consumoDe = (t) => ({
    consumo_A_tokens: t.A.tokens ? t.A.tokens.total : null, consumo_B_tokens: t.B.tokens ? t.B.tokens.total : null,
    valorizacao_A_usd: arred.usd(t.A.valorizacao_usd), valorizacao_B_usd: arred.usd(t.B.valorizacao_usd),
    custo_cli_A_usd: arred.usd(t.A.custo_cli_usd), custo_cli_B_usd: arred.usd(t.B.custo_cli_usd),
    custo_cli_total_A_usd: arred.usd(t.A.custo_cli_total_usd), custo_cli_total_B_usd: arred.usd(t.B.custo_cli_total_usd),
  });
  const resumoSolta = (t) => { const k = tokensOpusDaTentativa(t); return { task_id: t.task_id, braco: t.braco, tentativa: t.tentativa, tokens_opus: k ? k.total : null, custo_cli_usd: k ? arred.usd(k.custo_cli_usd) : null }; };
  const fiabilidade = {
    pares_invalidos: invalidosComConsumo.map((t) => ({
      task_id: t.task_id, tier: t.tier,
      braco_que_nao_arrancou: t.invalido.braco_que_nao_arrancou,
      motivo: t.invalido.motivo,
      ...consumoDe(t),
    })),
    nao_corridas: naoCorridas.map((t) => t.task_id),
    tentativas_orfas: orfas.map(resumoSolta),
    tentativas_duplicadas: duplicadas.map(resumoSolta),
    tarefas_excluidas_antes_de_correr: excluidas.map((e) => ({ task_id: e.task_id, motivo: e.motivo, suplente_usado: e.suplente_usado || null })),
    estado_vivo_shas_vistos: shasEstadoVivo,
    modelos_locais_vistos: modelosLocais,
    AVISO: 'CUSTO-10: o consumo dos pares invalidos NAO e apagado; esta aqui.',
  };

  const resultado = {
    schema: 'mooter/custo-analysis/1',
    experiment_id: prereg.experiment_id,
    gerado_em: agora || new Date().toISOString(),
    prereg_sha256: prereg.__sha256 || null,
    corrida_fechou_os_pares: fechou,
    corrida_valida: corridaValida,
    corrida_invalida_por: corridaInvalidaPor,
    validade_nd_porque: validadeNdPorque,
    motivo_de_paragem: paragem ? { ts: paragem.ts, motivo: paragem.motivo, ultima_tarefa: paragem.ultima_tarefa || null } : null,
    prefixo_executado: { tarefas_com_alguma_tentativa: porTarefa.filter((t) => t.A.tentativas + t.B.tentativas > 0).length, de: idsEmJogo.length, de_prereg: ordemIds.length },
    primaria,
    secundaria,
    valorizacao,
    velocidade,
    fiabilidade,
    por_tarefa: porTarefa.map((t) => ({
      task_id: t.task_id, tier: t.tier, suplente: t.suplente, ordem_dos_bracos: t.ordem_dos_bracos, pre_voo_falhou: t.pre_voo_falhou, par_valido: t.par_valido, par_fechado: t.par_fechado,
      A: { tentativas: t.A.tentativas, aceite: t.A.aceite, arrancou: t.A.arrancou, tokens_opus: t.A.tokens ? t.A.tokens.total : null, fontes: t.A.fontes, duration_ms: t.A.duration_ms, tecto_do_orcamento: t.A.tecto, escalou: t.A.escalou, modelos_opus: t.A.modelos_opus },
      B: { tentativas: t.B.tentativas, aceite: t.B.aceite, arrancou: t.B.arrancou, tokens_opus: t.B.tokens ? t.B.tokens.total : null, fontes: t.B.fontes, duration_ms: t.B.duration_ms, tecto_do_orcamento: t.B.tecto, escalou: t.B.escalou, tokens_locais: t.B.tokens_locais, modelo_local: t.B.modelo_local, modelos_opus: t.B.modelos_opus },
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
  const p = r.primaria, f = r.fiabilidade;
  const estado = r.corrida_fechou_os_pares ? 'corrida FECHADA' : `corrida NAO fechou — prefixo ${r.prefixo_executado.tarefas_com_alguma_tentativa}/${r.prefixo_executado.de}`;
  const validade = r.corrida_valida === false ? ` · INVALIDA: ${r.corrida_invalida_por.map((x) => x.motivo).join('; ')}` : r.corrida_valida === null ? ` · validade n/d: ${r.validade_nd_porque.join('; ')}` : '';
  console.log(`custo-analise: ${estado}${validade} · nao corridas ${f.nao_corridas.length}`);
  const veredicto = p.limiar_descritivo_cumprido === null ? `n/d (${p.veredicto_ausente_porque})` : p.limiar_descritivo_cumprido ? 'cumprido' : 'NAO cumprido';
  console.log(`  pares validos ${p.n_pares_validos} · aceites A ${p.aceites_A} B ${p.aceites_B} · limiar descritivo ${veredicto}`);
  console.log(`  tokens Opus total A ${r.secundaria.global.A.tokens_opus_total ?? 'n/d'} B ${r.secundaria.global.B.tokens_opus_total ?? 'n/d'} · marcas ${r.marcas.length} · invalidos ${f.pares_invalidos.length} · orfas ${f.tentativas_orfas.length} · duplicadas ${f.tentativas_duplicadas.length}`);
  console.log(`  escrito: ${outPath}`);
}
