/**
 * ab-report.test.mjs — o relatorio que decide a F1 tem de ser mordido primeiro.
 *
 * Este relatorio vai ser usado para dizer «as perguntas novas melhoraram» ou
 * «nao melhoraram». Se ele somar coortes que nao se somam, ou contar as
 * decisoes do autopilot como aceites do dono, produz um numero que parece
 * medicao e e propaganda. Zero I/O aqui: tudo injectado.
 */

import test from 'node:test';
import path from 'node:path';
import assert from 'node:assert/strict';

import {
  partirChave, lerJsonl, decisoesDoDono, agregar, veredictos, construir, render, mooterHome,
} from './ab-report.mjs';

const recibo = (o = {}) => ({
  ts: '2026-08-20T18:00:00Z', chave: 'P6.aaaaaa|f.js:1-10:abc',
  verdict: 'sem-citacao', conclusao: 'sem-achado', ...o,
});

test('a chave separa pilar de versao, e a ausencia de versao e o LEGADO', () => {
  assert.deepEqual(partirChave('P6.d29f41|f.js:1-2:x'), { pilar: 'P6', versao: 'd29f41' });
  assert.deepEqual(partirChave('P6|f.js:1-2:x'), { pilar: 'P6', versao: null });
  assert.equal(partirChave('lixo'), null);
  assert.equal(partirChave(null), null);
});

test('legado e versionado NUNCA se somam — sao coortes separadas', () => {
  const { coortes } = agregar([
    recibo({ chave: 'P6|f.js:1-2:x' }),
    recibo({ chave: 'P6|f.js:3-4:y' }),
    recibo({ chave: 'P6.d29f41|f.js:1-2:x' }),
  ]);
  assert.equal(coortes.length, 2, 'duas coortes, nao uma media das duas');
  const legado = coortes.find((c) => c.legado);
  const nova = coortes.find((c) => !c.legado);
  assert.equal(legado.rondas, 2);
  assert.equal(nova.rondas, 1);
  assert.equal(nova.versao, 'd29f41');
});

test('conta citadas, achados e refutado pelo campo certo', () => {
  const { coortes } = agregar([
    recibo({ verdict: 'citacao-ok', conclusao: 'achado' }),
    recibo({ verdict: 'citacao-ok', conclusao: 'sem-achado' }),
    recibo({ verdict: 'refutado', conclusao: 'achado' }),
    recibo({ verdict: 'sem-citacao' }),
  ]);
  const c = coortes[0];
  assert.equal(c.rondas, 4);
  assert.equal(c.citadas, 2);
  assert.equal(c.refutado, 1);
  assert.equal(c.achados, 2, 'um achado refutado continua a ser um achado declarado');
});

/**
 * O mesmo principio do portao L2 (#321): o autopilot assina as suas decisoes
 * como `agente`. Conta-las como aceite do dono seria o sistema a validar-se a
 * si proprio — e e exactamente o numero que o masterprompt quer mover.
 */
test('as decisoes do AUTOPILOT nao contam como aceite do dono', () => {
  const { porChave, doAgente } = decisoesDoDono([
    { chave: 'k1', decisao: 'aceite', por: 'dono' },
    { chave: 'k2', decisao: 'descartado', por: 'agente' },
    { chave: 'k3', decisao: 'aceite', por: 'agente' },
  ]);
  assert.equal(doAgente, 2);
  assert.equal(porChave.get('k1'), 'aceite');
  assert.equal(porChave.has('k2'), false);
  assert.equal(porChave.has('k3'), false, 'nem sequer um "aceite" do agente conta');
});

test('aceite, descartado e por-triar dividem os achados sem sobrar nem faltar', () => {
  const decisoes = new Map([['a', 'aceite'], ['b', 'descartado'], ['c', 'issue']]);
  const { coortes } = agregar([
    recibo({ chave: 'P1.a1aaaa|x', conclusao: 'achado' }),
    { ...recibo({ conclusao: 'achado' }), chave: 'a' },
    { ...recibo({ conclusao: 'achado' }), chave: 'b' },
    { ...recibo({ conclusao: 'achado' }), chave: 'c' },
  ], decisoes);
  // As chaves 'a'/'b'/'c' nao batem no formato de pilar -> ficam fora das coortes.
  const c = coortes[0];
  assert.equal(c.achados, 1);
  assert.equal(c.aceites + c.descartados + c.por_triar, c.achados,
    'todo achado tem de estar em exactamente um balde');
});

test('`issue` conta como aceite — o dono quis fazer alguma coisa com ele', () => {
  const { coortes } = agregar(
    [recibo({ chave: 'P1.aaaaaa|k', conclusao: 'achado' })],
    new Map([['P1.aaaaaa|k', 'issue']]),
  );
  assert.equal(coortes[0].aceites, 1);
  assert.equal(coortes[0].por_triar, 0);
});

test('com UMA so versao o veredicto diz que nao ha comparacao — nao inventa uma', () => {
  const { coortes } = agregar([
    recibo({ chave: 'P6|k1' }),
    recibo({ chave: 'P6.d29f41|k2' }),
  ]);
  const [v] = veredictos(coortes);
  assert.equal(v.tipo, 'um-braco-so');
  assert.equal(v.versao, 'd29f41');
  assert.match(v.porque, /nao sao comparaveis/);
});

test('com DUAS versoes compara, e leva o N de cada lado', () => {
  const recibos = [];
  for (let i = 0; i < 10; i++) recibos.push(recibo({ chave: `P6.a00001|k${i}`, verdict: i < 5 ? 'refutado' : 'sem-citacao' }));
  for (let i = 0; i < 20; i++) recibos.push(recibo({ chave: `P6.b00002|j${i}`, verdict: i < 2 ? 'refutado' : 'sem-citacao' }));
  const { coortes } = agregar(recibos);
  const [v] = veredictos(coortes);
  assert.equal(v.tipo, 'comparavel');
  assert.equal(v.n_de, 10);
  assert.equal(v.n_para, 20);
  assert.equal(v.delta_refutado_pp, -40, '50% -> 10% sao -40 pontos percentuais');
});

test('o corte --min-n exclui coortes pequenas em vez de as diluir', () => {
  const recibos = [recibo({ chave: 'P6.a00001|k' })];
  for (let i = 0; i < 50; i++) recibos.push(recibo({ chave: `P6.b00002|j${i}` }));
  const { coortes } = agregar(recibos);
  const [v] = veredictos(coortes, 10);
  assert.equal(v.tipo, 'um-braco-so', 'a coorte de 1 ronda nao entra numa comparacao');
  assert.equal(v.n, 50);
});

test('uma linha partida do ledger e CONTADA, nunca engolida', () => {
  const ler = () => '{"chave":"P1.aaaaaa|k","verdict":"citacao-ok"}\nisto nao e json\n';
  const r = lerJsonl('/x', ler);
  assert.equal(r.linhas.length, 1);
  assert.equal(r.lidas, 2);
  assert.equal(r.partidas, 1);
});

test('um ledger que nao existe da zero, e DIZ que nao existe', () => {
  const r = lerJsonl('/nao/existe', () => { throw new Error('ENOENT'); });
  assert.equal(r.existe, false);
  assert.deepEqual(r.linhas, []);
});

test('o relatorio inteiro avisa do que nao consegue medir', () => {
  // As chaves usam o MESMO `path.join` do codigo. No Windows `/h/x` e `\h\x`
  // sao caminhos diferentes, e um mock com barras POSIX mediria o separador em
  // vez do comportamento — o mesmo defeito que partiu o `mockIO` do audit e que
  // manteve 13 testes vermelhos fora do CI ate hoje (#328).
  const ficheiros = {
    [path.join('/h', 'runner-ledger.jsonl')]: '{"chave":"P6|k1","verdict":"refutado"}\npartida\n',
    [path.join('/h', 'triagem.jsonl')]: '{"chave":"k1","decisao":"descartado","por":"agente"}\n',
  };
  const d = construir({ home: '/h', readImpl: (p) => { if (!ficheiros[p]) throw new Error('ENOENT'); return ficheiros[p]; } });
  const texto = d.avisos.join(' | ');
  assert.match(texto, /ilegiveis/, 'a linha partida tem de aparecer');
  assert.match(texto, /autopilot NAO contam/, 'a decisao do agente tem de ser declarada');
  assert.match(texto, /legado/, 'as rondas pre-#318 tem de ser declaradas');
});

test('o modulo NAO le o relogio — quem carimba a data e quem chama', () => {
  const d = construir({ home: '/h', readImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(d.gerado_em, null,
    'um relatorio que se auto-data nao e reproduzivel a partir do mesmo ledger');
});

test('render nao rebenta com zero dados e diz que nao ha nada', () => {
  const d = construir({ home: '/h', readImpl: () => { throw new Error('ENOENT'); } });
  const txt = render(d);
  assert.match(txt, /A\/B das perguntas/);
  assert.match(txt, /zero rondas/);
});

test('o home segue o mesmo contrato do resto do repo', () => {
  assert.equal(mooterHome({ MOOTER_HOME: '/x/.mooter' }), '/x/.mooter');
  assert.match(mooterHome({}), /\.mooter$/);
});
