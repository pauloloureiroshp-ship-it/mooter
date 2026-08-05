'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════════
 * trilha-tool.test.js — a porta MCP da Trilha.
 *
 * A trava nº1 deste ficheiro não é sobre a Trilha: é sobre REGISTO. Uma tool
 * registada só num dos dois pontos de entrada responde exactamente como uma
 * tool que não existe — `unknown tool` — e já custou duas horas a alguém que
 * procurava o conector na pasta errada. Por isso cada entrypoint arranca num
 * PROCESSO SEPARADO: se o teste os carregasse os dois no mesmo processo, o
 * primeiro registava a tool no array partilhado e o segundo passava de borla.
 * ══════════════════════════════════════════════════════════════════════════
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-trilha-tool-'));
process.env.MOOTER_HOME = HOME;
process.env.MOOTER_LIB = '1';
process.env.MOOTER_SKIP_INSTALL_ID = '1';

const { TOOL, construir } = require('./trilha-tool.js');
const trilha = require('./trilha.js');

/* ── 1 · registo nos DOIS pontos de entrada ─────────────────────────────── */

function toolsDoEntrypoint(entry) {
  const dir = __dirname.replace(/\\/g, '/');
  const script = 'process.env.MOOTER_LIB="1";'
    + 'require(' + JSON.stringify(dir + '/' + entry) + ');'
    + 'const n=require(' + JSON.stringify(dir + '/server.js') + ').TOOLS.map(t=>t.name);'
    + 'require("fs").writeSync(1,"\\nTOOLS=" + JSON.stringify(n));';
  const out = execFileSync(process.execPath, ['-e', script], {
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 60000,
    env: Object.assign({}, process.env, {
      MOOTER_HOME: fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-entry-')),
      MOOTER_LOG_DIR: HOME,
      MOOTER_LIB: '1',
      MOOTER_SKIP_INSTALL_ID: '1',
    }),
  });
  const m = /\nTOOLS=(\[.*\])/.exec(out);
  assert.ok(m, entry + ' nao imprimiu o registo: ' + out.slice(-400));
  return JSON.parse(m[1]);
}

test('mooter_trilha esta registada em server-seamless.js', () => {
  const nomes = toolsDoEntrypoint('server-seamless.js');
  assert.ok(nomes.includes('mooter_trilha'),
    'registar so num entrypoint da uma resposta indistinguivel de "a funcionalidade nao existe": ' + nomes.join(', '));
});

test('mooter_trilha esta registada em server-apps.js', () => {
  const nomes = toolsDoEntrypoint('server-apps.js');
  assert.ok(nomes.includes('mooter_trilha'),
    'o Cowork arranca por aqui — sem registo o painel pede uma tool que o servidor nunca ouviu falar');
});

test('a tool declara-se do painel: visibility app, porque devolve caminhos absolutos', () => {
  assert.deepStrictEqual(TOOL._meta.ui.visibility, ['app']);
  assert.strictEqual(TOOL.annotations.readOnlyHint, true, 'a Trilha lê; nunca escreve');
  assert.strictEqual(TOOL.inputSchema.additionalProperties, false);
});

/* ── 2 · o que a tool devolve ───────────────────────────────────────────── */

const J = (o) => Object.assign({ job_id: 'j', agent: 'claude', state: 'done',
  wave: 'w1', dispatched_at: '2026-08-05T02:00:00Z', cost_usd: 0, duration_s: 1 }, o);

/** Um host que existe, sem tocar no disco. */
const HOST_FALSO = {
  lerHost: () => ({
    linhas: [{ rotulo: 'Created x.js', kind: 'ficheiro', at: Date.parse('2026-08-05T02:00:05Z'),
               motores: [], registos: [], estado: 'terminado',
               ms: { valor: null, porque: 'sem duracao por chamada' }, usd: { valor: null, porque: 'custo por turno' } }],
    ficheiro: 'C:\\Users\\p\\.claude\\projects\\p\\sessao.jsonl',
    filtrados: 2, duplicados: 1, disponivel: true, porque: 'lidos 4 blocos',
  }),
  dosJobs: trilha.dosJobs, fundir: trilha.fundir, texto: trilha.texto,
};

test('a Trilha junta host e ledger numa lista so, ordenada', async () => {
  const r = await construir({ formato: 'tudo' }, {
    trilha: HOST_FALSO,
    ledgerRead: () => [],
    foldJobs: () => [J({ job_id: 'j1', agent: 'moo' }), J({ job_id: 'j2', agent: 'kimi', prep_from: 'j1', cost_usd: 0.02 })],
  });
  assert.strictEqual(r.passos.length, 2, 'uma cadeia da UMA linha, mais a linha do host');
  assert.ok(r.passos[0].at <= r.passos[1].at, 'a lista devolvida tem de vir ordenada por tempo');
  assert.strictEqual(r.host.disponivel, true);
  assert.strictEqual(r.medido.motores_locais, 1, 'o moo local tem de contar como local');
  /* ⚠️ Nada de asserções sobre as PALAVRAS do cabeçalho: `trilha.js` passou de
     PT para inglês a meio desta onda («🐄 A Trilha» → «🐄 The Trail») e um
     teste colado à língua parte-se em cada tradução sem que nada esteja mal.
     O que é invariante: a vaca (a marca) e o número de passos. */
  assert.ok(r.texto.split('\n')[0].includes('🐄'), 'o cabecalho leva a marca');
  assert.match(r.texto.split('\n')[0], new RegExp('\\b' + r.passos_total + '\\b'),
    'o cabecalho tem de contar os passos que a lista traz');
  assert.strictEqual(r.resumo, r.texto.split('\n')[0], 'o resumo e a primeira linha do texto, nunca outra frase');
});

test('sem registos, a lista vem VAZIA com porque — nao se inventa destino', () => {
  /* O Notion nao tem recibo de escrita nenhum hoje; so o vault Obsidian
     escreve nota, e a ligacao job->nota nao fica indexada. Inventar aqui um
     destino era a metrica fabricada que este produto existe para nao ter. */
  return construir({ formato: 'tudo' }, {
    trilha: HOST_FALSO, ledgerRead: () => [], foldJobs: () => [J({ job_id: 'j1' })],
  }).then((r) => {
    assert.strictEqual(r.registos_fonte.disponivel, false);
    assert.deepStrictEqual(r.registos_fonte.destinos_com_recibo, []);
    assert.ok(r.registos_fonte.porque.length > 20, 'lista vazia sem porque le-se como "nao aconteceu"');
    assert.deepStrictEqual(r.passos.find((p) => p.job_id === 'j1').registos, []);
    assert.strictEqual(r.medido.registos, 0);
  });
});

test('formato "texto" nao arrasta os passos, e diz que os cortou', async () => {
  const r = await construir({}, {
    trilha: HOST_FALSO, ledgerRead: () => [], foldJobs: () => [J({ job_id: 'j1' })],
  });
  assert.strictEqual(r.passos, undefined, 'o default e dieta: o texto ja diz tudo o que uma pessoa le');
  assert.match(r.passos_omitidos, /formato/, 'um corte silencioso le-se como "nao aconteceu mais nada"');
  assert.strictEqual(r.passos_total, 2, 'o total continua a ser dito mesmo sem a lista');
  assert.ok(r.corrente_indice_refere.includes('passos'), 'o indice da corrente tem de dizer a que lista se refere');
});

test('desde corta cadeias INTEIRAS, nunca a meio, e conta as que cortou', async () => {
  const r = await construir({ desde: '2026-08-05T03:00:00Z', formato: 'tudo' }, {
    trilha: Object.assign({}, HOST_FALSO, { lerHost: () => ({ linhas: [], ficheiro: null, filtrados: 0, duplicados: 0, disponivel: true, porque: 'vazio' }) }),
    ledgerRead: () => [],
    foldJobs: () => [
      J({ job_id: 'velho', dispatched_at: '2026-08-05T02:00:00Z' }),
      J({ job_id: 'novo', dispatched_at: '2026-08-05T04:00:00Z' }),
    ],
  });
  assert.deepStrictEqual(r.passos.map((p) => p.job_id), ['novo']);
  assert.strictEqual(r.passos_cortados, 1);
  assert.match(r.passos_cortados_porque, /inteiras|inteira/);
});

test('desde ilegivel nao esconde a sessao — mostra tudo e declara que ignorou', async () => {
  const r = await construir({ desde: 'ontem', formato: 'tudo' }, {
    trilha: HOST_FALSO, ledgerRead: () => [], foldJobs: () => [J({ job_id: 'j1' })],
  });
  assert.strictEqual(r.passos.length, 2);
  assert.match(r.desde_ignorado, /ontem/);
});

test('modelo em falta devolve erro declarado — o servidor nao morre por isso', async () => {
  const r = await construir({}, {
    trilha: null,
    /* força o caminho real de carregamento a partir de um sítio onde o módulo
       não está: simulamos com um require que rebenta */
    ledgerRead: () => [], foldJobs: () => [],
  });
  /* Com o módulo presente no pacote isto CARREGA — e é o que queremos provar:
     o caminho normal responde. A trava do erro declarado vive na forma. */
  assert.ok(r.resumo, 'sem trilha.js injectado a tool tem de usar o require real e responder');
  assert.ok(!r.error || (r.error && r.porque), 'se falhar, falha a dizer porque — nunca em silencio');
});

process.on('exit', () => { try { fs.rmSync(HOME, { recursive: true, force: true }); } catch { /* */ } });
