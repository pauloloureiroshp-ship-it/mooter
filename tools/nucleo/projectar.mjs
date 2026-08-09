#!/usr/bin/env node
/**
 * projectar.mjs — duas projeccoes puras sobre a MESMA cadeia.
 *
 *   node tools/nucleo/projectar.mjs .mooter/medicoes/ledger.jsonl
 *
 * Isto e o que sobrevive da tese "um nucleo, duas peles" depois do G4: nao que a
 * Forja e a Cascata sejam a mesma engrenagem — 3/3 lentes adversariais refutaram
 * isso — mas que UM registo ao nivel da linha alimenta DUAS leituras diferentes:
 *
 *   cascata : taxa de acerto por (modelo x categoria)     — nivel absoluto entre bracos
 *   forja   : delta pareado por (skill x categoria)       — mesma maquina, mesmo modelo
 *
 * A distincao importa: uma skill nao substitui o modelo, e injectada no prompt
 * dele. Medi-la em nivel absoluto reatribuiria a skill o custo e a latencia do
 * modelo subjacente. Por isso a projeccao da forja e um DELTA, nunca um nivel.
 *
 * Estas projeccoes sao derivadas, nao sao 2a verdade: cada uma carrega o
 * corpus_sha e o record_hash do ultimo registo de que deriva.
 */

import { lerLedger, carregarCorpus } from './nucleo.mjs';
import { verificar } from './verificar.mjs';

function taxa(registos) {
  const acertos = registos.filter((r) => r.sucesso === true).length;
  const falhas = registos.filter((r) => r.sucesso === false).length;
  const nd = registos.filter((r) => r.sucesso === null).length;
  const denom = acertos + falhas;
  return {
    acertos, falhas, n_d: nd,
    // Denominador exclui n/d: "sem prova" nunca vira zero.
    taxa_acerto: denom === 0 ? 'n/d' : Number((acertos / denom).toFixed(4)),
    // Latencia so das chamadas que produziram veredito: um timeout de 120s
    // entrar na mediana faria a projeccao mentir sobre o candidato.
    latencia_mediana_ms: mediana(registos.filter((r) => r.sucesso !== null).map((r) => r.latencia_ms)),
    // `null` NAO vira zero (a regra que a linha do denominador acima ja aplica):
    // soma-se o que foi medido e conta-se o que nao foi.
    tokens_out_total: registos.some((r) => Number.isFinite(r.tokens_out))
      ? registos.reduce((s, r) => s + (Number.isFinite(r.tokens_out) ? r.tokens_out : 0), 0)
      : 'n/d',
    tokens_out_n_d: registos.filter((r) => !Number.isFinite(r.tokens_out)).length,
    truncados: registos.filter((r) => r.truncado).length,
    custo_usd: registos.every((r) => Number.isFinite(r.custo_usd))
      ? Number(registos.reduce((s, r) => s + r.custo_usd, 0).toFixed(6))
      : 'n/d',
  };
}

function mediana(v) {
  const s = v.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!s.length) return 'n/d';
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Chave por par explicito: nomes de modelo contem ':' e ids de tarefa contem '-',
 *  por isso qualquer separador de um caracter seria ambiguo. */
function par(host, tarefa) {
  return JSON.stringify([host, tarefa]);
}

export function projectar(registos, cadeia = 'NAO VERIFICADA') {
  const modelos = registos.filter((r) => r.classe_candidato === 'modelo');
  const skills = registos.filter((r) => r.classe_candidato === 'skill_prefixo');

  // --- Projeccao 1: cascata (nivel absoluto por modelo x categoria) ---
  const cascata = {};
  for (const r of modelos) {
    cascata[r.host_model] ??= {};
    (cascata[r.host_model][r.categoria] ??= []).push(r);
  }
  for (const m of Object.keys(cascata)) {
    for (const c of Object.keys(cascata[m])) cascata[m][c] = taxa(cascata[m][c]);
  }

  // --- Projeccao 2: forja (delta pareado por skill x categoria) ---
  // Pareado = mesma tarefa, mesmo host_model. Sem par, a celula conta em sem_par.
  const baseline = new Map();
  for (const r of modelos) baseline.set(par(r.host_model, r.tarefa_id), r.sucesso);

  const forja = {};
  for (const r of skills) {
    const chave = r.candidato_id;
    forja[chave] ??= { skill_sha: r.skill_sha, host_model: r.host_model, categorias: {} };
    const cel = (forja[chave].categorias[r.categoria] ??= { pares: 0, ganhos: 0, perdas: 0, iguais: 0, sem_par: 0 });
    const base = baseline.get(par(r.host_model, r.tarefa_id));
    // n/d de qualquer lado nao vira zero: fica sem_par, contado e visivel.
    if (base === undefined || base === null || r.sucesso === null) { cel.sem_par++; continue; }
    cel.pares++;
    if (r.sucesso === base) cel.iguais++;
    else if (r.sucesso === true) cel.ganhos++;
    else cel.perdas++;
  }
  for (const s of Object.keys(forja)) {
    for (const c of Object.keys(forja[s].categorias)) {
      const cel = forja[s].categorias[c];
      cel.delta = cel.pares === 0 ? 'n/d' : Number(((cel.ganhos - cel.perdas) / cel.pares).toFixed(4));
    }
  }

  const ultimo = registos[registos.length - 1];
  return {
    schema: 'projeccao_v1',
    aviso: 'derivada do ledger; nao e 2a verdade. A fonte e o measurement_v1.',
    derivada_de: {
      registos: registos.length,
      // Sem isto, uma projeccao de um ledger PARTIDO ficava indistinguivel de uma
      // valida — e os hashes por baixo davam-lhe ar de prova.
      cadeia,
      corpus_sha: ultimo?.ambiente?.corpus_sha ?? 'n/d',
      ultimo_record_hash: ultimo?.record_hash ?? 'n/d',
    },
    cascata,
    forja,
  };
}

if (process.argv[1]?.endsWith('projectar.mjs')) {
  const caminho = process.argv[2];
  if (!caminho) { process.stderr.write('uso: node tools/nucleo/projectar.mjs <ledger.jsonl>\n'); process.exit(1); }
  const registos = lerLedger(caminho);
  // Projectar um ledger que o portao recusaria e produzir prova falsa.
  const v = verificar(registos, carregarCorpus());
  if (!v.ok) {
    process.stderr.write('RECUSADO: nao projecto um ledger que o portao recusa.\n  - ' + v.falhas.join('\n  - ') + '\n');
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(projectar(registos, 'VERIFICADA'), null, 2) + '\n');
}
