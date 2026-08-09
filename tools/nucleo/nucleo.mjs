/**
 * nucleo.mjs — a engrenagem de medicao, sem rede e sem juizo de LLM.
 *
 * O que este modulo e: carregador de corpus + graders mecanicos + construtor da
 * cadeia measurement_v1. O que NAO e: um nucleo unificado que substitui a
 * afericao e a cascata. O G4 desta sessao refutou essa tese em 3/3 lentes; o que
 * sobrevive e mais modesto e verdadeiro — *uma funcao partilhada, duas peles*.
 * Por isso o grader ternario nao e reescrito aqui: e importado de
 * packages/mooter-bridge/afericao.js, que ja o exporta.
 *
 * Nada em packages/ e modificado. Este modulo so importa.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');
const require_ = createRequire(import.meta.url);

// Reuso real, por chamada de funcao — nao por nucleo partilhado.
const { provHash } = require_(path.join(RAIZ, 'tools', 'router', 'ledger-prov.js'));
const { avaliarResposta } = require_(path.join(RAIZ, 'packages', 'mooter-bridge', 'afericao.js'));

export const NUCLEO_VERSAO = '0.1.0';
export const SCHEMA = 'measurement_v1';
export { provHash };

/** Campos obrigatorios de todo registo. `taskId` esta aqui de proposito: o
 *  measurement_v1 do SUPERMASTER esquecia-o, e sem ele duas skills que passem
 *  tarefas disjuntas da mesma categoria ficam indistinguiveis. */
export const CAMPOS_OBRIGATORIOS = [
  'seq', 'schema', 'candidato_id', 'tipo', 'host_model', 'skill_sha',
  'tarefa_id', 'categoria', 'tier', 'sucesso', 'motivo',
  'tokens_in', 'tokens_out', 'latencia_ms', 'custo_usd',
  'seed', 'determinismo', 'ambiente', 'timestamp', 'prev_hash', 'record_hash',
];

const TIPOS_CANDIDATO = new Set(['modelo', 'skill']);
const TIPOS_CHECK = new Set(['resposta-exata', 'constante', 'regex-presente', 'regex-ausente', 'todos']);

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

export function carregarCorpus(caminho = path.join(AQUI, 'corpus.json')) {
  const bruto = fs.readFileSync(caminho, 'utf8');
  const corpus = JSON.parse(bruto);
  const erros = [];
  if (corpus.schema !== 'corpus_v1') erros.push(`schema inesperado: ${corpus.schema}`);
  const ids = new Set();
  for (const t of corpus.tarefas || []) {
    if (!t.id) erros.push('tarefa sem id');
    if (ids.has(t.id)) erros.push(`id duplicado: ${t.id}`);
    ids.add(t.id);
    if (!t.prompt) erros.push(`${t.id}: sem prompt`);
    if (!t.categoria) erros.push(`${t.id}: sem categoria`);
    if (!t.tier) erros.push(`${t.id}: sem tier`);
    // A regra que fecha o buraco: sem verificador, a tarefa nao corre.
    if (!t.verificacao) erros.push(`${t.id}: SEM verificacao — tarefa sem verificador nao corre`);
    else erros.push(...errosDeCheck(t.id, t.verificacao));
  }
  if (erros.length) throw new Error(`corpus invalido:\n  - ${erros.join('\n  - ')}`);
  // sha do corpus: conteudo canonico, nao bytes do ficheiro (indentacao nao conta).
  return { ...corpus, corpus_sha: provHash(corpus), caminho };
}

function errosDeCheck(id, check, profundidade = 0) {
  const erros = [];
  if (!check || typeof check !== 'object') return [`${id}: verificacao nao e objecto`];
  if (!TIPOS_CHECK.has(check.tipo)) return [`${id}: tipo de verificacao desconhecido: ${check.tipo}`];
  if (check.tipo === 'todos') {
    if (profundidade > 0) erros.push(`${id}: 'todos' nao pode ser aninhado`);
    if (!Array.isArray(check.checks) || check.checks.length === 0) erros.push(`${id}: 'todos' sem checks`);
    else for (const c of check.checks) erros.push(...errosDeCheck(id, c, profundidade + 1));
  }
  if ((check.tipo === 'regex-presente' || check.tipo === 'regex-ausente') && !check.padrao) {
    erros.push(`${id}: ${check.tipo} sem padrao`);
  }
  if (check.tipo === 'resposta-exata' && check.esperado === undefined) erros.push(`${id}: resposta-exata sem esperado`);
  if (check.tipo === 'constante' && check.esperado === undefined) erros.push(`${id}: constante sem esperado`);
  return erros;
}

// ---------------------------------------------------------------------------
// Graders — todos mecanicos. Nenhum LLM julga.
// ---------------------------------------------------------------------------

/** Tira cercas de codigo, aspas e pontuacao final. Nao "interpreta" nada. */
function despir(texto) {
  let s = String(texto == null ? '' : texto).trim();
  s = s.replace(/^```[a-zA-Z0-9_-]*\s*/m, '').replace(/```\s*$/m, '').trim();
  s = s.replace(/^[`'"]+|[`'".,;:]+$/g, '').trim();
  return s;
}

/** @returns {{sucesso: true|false|null, motivo: string}} — ternario, como o afericao. */
export function avaliar(check, saida) {
  switch (check.tipo) {
    case 'constante': {
      // Reuso verbatim do grader do Mooter (packages/mooter-bridge/afericao.js:60).
      const r = avaliarResposta({ expected: check.esperado, kind: check.kind }, saida);
      return { sucesso: r.acertou, motivo: r.porque };
    }
    case 'resposta-exata': {
      const obtido = despir(saida);
      const esperado = String(check.esperado);
      if (obtido === '') return { sucesso: null, motivo: 'resposta vazia — sem prova para decidir' };
      if (obtido === esperado) return { sucesso: true, motivo: `resposta exacta "${esperado}"` };
      return { sucesso: false, motivo: `respondeu "${obtido.slice(0, 60)}", esperado exactamente "${esperado}"` };
    }
    case 'regex-presente': {
      const re = new RegExp(check.padrao, 'im');
      const ok = re.test(String(saida ?? ''));
      return { sucesso: ok, motivo: ok ? `casou /${check.padrao}/` : `nao casou /${check.padrao}/` };
    }
    case 'regex-ausente': {
      const re = new RegExp(check.padrao, 'im');
      const presente = re.test(String(saida ?? ''));
      return { sucesso: !presente, motivo: presente ? `casou /${check.padrao}/ e nao devia` : `ausente como exigido` };
    }
    case 'todos': {
      const motivos = [];
      let algumNulo = false;
      for (const c of check.checks) {
        const r = avaliar(c, saida);
        motivos.push(r.motivo);
        if (r.sucesso === false) return { sucesso: false, motivo: motivos.join(' · ') };
        if (r.sucesso === null) algumNulo = true;
      }
      return { sucesso: algumNulo ? null : true, motivo: motivos.join(' · ') };
    }
    default:
      // Inalcancavel: carregarCorpus rejeita tipos desconhecidos antes de correr.
      throw new Error(`tipo de verificacao desconhecido: ${check.tipo}`);
  }
}

// ---------------------------------------------------------------------------
// Cadeia measurement_v1
// ---------------------------------------------------------------------------

export function shaDaSkill(prefixo) {
  return crypto.createHash('sha256').update(String(prefixo), 'utf8').digest('hex');
}

/** Constroi o registo e sela-o. `record_hash` cobre tudo excepto ele proprio. */
export function selar(registoSemHash) {
  const { record_hash: _ignorado, ...corpo } = registoSemHash;
  return { ...corpo, record_hash: provHash(corpo) };
}

export function hashEsperado(registo) {
  const { record_hash: _ignorado, ...corpo } = registo;
  return provHash(corpo);
}

export function lerLedger(caminho) {
  return fs.readFileSync(caminho, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l, i) => {
      try { return JSON.parse(l); } catch (e) { throw new Error(`linha ${i + 1} nao e JSON: ${e.message}`); }
    });
}

export function escreverLedger(caminho, registos) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, registos.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
}
