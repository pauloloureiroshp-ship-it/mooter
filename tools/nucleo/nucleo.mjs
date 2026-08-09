/**
 * nucleo.mjs — a engrenagem de medicao, sem rede e sem juizo de LLM.
 *
 * O que este modulo e: carregador de corpus + graders mecanicos + construtor da
 * cadeia measurement_v2. O que NAO e: um nucleo unificado que substitui a
 * afericao e a cascata. O G4 de 2026-08-09 refutou essa tese em 3/3 lentes; o que
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
export const RAIZ = path.resolve(AQUI, '..', '..');
const require_ = createRequire(import.meta.url);

// Reuso real, por chamada de funcao — nao por nucleo partilhado.
const { provHash } = require_(path.join(RAIZ, 'tools', 'router', 'ledger-prov.js'));
const { avaliarResposta } = require_(path.join(RAIZ, 'packages', 'mooter-bridge', 'afericao.js'));

export const NUCLEO_VERSAO = '0.2.0';
export const SCHEMA = 'measurement_v2';
export { provHash };

/**
 * Classes de candidato. `skill_ferramentas` esta NOMEADA e explicitamente FORA DE
 * ESCOPO: uma skill com scripts e ferramentas exige um runtime de agente com
 * sandbox, que e outro projecto. Esta nomeada aqui para que o portao a RECUSE em
 * vez de a aceitar em silencio no dia em que alguem a escrever.
 */
export const CLASSES_CANDIDATO = {
  modelo: { suportada: true, o_que_e: 'um modelo, chamado directamente' },
  skill_prefixo: { suportada: true, o_que_e: 'conteudo importado, concatenado no prompt do modelo host; mede-se em DELTA PAREADO sobre o mesmo host' },
  skill_ferramentas: { suportada: false, o_que_e: 'skill com scripts/ferramentas e runtime proprio — classe futura, fora de escopo da Forja v1' },
};

/**
 * Doutrina de conteudo importado (reescrita pelo dono em 2026-08-09, porque a
 * regra anterior contradizia-se: proibia conteudo importado no prompt e ao mesmo
 * tempo mandava medir skills importadas).
 *
 * Aqui isto nao e prosa: `TETO_TOKENS_PREFIXO` e `carregarPrefixo()` fazem-na
 * cumprir. A segunda classe de risco nao tem executor neste modulo — o MOOGEN
 * ainda nao existe em codigo — e por isso diz `executor: 'n/d'` em vez de fingir.
 */
export const DOUTRINA_CONTEUDO_IMPORTADO = {
  regra: 'Conteudo importado NUNCA e executado como codigo no nosso processo e NUNCA entra no system prompt do host. Entra no prompt DO CANDIDATO medido, em sandbox, com teto de tokens — porque e exactamente isso que esta a ser medido. Conteudo de terceiros que compila para DENTRO do motor (ex.: .cns de chars da comunidade) e OUTRA classe de risco: teste privado apenas, proibido em ranked e em publicacao.',
  classe_1_prompt_do_candidato: { executor: 'nucleo.mjs carregarPrefixo() + medir.mjs', teto_tokens: 512, sandbox: 'n/d (spawn-orchestrator devolve available:false em Windows)' },
  classe_2_compila_para_dentro_do_motor: { executor: 'n/d', permitido: 'teste privado', proibido: ['ranked', 'publicacao'] },
};

/** Teto do prefixo importado. Grosseiro de proposito: 1 token ~ 4 chars. */
export const TETO_TOKENS_PREFIXO = 512;

export const CAMPOS_OBRIGATORIOS = [
  'seq', 'schema', 'candidato_id', 'classe_candidato', 'host_model', 'skill_sha',
  'tarefa_id', 'categoria', 'dificuldade', 'tier', 'sucesso', 'motivo',
  'saida', 'saida_sha', 'truncado',
  'tokens_in', 'tokens_out', 'latencia_ms', 'custo_usd',
  'seed', 'determinismo', 'ambiente', 'timestamp', 'prev_hash', 'record_hash',
];

/** Campos numericos que as projeccoes somam. `null` e legitimo; texto nao e. */
export const CAMPOS_NUMERICOS = ['tokens_in', 'tokens_out', 'latencia_ms', 'custo_usd'];

/**
 * A saida guarda-se INTEIRA. Uma versao anterior cortava-a a 4000 chars e isso
 * partia a C8 num ledger honesto: o grader via o texto todo, a C8 re-derivava do
 * texto cortado, e um `regex-presente` cujo padrao caisse depois do corte dava
 * portao vermelho num registo correcto. Um tecto que faz o verificador mentir e
 * pior do que um ficheiro grande — e `num_predict` ja limita o tamanho na origem.
 */
export function guardarSaida(texto) {
  const s = String(texto ?? '');
  return { saida: s, saida_sha: provHash(s) };
}

const TIPOS_CHECK = new Set([
  'resposta-exata', 'constante', 'regex-presente', 'regex-ausente', 'todos',
  'json-igual', 'tabela-markdown',
]);

// ---------------------------------------------------------------------------
// Conteudo importado
// ---------------------------------------------------------------------------

/** Faz cumprir o teto. Prefixo acima do teto nao corre — recusa, nao trunca. */
export function carregarPrefixo(texto) {
  const s = String(texto ?? '');
  const tokens_aprox = Math.ceil(s.length / 4);
  if (tokens_aprox > TETO_TOKENS_PREFIXO) {
    throw new Error(`prefixo importado com ~${tokens_aprox} tokens excede o teto de ${TETO_TOKENS_PREFIXO}`);
  }
  return { texto: s, tokens_aprox, sha: crypto.createHash('sha256').update(s, 'utf8').digest('hex') };
}

// ---------------------------------------------------------------------------
// Corpus
// ---------------------------------------------------------------------------

export function carregarCorpus(caminho = path.join(AQUI, 'corpus.json')) {
  const corpus = JSON.parse(fs.readFileSync(caminho, 'utf8'));
  const erros = [];
  if (corpus.schema !== 'corpus_v2') erros.push(`schema inesperado: ${corpus.schema}`);
  if (!corpus.rubrica || !corpus.rubrica.niveis) erros.push('corpus sem rubrica de dificuldade declarada');
  const niveis = new Set(Object.keys(corpus.rubrica?.niveis || {}));
  const ids = new Set();
  for (const t of corpus.tarefas || []) {
    if (!t.id) erros.push('tarefa sem id');
    if (ids.has(t.id)) erros.push(`id duplicado: ${t.id}`);
    ids.add(t.id);
    if (!t.prompt) erros.push(`${t.id}: sem prompt`);
    if (!t.categoria) erros.push(`${t.id}: sem categoria`);
    if (!t.tier) erros.push(`${t.id}: sem tier`);
    if (!niveis.has(t.dificuldade)) erros.push(`${t.id}: dificuldade "${t.dificuldade}" fora da rubrica`);
    // As duas regras que fecham buracos conhecidos:
    if (!t.verificacao) erros.push(`${t.id}: SEM verificacao — tarefa sem verificador nao corre`);
    else erros.push(...errosDeCheck(t.id, t.verificacao));
    if (!t.gabarito_fonte) erros.push(`${t.id}: SEM gabarito_fonte — gabarito que nao se re-deriva apodrece em silencio`);
    // Verificacao so-regex aceita demasiado (`new Set(b).size` passa um /new\s+Set/).
    // Provar que a resposta certa passa e METADE do trabalho; a outra metade e
    // provar que a errada NAO passa. Por isso estas exigem contra-exemplos.
    if (t.verificacao && soRegex(t.verificacao) && !(t.contra_exemplos?.length > 0)) {
      erros.push(`${t.id}: verificacao so-regex SEM contra_exemplos — provar que a resposta certa passa nao prova que a errada falha`);
    }
  }
  if (erros.length) throw new Error(`corpus invalido:\n  - ${erros.join('\n  - ')}`);
  return { ...corpus, corpus_sha: provHash(corpus), caminho };
}

/**
 * true se ALGUMA perna da verificacao decide por regex. Deliberadamente `some` e
 * nao `every`: um `todos` que misture uma regex com um parser continua a ter a
 * fraqueza da regex, e com `every` escapava a exigencia de contra-exemplos.
 */
export function soRegex(check) {
  if (check.tipo === 'regex-presente' || check.tipo === 'regex-ausente') return true;
  if (check.tipo === 'todos') return check.checks.some(soRegex);
  return false;
}

function errosDeCheck(id, check, profundidade = 0) {
  if (!check || typeof check !== 'object') return [`${id}: verificacao nao e objecto`];
  if (!TIPOS_CHECK.has(check.tipo)) return [`${id}: tipo de verificacao desconhecido: ${check.tipo}`];
  const erros = [];
  if (check.tipo === 'todos') {
    if (profundidade > 0) erros.push(`${id}: 'todos' nao pode ser aninhado`);
    if (!Array.isArray(check.checks) || check.checks.length === 0) erros.push(`${id}: 'todos' sem checks`);
    else for (const c of check.checks) erros.push(...errosDeCheck(id, c, profundidade + 1));
  }
  if ((check.tipo === 'regex-presente' || check.tipo === 'regex-ausente') && !check.padrao) {
    erros.push(`${id}: ${check.tipo} sem padrao`);
  }
  if ((check.tipo === 'resposta-exata' || check.tipo === 'constante' || check.tipo === 'json-igual') && check.esperado === undefined) {
    erros.push(`${id}: ${check.tipo} sem esperado`);
  }
  if (check.tipo === 'tabela-markdown' && (!check.colunas || !check.linhas)) {
    erros.push(`${id}: tabela-markdown sem colunas/linhas`);
  }
  return erros;
}

// ---------------------------------------------------------------------------
// Graders — todos mecanicos. Nenhum LLM julga.
// ---------------------------------------------------------------------------

function despir(texto) {
  let s = String(texto == null ? '' : texto).trim();
  s = s.replace(/^```[a-zA-Z0-9_-]*\s*/m, '').replace(/```\s*$/m, '').trim();
  s = s.replace(/^[`'"]+|[`'".,;:]+$/g, '').trim();
  return s;
}

function primeiroJson(texto) {
  const s = String(texto ?? '');
  const i = s.search(/[[{]/);
  if (i < 0) return undefined;
  for (let fim = s.length; fim > i; fim--) {
    try { return JSON.parse(s.slice(i, fim)); } catch { /* encolhe e tenta de novo */ }
  }
  return undefined;
}

function linhasDeTabela(texto) {
  return String(texto ?? '')
    .split(/\r?\n/)
    .filter((l) => l.includes('|'))
    .map((l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()))
    .filter((cs) => !cs.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
}

/** @returns {{sucesso: true|false|null, motivo: string}} — ternario, como o afericao. */
export function avaliar(check, saida) {
  const vazio = String(saida ?? '').trim() === '';
  switch (check.tipo) {
    case 'constante': {
      // Reuso verbatim do grader do Mooter (packages/mooter-bridge/afericao.js:60).
      //
      // ASSIMETRIA DECLARADA: este grader e mais generoso que `resposta-exata`.
      // Uma resposta sem numero concreto devolve `null` ("nao encontrei um numero
      // na resposta", afericao.js:74) onde `resposta-exata` devolveria `false`.
      // Consequencia: um candidato que nunca emite um numero sai do denominador
      // em vez de ser penalizado. E a semantica do afericao — "so se marca false
      // quando ha uma resposta concreta e divergente" — e mantem-se de proposito,
      // mas fica dita, porque muda a leitura das celulas que a usam.
      const r = avaliarResposta({ expected: check.esperado, kind: check.kind }, saida);
      return { sucesso: r.acertou, motivo: r.porque };
    }
    case 'resposta-exata': {
      if (vazio) return { sucesso: null, motivo: 'resposta vazia — sem prova para decidir' };
      const obtido = despir(saida);
      const esperado = String(check.esperado);
      if (obtido === esperado) return { sucesso: true, motivo: `resposta exacta "${esperado}"` };
      return { sucesso: false, motivo: `respondeu "${obtido.slice(0, 60)}", esperado exactamente "${esperado}"` };
    }
    case 'regex-presente': {
      const ok = new RegExp(check.padrao, 'im').test(String(saida ?? ''));
      return { sucesso: ok, motivo: ok ? `casou /${check.padrao}/` : `nao casou /${check.padrao}/` };
    }
    case 'regex-ausente': {
      const presente = new RegExp(check.padrao, 'im').test(String(saida ?? ''));
      return { sucesso: !presente, motivo: presente ? `casou /${check.padrao}/ e nao devia` : 'ausente como exigido' };
    }
    case 'json-igual': {
      if (vazio) return { sucesso: null, motivo: 'resposta vazia — sem prova para decidir' };
      const obtido = primeiroJson(saida);
      if (obtido === undefined) return { sucesso: false, motivo: 'nao produziu JSON que faca parse' };
      const ok = JSON.stringify(obtido) === JSON.stringify(check.esperado);
      return { sucesso: ok, motivo: ok ? 'JSON igual ao esperado' : `JSON ${JSON.stringify(obtido).slice(0, 60)} != ${JSON.stringify(check.esperado)}` };
    }
    case 'tabela-markdown': {
      if (vazio) return { sucesso: null, motivo: 'resposta vazia — sem prova para decidir' };
      const linhas = linhasDeTabela(saida);
      if (linhas.length === 0) return { sucesso: false, motivo: 'nao produziu tabela markdown' };
      const cab = linhas[0].map((c) => c.toLowerCase());
      const esperadoCab = check.colunas.map((c) => String(c).toLowerCase());
      if (JSON.stringify(cab) !== JSON.stringify(esperadoCab)) {
        return { sucesso: false, motivo: `cabecalho ${JSON.stringify(cab)} != ${JSON.stringify(esperadoCab)}` };
      }
      const corpo = linhas.slice(1).map((l) => l.map(String));
      const esperadoCorpo = check.linhas.map((l) => l.map(String));
      const ok = JSON.stringify(corpo) === JSON.stringify(esperadoCorpo);
      return { sucesso: ok, motivo: ok ? 'tabela igual a esperada' : `linhas ${JSON.stringify(corpo).slice(0, 60)} != ${JSON.stringify(esperadoCorpo)}` };
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
// Cadeia measurement_v2
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
