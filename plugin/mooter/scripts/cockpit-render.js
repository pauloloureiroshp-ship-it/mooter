#!/usr/bin/env node
/**
 * cockpit-render.js — o Mooter Cockpit, em texto, a partir do disco.
 *
 * PORQUE ESTE FICHEIRO EXISTE
 * O `/cockpit` no Claude Code mandava chamar `mooter_fleet`. Mas o conector MCP
 * **não está ligado no Claude Code** — Cowork e CC são instalações separadas
 * (medido em 2026-08-03/04). O comando pedia uma tool que não existe, e o
 * modelo caía para "não consigo", ou pior, para adivinhar.
 *
 * Este script lê `~/.mooter/` directamente. Não precisa de conector, não gasta
 * quota, e produz SEMPRE os mesmos números — o que o modelo faz a seguir é
 * comentar, não calcular. Uma leitura, um número.
 *
 * Correr:
 *   node cockpit-render.js              # texto para o terminal
 *   node cockpit-render.js --json       # o mesmo, em JSON, para outra ferramenta
 *   node cockpit-render.js --raiz <dir> # apontar a outro ~/.mooter (testes)
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const argv = process.argv.slice(2);
const querJson = argv.includes('--json');
const iRaiz = argv.indexOf('--raiz');
const RAIZ = iRaiz >= 0 ? argv[iRaiz + 1] : path.join(os.homedir(), '.mooter');

/* ── leitura tolerante: um ficheiro ilegível é um facto, não uma excepção ── */
const problemas = [];
function lerJson(rel) {
  const p = path.join(RAIZ, rel);
  try {
    if (!fs.existsSync(p)) { problemas.push(rel + ' — não existe'); return null; }
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    problemas.push(rel + ' — ilegível: ' + e.message);
    return null;
  }
}

/* ── os jobs vivem um por pasta em ~/.mooter/jobs/<id>/meta.json ── */
function lerJobs() {
  const dir = path.join(RAIZ, 'jobs');
  if (!fs.existsSync(dir)) { problemas.push('jobs/ — não existe'); return []; }
  const out = [];
  for (const id of fs.readdirSync(dir)) {
    const meta = path.join(dir, id, 'meta.json');
    if (!fs.existsSync(meta)) continue;
    try {
      const j = JSON.parse(fs.readFileSync(meta, 'utf8'));
      j.job_id = j.job_id || id;
      /* o out.log é a única prova de que algo cresceu — e o seu mtime é a
         única forma de saber se ainda cresce */
      const log = path.join(dir, id, 'out.log');
      if (fs.existsSync(log)) {
        const st = fs.statSync(log);
        j.__logBytes = st.size;
        j.__logIdadeS = Math.round((Date.now() - st.mtimeMs) / 1000);
      }
      out.push(j);
    } catch (e) { problemas.push('jobs/' + id + '/meta.json — ilegível'); }
  }
  return out;
}

/**
 * A REGRA QUE JUSTIFICA O COCKPIT — a mesma do painel HTML, à letra.
 * `state:"running"` não significa a trabalhar. Se o log não cresce, é stalled.
 * Se isto divergir do `realState()` do painel, os dois mentem em sítios
 * diferentes e ninguém sabe qual acreditar.
 */
const PARADO_S = 180;   // 3 min sem crescer = parado, e diz-se porquê
function estadoReal(j) {
  if (j.state === 'done')   return { k: 'done',   label: 'done ✓' };
  if (j.state === 'failed') return { k: 'failed', label: 'failed ✗ ' + (j.exit_code != null ? '(' + j.exit_code + ')' : '') };
  if (String(j.exit_code || '').includes('agent-awaiting-approval'))
    return { k: 'awaiting', label: 'awaiting approval', porque: 'processo vivo, exit_code agent-awaiting-approval' };
  if (j.__logIdadeS != null && j.__logIdadeS > PARADO_S)
    return { k: 'stalled', label: 'stalled ' + dur(j.__logIdadeS), porque: 'out.log não cresce há ' + dur(j.__logIdadeS) };
  if (j.__logIdadeS == null)
    return { k: 'working', label: 'working', nd: 'sem out.log — vivacidade n/d, não confirmada' };
  return { k: 'working', label: 'working' };
}

const dur = s => s == null ? 'n/d'
  : s < 60 ? s + 's'
  : s < 3600 ? Math.round(s / 60) + 'min'
  : s < 86400 ? (s / 3600).toFixed(1) + 'h'
  : (s / 86400).toFixed(1) + 'd';

const hora = iso => {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const hoje = new Date().toDateString() === d.toDateString();
    return new Intl.DateTimeFormat(undefined, hoje
      ? { hour: '2-digit', minute: '2-digit', hour12: false }
      : { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }
    ).format(d);
  } catch (e) { return String(iso).slice(11, 16); }
};

const corta = (s, n) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const goalDe = j => typeof j.goal === 'string' ? j.goal : (j.goal && j.goal.resumo) || null;

// ─────────────────────────────────────────────────────────────────────────────
const jobs = lerJobs().sort((a, b) =>
  String(b.dispatched_at || '').localeCompare(String(a.dispatched_at || '')));
const board = lerJson('board/' + new Date().toISOString().slice(0, 10) + '.json') || lerJson('scorecard.json');
const hardware = lerJson('hardware.json');
const prefs = lerJson('preferences.json');

const comEstado = jobs.map(j => ({ j, rs: estadoReal(j) }));
const presos = comEstado.filter(x => x.rs.k === 'stalled' || x.rs.k === 'awaiting');
const aTrabalhar = comEstado.filter(x => x.rs.k === 'working');
const feitos = comEstado.filter(x => x.rs.k === 'done');
const falhados = comEstado.filter(x => x.rs.k === 'failed');

/* Custo: soma PARCIAL declarada. Um total sem denominador é uma mentira educada. */
const comCusto = jobs.filter(j => typeof j.cost_usd === 'number');
const custo = comCusto.reduce((n, j) => n + j.cost_usd, 0);
const semCusto = jobs.length - comCusto.length;

const locais = jobs.filter(j => j.local === true || /^(moo|ollama)/i.test(String(j.agent || '')));

if (querJson) {
  console.log(JSON.stringify({
    raiz: RAIZ, lido_em: new Date().toISOString(),
    jobs: comEstado.map(x => ({ ...x.j, estado_real: x.rs })),
    resumo: {
      total: jobs.length, a_trabalhar: aTrabalhar.length, presos: presos.length,
      feitos: feitos.length, falhados: falhados.length,
      custo_usd: { valor: custo, jobs_medidos: comCusto.length, jobs_sem_medicao: semCusto, parcial: semCusto > 0 },
      locais: locais.length
    },
    problemas
  }, null, 2));
  process.exit(0);
}

// ── texto ────────────────────────────────────────────────────────────────────
const L = [];
const nome = (prefs && (prefs.project || prefs.folder_name)) || path.basename(process.cwd());
L.push('# Mooter Cockpit · ' + nome);
L.push('');
L.push('_lido de `' + RAIZ + '` às ' + hora(new Date().toISOString()) + ' — sem conector, sem quota gasta_');
L.push('');

if (problemas.length) {
  L.push('> ⚠️ **' + problemas.length + ' fonte(s) não foram lidas.** O que falta abaixo pode ser');
  L.push('> falha de leitura, não ausência de trabalho:');
  problemas.forEach(p => L.push('> - `' + p + '`'));
  L.push('');
}

if (!jobs.length) {
  L.push('**Nenhum job em `' + RAIZ + '/jobs/`.**');
  L.push('');
  L.push('Isto quer dizer uma de duas coisas, e são diferentes: ou esta máquina nunca despachou');
  L.push('trabalho pelo Mooter, ou o `~/.mooter/` está noutro sítio. Confirma o caminho antes de');
  L.push('concluir que não houve trabalho.');
} else {
  L.push('## Job log');
  L.push('');
  L.push('| hora | o quê | motor · modelo | estado real |');
  L.push('|---|---|---|---|');
  comEstado.slice(0, 14).forEach(({ j, rs }) => {
    const modelo = j.model_used || (j.model && (typeof j.model === 'string' ? j.model : j.model.valor)) || '◌ n/d';
    L.push('| ' + (hora(j.dispatched_at) || '◌')
      + ' | ' + corta(goalDe(j) || j.job_id, 46)
      + ' | ' + (j.agent_label || j.agent || '◌') + ' · `' + modelo + '`'
      + ' | ' + rs.label + (rs.nd ? ' ⚠️' : '') + ' |');
  });
  if (jobs.length > 14) L.push('');
  if (jobs.length > 14) L.push('_… e mais ' + (jobs.length - 14) + ' jobs mais antigos._');
  L.push('');

  L.push('**' + aTrabalhar.length + '** a trabalhar · **' + presos.length + '** vivos sem avançar · **'
    + feitos.length + '** feitos · **' + falhados.length + '** falhados');
  L.push('');

  if (presos.length) {
    L.push('## ⚠️ Vivos, mas não a trabalhar');
    L.push('');
    L.push('_É esta distinção que justifica o Cockpit: o processo está de pé, o trabalho não anda._');
    L.push('');
    presos.forEach(({ j, rs }) => {
      L.push('- `' + j.job_id + '` ' + (j.agent_label || j.agent || '') + ' — **' + rs.label + '**');
      if (rs.porque) L.push('  - ' + rs.porque);
      if (j.worktree) L.push('  - pasta `' + j.worktree + '` — segura-a enquanto estiver assim');
      L.push('  - `' + path.join(RAIZ, 'jobs', j.job_id, 'out.log') + '` ← o comando exacto está aqui');
    });
    L.push('');
  }

  L.push('## Custo e fatia local');
  L.push('');
  L.push('- custo: **$' + custo.toFixed(4) + '**'
    + (semCusto > 0
        ? ' ⚠️ **soma parcial** — ' + comCusto.length + ' job(s) medidos, ' + semCusto + ' sem custo no recibo'
        : ' (todos os ' + comCusto.length + ' jobs traziam custo medido)'));
  L.push('- locais: **' + locais.length + '** de ' + jobs.length + ' jobs correram na GPU, a $0');
  const poup = jobs.filter(j => j.tokens_poupados_estimados != null);
  if (poup.length) {
    const tot = poup.reduce((n, j) => n + j.tokens_poupados_estimados, 0);
    L.push('- `tokens_poupados_estimados`: **' + tot + '** — ⚠️ isto é o **volume que o modelo local**');
    L.push('  **produziu**, não uma poupança líquida medida. Numa cadeia moo→nuvem o job pago corre à');
    L.push('  mesma e recebe esse texto no prompt; aí a poupança líquida é `n/d`.');
  }
  L.push('');
}

if (board && Array.isArray(board.excepcoes) && board.excepcoes.length) {
  L.push('## Attention — só o que está fora da faixa');
  L.push('');
  board.excepcoes.forEach(e => {
    const m = (board.metricas && board.metricas[e.metrica]) || {};
    L.push('- **' + e.metrica + '** = ' + (m.valor != null ? m.valor : 'n/d')
      + (Array.isArray(m.faixa) ? ' · faixa [' + m.faixa.join(',') + ']' : '')
      + ' · dono **' + (e.dono || 'n/d') + '**');
    if (m.porque) L.push('  - porquê: ' + m.porque);
    if (e.o_que_muda_se_ninguem_agir) L.push('  - se ninguém agir: ' + e.o_que_muda_se_ninguem_agir);
  });
  L.push('');
} else if (board) {
  L.push('## Attention');
  L.push('');
  L.push('_Nada fora da faixa. O bloco fica vazio de propósito — e vazio aqui é o objectivo._');
  L.push('');
}

if (hardware) {
  const g = hardware.gpu || hardware;
  L.push('## Máquina');
  L.push('');
  L.push('- GPU: ' + (g.nome || g.name || '◌ n/d')
    + (g.vram_livre_mb != null ? ' · ' + g.vram_livre_mb + ' MB livres' : '')
    + (g.utilizacao_pct != null ? ' · ' + g.utilizacao_pct + '% de uso' : ''));
  L.push('');
}

L.push('---');
L.push('');
L.push('_Todos os números acima vêm de ficheiros no disco. Um campo sem medição aparece como `◌ n/d`_');
L.push('_com o motivo — nunca como zero, porque um zero sem explicação lê-se como uma medição._');

console.log(L.join('\n'));
