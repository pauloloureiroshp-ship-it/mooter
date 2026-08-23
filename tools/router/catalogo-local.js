/**
 * catalogo-local.js — que modelos Ollama existem MESMO nesta maquina.
 *
 * O `latencia-local.js` precisa de candidatos para poder escolher. Sem catalogo,
 * o unico candidato e o que o router recomenda, e um modelo reprovado por
 * medicao nao teria substituto — o sistema ficava preso a saber que a escolha
 * esta errada e sem nada para pôr no lugar.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORQUE E EM CACHE, e porque a cache so se refresca a FALHAR
 *
 * Isto corre dentro do `UserPromptSubmit`, a cada prompt. Um `ollama list` e um
 * subprocesso: pagar isso sempre para ler uma lista que muda uma vez por mes
 * seria trocar latencia do dono por informacao que ja tinhamos.
 *
 * A cache refresca-se quando a escolha do modelo FALHA — que e exactamente o
 * momento em que precisamos de alternativas, e um momento em que ja gastamos o
 * orcamento todo, portanto 200 ms a mais nao se notam. Enquanto tudo corre bem,
 * ninguem pergunta nada ao Ollama.
 *
 * Nunca bloqueia e nunca rebenta: sem catalogo legivel devolve-se lista vazia, e
 * o `escolher` cai no recomendado de sempre.
 */

'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

/** Quanto tempo um catalogo serve antes de valer a pena voltar a perguntar. */
const VALIDADE_MS = 24 * 60 * 60 * 1000;
/** Tecto do subprocesso. Se o Ollama nao responde nisto, nao ha catalogo — e tudo bem. */
const TIMEOUT_MS = 4000;

/** A lista em cache. Sem ficheiro, sem lista — nunca uma excepcao. */
function lerCatalogo(caminho) {
  try {
    const d = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    return Array.isArray(d.modelos) ? d.modelos.filter((m) => typeof m === 'string' && m) : [];
  } catch { return []; }
}

/** O catalogo esta velho de mais para servir? Sem ficheiro conta como velho. */
function caducou(caminho, { agora = Date.now(), validadeMs = VALIDADE_MS } = {}) {
  try {
    const d = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    const t = Date.parse(d.ts || '');
    return !Number.isFinite(t) || (agora - t) > validadeMs;
  } catch { return true; }
}

/** Extrai os nomes de modelo da saida do `ollama list`. Salta o cabecalho. */
function analisar(saida) {
  return String(saida || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split(/\s+/)[0])
    .filter((n) => n && n !== 'NAME' && n.includes(':'));
}

/**
 * Pergunta ao Ollama e escreve a cache. Devolve a lista, ou a antiga se falhar.
 *
 * Filtra os modelos de embedding: `nomic-embed-text` esta instalado e nunca
 * respondera a um prompt. Sem isto, ele entrava como "por medir", era tentado
 * uma vez, falhava, e gastava um orcamento inteiro do dono para descobrir uma
 * coisa que se sabe pelo nome.
 */
function refrescar(caminho, { execImpl = spawnSync, agora = () => new Date().toISOString() } = {}) {
  try {
    const r = execImpl('ollama', ['list'], { encoding: 'utf8', timeout: TIMEOUT_MS });
    if (!r || r.status !== 0 || !r.stdout) return lerCatalogo(caminho);
    const modelos = analisar(r.stdout).filter((m) => !/embed/i.test(m));
    if (!modelos.length) return lerCatalogo(caminho);
    try { fs.writeFileSync(caminho, JSON.stringify({ ts: agora(), modelos }, null, 2), 'utf8'); } catch { /* cache e opcional */ }
    return modelos;
  } catch { return lerCatalogo(caminho); }
}

module.exports = { lerCatalogo, caducou, refrescar, analisar, VALIDADE_MS, TIMEOUT_MS };
