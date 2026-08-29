/**
 * bench-b3b6.test.mjs — o B3/B6 sem tocar na rede.
 *
 * Porque importa: o portao de promocao do mapa §3 exige B3>=4/5. Se o scorer
 * mentir, o portao passa a carimbar em vez de morder. Cada teste abaixo planta
 * uma resposta de modelo e exige o veredicto certo.
 */
import test from 'node:test';
import assert from 'node:assert';
import { b3, b6, TAREFAS, SCHEMA } from './bench-b3b6.mjs';

/** Um Ollama de mentira: devolve o que lhe mandarmos, por ordem de chamada. */
const fakeOllama = (respostas) => {
  let i = 0;
  return async () => {
    const r = respostas[Math.min(i++, respostas.length - 1)];
    return { ok: true, json: async () => r };
  };
};
const chamou = (name, args) => ({ message: { tool_calls: [{ function: { name, arguments: args } }] } });
const naoChamou = { message: { content: 'A janela deslizante limita a atencao a N tokens vizinhos.' } };

test('B3: chamar a ferramenta certa com os argumentos certos conta como acerto', async () => {
  const r = await b3({ model: 'x', reps: 1, fetchImpl: fakeOllama([
    chamou('ler_ficheiro', { caminho: 'a.js' }),
    chamou('procurar', { padrao: 'X', pasta: 'tools' }),
    chamou('correr_testes', { alvo: 'tools/router' }),
    chamou('git_estado', {}),
    naoChamou,
  ]) });
  assert.equal(r.n, 5);
  assert.equal(r.acertos, 5);
  assert.equal(r.pct, 100);
});

test('B3: chamar a ferramenta errada NAO conta', async () => {
  const r = await b3({ model: 'x', reps: 1, fetchImpl: fakeOllama([chamou('git_estado', {})]) });
  const d = r.det.find((x) => x.tarefa === 'ler');
  assert.equal(d.ok, false);
  assert.match(d.porque, /esperado ler_ficheiro/);
});

test('B3: ferramenta certa com argumento em falta NAO conta', async () => {
  const r = await b3({ model: 'x', reps: 1, fetchImpl: fakeOllama([chamou('ler_ficheiro', {})]) });
  const d = r.det.find((x) => x.tarefa === 'ler');
  assert.equal(d.ok, false);
  assert.match(d.porque, /faltam args: caminho/);
});

test('B3: argumentos em STRING JSON contam na mesma — e como muitos modelos respondem', async () => {
  const r = await b3({ model: 'x', reps: 1, fetchImpl: fakeOllama([chamou('ler_ficheiro', '{"caminho":"a.js"}')]) });
  assert.equal(r.det.find((x) => x.tarefa === 'ler').ok, true);
});

test('B3 IRRELEVANCIA: chamar uma ferramenta quando nao era preciso e ERRO', async () => {
  const r = await b3({ model: 'x', reps: 1, fetchImpl: fakeOllama([chamou('ler_ficheiro', { caminho: 'a' })]) });
  const d = r.det.find((x) => x.tarefa === 'irrelevante');
  assert.equal(d.ok, false, 'um modelo que chama sempre nao e um bom tool-caller');
  assert.match(d.porque, /sem necessidade/);
});

test('B3: a tarefa de irrelevancia existe — sem ela o bench premeia chamar sempre', () => {
  assert.ok(TAREFAS.some((t) => t.espera === null), 'tem de haver pelo menos uma tarefa sem ferramenta');
});

test('B6: parse, schema e enum sao contados EM SEPARADO', async () => {
  const bom = { message: { content: JSON.stringify({ veredicto: 'aceite', ficheiro: 'a.js', linha: 42, porque: 'x' }) } };
  const r = await b6({ model: 'x', reps: 1, fetchImpl: fakeOllama([bom]) });
  assert.deepEqual([r.parse_pct, r.schema_pct, r.enum_pct], [100, 100, 100]);
});

test('B6: JSON valido mas fora do enum passa o schema e FALHA o enum', async () => {
  const mau = { message: { content: JSON.stringify({ veredicto: 'talvez', ficheiro: 'a.js', linha: 42, porque: 'x' }) } };
  const r = await b6({ model: 'x', reps: 1, fetchImpl: fakeOllama([mau]) });
  assert.equal(r.parse_pct, 100);
  assert.equal(r.schema_pct, 100);
  assert.equal(r.enum_pct, 0, '"devolveu JSON" e "devolveu o JSON pedido" sao coisas diferentes');
});

test('B6: campo em falta reprova o schema', async () => {
  const mau = { message: { content: JSON.stringify({ veredicto: 'aceite', ficheiro: 'a.js' }) } };
  const r = await b6({ model: 'x', reps: 1, fetchImpl: fakeOllama([mau]) });
  assert.equal(r.schema_pct, 0);
  assert.match(r.det[0].porque, /faltam/);
});

test('B6: texto que nao e JSON reprova o parse', async () => {
  const r = await b6({ model: 'x', reps: 1, fetchImpl: fakeOllama([{ message: { content: 'Claro! Aqui vai:' } }]) });
  assert.equal(r.parse_pct, 0);
  assert.equal(r.schema_pct, 0);
});

test('B6: o schema exige os quatro campos', () => {
  assert.deepEqual(SCHEMA.required, ['veredicto', 'ficheiro', 'linha', 'porque']);
});

test('erro de rede nao rebenta o bench — conta como falha', async () => {
  const r = await b3({ model: 'x', reps: 1, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
  assert.equal(r.acertos, 0);
  assert.equal(r.n, 5);
});
