#!/usr/bin/env node
/**
 * r24-diagnostico.mjs — porque é que o `--correr` não arrancou.
 *
 * Uso: node tools/ab/r24-diagnostico.mjs [--prereg tools/ab/r24-prereg.json]
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PORQUE EXISTE
 *
 * A 2026-09-04 o dono correu `--correr --so 1` e não apareceu ledger nenhum,
 * nem snapshot, nem tranca. O executor recusa-se com uma linha em stderr —
 * e uma linha em stderr, numa consola que mais ninguém vê, é indistinguível
 * de «não fiz nada».
 *
 * Este ficheiro percorre TODAS as pré-condições, uma a uma, e diz de qual
 * delas o `--correr` teria desistido. Não decide nada e não chama o modelo: por
 * isso NÃO entra no congelamento. É um relatório.
 *
 * Escreve uma coisa, e é preciso dizê-lo: `prepararRouterPinado` cria a cópia
 * do tratamento no cache temporário se ela ainda não existir — é idempotente e
 * fora do repositório, mas não é «zero escritas», e afirmar isso seria o tipo
 * de imprecisão que este ficheiro existe para apanhar.
 *
 * Devolve 0 se o `--correr` pode arrancar, 1 se não pode.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let bloqueios = 0;

function linha(nome, ok, detalhe) {
  const marca = ok === null ? '  · ' : ok ? '  ok  ' : '  BLOQUEIA  ';
  if (ok === false) bloqueios++;
  console.log(`${marca}${nome}${detalhe ? `  ${detalhe}` : ''}`);
}

const argv = process.argv.slice(2);
const iP = argv.indexOf('--prereg');
const preregPath = iP >= 0 ? argv[iP + 1] : 'tools/ab/r24-prereg.json';

console.log('r24 · diagnóstico das pré-condições de --correr\n');
linha('cwd', null, process.cwd());

// ── 1. os ficheiros estão aqui? ─────────────────────────────────────────────
const precisa = ['tools/ab/correr-r24.mjs', 'tools/ab/mooter-use-ab.mjs', 'tools/ab/r24-exposicao.mjs', preregPath, 'tools/ab/r24-manifest.json'];
const emFalta = precisa.filter((f) => !fs.existsSync(f));
linha('ficheiros do R-24 presentes', emFalta.length === 0,
  emFalta.length ? `em falta: ${emFalta.join(', ')} — estás no directório certo? (o worktree do Claude Code NÃO os tem)` : `${precisa.length} de ${precisa.length}`);
if (emFalta.length) { console.log('\nPára aqui: corre a partir de ~/frugal, no ramo que tem o R-24.'); process.exit(1); }

const m = await import(`file://${path.resolve('tools/ab/correr-r24.mjs')}`);
const c = await import(`file://${path.resolve('tools/ab/mooter-use-ab.mjs')}`);
const prereg = JSON.parse(fs.readFileSync(preregPath, 'utf8'));
const repo = path.resolve(path.dirname(preregPath), '..', '..');
linha('repo resolvido pelo executor', null, repo);

// ── 2. o pré-registo ────────────────────────────────────────────────────────
linha('pré-registo CONGELADO', prereg.estado === 'CONGELADO', prereg.estado);
linha('pré-registo fecha-se sobre si próprio', m.shaDoPrereg(prereg) === prereg.sha_do_prereg,
  `${String(prereg.sha_do_prereg).slice(0, 12)}…`);
const e = prereg.estatistica || {};
linha('limiar pré-registado bate com o recalculado', c.limiarMinimo(e.n, 0.5, e.alfa) === e.limiar_X,
  `n=${e.n} · alfa=${e.alfa} · limiar=${e.limiar_X}`);

// ── 3. o congelamento, entrada a entrada ────────────────────────────────────
const cong = c.verificarCongelamento(prereg);
linha('congelamento dos ficheiros', cong.ok,
  cong.ok ? `${Object.keys(prereg.congelados).length} entradas` : cong.falhas.map((f) => `${f.nome}=${f.motivo}`).join(', '));

// ── 4. corpus e atribuição ──────────────────────────────────────────────────
try {
  const manifest = JSON.parse(fs.readFileSync(path.join(repo, prereg.congelados.manifest.path), 'utf8'));
  const t = m.primarias(manifest, prereg);
  const on = t.filter((x) => m.primeiroDe(prereg, x.task_id) === 'ON').length;
  linha('primárias legíveis do manifest', t.length === e.n, `${t.length} tarefas · ${on} ON-primeiro · ${t.length - on} OFF-primeiro`);
} catch (err) {
  linha('primárias legíveis do manifest', false, err.message);
}

// ── 5. o ambiente ───────────────────────────────────────────────────────────
const amb = c.ambienteApto(process.env);
linha('terminal fora de uma sessão Claude Code', amb.apto,
  amb.apto ? 'apto' : 'INAPTO — abre uma consola normal (isto bloqueia só o --correr; --controlo e --verificar correm em qualquer lado)');

// ── 6. o executável do agente ───────────────────────────────────────────────
const cl = m.resolverClaude();
linha('executável do agente responde --version', cl.ok,
  cl.ok ? `${cl.versao} · ${cl.caminho}` : `tentados: ${cl.tentados.join(' · ')} — define MOOTER_CLAUDE_BIN`);

// ── 7. o tratamento ─────────────────────────────────────────────────────────
const raiz = path.join(os.tmpdir(), 'r24-snapshots');
try {
  const r = m.prepararRouterPinado({ repo, cache: raiz });
  const esperado = prereg?.tratamento?.router_sha ?? null;
  linha('router pinado bate com o pré-registo', !esperado || r.sha === esperado,
    esperado ? `${r.sha.slice(0, 12)}… vs ${String(esperado).slice(0, 12)}…` : 'sem sha no pré-registo');
  linha('effort fixado', null, prereg?.tratamento?.effort ?? 'n/d');
} catch (err) {
  linha('router pinado', false, err.message);
}

// ── 8. a tranca ─────────────────────────────────────────────────────────────
const tranca = path.join(raiz, '.tranca');
const temTranca = fs.existsSync(tranca);
linha('sem outra instância a correr', !temTranca,
  temTranca ? `existe ${tranca}: ${fs.readFileSync(tranca, 'utf8').slice(0, 80)} — apaga-o se tens a certeza` : 'livre');

// ── 9. o ledger ─────────────────────────────────────────────────────────────
const ledger = path.join(repo, prereg.ledger?.path || '_handoff/r24/ledger.jsonl');
const cru = m.lerLedgerCru(ledger);
const nossas = fs.existsSync(ledger) ? m.desta(cru.linhas, prereg) : [];
linha('ledger', null, fs.existsSync(ledger)
  ? `${cru.linhas.length} linhas (${nossas.length} desta experiência, ${cru.descartadas} ilegíveis) · ${ledger}`
  : `ainda não existe · seria ${ledger}`);

// ── 10. os snapshots ────────────────────────────────────────────────────────
const dirs = fs.existsSync(raiz) ? fs.readdirSync(raiz).filter((d) => /^t\d\d-/.test(d)) : [];
linha('snapshots de corrida', null, dirs.length ? `${dirs.length}: ${dirs.slice(0, 4).join(', ')}` : 'nenhum — o --correr nunca chegou a preparar um');

console.log();
if (bloqueios === 0) {
  console.log('VEREDICTO: --correr pode arrancar.');
  process.exit(0);
}
console.log(`VEREDICTO: --correr NÃO arranca. ${bloqueios} pré-condição(ões) a bloquear, marcadas acima.`);
process.exit(1);
