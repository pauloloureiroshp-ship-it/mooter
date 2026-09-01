/**
 * receipts-check.test.mjs — provar que ele acusa o certo E absolve o certo.
 *
 * Metade destes testes existe por causa de FALSOS POSITIVOS apanhados a medir
 * contra o ledger real, e nao por causa de falsos negativos. Um verificador de
 * evidencia que acusa em falso e o mesmo erro ao contrario, no ficheiro cuja
 * unica razao de existir e separar prova de ruido. As quatro classes que ele
 * tem de absolver estao aqui com o caso real que as descobriu.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const {
  VEREDICTO, MIN_ALEGACAO, JANELA_LINHAS, PREFIXO_MIN_PCT,
  espremer, extrairAlegacoes, conferirAlegacao, conferirRecibo, conferirLedger,
} = await import('./receipts-check.mjs');
const { MOTIVOS } = await import('./triagem.mjs');

/** Um repo de bolso: um ficheiro com o conteudo que o teste quiser. */
function bancada(conteudo, nome = 'a.js') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-'));
  fs.writeFileSync(path.join(dir, nome), conteudo);
  return { dir, nome };
}
const achado = (extra) => Object.assign({
  conclusao: 'achado', ficheiro: 'a.js', chave: 'P1|a.js:1-9:aa',
}, extra);

// ── extraccao ───────────────────────────────────────────────────────────────

test('le `LINE n:` e `LINHA n:`, em cadeia numa linha so', () => {
  const a = extrairAlegacoes("LINE 12: const x = 1 LINE 30: const y = 2");
  assert.deepEqual(a.map((x) => x.linha), [12, 30]);
  assert.equal(a[0].conteudo, 'const x = 1');
  assert.equal(extrairAlegacoes('LINHA 5: foo()')[0].linha, 5);
});

test('para nos marcadores que o modelo usa a seguir', () => {
  const a = extrairAlegacoes('LINE 99: temperature = 0 EXITS AT LINE 108 PROOF: f.ts:99');
  assert.equal(a[0].conteudo, 'temperature = 0');
});

test('nao repete a mesma alegacao duas vezes', () => {
  assert.equal(extrairAlegacoes('LINE 1: a=1 LINE 1: a=1').length, 1);
});

// ── normalizacao ────────────────────────────────────────────────────────────

test('espremer ignora espacos, aspas curvas e a virgula pendente', () => {
  assert.equal(espremer(' const  x = 1 ;'), 'constx=1');
  assert.equal(espremer('a: ‘b’'), 'a:\'b\'');
  assert.equal(espremer('{ a: 1, }'), '{a:1}');
});

// ── ABSOLVER: as quatro classes apanhadas a medir ───────────────────────────

test('ABSOLVE: expressao multi-linha citada como uma so (caso gpu-probe.js:37)', () => {
  const { dir } = bancada([
    'const r = spawnSync(',
    "  'nvidia-smi',",
    "  ['--query-gpu=name,memory.total,utilization.gpu', '--format=csv,noheader,nounits'],",
    "  { encoding: 'utf8', timeout: 3000, windowsHide: true }",
    ');',
  ].join('\n'));
  const r = conferirAlegacao(dir, 'a.js', {
    linha: 1,
    conteudo: "spawnSync('nvidia-smi', ['--query-gpu=name,memory.total,utilization.gpu', "
      + "'--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 3000, windowsHide: true })",
  });
  assert.equal(r.bate, true, r.porque);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ABSOLVE: virgula pendente antes do fechador (caso gpu-probe.js:62)', () => {
  const { dir } = bancada([
    "const r = spawnSync('system_profiler', ['SPDisplaysDataType', '-json'], {",
    "  encoding: 'utf8',",
    '  timeout: 3000,',
    '});',
  ].join('\n'));
  const r = conferirAlegacao(dir, 'a.js', {
    linha: 1,
    conteudo: "spawnSync('system_profiler', ['SPDisplaysDataType', '-json'], { encoding: 'utf8', timeout: 3000 })",
  });
  assert.equal(r.bate, true, r.porque);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ABSOLVE: geracao truncada a meio (caso hub-push.js:67)', () => {
  const { dir } = bancada("const hw = JSON.parse(fs.readFileSync(path.join(ROUTER_DIR, 'hw-capability.json'), 'utf8'));");
  const r = conferirAlegacao(dir, 'a.js', {
    linha: 1,
    conteudo: "JSON.parse(fs.readFileSync(path.join(ROUTER_DIR, 'hw-capability.json'), 'utf8')) R",
  });
  assert.equal(r.bate, true, r.porque);
  assert.match(r.porque, /truncada/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('ABSOLVE: continuacao de um bloco de comentario (o `*` nao e a frase)', () => {
  const { dir } = bancada([
    ' * Desktop pode ser outra — medido, 1.33.0 contra 1.49.3, dezasseis versoes de',
    ' * diferenca.',
  ].join('\n'));
  const r = conferirAlegacao(dir, 'a.js', {
    linha: 1, conteudo: 'medido, 1.33.0 contra 1.49.3, dezasseis versoes de diferenca.',
  });
  assert.equal(r.bate, true, r.porque);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('NAO JULGA: parafrase (caso agent.ts:99) sai `null`, nunca "sem evidencia"', () => {
  const { dir } = bancada('  temperature: req.temperature ?? 0,');
  const r = conferirAlegacao(dir, 'a.js', { linha: 1, conteudo: 'temperature = 0' });
  assert.equal(r.bate, null, 'resumir foi o que se lhe pediu — este verificador nao consegue julgar');
  assert.match(r.porque, /parafraseada/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── ACUSAR: o que ele existe para apanhar ───────────────────────────────────

test('ACUSA: a transcricao nao esta em lado nenhum do ficheiro', () => {
  const { dir } = bancada('const agreed = 0;\nconst outro = 1;');
  const r = conferirAlegacao(dir, 'a.js', { linha: 1, conteudo: 'flips_proposed: 0, THEY DIVERGE:' });
  assert.equal(r.bate, false);
  assert.equal(r.linha_errada, false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('SEPARA: transcricao certa, linha errada — balde proprio', () => {
  const { dir } = bancada(['// comentario', '', 'const TIER_MODEL_MAP = buildTierModelMap({});'].join('\n'));
  const r = conferirAlegacao(dir, 'a.js', { linha: 1, conteudo: 'const TIER_MODEL_MAP = buildTierModelMap({});' });
  assert.equal(r.bate, false);
  assert.equal(r.linha_errada, true);
  assert.equal(r.encontrado_na_linha, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('uma linha para la do fim do ficheiro e referencia fabricada', () => {
  const { dir } = bancada('uma linha so');
  const r = conferirAlegacao(dir, 'a.js', { linha: 900, conteudo: 'const qualquer = 1;' });
  assert.equal(r.bate, false);
  assert.match(r.porque, /linha-fora-do-ficheiro/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('um caminho que sai do repo nunca chega ao disco', () => {
  const r = conferirAlegacao('/repo', '../../etc/passwd', { linha: 1, conteudo: 'root:x:0:0:root' });
  assert.equal(r.bate, false);
  assert.equal(r.porque, 'fora-do-repo');
});

test('uma alegacao curta de mais nao discrimina nada — e diz isso', () => {
  const { dir } = bancada('x = 1');
  const r = conferirAlegacao(dir, 'a.js', { linha: 1, conteudo: 'x' });
  assert.equal(r.bate, null);
  assert.equal(r.porque, 'alegacao-curta');
  assert.ok(MIN_ALEGACAO >= 8);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── o recibo inteiro ────────────────────────────────────────────────────────

test('so recibos com achado sao conferidos', () => {
  assert.equal(conferirRecibo({ conclusao: 'sem-achado' }).veredicto, VEREDICTO.NAO_APLICA);
});

test('um achado que nao transcreve nada nao tem o que conferir', () => {
  const v = conferirRecibo(achado({ resultado_resumo: 'ha um problema aqui' }));
  assert.equal(v.veredicto, VEREDICTO.SEM_ALEGACAO);
});

test('UMA alegacao inventada chega para `sem-evidencia`, mesmo com outras a bater', () => {
  const { dir } = bancada('const a = 1;\nconst b = 2;');
  const v = conferirRecibo(
    achado({ resultado_resumo: 'LINE 1: const a = 1; LINE 2: const inventado = 99;' }),
    { raiz: dir },
  );
  assert.equal(v.veredicto, VEREDICTO.SEM);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('so falhas de SITIO dao `linha-errada`, nunca `sem-evidencia`', () => {
  const { dir } = bancada('const b = 2;\nconst a = 1;');
  const v = conferirRecibo(achado({ resultado_resumo: 'LINE 1: const a = 1;' }), { raiz: dir });
  assert.equal(v.veredicto, VEREDICTO.LINHA_ERRADA);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('o campo `evidencia` NAO entra — seria conferir a maquina contra si propria', () => {
  const { dir } = bancada('const a = 1;');
  const v = conferirRecibo(achado({
    resultado_resumo: 'LINE 1: const inventado = 99;',
    evidencia: 'cited: a.js:1 => const a = 1;',
  }), { raiz: dir });
  assert.equal(v.veredicto, VEREDICTO.SEM, 'a evidencia do nosso verificador nao pode absolver o modelo');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('um achado sem ficheiro nao se confere contra nada', () => {
  assert.equal(conferirRecibo({ conclusao: 'achado', resultado_resumo: 'LINE 1: x' }).veredicto,
    VEREDICTO.SEM_ALEGACAO);
});

test('conferirLedger conta os cinco baldes e nao perde recibos', () => {
  const { dir } = bancada('const a = 1;');
  const { contas } = conferirLedger([
    achado({ resultado_resumo: 'LINE 1: const a = 1;' }),
    achado({ resultado_resumo: 'LINE 1: const inventado = 99;' }),
    { conclusao: 'sem-achado' },
  ], { raiz: dir });
  assert.equal(contas[VEREDICTO.BATE], 1);
  assert.equal(contas[VEREDICTO.SEM], 1);
  assert.equal(contas[VEREDICTO.NAO_APLICA], 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── o balde na triagem ──────────────────────────────────────────────────────

test('`sem-evidencia` e motivo de triagem, e e SEPARADO de nao-discrimina', () => {
  assert.ok(MOTIVOS.includes('sem-evidencia'));
  assert.ok(MOTIVOS.includes('instrumento-nao-discrimina'));
  assert.notEqual('sem-evidencia', 'instrumento-nao-discrimina');
});

test('as constantes de tolerancia estao onde se possam discutir', () => {
  assert.equal(JANELA_LINHAS, 8);
  assert.equal(PREFIXO_MIN_PCT, 0.9);
});

// ── o campo chega MESMO ao recibo de uma ronda real ─────────────────────────
//
// Um teste sobre o texto do ficheiro provaria que a linha existe. Nao provaria
// que ela CORRE: a primeira versao desta ligacao ficou depois de um `return` —
// codigo morto que importava, passava nos 112 testes do motor, e nunca escrevia
// campo nenhum. Por isso este teste corre uma ronda.

const { runRound } = await import('./runner-core.mjs');

/** O mesmo repo de bolso que o `runner-core.test.mjs` usa. */
function repoDeBolso() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc-round-'));
  fs.mkdirSync(path.join(dir, 'tools', 'router'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tools', 'router', 'mooter-review.js'),
    `const TIER = 3;\n${'// linha\n'.repeat(80)}`);
  return dir;
}

const ronda = (resposta) => runRound({
  repoRoot: repoDeBolso(),
  pillar: 'P1',
  stopFile: '/nao/existe/STOP', stopPollMs: 60_000,
  clock: () => 0,
  fetchImpl: async () => ({ ok: true, json: async () => ({ response: resposta, eval_count: 21 }) }),
});

test('uma ronda com transcricao CERTA sai `evidencia-bate`', async () => {
  const out = await ronda('ACHADO: o tier esta cravado. LINE 1: const TIER = 3; PROVA: tools/router/mooter-review.js:1');
  assert.equal(out.receipt.conclusao, 'achado');
  assert.equal(out.receipt.evidencia_confere, VEREDICTO.BATE, out.receipt.evidencia_porque);
});

test('uma ronda com transcricao INVENTADA sai `sem-evidencia` — e o recibo diz porque', async () => {
  const out = await ronda('ACHADO: isto rebenta. LINE 1: const NADA_DISTO = 999; PROVA: tools/router/mooter-review.js:1');
  assert.equal(out.receipt.evidencia_confere, VEREDICTO.SEM);
  assert.match(out.receipt.evidencia_porque, /nao existem no ficheiro/);
});

test('e NAO escreve triagem nenhuma — fechar achados sozinho e decisao do dono', async () => {
  // Sem comentarios: a regra citada dentro de um comentario nao e uma violacao —
  // e e exactamente onde `triagem.jsonl` aparece, a explicar porque NAO se escreve.
  const core = fs.readFileSync(new URL('./runner-core.mjs', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(core, /registarDecisao|triagem\.jsonl|registarVarias/,
    'o motor passou a escrever no ledger de triagem — isso e um gesto do dono');
});
