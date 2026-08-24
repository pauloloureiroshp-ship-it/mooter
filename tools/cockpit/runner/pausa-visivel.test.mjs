/**
 * pausa-visivel.test.mjs — a pausa TEM de se distinguir de uma avaria.
 *
 * O teste que faltava quando a pausa foi ligada, e por isso o defeito passou
 * 20 checks verdes e entrou no main: o ramo da pausa fazia `continue` antes das
 * escritas que o produto le, e o painel — que deriva a vivacidade do `ts` do
 * ultimo RECIBO — pintava `stale` aos 75s e `morto` aos 300s um runner que
 * estava vivo e a obedecer. Com a fila cheia, esse era o caminho por omissao.
 *
 * O que se testa aqui NAO e "o comandante decide bem" (isso e o comandante.test).
 * E a pergunta mais burra e mais importante: **quando ele manda parar, alguem
 * consegue notar a diferenca entre isso e uma maquina rebentada?**
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOME_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-pausa-home-'));
process.env.MOOTER_HOME = HOME_TMP;

const runner = await import('./moo-runner.mjs');
const { buildFleetState } = await import('./fleet-state.mjs');

const REPO = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

/**
 * ARMADILHA, e custou-me meia hora a encontrar: `main()` reclama o lock e NAO o
 * larga no caminho `--once`. O segundo `main()` do mesmo ficheiro encontra o
 * lock com o NOSSO PID — vivo, obviamente — diz "ja ha um runner vivo" e faz
 * `process.exit(0)`.
 *
 * O processo morre a ZERO, antes de descarregar resultados nenhuns, e o
 * `node --test` reporta o ficheiro como UM teste que passou. Ou seja: um
 * ficheiro de teste com seis assercoes reais aparecia verde tendo corrido zero.
 * E o pior modo de falha que um teste pode ter, porque parece cobertura.
 *
 * Quem escrever o proximo teste que levanta o loop tem de fazer isto tambem.
 */
function limparLock(paths) {
  fs.rmSync(paths.LOCK, { force: true });
}

/** Um ledger com achados a mais para triar — a fila cheia que forca a pausa. */
function encherAFila(paths, quantos = 400) {
  const linhas = [];
  for (let i = 0; i < quantos; i += 1) {
    linhas.push(JSON.stringify({
      pilar: 'P2',
      chave: `chave-sintetica-${i}`,
      ts: '2026-08-23T10:00:00Z',
      conclusao: 'achado',
      verdict: 'citacao-ok',
      ficheiro: 'f.js',
      repo: REPO,
    }));
  }
  fs.mkdirSync(path.dirname(paths.LEDGER), { recursive: true });
  fs.writeFileSync(paths.LEDGER, `${linhas.join('\n')}\n`);
}

// ─────────────────────────────────────────── o bloqueante, no ciclo a serio

test('em PAUSA, o loop escreve o estado e publica o beacon — nao desaparece', async () => {
  const paths = runner.PATHS;
  encherAFila(paths);
  limparLock(paths);
  fs.rmSync(paths.STOP_FILE, { force: true });
  fs.rmSync(paths.STATE, { force: true });

  const beacons = [];
  const logs = [];
  await runner.main({
    argv: ['--once'],
    env: { ...process.env, MOOTER_HOME: HOME_TMP },
    maxRounds: 1,
    sleepImpl: async () => {},
    // Se o motor for chamado, a pausa nao aconteceu — e o teste diz isso em vez
    // de passar por outra razao qualquer.
    runRoundImpl: async () => { throw new Error('o motor foi chamado durante uma pausa'); },
    publishBeaconImpl: async (a) => { beacons.push(a); },
    appendReceiptImpl: () => { throw new Error('escreveu recibo numa pausa'); },
    logImpl: (m) => logs.push(m),
  });

  assert.ok(logs.some((l) => /PAUSA/.test(l)), `nao pausou. logs: ${logs.join(' | ')}`);

  // 1. O ESTADO existe e diz-se em pausa, COM motivo.
  const estado = JSON.parse(fs.readFileSync(paths.STATE, 'utf8'));
  assert.ok(estado.pausa, 'o state.json nao tem campo `pausa` — o painel nao tem como saber');
  assert.ok(estado.pausa.razao && estado.pausa.razao.length > 8,
    'pausa sem razao: indistinguivel de uma avaria muda');
  assert.ok(estado.pausa.desde, 'pausa sem `desde`: nao da para saber ha quanto tempo');
  assert.equal(estado.pilar_atual, null, 'nao esta a trabalhar em pilar nenhum');

  // 2. O BEACON saiu — e a frota que ve isto, nao esta maquina.
  assert.equal(beacons.length, 1, 'a pausa nao publicou beacon: a frota ve-a como morta');
  // 3. E NAO jurou motor vivo, porque ninguem lhe perguntou.
  assert.equal(beacons[0].engineAlive, null,
    'jurou saber o estado do motor sem o ter chamado — foi este o bug das 11 horas');
});

test('a pausa diz-se UMA vez por motivo, nao uma vez por ronda', async () => {
  const paths = runner.PATHS;
  encherAFila(paths);
  limparLock(paths);
  fs.rmSync(paths.STOP_FILE, { force: true });
  const logs = [];
  await runner.main({
    argv: [],
    env: { ...process.env, MOOTER_HOME: HOME_TMP },
    maxRounds: 5,
    sleepImpl: async () => {},
    runRoundImpl: async () => { throw new Error('motor chamado'); },
    publishBeaconImpl: async () => {},
    appendReceiptImpl: () => {},
    logImpl: (m) => logs.push(m),
  });
  const ditas = logs.filter((l) => /comandante: PAUSA/.test(l));
  assert.equal(ditas.length, 1,
    `cinco rondas de pausa deram ${ditas.length} linhas de log — a inundacao que o disjuntor existe para travar`);
});

// ─────────────────────────────────────────────────────────── o recuo

test('esperaDaPausa recua 5 -> 60 e nao passa do tecto', () => {
  const { esperaDaPausa } = runner;
  assert.equal(esperaDaPausa(0), 5, 'a primeira pausa responde depressa');
  assert.equal(esperaDaPausa(1), 10);
  assert.equal(esperaDaPausa(2), 20);
  assert.equal(esperaDaPausa(10), 60, 'tecto: o botao do painel tem de valer dentro de um minuto');
  assert.equal(esperaDaPausa(9999), 60, 'sem tecto, "ja triei" virava dez minutos de silencio');
  assert.equal(esperaDaPausa(undefined), 5, 'entrada absurda nao pode virar espera infinita');
  assert.equal(esperaDaPausa(-3), 5);
});

// ─────────────────────────────────────── o payload que o painel consome

test('buildFleetState publica `pausa` para quem le o fleet.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-pausa-fs-'));
  const statePath = path.join(dir, 'state.json');
  const ledger = path.join(dir, 'ledger.jsonl');
  fs.writeFileSync(ledger, '');
  // O `ts` e obrigatorio: e o que diz se a pausa ainda esta viva. O runner
  // escreve-o sempre; um estado sem ele e malformado.
  fs.writeFileSync(statePath, JSON.stringify({
    device: 'd', ts: Math.floor(Date.now() / 1000),
    pausa: { razao: 'human queue full (215/50)', fila: 215, desde: '2026-08-23T16:00:00Z' },
  }));
  const s = buildFleetState({
    device: 'd', ledgerPath: ledger, statePath, stopFile: path.join(dir, 'STOP'),
  });
  assert.equal(s.pausa.activa, true);
  assert.match(s.pausa.razao, /queue full/);
  assert.equal(s.pausa.fila, 215);
  assert.equal(s.pausa.obsoleta, false);
});

test('uma pausa VELHA deixa de ser pausa — o runner morreu nela', () => {
  // O campo `pausa` sem expirar trocou o defeito de lado em vez de o fechar:
  // antes um runner VIVO era pintado de morto; depois um runner MORTO ha tres
  // dias, cujo ultimo estado dizia pausa, aparecia `holding` a laranja.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-pausa-velha-'));
  const ledger = path.join(dir, 'ledger.jsonl');
  fs.writeFileSync(ledger, '');
  const statePath = path.join(dir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({
    device: 'd', ts: Math.floor(Date.now() / 1000) - 3 * 24 * 3600,
    pausa: { razao: 'human queue full (215/50)', fila: 215, desde: '2026-08-20T16:00:00Z' },
  }));
  const s = buildFleetState({ device: 'd', ledgerPath: ledger, statePath, stopFile: path.join(dir, 'STOP') });
  assert.equal(s.pausa.activa, false, 'tres dias nao e uma pausa');
  assert.equal(s.pausa.obsoleta, true);
  // NAO desaparece: o painel tem de poder dizer "morreu EM PAUSA", que pede
  // coisa diferente ao dono do que "morreu a trabalhar".
  assert.match(s.pausa.razao, /queue full/);
  assert.ok(s.pausa.idade_s > 3600);
});

test('idade desconhecida conta como obsoleta — nunca como pausa viva', () => {
  // Um estado sem `ts` nao permite dizer se a pausa ainda vale. Assumir que
  // sim seria pintar de laranja uma maquina que pode estar morta ha uma semana.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-pausa-semts-'));
  const ledger = path.join(dir, 'ledger.jsonl');
  fs.writeFileSync(ledger, '');
  const statePath = path.join(dir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ device: 'd', pausa: { razao: 'x' } }));
  const s = buildFleetState({ device: 'd', ledgerPath: ledger, statePath, stopFile: path.join(dir, 'STOP') });
  assert.equal(s.pausa.activa, false);
  assert.equal(s.pausa.obsoleta, true);
  assert.equal(s.pausa.idade_s, null);
});

test('sem pausa, o campo vem `activa: false` — nunca em falta', () => {
  // Um campo AUSENTE obriga o painel a adivinhar; um `false` explicito nao.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-pausa-fs2-'));
  const ledger = path.join(dir, 'ledger.jsonl');
  fs.writeFileSync(ledger, '');
  const statePath = path.join(dir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ device: 'd' }));
  const s = buildFleetState({ device: 'd', ledgerPath: ledger, statePath, stopFile: path.join(dir, 'STOP') });
  assert.equal(s.pausa.activa, false);
  assert.equal(s.pausa.razao, null);
});

test('engine tem TRES estados: vivo, morto, e ninguem perguntou', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-pausa-eng-'));
  const ledger = path.join(dir, 'ledger.jsonl');
  fs.writeFileSync(ledger, '');
  const base = { device: 'd', ledgerPath: ledger, statePath: path.join(dir, 'nao-existe.json'), stopFile: path.join(dir, 'STOP') };
  assert.equal(buildFleetState({ ...base, engineAlive: true }).engine, 'ollama-local');
  assert.equal(buildFleetState({ ...base, engineAlive: false }).engine, 'down');
  assert.equal(buildFleetState({ ...base, engineAlive: null }).engine, 'n/d',
    'null e "nao perguntei"; dizer down era o falso alarme simetrico do bug das 11 horas');
  assert.equal(buildFleetState({ ...base }).engine, 'down',
    'quem OMITE o campo continua a dizer down, como sempre disse');
});
