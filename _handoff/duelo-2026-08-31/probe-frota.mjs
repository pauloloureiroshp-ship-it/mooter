#!/usr/bin/env node
// probe-frota.mjs — rascunho L0 do probe da frota (2026-08-31)
//
// ─────────────────────────────────────────────────────────────────────────────
// PORQUE ESTE FICHEIRO EXISTE
//
// A §2 do masterprompt de 2026-08-31 manda correr um probe ANTES DE CADA TAREFA
// e escolher o motor por tabela. O probe que ela cita nunca existiu: busca
// exaustiva a 2026-08-31 (git log --all em todo o histórico, find por nome na
// home inteira incluindo AppData/Downloads/Documents, grep no repo, vault) deu
// ZERO ocorrências de `probe-frota*`. Este ficheiro é o desenho de raiz, feito
// a pedido explícito do dono depois de ele confirmar que nunca existiram.
//
// ─────────────────────────────────────────────────────────────────────────────
// O QUE ESTE FICHEIRO **NÃO** FAZ (e porquê)
//
// Não inventa sondas. O repo já tem as três peças de que isto precisa, e cada
// uma delas nasceu de um defeito medido. Reimplementá-las seria repetir os
// defeitos:
//
//   · `providers/*.isAvailable()` — sonda barata por motor. A do codex declara
//     explicitamente «Does NOT consume quota»: é `codex login status`, não uma
//     chamada ao modelo. Um probe que "testasse" o motor gastando quota seria um
//     probe que se paga a si próprio.
//   · `quota-honesta.js` — separa DUAS perguntas que o router respondia com o
//     mesmo número: `engine_health` (prova: um pong) e `quota_remaining_pct`
//     (prova: fonte oficial). Nasceu de 2026-08-06, quando o hint publicou
//     `codex_quota: 0%` vindo de um orçamento LOCAL e um job codex correu 30+
//     passos quinze minutos depois. Aqui só se consome; não se recalcula.
//   · `provider-health.js` — memória com decaimento. O cooldown que a F1 pede
//     JÁ EXISTE aqui, com `recupera_em` por causa. Este probe LÊ esse estado;
//     não mantém um segundo.
//
// Escrever um quarto sítio a responder «o motor está vivo?» era criar a segunda
// verdade que estes três ficheiros passaram meses a eliminar.
//
// ─────────────────────────────────────────────────────────────────────────────
// A CONTRADIÇÃO ENTRE O MASTERPROMPT E O MOTOR (declarada, não escondida)
//
// A §2 diz: «Pesquisa web → motor com quota mais folgada no probe; n/d de quota
// = tratar como esgotada.»
//
// Só que `quota-honesta.js` estabelece que a ÚNICA fonte oficial de quota nesta
// máquina é a da Anthropic (`cc-statusline-stdin`), e que a do Codex é `n/d`
// por construção. Aplicada à letra, a regra tem duas consequências medidas:
//
//   1. o Codex nunca ganha a comparação de quota — fica excluído da pesquisa
//      web para sempre, não por estar esgotado, mas por ser inmensurável;
//   2. quando a statusline ainda não renderizou nesta janela — que é o caso
//      HOJE, 2026-08-31, o `<router-hint>` desta própria sessão diz
//      `anthropic_quota: n/d (sem quota-live…)` — TODOS os motores são n/d e a
//      pesquisa web fica sem motor nenhum.
//
// A ordem do dono é a ordem do dono: a regra está implementada à letra. O que
// este probe acrescenta é recusar-se a fazê-lo em silêncio. Quando um motor é
// excluído só por n/d, isso sai escrito como `excluido_por_nd`, distinto de
// `esgotado_medido`; e quando ninguém sobra, a etapa sai `BLOQUEADA` com o
// porquê — nunca um vencedor inventado, nunca o mais barato por defeito (a
// regra `viés do default barato` da memória do dono).
//
// ─────────────────────────────────────────────────────────────────────────────
// USO
//   node _handoff/duelo-2026-08-31/probe-frota.mjs                  # humano
//   node _handoff/duelo-2026-08-31/probe-frota.mjs --json           # ledger
//   node _handoff/duelo-2026-08-31/probe-frota.mjs --autor=claude   # refutação
//
// Nunca lança. Um probe que rebenta deixa a sessão sem rota; um probe que
// devolve `n/d` deixa-a a decidir com o que sabe.

'use strict';

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ROUTER = path.resolve(AQUI, '../../tools/router');

// ─────────────────────────────────────────────────────────────────────────────
// ROSTER — quem existe, e como se prova que existe
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Motores com sonda barata real. `modulo` é resolvido contra tools/router.
 * A sonda é sempre `isAvailable()`: existe nos quatro, e nenhum consome quota.
 */
export const SONDAVEIS = Object.freeze([
  { key: 'ollama',   modulo: 'providers/ollama-api.js',  rotulo: 'moo local (Ollama)', custo: 'gratis' },
  { key: 'codex',    modulo: 'providers/codex-cli.js',   rotulo: 'Codex CLI',          custo: 'subscricao' },
  { key: 'deepseek', modulo: 'providers/deepseek-v4.js', rotulo: 'DeepSeek v4',        custo: 'api' },
  { key: 'openai',   modulo: 'providers/openai-api.js',  rotulo: 'OpenAI API',         custo: 'api' },
]);

/**
 * Motores SEM sonda barata. Entram no relatório com `n/d` e o motivo — nunca
 * como `morto`. «Ausência não é negação»: não ter sonda não é prova de avaria.
 */
export const SEM_SONDA = Object.freeze({
  claude: 'é o processo que corre este probe — vivo por construção, não por medição',
  gemini: 'sem adaptador em tools/router/providers/ — não há sonda barata; n/d',
  kimi:   'sem adaptador em tools/router/providers/ — não há sonda barata; n/d',
});

/**
 * Quem NÃO pode refutar, e porquê. A §2 do masterprompt regista a medição:
 * «refutador local gpt-oss:20b tem precisão 2/13 — não serve de adversário para
 * conclusão com consequência». Um adversário que erra 11 em 13 não é um gate,
 * é um carimbo.
 */
export const NAO_REFUTAM = Object.freeze({
  'gpt-oss:20b': 'precisão medida 2/13 como refutador (§2 do MP 2026-08-31)',
  ollama:        'os moos locais servem leitura e rascunho, não veredicto com consequência',
});

/** Ordem de preferência do refutador, da §2: codex → gemini/kimi. */
export const ORDEM_REFUTADOR = Object.freeze(['codex', 'gemini', 'kimi', 'deepseek', 'openai']);

/** Ordem de fallback da leitura/rascunho: $0 primeiro, depois o mais barato vivo. */
export const ORDEM_LEITURA = Object.freeze(['ollama', 'deepseek', 'codex', 'openai', 'claude']);

// ─────────────────────────────────────────────────────────────────────────────
// SONDA — a única parte que toca no mundo
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Corre `isAvailable()` de cada motor sondável, em paralelo, e devolve o mapa
 * `health` no formato que o `quota-honesta.estado()` já consome:
 *   { <motor>: { pong: bool, at: iso, porque: string } }
 *
 * @param {object}   [deps]
 * @param {object}   [deps.adaptadores] — { key: { isAvailable } } para testes
 * @param {string}   [deps.agoraIso]
 * @param {number}   [deps.timeoutMs]
 */
export async function sondar(deps = {}) {
  const agoraIso = deps.agoraIso || new Date().toISOString();
  const adaptadores = deps.adaptadores || carregarAdaptadores();
  const health = {};

  await Promise.all(SONDAVEIS.map(async (m) => {
    const ad = adaptadores[m.key];
    if (!ad || typeof ad.isAvailable !== 'function') {
      health[m.key] = { pong: false, at: agoraIso, porque: 'adaptador ausente ou sem isAvailable()' };
      return;
    }
    try {
      const r = await ad.isAvailable({ timeoutMs: deps.timeoutMs || 1500 });
      const ok = !!(r && r.available);
      health[m.key] = {
        pong: ok,
        at: agoraIso,
        porque: ok ? 'isAvailable() respondeu disponível' : `isAvailable(): ${(r && r.reason) || 'sem motivo declarado'}`,
      };
    } catch (err) {
      // Uma sonda que rebenta é sonda sem resposta — não é motor morto por
      // decreto, mas também não é verde. Fica `pong:false` com a razão à vista.
      health[m.key] = { pong: false, at: agoraIso, porque: `sonda lançou: ${(err && err.message) || 'erro sem mensagem'}` };
    }
  }));

  return health;
}

function carregarAdaptadores() {
  const out = {};
  for (const m of SONDAVEIS) {
    try { out[m.key] = require(path.join(ROUTER, m.modulo)); }
    catch { /* adaptador ausente → `sondar` regista o porquê */ }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// NÚCLEO PURO — sem rede, sem relógio, sem disco. Tudo o que decide é testável.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Junta as três fontes num só retrato por motor.
 *
 * @param {object} entrada
 * @param {object} entrada.health   — de `sondar()`
 * @param {object} entrada.quota    — de `quota-honesta.estado({health})`
 * @param {object} [entrada.memoria]— de `provider-health.estadoActual()`
 * @param {object[]} [entrada.cooldown] — de `provider-health.relatorio()`
 */
export function retrato({ health = {}, quota = {}, memoria = {}, cooldown = [] } = {}) {
  const motores = {};
  const chaves = new Set([
    ...SONDAVEIS.map((m) => m.key),
    ...Object.keys(SEM_SONDA),
    ...Object.keys(quota),
    ...Object.keys(health),
  ]);

  const porCooldown = new Map(cooldown.map((c) => [c.provider, c]));

  for (const key of chaves) {
    const q = quota[key] || {};
    const h = health[key];
    const mem = memoria[key];
    const cd = porCooldown.get(key);

    // Saúde: prova > memória > n/d. Nunca «ok» sem prova.
    let saude, saude_porque;
    if (h && typeof h.pong === 'boolean') {
      saude = h.pong ? 'vivo' : 'sem-resposta';
      saude_porque = h.porque;
    } else if (SEM_SONDA[key]) {
      saude = key === 'claude' ? 'vivo' : null;
      saude_porque = SEM_SONDA[key];
    } else {
      saude = null;
      saude_porque = 'sem prova de saúde nesta janela — n/d';
    }

    // Memória (provider-health) só DEGRADA; nunca promove a vivo. Um registo
    // «ok» de ontem não prova nada sobre agora — a prova é o pong desta janela.
    const degradado = !!(mem && mem !== 'ok');

    motores[key] = {
      motor: key,
      saude,
      saude_porque,
      degradado,
      degradado_porque: degradado
        ? `provider-health diz '${mem}'${cd ? ` — ${cd.porque}, repõe em ~${cd.restaMin}min` : ''}`
        : null,
      quota_pct: typeof q.quota_remaining_pct === 'number' ? q.quota_remaining_pct : null,
      quota_fonte: q.quota_fonte || null,
      quota_porque: q.quota_porque || 'motor fora do roster de quota — n/d',
    };
  }
  return motores;
}

/** Um motor é despachável se não está provadamente sem resposta nem em cooldown. */
export function despachavel(m) {
  if (!m) return { pode: false, porque: 'motor desconhecido' };
  if (m.degradado) return { pode: false, porque: m.degradado_porque };
  if (m.saude === 'sem-resposta') return { pode: false, porque: `sem resposta na sonda: ${m.saude_porque}` };
  // n/d NÃO bloqueia — «não medir não é o mesmo que estar avariado»
  // (quota-honesta.podeDespachar). Bloquear aqui mataria gemini e kimi sem
  // prova nenhuma, que é exactamente o erro que o provider-health documenta.
  return { pode: true, porque: m.saude === 'vivo' ? 'respondeu ao pong' : 'saúde n/d — sem prova de avaria, segue' };
}

/**
 * A tabela da §2, resolvida contra o retrato real da frota.
 * Devolve, por etapa: { motor, porque, fallback_de, bloqueada }.
 *
 * @param {object} motores — de `retrato()`
 * @param {object} [opts]
 * @param {string} [opts.autor] — quem produziu a conclusão a refutar
 */
export function rotas(motores, opts = {}) {
  return {
    leitura:      rotaLeitura(motores),
    codigo_git:   rotaCodigoGit(),
    refutacao:    rotaRefutacao(motores, opts.autor),
    pesquisa_web: rotaPesquisaWeb(motores),
  };
}

function rotaLeitura(motores) {
  const preferido = ORDEM_LEITURA[0];
  for (const key of ORDEM_LEITURA) {
    const d = despachavel(motores[key]);
    if (!d.pode) continue;
    return {
      etapa: 'leitura', motor: key, bloqueada: false,
      fallback_de: key === preferido ? null : preferido,
      porque: key === preferido
        ? `$0 primeiro: ${key} despachável (${d.porque})`
        : `${preferido} indisponível — ${naoPode(motores, preferido)}; caiu para ${key} (${d.porque})`,
    };
  }
  return {
    etapa: 'leitura', motor: null, bloqueada: true, fallback_de: preferido,
    porque: 'nenhum motor da escada de leitura está despachável — declara bloqueio, não improvises',
  };
}

function rotaCodigoGit() {
  // Não é uma escolha: a §1 dá a custódia do git ao Claude Code e mais ninguém
  // commita. O probe reporta-o para o recibo, não para decidir.
  return {
    etapa: 'codigo_git', motor: 'claude-code', bloqueada: false, fallback_de: null,
    porque: 'insubstituível por desenho — §1: custódia do git do repo e do vault',
  };
}

function rotaRefutacao(motores, autor) {
  const a = String(autor || '').toLowerCase();
  const recusados = [];

  for (const key of ORDEM_REFUTADOR) {
    if (NAO_REFUTAM[key]) { recusados.push(`${key}: ${NAO_REFUTAM[key]}`); continue; }
    // A regra que dá sentido à etapa: crítico ≠ autor. Um motor a refutar-se a
    // si próprio produz concordância, não refutação.
    if (a && key === a) { recusados.push(`${key}: é o autor da conclusão — auto-refutação não conta`); continue; }
    const d = despachavel(motores[key]);
    if (!d.pode) { recusados.push(`${key}: ${d.porque}`); continue; }
    return {
      etapa: 'refutacao', motor: key, bloqueada: false,
      fallback_de: key === ORDEM_REFUTADOR[0] ? null : ORDEM_REFUTADOR[0],
      porque: `adversário ≠ autor(${a || 'n/d'}): ${key} despachável (${d.porque})`,
    };
  }

  return {
    etapa: 'refutacao', motor: null, bloqueada: true, fallback_de: ORDEM_REFUTADOR[0],
    // O masterprompt é explícito: sem adversário vivo escreve-se «refutação
    // pendente» no recibo e o merge espera. Nunca auto-refutar.
    porque: `refutação pendente — nenhum adversário elegível. Recusados: ${recusados.join(' · ') || 'nenhum candidato'}`,
  };
}

function rotaPesquisaWeb(motores) {
  // Regra do masterprompt, à letra: quota mais folgada; n/d = esgotada.
  const comNumero = [];
  const excluidoPorNd = [];

  for (const m of Object.values(motores)) {
    if (!despachavel(m).pode) continue;
    if (typeof m.quota_pct === 'number') comNumero.push(m);
    else excluidoPorNd.push(`${m.motor}: ${m.quota_porque}`);
  }

  if (!comNumero.length) {
    return {
      etapa: 'pesquisa_web', motor: null, bloqueada: true, fallback_de: null,
      excluido_por_nd: excluidoPorNd,
      esgotado_medido: [],
      porque: 'BLOQUEADA — nenhum motor com quota medida. §2 manda tratar n/d como esgotada, '
            + 'e nesta janela TODOS são n/d. Não há vencedor a inventar: escolher o mais barato '
            + 'aqui seria o «viés do default barato». Repor com uma fonte oficial de quota '
            + '(a statusline do Claude Code alimenta quota-live) e voltar a correr o probe.',
    };
  }

  comNumero.sort((x, y) => y.quota_pct - x.quota_pct);
  const vencedor = comNumero[0];
  const esgotados = comNumero.filter((m) => m.quota_pct <= 0).map((m) => `${m.motor}: 0% (fonte ${m.quota_fonte})`);

  if (vencedor.quota_pct <= 0) {
    return {
      etapa: 'pesquisa_web', motor: null, bloqueada: true, fallback_de: null,
      excluido_por_nd: excluidoPorNd, esgotado_medido: esgotados,
      porque: 'BLOQUEADA — todos os motores com quota medida estão a 0%. Isto é esgotamento MEDIDO, não n/d.',
    };
  }

  return {
    etapa: 'pesquisa_web', motor: vencedor.motor, bloqueada: false, fallback_de: null,
    excluido_por_nd: excluidoPorNd, esgotado_medido: esgotados,
    porque: `quota mais folgada: ${vencedor.quota_pct}% (fonte ${vencedor.quota_fonte})`
          + (excluidoPorNd.length ? ` · ${excluidoPorNd.length} motor(es) excluído(s) só por n/d, não por esgotamento` : ''),
  };
}

function naoPode(motores, key) {
  const d = despachavel(motores[key]);
  return d.porque;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

/** Recolhe tudo e devolve o objecto que o recibo/ledger consome. */
export async function correr(deps = {}) {
  const probe_ts = deps.agoraIso || new Date().toISOString();
  const health = await sondar({ ...deps, agoraIso: probe_ts });

  let quota = {};
  try {
    const qh = deps.quotaHonesta || require(path.join(ROUTER, 'quota-honesta.js'));
    quota = qh.estado({ health });
  } catch (err) {
    quota = {};
  }

  let memoria = {}, cooldown = [];
  try {
    const ph = deps.providerHealth || require(path.join(ROUTER, 'provider-health.js'));
    memoria = ph.estadoActual();
    cooldown = ph.relatorio();
  } catch { /* sem memória → o retrato usa só a prova desta janela */ }

  const motores = retrato({ health, quota, memoria, cooldown });
  return { probe_ts, motores, rotas: rotas(motores, { autor: deps.autor }) };
}

function formatar(r) {
  const L = [];
  L.push(`probe-frota · ${r.probe_ts}`);
  L.push('');
  L.push('MOTOR       SAUDE         QUOTA        PORQUE');
  for (const m of Object.values(r.motores)) {
    const saude = m.degradado ? 'cooldown' : (m.saude || 'n/d');
    const quota = m.quota_pct == null ? 'n/d' : `${m.quota_pct}%`;
    L.push(`${m.motor.padEnd(11)} ${String(saude).padEnd(13)} ${quota.padEnd(12)} ${m.degradado ? m.degradado_porque : m.saude_porque}`);
  }
  L.push('');
  L.push('ROTA POR ETAPA');
  for (const rota of Object.values(r.rotas)) {
    const alvo = rota.bloqueada ? 'BLOQUEADA' : rota.motor;
    L.push(`  ${rota.etapa.padEnd(13)} → ${alvo}`);
    L.push(`  ${''.padEnd(13)}   ${rota.porque}`);
    if (rota.fallback_de && rota.motor) L.push(`  ${''.padEnd(13)}   fallback_de: ${rota.fallback_de}`);
  }
  return L.join('\n');
}

const ESTE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ESTE)) {
  const args = process.argv.slice(2);
  const autor = (args.find((a) => a.startsWith('--autor=')) || '').split('=')[1] || null;
  correr({ autor })
    .then((r) => {
      console.log(args.includes('--json') ? JSON.stringify(r, null, 2) : formatar(r));
      // Sair 0 sempre: um probe é um instrumento, não um portão. Quem decide
      // parar é quem lê `bloqueada`, não o código de saída.
      process.exit(0);
    })
    .catch((err) => {
      console.error(`probe-frota falhou: ${(err && err.message) || err}`);
      process.exit(0);
    });
}
