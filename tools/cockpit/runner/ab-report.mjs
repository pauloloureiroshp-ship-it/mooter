#!/usr/bin/env node
/**
 * ab-report.mjs — as perguntas novas mudaram alguma coisa? Com numero e com N.
 *
 * O loop acumula recibos desde sempre e nada os sabia ler POR VERSAO DE
 * PERGUNTA. Sem isso, "o P6 v2 reduziu as citacoes inventadas" e uma intencao,
 * nao um resultado — e o masterprompt e explicito: nove rondas nao chegam.
 *
 * ZERO LLM. Le o `runner-ledger.jsonl` e o `triagem.jsonl`, conta, e imprime.
 * Nenhuma chamada de rede, nenhum modelo, nenhuma estimativa.
 *
 * ── A CHAVE E QUE MANDA ──────────────────────────────────────────────────────
 *
 * Desde o #318 a chave de revisao inclui um digest da PERGUNTA:
 *
 *     P6.d29f41|ficheiro:linhas:hash      <- pergunta versionada
 *     P6|ficheiro:linhas:hash             <- LEGADO, anterior ao #318
 *
 * As duas coortes NAO se somam. Uma ronda antiga respondeu a uma pergunta que
 * ja nao existe; junta-las produziria uma media de duas coisas diferentes, que
 * e a forma mais discreta de mentir com aritmetica correcta. Por isso o legado
 * aparece SEMPRE separado e rotulado `legado`, e nunca entra num veredicto de
 * comparacao.
 *
 * ── O QUE CONTA COMO O QUE ───────────────────────────────────────────────────
 *
 *   rondas     linhas de recibo do par (pilar, versao)
 *   citada     `verdict === 'citacao-ok'` — a linha citada existe no disco.
 *              NAO quer dizer que o achado seja verdadeiro, nem sequer que a
 *              linha contenha o que ele afirma (ver #323).
 *   achado     `conclusao === 'achado'` — o modelo declarou um defeito.
 *   refutado   `verdict === 'refutado'` — citou uma linha que nao existe.
 *   aceite     o dono decidiu `aceite` ou `issue` na triagem. Decisoes
 *              assinadas por `agente` NAO contam: o autopilot a validar-se a si
 *              proprio nao e evidencia (mesmo motivo do portao L2, ver #321).
 *
 * Uso:
 *   node tools/cockpit/runner/ab-report.mjs                 # texto
 *   node tools/cockpit/runner/ab-report.mjs --json          # para o painel
 *   node tools/cockpit/runner/ab-report.mjs --min-n 100     # so coortes com N>=100
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** O mesmo contrato de home que o resto do repo honra. */
export function mooterHome(env = process.env) {
  return env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
}

/** `P6.d29f41|...` -> `{pilar:'P6', versao:'d29f41'}` · `P6|...` -> versao null. */
export function partirChave(chave) {
  const m = /^(P\d+)(?:\.([0-9a-f]{6}))?\|/.exec(String(chave || ''));
  if (!m) return null;
  return { pilar: m[1], versao: m[2] || null };
}

/** Uma linha por linha; uma linha partida conta-se e NAO se engole em silencio. */
export function lerJsonl(caminho, readImpl = fs.readFileSync) {
  let bruto;
  try { bruto = String(readImpl(caminho, 'utf8')); }
  catch { return { linhas: [], lidas: 0, partidas: 0, existe: false }; }
  const linhas = [];
  let lidas = 0;
  let partidas = 0;
  for (const l of bruto.split('\n')) {
    if (!l.trim()) continue;
    lidas += 1;
    try { linhas.push(JSON.parse(l)); } catch { partidas += 1; }
  }
  return { linhas, lidas, partidas, existe: true };
}

/**
 * As decisoes DO DONO, por chave. As do `agente` ficam de fora e sao contadas
 * a parte — o autopilot fecha achados `low` sozinho, e conta-los como aceite do
 * dono inflacionaria exactamente o numero que o masterprompt quer mover.
 */
export function decisoesDoDono(linhasTriagem) {
  const porChave = new Map();
  let doAgente = 0;
  for (const d of linhasTriagem) {
    if (!d || !d.chave) continue;
    if (d.por === 'agente') { doAgente += 1; continue; }
    porChave.set(d.chave, d.decisao);
  }
  return { porChave, doAgente };
}

/** Uma linha da tabela, por par (pilar, versao). */
function coorteVazia(pilar, versao) {
  return {
    pilar, versao, legado: versao === null,
    rondas: 0, citadas: 0, achados: 0, refutado: 0,
    aceites: 0, descartados: 0, por_triar: 0,
    primeira: null, ultima: null,
  };
}

export function agregar(recibos, decisoes = new Map()) {
  const coortes = new Map();
  let semChave = 0;
  for (const r of recibos) {
    if (!r || r.evento) continue;
    const p = partirChave(r.chave);
    if (!p) { semChave += 1; continue; }
    const id = `${p.pilar}|${p.versao || ''}`;
    if (!coortes.has(id)) coortes.set(id, coorteVazia(p.pilar, p.versao));
    const c = coortes.get(id);
    c.rondas += 1;
    if (r.verdict === 'citacao-ok') c.citadas += 1;
    if (r.verdict === 'refutado') c.refutado += 1;
    if (r.conclusao === 'achado') {
      c.achados += 1;
      const d = decisoes.get(r.chave);
      if (d === 'aceite' || d === 'issue') c.aceites += 1;
      else if (d === 'descartado') c.descartados += 1;
      else c.por_triar += 1;
    }
    if (r.ts) {
      if (!c.primeira || r.ts < c.primeira) c.primeira = r.ts;
      if (!c.ultima || r.ts > c.ultima) c.ultima = r.ts;
    }
  }
  return { coortes: [...coortes.values()].sort(ordenar), semChave };
}

function ordenar(a, b) {
  const na = Number(a.pilar.slice(1));
  const nb = Number(b.pilar.slice(1));
  return na - nb || (a.legado === b.legado ? 0 : a.legado ? -1 : 1);
}

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : null);
const mostra = (v, suf = '') => (v === null ? 'n/d' : `${v}${suf}`);

/**
 * O veredicto por pilar. So compara coortes VERSIONADAS — e quando so ha uma,
 * DIZ que so ha uma em vez de inventar uma diferenca.
 */
export function veredictos(coortes, minN = 0) {
  const porPilar = new Map();
  for (const c of coortes) {
    if (!porPilar.has(c.pilar)) porPilar.set(c.pilar, []);
    porPilar.get(c.pilar).push(c);
  }
  const out = [];
  for (const [pilar, cs] of porPilar) {
    const versionadas = cs.filter((c) => !c.legado && c.rondas >= minN);
    const legado = cs.find((c) => c.legado) || null;
    if (versionadas.length >= 2) {
      const [a, b] = versionadas.slice(-2);
      out.push({
        pilar, tipo: 'comparavel',
        de: a.versao, para: b.versao,
        delta_refutado_pp: Math.round(((pct(b.refutado, b.rondas) ?? 0) - (pct(a.refutado, a.rondas) ?? 0)) * 10) / 10,
        delta_achados_pp: Math.round(((pct(b.achados, b.rondas) ?? 0) - (pct(a.achados, a.rondas) ?? 0)) * 10) / 10,
        n_de: a.rondas, n_para: b.rondas,
      });
    } else if (versionadas.length === 1) {
      out.push({
        pilar, tipo: 'um-braco-so',
        versao: versionadas[0].versao,
        n: versionadas[0].rondas,
        legado_rondas: legado ? legado.rondas : 0,
        porque: legado
          ? `ha ${legado.rondas} ronda(s) anteriores ao #318, mas sem versao gravada — nao sao comparaveis, so datadas`
          : 'nao ha coorte anterior neste ledger',
      });
    } else {
      out.push({ pilar, tipo: 'sem-dados', porque: `nenhuma coorte versionada com N >= ${minN}` });
    }
  }
  return out;
}

export function render(dados, { minN = 0 } = {}) {
  const L = [];
  L.push('A/B das perguntas — por pilar e por versao de enunciado');
  L.push('');
  L.push('  pilar  versao      rondas  citadas   achados  refutado   aceites  por triar');
  L.push('  ' + '-'.repeat(74));
  for (const c of dados.coortes) {
    const v = c.legado ? 'legado' : c.versao;
    L.push(
      '  ' + c.pilar.padEnd(6)
      + v.padEnd(11)
      + String(c.rondas).padStart(6)
      + mostra(pct(c.citadas, c.rondas), '%').padStart(9)
      + String(c.achados).padStart(10)
      + mostra(pct(c.refutado, c.rondas), '%').padStart(10)
      + String(c.aceites).padStart(10)
      + String(c.por_triar).padStart(11),
    );
  }
  L.push('');
  L.push('  `legado` = rondas anteriores ao #318, quando a chave ainda nao');
  L.push('  guardava a pergunta. NAO se somam as versionadas: responderam a um');
  L.push('  enunciado que ja nao existe.');
  L.push('');
  L.push('Veredicto');
  for (const v of dados.veredictos) {
    if (v.tipo === 'comparavel') {
      L.push(`  ${v.pilar}: ${v.de} -> ${v.para} · refutado ${v.delta_refutado_pp >= 0 ? '+' : ''}${v.delta_refutado_pp} pp `
        + `· achados ${v.delta_achados_pp >= 0 ? '+' : ''}${v.delta_achados_pp} pp (N ${v.n_de} -> ${v.n_para})`);
    } else if (v.tipo === 'um-braco-so') {
      L.push(`  ${v.pilar}: SEM COMPARACAO — uma so versao (${v.versao}, N=${v.n}). ${v.porque}`);
    } else {
      L.push(`  ${v.pilar}: ${v.porque}`);
    }
  }
  if (dados.avisos.length) {
    L.push('');
    L.push('Avisos');
    for (const a of dados.avisos) L.push(`  · ${a}`);
  }
  return L.join('\n');
}

export function construir({ home = mooterHome(), minN = 0, readImpl = fs.readFileSync } = {}) {
  const ledger = lerJsonl(path.join(home, 'runner-ledger.jsonl'), readImpl);
  const triagem = lerJsonl(path.join(home, 'triagem.jsonl'), readImpl);
  const { porChave, doAgente } = decisoesDoDono(triagem.linhas);
  const { coortes, semChave } = agregar(ledger.linhas, porChave);

  const avisos = [];
  if (!ledger.existe) avisos.push('nao ha ledger neste home — zero rondas para medir');
  if (ledger.partidas) avisos.push(`${ledger.partidas} linha(s) do ledger ilegiveis (contadas, nao engolidas)`);
  if (triagem.partidas) avisos.push(`${triagem.partidas} linha(s) da triagem ilegiveis`);
  if (semChave) avisos.push(`${semChave} recibo(s) sem chave reconhecivel — fora de todas as coortes`);
  if (doAgente) avisos.push(`${doAgente} decisao(oes) do autopilot NAO contam como aceite do dono`);
  const legado = coortes.filter((c) => c.legado).reduce((n, c) => n + c.rondas, 0);
  if (legado) avisos.push(`${legado} ronda(s) legado (pre-#318): datadas, nao comparaveis`);

  return {
    gerado_em: null, // quem chama carimba — este modulo nao le o relogio
    home,
    min_n: minN,
    ledger_linhas: ledger.lidas,
    coortes,
    veredictos: veredictos(coortes, minN),
    avisos,
  };
}

function principal(argv) {
  const json = argv.includes('--json');
  const i = argv.indexOf('--min-n');
  const minN = i === -1 ? 0 : Number(argv[i + 1]) || 0;
  const dados = construir({ minN });
  process.stdout.write(json ? `${JSON.stringify(dados, null, 2)}\n` : `${render(dados, { minN })}\n`);
  return 0;
}

const invocadoComoPrograma = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invocadoComoPrograma) process.exit(principal(process.argv.slice(2)));
