/**
 * queixas.test.mjs — as 14 queixas do dono, uma a uma, com critério mecânico.
 *
 * Este ficheiro existe para que "está resolvido" deixe de ser uma opinião. Cada
 * queixa vira um teste que lê o repo e falha quando a promessa não está no
 * código. As que ainda não têm implementação ficam `{ todo: true }` — aparecem
 * na saída como dívida declarada em vez de desaparecerem numa checklist em
 * prosa onde eu poderia escrever "parcialmente feito" e seguir em frente.
 *
 * Regra do brief: uma falha = reprovado. Um `todo` NÃO é uma passagem.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(REPO, rel));

const SHELL = 'tools/cockpit/moo-pilot-shell.html';
const RUNNER = 'tools/cockpit/runner';

// ── 1 · lançar/abrir por device ──────────────────────────────────────────────
test('q01 · o painel abre por device, servido pelo endpoint local', () => {
  const server = read(`${RUNNER}/f10-server.mjs`);
  assert.match(server, /panelCandidates/, 'o endpoint tem de saber servir o painel');
  assert.match(server, /X-Moo-Panel-Source/, 'tem de declarar QUAL painel serviu');
  assert.ok(exists(SHELL), 'o shell canónico tem de existir no repo');
  assert.match(read(SHELL), /state\.device/, 'o painel tem de mostrar de que device fala');
});

// ── 2 · play por pilar ───────────────────────────────────────────────────────
test('q02 · o play por pilar mexe mesmo no loop, não é decoração', () => {
  assert.match(read(`${RUNNER}/f10-server.mjs`), /'\/focus'/, 'tem de haver endpoint /focus');
  const runner = read(`${RUNNER}/moo-runner.mjs`);
  assert.match(runner, /readFocus\(\)/, 'o loop tem de LER o foco');
  assert.match(runner, /focus \|\| nextPillar/, 'o foco tem de vencer o rodízio');
  assert.match(read(SHELL), /control\('\/focus'/, 'o botão tem de chamar o endpoint');
});

// ── 3 · progresso e animações ────────────────────────────────────────────────
test('q03 · há progresso visível e movimento, com respeito por reduced-motion', () => {
  const shell = read(SHELL);
  assert.match(shell, /stroke-dashoffset/, 'o gauge tem de ser animável');
  assert.match(shell, /@keyframes pulse/, 'o estado vivo tem de pulsar');
  assert.match(shell, /prefers-reduced-motion/, 'quem desliga movimento tem de ser respeitado');
});

// ── 4 · cross-device em tempo real ───────────────────────────────────────────
test('q04 · a frota inteira (Mac + 4090) visível em cada painel', { todo: 'F7 — só existe este device; o painel mostra UM device, não a frota' }, () => {
  assert.match(read(SHELL), /frota|devices/i);
});

// ── 5 · GPU% durante o play ──────────────────────────────────────────────────
test('q05 · o GPU% vem do play real e não de um número decorativo', () => {
  assert.match(read(`${RUNNER}/gpu-sampler.mjs`), /IOAccelerator/, 'medido via ioreg');
  const shell = read(SHELL);
  assert.match(shell, /gpu\.util_pct/, 'o gauge tem de consumir a medição');
  assert.match(shell, /'n\/d'/, 'sem amostra tem de dar n/d');
});

// ── 6 · look & feel profissional ─────────────────────────────────────────────
test('q06 · o painel é profissional: temas, responsivo, sem dependências externas', () => {
  const shell = read(SHELL);
  assert.match(shell, /prefers-color-scheme\s*:\s*dark/, 'tem de seguir o tema do sistema');
  assert.match(shell, /data-theme="dark"/, 'e a escolha explícita do utilizador');
  assert.match(shell, /@media \(max-width/, 'tem de ser responsivo');
  assert.ok(!/src="http|href="http|@import/.test(shell), 'nenhum recurso externo — abre offline');
});

// ── 7 · confiança: ▶ = trabalha sozinho, sem parar ───────────────────────────
test('q07 · o ▶ deixa mesmo a máquina a trabalhar sozinha e a prova está no ledger', () => {
  const runner = read(`${RUNNER}/moo-runner.mjs`);
  assert.match(runner, /for \(;;\)/, 'tem de ser um loop perpétuo');
  assert.match(runner, /appendReceipt\(receipt\)/, 'cada volta deixa recibo');
  assert.match(runner, /ronda rebentou/, 'até um crash deixa rasto — um buraco no ledger seria a mentira');
});

// ── 8 · amarrado ao conector 1.48.0 ──────────────────────────────────────────
test('q08 · a versão do conector é declarada no payload', () => {
  const state = read(`${RUNNER}/fleet-state.mjs`);
  assert.match(state, /connector = '1\.48\.0'/, 'a versão tem de estar no payload');
  assert.match(read(SHELL), /state\.conector/, 'e visível no painel');
});

// ── 9 · modelos locais visíveis ──────────────────────────────────────────────
test('q09 · vê-se que modelos locais estão residentes e quanta VRAM ocupam', () => {
  assert.match(read(`${RUNNER}/f10-server.mjs`), /api\/ps/, 'lê os modelos residentes do Ollama');
  const shell = read(SHELL);
  assert.match(shell, /modelos_carregados/, 'o painel mostra-os');
  assert.match(shell, /nenhum modelo residente/, 'e diz quando não há nenhum');
});

// ── 10 · alinhamento projeto / vault ─────────────────────────────────────────
test('q10 · o alinhamento é medido: repo, sha do canon e vault', () => {
  const align = read(`${RUNNER}/alignment.mjs`);
  for (const campo of ['repo_branch', 'repo_clean', 'classify_sha', 'vault']) {
    assert.match(align, new RegExp(campo), `falta ${campo}`);
  }
  assert.match(align, /parseCanonSha/, 'o sha vem do canon, não de uma constante');
  assert.match(read(SHELL), /renderAlign/, 'e aparece no painel');
});

// ── 11 · % GPU (honesto, e não substituto de recibos) ────────────────────────
test('q11 · GPU% é utilização, e o painel não a confunde com valor entregue', () => {
  const shell = read(SHELL);
  assert.match(shell, /por veredicto, nunca só por volume/i, 'o valor entregue mede-se em recibos');
  assert.match(shell, /<b>Não<\/b> quer dizer que o\s+achado está certo/,
               'a legenda tem de desarmar a leitura errada de "citação-ok"');
});

// ── 12 · features bem distribuídos ───────────────────────────────────────────
test('q12 · a lógica está distribuída por módulos testáveis, não num monólito', () => {
  const modulos = ['context-pack', 'evidence-verifier', 'runner-core', 'fleet-state', 'gpu-sampler', 'alignment', 'f10-server', 'moo-runner'];
  for (const m of modulos) assert.ok(exists(`${RUNNER}/${m}.mjs`), `falta ${m}.mjs`);
  const shim = read('moo-runner.command');
  assert.ok(shim.split('\n').length < 45, 'o .command tem de ser um shim fino');
  assert.match(shim, /SHIM FINO/, 'e declará-lo');
});

// ── 13 · research de repos públicos ──────────────────────────────────────────
test('q13 · desenho confrontado com prática de cockpits/runners públicos', { todo: 'não feito — nenhuma pesquisa externa foi corrida nesta sessão' }, () => {
  assert.fail('sem evidência de research');
});

// ── 14 · deep-search da sessão ───────────────────────────────────────────────
test('q14 · o estado herdado foi confrontado com o disco, não assumido', () => {
  // A F0 refutou a premissa central (174 recibos = trabalho) lendo o ledger.
  // O que prova que a busca aconteceu é o verificador existir e o legado
  // aparecer contabilizado à parte, em vez de silenciosamente apagado.
  const state = read(`${RUNNER}/fleet-state.mjs`);
  assert.match(state, /sem_veredicto/, 'o legado tem de continuar contado, não escondido');
  assert.match(read(`${RUNNER}/fleet-state.test.mjs`), /174 recibos/, 'o caso herdado tem de estar fixado em teste');
});
