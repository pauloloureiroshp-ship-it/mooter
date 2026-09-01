#!/usr/bin/env node
/**
 * build-ledger-snapshot.mjs — enche o Moo Ledger com o que ESTE device mediu.
 *
 * O `moo-ledger-shell.html` e uma casca: nao tem um unico numero dentro. Tudo o
 * que ele mostra entra por tres globais que este ficheiro injecta —
 * `window.__SNAPSHOT__`, `window.__ROADMAP__` e `window.__SHELL__`. A razao de
 * ser assim e a mesma que fez nascer o `build-shell-snapshot.mjs`: uma casca com
 * numeros cravados envelhece em silencio e continua a parecer certa.
 *
 * ⚠️ A REGRA DURA: campo sem medicao = `null`. Nunca um palpite, nunca um zero
 * que finge ser uma medicao. A casca sabe pintar `n/d`; o que ela nao sabe e
 * desmentir um numero que lhe foi dado. `vram_total_gb` e o exemplo vivo: o
 * `ioreg` do macOS nao o reporta e nenhum beacon o publica, por isso vai `null`
 * e o termometro diz `VRAM n/d` — em vez dos 16 GB que era facil escrever de
 * cabeca e impossivel provar.
 *
 * A janela nocturna e 00:00–08:00 na hora do dono (America/Sao_Paulo), como
 * manda o `owner_tz` do CLAUDE.md — nunca UTC cru.
 *
 * Usage:
 *   node tools/cockpit/runner/build-ledger-snapshot.mjs [saida.html]
 *   node tools/cockpit/runner/build-ledger-snapshot.mjs --json     (so o payload)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { readLedger, ownerDay, OWNER_TZ } from './fleet-state.mjs';
import {
  lerTriagem, contarTriagem, chaveDoRecibo, ehAchado,
  idDoAchado, idEstavel, MOTIVOS,
} from './triagem.mjs';
import { exercidas, rotaDoRecibo, rotaDaCorreccao } from './rota.mjs';
import { estadoDaPublicacao } from './publicacao.mjs';
import { portoes } from './autopilot.mjs';
import { sampleGpu } from './gpu-sampler.mjs';
import { beaconDir, readBeacons, deviceName } from './fleet-beacon.mjs';
import { versaoDoConector } from './project.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..');
const SHELL = path.join(REPO, 'tools', 'cockpit', 'moo-ledger-shell.html');
const ROADMAP = path.join(REPO, 'tools', 'cockpit', 'roadmap.json');
const MOO_DIR = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');

/** A versao da casca. Sobe quando o CONTRATO de campos muda, nunca por estetica. */
export const SHELL_VERSION = '4.1.0';

export const BEGIN = '<!-- MOO_LEDGER:BEGIN -->';
export const END = '<!-- MOO_LEDGER:END -->';

/** Toda a janela do ledger, nao os ultimos 5000: as contagens diarias precisam dela. */
const LEDGER_MAX_LINES = 1e9;

/**
 * Os campos que a casca LE. Se um deles desaparecer do payload, a pagina mostra
 * buracos em vez de `n/d` — por isso o teste exige a lista, e a lista vive aqui,
 * ao lado de quem a enche.
 */
export const CAMPOS_OBRIGATORIOS = Object.freeze([
  'generated_at', 'device', 'window', 'counters', 'daily', 'triage', 'yardstick',
  'night', 'needs_you', 'receipts', 'fleet', 'fleet_rejected', 'versions', 'worktrees', 'engine',
  'gates', 'hold', 'eta_keys', 'worktrees_list', 'paths', 'route', 'publish',
]);

/** Quantos recibos viajam. Um ledger de 50 MB nao pode congelar a pagina. */
export const MAX_RECIBOS = 50;

/** Quantas decisoes de triagem viajam. Mesma razao, mesmo tecto de bom senso. */
export const MAX_ITENS_TRIAGEM = 40;

/**
 * As decisoes de triagem, as ULTIMAS primeiro, com o achado a que pertencem.
 *
 * Ate aqui o payload levava so CONTAGENS (`aceite: 3, descartado: 72`), e a
 * pagina que as recebia nao tinha como mostrar uma unica delas: para contar a
 * historia de um achado inventava-a a partir de um recibo qualquer com
 * `citacao-ok`. Ou seja, o capitulo das tarefas nao mostrava tarefas — mostrava
 * um molde preenchido com dados de outra coisa.
 *
 * `recibo: null` e legitimo e frequente: uma decisao pode ser sobre um
 * apontamento do detector deterministico, que nunca passou pelo ledger de
 * rondas. Nesse caso o item leva o que a decisao sabe e mais nada.
 */
export function itensDeTriagem(decisoes, receipts, limite = MAX_ITENS_TRIAGEM) {
  const porChave = new Map();
  for (const r of receipts || []) {
    const k = chaveDoRecibo(r);
    // O ULTIMO recibo de uma chave e o que descreve o estado actual dela.
    if (k) porChave.set(k, r);
  }
  const itens = [...(decisoes ? decisoes.values() : [])]
    .filter((d) => d && d.chave)
    .sort((a, b) => String(b.ts || '').localeCompare(String(a.ts || '')))
    .slice(0, limite);
  return itens.map((d) => {
    const r = porChave.get(String(d.chave)) || null;
    return {
      finding_id: r ? idDoAchado(r) : null,
      chave: String(d.chave),
      decision: d.decisao || null,
      reason: d.motivo || null,
      by: d.por || null,
      via: d.via || null,
      decided_at: d.ts || null,
      note: d.nota || null,
      ficheiro: (r && r.ficheiro) || null,
      pilar: (r && r.pilar) || null,
      // `null` quer dizer que a decisao nao tem recibo no ledger desta janela —
      // nao que o achado nao exista. A pagina tem de saber a diferenca.
      route: r ? (rotaDoRecibo(r) || {}).id || null : null,
    };
  });
}

/** A hora do dono, como numero, a partir de um epoch. `null` se nao for lido. */
export function ownerHour(ms, tz = OWNER_TZ) {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false })
    .format(new Date(ms));
  const n = Number(h);
  return Number.isFinite(n) ? n : null;
}

/** 00:00–08:00 na hora do dono. Fechado a esquerda, aberto a direita. */
export function ehNoite(ms, tz = OWNER_TZ) {
  const h = ownerHour(ms, tz);
  return h != null && h >= 0 && h < 8;
}

const tsDe = (r) => {
  const t = r && r.ts ? Date.parse(r.ts) : NaN;
  return Number.isFinite(t) ? t : null;
};

/**
 * As contagens por veredicto, com os nomes que a casca fala.
 *
 * `inconclusive` sao os recibos anteriores ao verificador: contam como volume e
 * NUNCA como trabalho, e e por isso que tem balde proprio em vez de somarem a
 * `no_finding`.
 */
export function contarVeredictos(receipts) {
  const c = { cited_verified: 0, refuted: 0, uncited: 0, no_finding: 0, queue_empty: 0, inconclusive: 0 };
  const mapa = {
    'citacao-ok': 'cited_verified',
    refutado: 'refuted',
    'sem-citacao': 'uncited',
    'sem-achado': 'no_finding',
    'nada-por-rever': 'queue_empty',
  };
  for (const r of receipts) {
    const k = mapa[r && r.verdict];
    if (k) c[k] += 1;
    else c.inconclusive += 1;
  }
  return c;
}

/** Rondas e citacoes por dia do dono, por ordem cronologica. */
export function porDia(receipts, tz = OWNER_TZ) {
  const dias = new Map();
  for (const r of receipts) {
    const t = tsDe(r);
    if (t == null) continue;
    const d = ownerDay(t, tz);
    if (!dias.has(d)) dias.set(d, { date: d, rounds: 0, cited: 0 });
    const linha = dias.get(d);
    linha.rounds += 1;
    if (r.verdict === 'citacao-ok') linha.cited += 1;
  }
  return [...dias.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/** O bloco "enquanto dormias": so o que caiu dentro de 00:00–08:00 da hora do dono. */
export function agregarNoite(receipts, tz = OWNER_TZ) {
  const noites = new Set();
  const engines = new Set();
  let rounds = 0, cited = 0, refuted = 0, tokens = 0, usd = 0;
  let primeiro = null, ultimo = null;
  for (const r of receipts) {
    const t = tsDe(r);
    if (t == null || !ehNoite(t, tz)) continue;
    rounds += 1;
    noites.add(ownerDay(t, tz));
    if (r.verdict === 'citacao-ok') cited += 1;
    if (r.verdict === 'refutado') refuted += 1;
    if (Number.isFinite(r.tokens_out)) tokens += r.tokens_out;
    if (Number.isFinite(r.usd)) usd += r.usd;
    if (r.modelo) engines.add(r.modelo);
    if (primeiro == null || t < primeiro) primeiro = t;
    if (ultimo == null || t > ultimo) ultimo = t;
  }
  if (!rounds) {
    return { rounds: 0, cited: 0, refuted: 0, tokens_out: 0, nights: 0, usd: 0,
             window_label: null, engines: [] };
  }
  const dia = (ms) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: '2-digit', month: 'short' })
    .format(new Date(ms));
  const n = noites.size;
  return {
    rounds, cited, refuted, tokens_out: tokens, nights: n,
    // `usd` nao e uma estimativa: o `assertLocalEngine` recusa qualquer motor
    // fora do loopback, por isso o zero e estrutural e vem somado do ledger.
    usd: Number(usd.toFixed(4)),
    window_label: `${n} night${n === 1 ? '' : 's'} · ${dia(primeiro)}–${dia(ultimo)} · 00:00–08:00 São Paulo`,
    engines: [...engines].sort(),
  };
}

/** Quantos recibos por modelo. `n/d` e um balde legitimo: um recibo sem modelo existe. */
export function tallyPorModelo(receipts) {
  const t = {};
  for (const r of receipts) {
    const m = (r && r.modelo) || 'n/d';
    t[m] = (t[m] || 0) + 1;
  }
  return t;
}

/**
 * As worktrees deste checkout, do git e so do git.
 *
 * `free` quer dizer ELEGIVEL — com branch, nao bare, nao detached — e nao "sem
 * trabalho a decorrer". O sinal de ocupacao existe em `packages/mooter-bridge/
 * worktrees.js` mas depende de um `busyFn` que nenhum chamador liga, portanto
 * inventa-lo aqui era dar-lhe um significado que ele nao tem. O criterio viaja
 * no payload (`criterion`) para a pagina nao ter de o adivinhar.
 */
export function listarWorktrees(repoRoot, { runImpl = null } = {}) {
  const run = runImpl || ((args) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }));
  let saida;
  try {
    saida = String(run(['worktree', 'list', '--porcelain']));
  } catch {
    return { lista: [], total: null, free: null };
  }
  const lista = [];
  let actual = null;
  for (const linha of saida.split('\n')) {
    if (linha.startsWith('worktree ')) {
      actual = { path: linha.slice(9).trim(), branch: null, bare: false, detached: false };
      lista.push(actual);
    } else if (!actual) continue;
    else if (linha.startsWith('branch ')) actual.branch = linha.slice(7).trim().replace(/^refs\/heads\//, '');
    else if (linha.trim() === 'bare') actual.bare = true;
    else if (linha.trim() === 'detached') actual.detached = true;
  }
  const raiz = path.resolve(repoRoot);
  const nome = (p) => {
    const abs = path.resolve(p);
    // Uma worktree dentro do proprio checkout mostra-se pelo caminho relativo,
    // senao `.claude/worktrees/x` aparecia so como `x` e parecia um repo irmao.
    if (abs !== raiz && abs.startsWith(raiz + path.sep)) return path.relative(raiz, abs);
    return path.basename(abs);
  };
  return {
    lista: lista.map((w) => ({ name: nome(w.path), branch: w.branch })),
    total: lista.length,
    free: lista.filter((w) => !w.bare && !w.detached && w.branch).length,
  };
}

/** As chaves de ETA que ja tem observacoes. `p50: null` = ainda nao ha mediana. */
export function lerEtaIndex(caminho, { readImpl = fs.readFileSync } = {}) {
  try {
    const d = JSON.parse(String(readImpl(caminho, 'utf8')));
    const out = {};
    for (const [k, v] of Object.entries(d.chaves || {})) {
      out[k] = { p50: Number.isFinite(v && v.p50) ? v.p50 : null, n: Number.isFinite(v && v.n) ? v.n : null };
    }
    return out;
  } catch {
    return null;
  }
}

/**
 * A versao do conector que esta REALMENTE instalada no Claude Desktop.
 *
 * `versaoDoConector()` le o manifest do CHECKOUT — o codigo em disco, que pode
 * estar dezasseis versoes a frente do que corre. Esta le a extensao instalada.
 * `null` quando nao ha nenhuma: um cockpit aberto por outra via nao inventa uma.
 */
export function versaoInstalada({ home = os.homedir(), readImpl = fs.readFileSync, existsImpl = fs.existsSync } = {}) {
  const candidatos = [
    path.join(home, 'Library', 'Application Support', 'Claude', 'Claude Extensions',
              'local.mcpb.paulo-loureiro.mooter', 'manifest.json'),
    path.join(home, 'AppData', 'Roaming', 'Claude', 'Claude Extensions',
              'local.mcpb.paulo-loureiro.mooter', 'manifest.json'),
  ];
  for (const c of candidatos) {
    if (!existsImpl(c)) continue;
    try {
      const v = JSON.parse(String(readImpl(c, 'utf8'))).version;
      if (typeof v === 'string' && v.trim()) return v.trim();
    } catch { /* um manifest ilegivel e uma versao desconhecida, nao uma versao */ }
  }
  return null;
}

/**
 * O elenco de motores. A PROSA vive aqui (uma so fonte); os NUMEROS vem do
 * tally medido no ledger. Um motor sem recibos leva `n: null` e diz porque —
 * nunca um zero que se leria como "trabalhou e falhou".
 */
export function elencoDeMotores(tally) {
  const medido = (id) => (Number.isFinite(tally && tally[id]) ? tally[id] : null);
  const lido = [...Object.entries(tally || {})]
    .filter(([m]) => m !== 'n/d')
    .sort((a, b) => b[1] - a[1]);
  const principal = lido.length ? lido[0][0] : null;
  const elenco = [];
  if (principal) {
    elenco.push({
      mark: 'Q', color: '#5B6DC9', name: principal, by: 'runs on Ollama, on this machine',
      role: 'The reader. Every receipt in this window came from a local engine — reading, analysing, citing. Class C2.',
      n: medido(principal), unit: 'receipts in window',
    });
  }
  elenco.push(
    { mark: 'CC', color: '#A8862D', name: 'Claude Code', by: 'Anthropic · subscription',
      role: 'The writer. Only engine allowed to touch git — every write and publish is its custody. Class C4.',
      n: null, unit: 'writes live in git history, not this ledger' },
    { mark: 'CX', color: '#51625A', name: 'codex', by: 'OpenAI · subscription',
      role: 'The adversary. Consequential conclusions must survive refutation on a different engine. Class C5.',
      n: null, unit: 'refutations logged in the vault' },
  );
  const semModelo = medido('n/d');
  if (semModelo) {
    elenco.push({
      mark: '?', color: '#8A968E', name: 'n/d', by: 'receipts written before the engine was recorded',
      role: 'Not an engine — the bucket for receipts whose model field is missing. Counted as volume, never as work.',
      n: semModelo, unit: 'receipts in window',
    });
  }
  return elenco;
}

/** Impede que o payload feche o `<script>` ou abra um comentario HTML. */
export function scriptSafeJson(value) {
  return JSON.stringify(value)
    .replace(/<\/script/gi, '<\\/script')
    .replace(/<!--/g, '<\\u0021--');
}

export function stripPayload(html) {
  let out = String(html);
  for (;;) {
    const start = out.indexOf(BEGIN);
    if (start < 0) return out;
    const end = out.indexOf(END, start);
    if (end < 0) throw new Error('o bloco de payload abre e nao fecha');
    out = out.slice(0, start) + out.slice(end + END.length);
  }
}

/** Idempotente: correr duas vezes substitui o bloco, nunca empilha copias. */
export function injectPayload(html, { snapshot, roadmap, shell }) {
  const limpo = stripPayload(html);
  const bloco = `${BEGIN}\n<script>window.__SNAPSHOT__=${scriptSafeJson(snapshot)};`
    + `window.__ROADMAP__=${scriptSafeJson(roadmap)};`
    + `window.__SHELL__=${scriptSafeJson(shell)};</script>\n${END}`;
  const ancora = '<div id="toast" role="status"></div>';
  const at = limpo.indexOf(ancora);
  if (at < 0) throw new Error('a casca nao tem a ancora do payload (#toast)');
  return limpo.slice(0, at + ancora.length) + '\n' + bloco + limpo.slice(at + ancora.length);
}

/**
 * O payload. Tudo o que aqui entra foi lido de um ficheiro deste device; o que
 * nao foi lido sai `null`.
 */
export async function buildLedgerSnapshot({
  repoRoot = REPO,
  mooDir = MOO_DIR,
  now = Date.now(),
  device = null,
  gpuImpl = sampleGpu,
  readImpl = fs.readFileSync,
  existsImpl = fs.existsSync,
  runGitImpl = null,
  homeImpl = os.homedir(),
  // Explicito de proposito: `beaconDir` cai no `process.env.VAULT_PATH`, e um
  // teste que herda o vault da bancada nao esta a testar nada — esta a ler o
  // disco do dono e a passar ou falhar conforme o dia.
  vaultPath = process.env.VAULT_PATH || null,
} = {}) {
  const dev = device || deviceName();
  const ledgerPath = path.join(mooDir, 'runner-ledger.jsonl');
  const triagemPath = path.join(mooDir, 'triagem.jsonl');
  const statePath = path.join(mooDir, 'runner-state.json');

  const { receipts, ledgerLinhas, existe } = readLedger(ledgerPath, { readImpl, maxLines: LEDGER_MAX_LINES });
  const counters = contarVeredictos(receipts);
  const ultimo = receipts.length ? receipts[receipts.length - 1] : null;

  const { decisoes } = existsImpl(triagemPath)
    ? lerTriagem(triagemPath, { readImpl })
    : { decisoes: new Map() };
  const contas = contarTriagem(receipts, decisoes);

  // Os achados que o dono marcou como `issue`: a unica fila que lhe PEDE algo.
  const needsYou = [];
  const vistos = new Set();
  for (let i = receipts.length - 1; i >= 0; i -= 1) {
    const r = receipts[i];
    if (!ehAchado(r)) continue;
    const chave = chaveDoRecibo(r);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    const d = decisoes.get(chave);
    if (!d || d.decisao !== 'issue') continue;
    needsYou.push({
      id: chave,
      // O id curto e estavel. Viaja ao lado da `chave` e nunca em vez dela: a
      // chave e o que se escreve no `triagem.jsonl`, e escrever com o id seria
      // criar uma segunda identidade para a mesma coisa.
      finding_id: idDoAchado(r),
      finding_id_estavel: idEstavel(r),
      receipt_ref: [r.pilar, r.ficheiro && r.janela ? `${r.ficheiro}:${r.janela}` : r.ficheiro]
        .filter(Boolean).join(' · ') || null,
      ficheiro: r.ficheiro || null,
      pilar: r.pilar || null,
      ts: r.ts || null,
      modelo: r.modelo || null,
      summary: r.resultado_resumo || null,
      decided_at: d.ts || null,
      // Quem FEZ, e quem faria a seguir. Duas classes da tabela, lidas dela —
      // ate 2026-09-01 esta frase era prosa cravada no HTML a citar uma tabela
      // que nao existia em ficheiro nenhum.
      route: (rotaDoRecibo(r) || {}).id || null,
      route_next: rotaDaCorreccao().id,
    });
  }

  let gpu = null;
  try { gpu = await gpuImpl(); } catch { gpu = null; }

  let state = {};
  try { state = JSON.parse(String(readImpl(statePath, 'utf8'))); } catch { state = {}; }

  const pastaBeacons = beaconDir({ home: homeImpl, vaultPath });
  const frota = readBeacons({ ...pastaBeacons, selfDevice: dev });
  /**
   * Os beacons RECUSADOS viajam. O `fleet-beacon.mjs` di-lo com todas as letras:
   * «um beacon descartado em silencio e indistinguivel de um device que nunca
   * existiu». O motor recusa assinaturas com mais de 24h — e nesta bancada isso
   * apaga dois devices reais da pastagem. Mostra-los como membros vivos seria
   * mentir; nao os mostrar de todo seria mentir de outra maneira.
   */
  const fleetRejected = (frota && Array.isArray(frota.rejeitados) ? frota.rejeitados : []).map((r) => ({
    device: r.device || (r.ficheiro || '').replace(/\.json$/, '') || null,
    ts: r.ts || null,
    code: r.codigo || null,
    why: r.motivo || null,
  }));
  const fleet = (frota && Array.isArray(frota.frota) ? frota.frota : []).map((b) => ({
    device: b.device || null,
    self: Boolean(b.self ?? (b.device === dev)),
    // Nenhum beacon carrega o utilizador. Um nome inventado aqui seria a
    // primeira mentira de um painel que se vende por nao ter nenhuma.
    user: b.user || null,
    ts: b.ts || null,
    state: b.pausa && b.pausa.activa ? `on hold — ${b.pausa.razao || 'reason n/d'}`
      : (b.running === false ? 'stopped' : (b.running === true ? 'running' : 'state n/d')),
    vram_gb: Number.isFinite(b.vram_gb) ? b.vram_gb : null,
    // MEDIDO POR NINGUEM: nem o `ioreg` do macOS nem o beacon publicam o total.
    // Fica `null` de proposito — o termometro pinta `n/d`.
    vram_total_gb: Number.isFinite(b.vram_total_gb) ? b.vram_total_gb : null,
    last_known: {
      total: (b.recibos && b.recibos.total) ?? null,
      cited: (b.recibos && b.recibos.citacao_ok) ?? null,
      refuted: (b.recibos && b.recibos.refutado) ?? null,
    },
  }));

  const tally = tallyPorModelo(receipts);
  const wts = listarWorktrees(repoRoot, { runImpl: runGitImpl });

  const gates = {};
  for (const p of portoes({ recibos: { total: receipts.length, refutado: counters.refuted },
                            triagem: contas, patches: {} })) {
    gates[`L${p.nivel}`] = {
      rule: p.regra, value: p.medido, unit: p.unidade || null, limit: p.alvo,
      base: p.base || null, open: p.aberto, why_closed: p.aberto ? null : (p.porque_fechado || null),
    };
  }

  const yardstick = await lerYardstick({ now });

  return {
    generated_at: new Date(now).toISOString(),
    device: dev,
    owner_tz: OWNER_TZ,
    window: {
      lines: existe ? (ledgerLinhas ?? null) : null,
      window: receipts.length,
      cutoff: ultimo && ultimo.ts ? ultimo.ts : null,
    },
    counters,
    daily: porDia(receipts),
    triage: {
      total: contas.achados,
      accepted: contas.aceite,
      issues: contas.issue,
      dismissed_total: contas.descartado,
      pending: contas.por_triar,
      dismissed: contas.por_motivo,
      dismissed_without_reason: contas.sem_motivo,
      by_owner: contas.do_dono,
      // A lista FECHADA de motivos, vinda do motor. O painel tem um botao de
      // descartar e o endpoint devolve 400 sem um motivo valido: sem esta lista,
      // a pagina teria de os cravar a mao e divergiriam no primeiro motivo novo.
      reasons: MOTIVOS,
      items: itensDeTriagem(decisoes, receipts),
      items_cap: MAX_ITENS_TRIAGEM,
    },
    yardstick,
    night: agregarNoite(receipts),
    needs_you: needsYou,
    receipts: receipts.slice(-MAX_RECIBOS).reverse().map((r) => ({
      ts: r.ts || null, pilar: r.pilar || null, verdict: r.verdict || null,
      finding_id: idDoAchado(r), route: (rotaDoRecibo(r) || {}).id || null,
      resumo: r.resultado_resumo || null, ficheiro: r.ficheiro || null,
      modelo: r.modelo || null, engine: r.engine || null,
      dur_s: Number.isFinite(r.dur_s) ? r.dur_s : null,
      tokens_out: Number.isFinite(r.tokens_out) ? r.tokens_out : null,
      usd: Number.isFinite(r.usd) ? r.usd : null,
    })),
    fleet,
    fleet_rejected: fleetRejected,
    fleet_note: (frota && frota.aviso) || null,
    /**
     * A tabela de encaminhamento, uma vez, para a pagina a citar em vez de a
     * recitar. `route` e a lista das classes que este sistema EXERCITA — as
     * outras duas ficam no modulo, declaradas como nao exercidas, e nao viajam
     * para nao darem a impressao de uma escada que ninguem subiu.
     */
    route: { classes: exercidas(), fonte: 'tools/cockpit/runner/rota.mjs' },
    /**
     * A frota ve mesmo este device? Medido pelo git do vault — a variavel de
     * ambiente que ligaria a publicacao vive no processo do LOOP, e le-la aqui
     * responderia sobre o processo errado.
     */
    publish: estadoDaPublicacao({ vaultPath, device: dev }),
    versions: {
      connector_installed: versaoInstalada({ home: homeImpl, readImpl, existsImpl }),
      connector_latest: versaoDoConector(repoRoot, { readImpl }),
      release_notes_url: null,
    },
    worktrees: {
      free: wts.free, total: wts.total,
      measured_at: new Date(now).toISOString(),
      criterion: 'eligible = has a branch, not bare, not detached — job occupancy is not measured here',
    },
    engine: {
      resident: state.modelo || null,
      vram_gb: gpu && Number.isFinite(gpu.vram_inuse_gb) ? gpu.vram_inuse_gb : null,
      vram_total_gb: null,
      engine: state.engine || null,
      gpu_pct: gpu && Number.isFinite(gpu.util_pct) ? gpu.util_pct : null,
      gpu_source: (gpu && gpu.fonte) || 'n/d',
      tally,
      roster: elencoDeMotores(tally),
    },
    gates,
    hold: state.pausa && state.pausa.desde
      ? { since: state.pausa.desde, reason: state.pausa.razao || null }
      : null,
    eta_keys: lerEtaIndex(path.join(mooDir, 'eta-index.json'), { readImpl }),
    worktrees_list: wts.lista,
    paths: {
      repo: repoRoot,
      vault: vaultPath,
      ledger: ledgerPath,
      beacons: pastaBeacons.dir || null,
    },
  };
}

/**
 * O padrao de comparacao: o que os turnos de subscricao DESTA maquina custariam
 * ao preco de tabela. Nao e dinheiro gasto e o payload di-lo (`scope`).
 * `null` quando o medidor nao tem sessoes — e nao um zero que se leria como
 * "nao gastaste nada".
 */
async function lerYardstick({ now = Date.now(), horas = 168 } = {}) {
  try {
    const { spendByModel } = await import('./spend-by-model.mjs');
    const r = spendByModel({ horas, agora: now });
    if (!r || !r.disponivel || !Array.isArray(r.modelos) || !r.modelos.length) return null;
    const topo = [...r.modelos].sort((a, b) => (b.turnos || 0) - (a.turnos || 0))[0];
    if (!topo) return null;
    return {
      engine: topo.modelo || null,
      turns: Number.isFinite(topo.turnos) ? topo.turnos : null,
      tokens_out: Number.isFinite(topo.saidas) ? topo.saidas : null,
      cost_list: Number.isFinite(topo.usd) ? Number(topo.usd.toFixed(2)) : null,
      period: `${Math.round(horas / 24)} days`,
      scope: 'this machine only, aggregate — API list price, NOT money spent on a subscription',
      caveat: r.aviso_saidas || topo.porque || null,
    };
  } catch {
    return null;
  }
}

export function lerRoadmap(caminho = ROADMAP, { readImpl = fs.readFileSync } = {}) {
  try {
    const d = JSON.parse(String(readImpl(caminho, 'utf8')));
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/** A casca com o payload dentro — o que o F10 serve e o que o `--out` escreve. */
export async function renderLedgerHtml(opts = {}) {
  const snapshot = await buildLedgerSnapshot(opts);
  const roadmap = lerRoadmap(opts.roadmapPath || ROADMAP);
  const shell = {
    version: SHELL_VERSION,
    built_at: snapshot.generated_at,
    device: snapshot.device,
    requires_connector: snapshot.versions.connector_latest,
  };
  const html = fs.readFileSync(opts.shellPath || SHELL, 'utf8');
  return { html: injectPayload(html, { snapshot, roadmap, shell }), snapshot, roadmap, shell };
}

async function main() {
  const soJson = process.argv.includes('--json');
  if (soJson) {
    const s = await buildLedgerSnapshot();
    process.stdout.write(JSON.stringify(s, null, 2) + '\n');
    return;
  }
  const out = process.argv[2] || path.join(REPO, 'dist', 'moo-ledger.html');
  const { html, snapshot } = await renderLedgerHtml();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  const nulos = CAMPOS_OBRIGATORIOS.filter((k) => snapshot[k] == null);
  process.stdout.write(
    `moo ledger escrito: ${out} (${Math.round(html.length / 1024)} KB, `
    + `${snapshot.window.window} recibos na janela, ${snapshot.counters.cited_verified} com citacao conferida)\n`
    + (nulos.length ? `campos sem medicao (a pagina mostra n/d): ${nulos.join(', ')}\n` : ''),
  );
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
