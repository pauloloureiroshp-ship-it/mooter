// @ts-check
/**
 * instrumentos.test.mjs — testes de MORDIDA dos instrumentos da MATRIZ 12.
 *
 *   node --test _handoff/matriz-12-2026-09-10/lib/instrumentos.test.mjs
 *
 * Cada teste aqui existe porque a coisa que ele guarda ja falhou uma vez nesta
 * corrida, ou falhou numa anterior e esta escrita na memoria do projecto. Um
 * teste que nunca poderia ficar vermelho nao esta a guardar nada.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { custos, TABELA, MULTIPLICADORES } from './preco.mjs';
import { baralhar } from './cego.mjs';
import { total, extrairJson, maximo } from './rubrica.mjs';
import { chamarClaude, LIMIAR_STDIN } from './claude-call.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

test('preco: um modelo de nuvem sem preco de lista da n/d, NAO da zero', () => {
  const c = custos('gpt-6-astra', { tokens_in: 27145, tokens_out: 19 });
  assert.equal(c.custo_resposta_usd, null, 'o braco D nao pode aparecer como gratuito');
  assert.equal(c.custo_faturado_usd, null);
  assert.match(String(c.nota), /n\/d/);
});

test('preco: local so e $0 se o modelo estiver mesmo instalado no Ollama', () => {
  const instalado = custos('qwen2.5-coder:14b', { tokens_in: 100, tokens_out: 50 });
  assert.equal(instalado.custo_resposta_usd, 0);
  const inventado = custos('modelo-que-nao-existe:99b', { tokens_in: 100, tokens_out: 50 });
  assert.equal(inventado.custo_resposta_usd, null, 'um nome desconhecido nao pode herdar o preco local');
});

test('preco: o faturado inclui o cache e e maior que a resposta quando ha cache', () => {
  const c = custos('claude-opus-5', { tokens_in: 2, tokens_out: 127, cache_creation: 3719, cache_read: 0 });
  assert.ok(c.custo_faturado_usd > c.custo_resposta_usd);
  // 3719 tokens x $6.25/M
  assert.equal(c.parcelas_usd.cache_write, +(3719 * 6.25 / 1e6).toFixed(8));
  assert.equal(c.parcelas_usd.saida, +(127 * 25 / 1e6).toFixed(8));
});

test('preco: as taxas de cache batem com os multiplicadores publicados', () => {
  for (const [id, p] of Object.entries(TABELA.modelos)) {
    assert.equal(p.cache_write_5m, +(p.input * MULTIPLICADORES.cache_write_5m).toFixed(4), `${id}: write`);
    assert.equal(p.cache_read, +(p.input * MULTIPLICADORES.cache_read).toFixed(4), `${id}: read`);
  }
});

test('cego: a mesma semente da sempre a mesma ordem, e outra semente da outra', () => {
  const bracos = ['A', 'B', 'B2', 'C', 'D'];
  const a = baralhar(bracos, 'semente-1', 'DATA-1');
  const b = baralhar(bracos, 'semente-1', 'DATA-1');
  assert.deepEqual(a.rotulos, b.rotulos);
  const c = baralhar(bracos, 'semente-2', 'DATA-1');
  const d = baralhar(bracos, 'semente-1', 'DATA-4');
  assert.ok(JSON.stringify(a.rotulos) !== JSON.stringify(c.rotulos) || JSON.stringify(a.rotulos) !== JSON.stringify(d.rotulos),
    'mudar a semente ou o id tem de mudar alguma ordem');
});

test('cego: a chave e mesmo a inversa dos rotulos', () => {
  const { rotulos, chave } = baralhar(['A', 'B', 'C'], 's', 'X');
  for (const [braco, r] of Object.entries(rotulos)) assert.equal(chave[r], braco);
});

test('cego: o baralhar nao e a identidade em todos os ids (senao A ficava sempre 1.o)', () => {
  const bracos = ['A', 'B', 'B2', 'C', 'D'];
  const ids = ['DATA-1', 'LEGAL-1', 'MKT-2', 'LEGAL-3', 'MKT-3', 'DEV-2', 'DATA-4', 'OPS-4', 'OPS-3', 'P5', 'MKT-4', 'DATA-3'];
  const primeiros = ids.map((id) => baralhar(bracos, 'sha-de-teste', id).chave.R1);
  assert.ok(new Set(primeiros).size > 1, 'o mesmo braco nunca pode calhar em 1.o em todos os prompts');
});

test('rubrica: RISCO conta a dobrar num prompt de risco', () => {
  const notas = { RESOLVE: 2, CORRECTO: 2, EXECUTAVEL: 2, RISCO: 2, ECONOMIA: 2 };
  assert.equal(total(notas, false), 10);
  assert.equal(total(notas, true), 12);
  assert.equal(maximo(false), 10);
  assert.equal(maximo(true), 12);
});

test('rubrica: uma nota em falta da null, nao um total optimista', () => {
  assert.equal(total({ RESOLVE: 2, CORRECTO: 2, EXECUTAVEL: 2, RISCO: 2 }, false), null);
});

test('rubrica: o JSON do juiz e extraido mesmo vindo com cercas e preambulo', () => {
  const j = extrairJson('Aqui esta:\n```json\n{"R1":{"RESOLVE":2}}\n```\nespero que ajude');
  assert.deepEqual(j, { R1: { RESOLVE: 2 } });
  assert.equal(extrairJson('sem json nenhum'), null);
});

test('claude-call: os argumentos de isolamento nao podem desaparecer', () => {
  const src = fs.readFileSync(path.join(AQUI, 'claude-call.mjs'), 'utf8');
  for (const arg of ["'--setting-sources', ''", "'--strict-mcp-config'", "'--tools', ''", "'--append-system-prompt'"]) {
    assert.ok(src.includes(arg), `falta o argumento de isolamento ${arg}: sem ele o braco leva os hooks do Mooter dentro do proprio prompt`);
  }
});

test('codex-call: corre isolado do config pessoal e com effort declarado', () => {
  const src = fs.readFileSync(path.join(AQUI, 'codex-call.mjs'), 'utf8');
  assert.ok(src.includes("'--ignore-user-config'"));
  assert.ok(src.includes('model_reasoning_effort'));
});

test('claude-call: um prompt que nao cabe na linha de comando do Windows vai por stdin', () => {
  const visto = [];
  const espia = (bin, args, opts) => { visto.push({ args, input: opts.input }); return { status: 0, stdout: '', stderr: '', error: null }; };

  chamarClaude({ prompt: 'x'.repeat(100), model: 'm', cwd: '.', spawnImpl: espia, exe: 'fake.exe' });
  assert.equal(visto[0].args[0], '-p');
  assert.equal(visto[0].args[1], 'x'.repeat(100), 'prompt curto continua a ir por argv');
  assert.equal(visto[0].input, '');

  const grande = 'y'.repeat(LIMIAR_STDIN + 1);
  chamarClaude({ prompt: grande, model: 'm', cwd: '.', spawnImpl: espia, exe: 'fake.exe' });
  assert.equal(visto[1].args[0], '-p');
  assert.equal(visto[1].args[1], '--output-format', 'o prompt grande NAO pode aparecer em argv');
  assert.equal(visto[1].input, grande, 'tem de ir inteiro por stdin');
  assert.ok(!visto[1].args.some((a) => a.length > LIMIAR_STDIN), 'nenhum argumento pode carregar o prompt');
});

test('claude-call: o limiar fica abaixo do tecto duro de 32767 do Windows', () => {
  assert.ok(LIMIAR_STDIN < 32767, 'o limiar tem de deixar folga para o resto dos argumentos');
  // O caso real: 33345 chars, que reprovou os DOIS juizes do LEGAL-3 a 2026-09-10.
  assert.ok(33345 > LIMIAR_STDIN);
});

test('agregar: a celula de custo de um braco sem preco e n/d, nunca "0.0000"', () => {
  // A funcao vive dentro de agregar.mjs; o teste replica-a a partir da fonte para
  // que uma regressao no ficheiro real seja apanhada, nao numa copia.
  const src = fs.readFileSync(path.join(AQUI, '..', 'agregar.mjs'), 'utf8');
  const m = src.match(/const num = \(v, casas = 4\) => \((.+)\);/);
  assert.ok(m, 'a definicao de num() mudou de forma');
  const num = new Function('v', 'casas', `casas = casas ?? 4; return (${m[1]});`);
  assert.equal(num(null), 'n/d');
  assert.equal(num(undefined), 'n/d');
  assert.equal(num(0), '0.0000', 'zero verdadeiro (local) continua a imprimir 0');
  assert.equal(num(0.1527), '0.1527');
});
