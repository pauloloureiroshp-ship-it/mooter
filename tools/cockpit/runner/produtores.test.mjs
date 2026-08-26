/**
 * produtores.test.mjs
 *
 * O gate da F1 tem duas metades e as duas são testáveis: «os três produzem para
 * a fila com contagem própria no /fleet.json» (aqui) e «0 chamadas de rede
 * durante a corrida (medido)» (em `rede-zero.test.mjs`).
 *
 * O que estes testes existem para impedir, por ordem de gravidade:
 *
 *  1. **Uma segunda definição do esquema.** A chave de um apontamento é
 *     `sha256([file,line,rule,msg])`. Se este ramo re-implementasse essa conta,
 *     um dia as duas divergiam e todas as decisões de triagem do dono ficavam
 *     órfãs. Há um teste que compara, byte a byte, a chave produzida aqui com a
 *     que `apontamentoDoDetector` produz sozinho.
 *  2. **Um zero que ninguém mediu.** Ausência de corrida tem de ser `n/d` com
 *     razão, e nunca uma contagem de zero.
 *  3. **Uma linha inventada.** Os tipos do knip sem posição não podem virar
 *     `line: 1` para caberem no esquema.
 *
 * As fixtures não são inventadas: são recortes de corridas reais feitas a
 * 2026-08-26 contra `ab-audit-subjects/hono`, com os números na origem de cada
 * bloco.
 */

import test from 'node:test';
import path from 'node:path';
import child_process from 'node:child_process';
import assert from 'node:assert/strict';

import {
  ORIGENS, normalizar, porTriarPorOrigem, lerProdutores, escrever, correr, posix,
  spawnVivo, ACHADOS_JSON, MANIFESTO_JSON,
} from './produtores.mjs';
import { produtorJscpd } from './produtor-jscpd.mjs';
import { produtorKnip } from './produtor-knip.mjs';
import { produtorSemgrep } from './produtor-semgrep.mjs';
import { apontamentoDoDetector, LIMITE_TRIAGEM } from './triagem.mjs';
import { buildFleetState } from './fleet-state.mjs';
import {
  traduzir as traduzirSemgrep, normalizarCheckId, paraWsl, comandoWsl, citar,
} from './produtor-semgrep.mjs';
import { traduzir as traduzirJscpd } from './produtor-jscpd.mjs';
import { traduzir as traduzirKnip, TIPOS_COM_LINHA } from './produtor-knip.mjs';

const GERADO = '2026-08-26T12:00:00Z';

function fakeFs(files) {
  return {
    read: (p) => { if (!(p in files)) throw new Error(`ENOENT ${p}`); return files[p]; },
    exists: (p) => p in files,
  };
}

// As leituras reais usam `path.join`, que no Windows devolve `\`. As fixtures
// têm de falar a mesma língua, senão o teste passava por o ficheiro "não existir".
const j = (...p) => path.join(...p);

const bruto = (o) => ({ file: 'src/a.ts', line: 10, rule: 'jscpd/duplicate:typescript', msg: 'x', ...o });

// ── 1. o esquema é IMPORTADO, nunca redefinido ─────────────────────────────

test('a chave sai do esquema de triagem.mjs, não de uma segunda conta feita aqui', () => {
  // Se alguém reescrever a identidade neste ramo, este teste parte no mesmo
  // commit — em vez de partir daqui a três meses, em silêncio, com a fila do
  // dono a ressuscitar decisões já tomadas.
  const b = bruto({});
  const { itens } = normalizar([b], { origem: 'jscpd', geradoEm: GERADO });
  const esperado = apontamentoDoDetector(b, GERADO);
  assert.equal(itens[0].chave, esperado.chave);
  assert.equal(itens[0].escopo, esperado.escopo);
  assert.equal(itens[0].resumo, esperado.resumo);
  assert.deepEqual(itens[0].sev, esperado.sev);
});

test('a origem do produtor sobrepõe-se, e é o único campo sobreposto', () => {
  const { itens } = normalizar([bruto({})], { origem: 'jscpd', geradoEm: GERADO });
  assert.equal(itens[0].origem, 'jscpd');
  assert.equal(itens[0].tipo, 'apontamento-regex', 'o resto do esquema fica intacto');
});

test('o que o esquema recusa é CONTADO, não engolido', () => {
  // `apontamentoDoDetector` devolve `null` em silêncio. Silêncio foi o que
  // deixou o modo ANCORADO correr zero vezes em 10 624 recibos.
  const { itens, aceites, rejeitados, amostraRejeitada } = normalizar([
    bruto({}),
    bruto({ line: 0 }),
    bruto({ line: 1.5 }),
    bruto({ rule: '' }),
    bruto({ file: '  ' }),
  ], { origem: 'knip', geradoEm: GERADO });
  assert.equal(itens.length, 1);
  assert.equal(aceites, 1);
  assert.equal(rejeitados, 4);
  assert.equal(amostraRejeitada.length, 3, 'a amostra viaja para o manifesto para se poder ver o que caiu');
});

test('uma origem fora da lista fechada é recusada à cabeça', () => {
  assert.throws(() => normalizar([bruto({})], { origem: 'eslint' }), /origem desconhecida/);
  assert.deepEqual(ORIGENS, ['semgrep', 'jscpd', 'knip']);
});

// ── 2. contagem própria por origem ─────────────────────────────────────────

test('cada origem tem a sua contagem, e as decisões já tomadas saem da fila', () => {
  const itens = [
    ...normalizar([bruto({ line: 1 }), bruto({ line: 2 })], { origem: 'semgrep', geradoEm: GERADO }).itens,
    ...normalizar([bruto({ line: 3 })], { origem: 'jscpd', geradoEm: GERADO }).itens,
    ...normalizar([bruto({ line: 4 })], { origem: 'knip', geradoEm: GERADO }).itens,
  ];
  const decididos = new Map([[itens[0].chave, { decisao: 'aceite' }]]);
  const { porOrigem, total, fila } = porTriarPorOrigem(itens, decididos);

  assert.deepEqual(porOrigem.semgrep, { apontamentos: 2, por_triar: 1, decididos: 1 });
  assert.deepEqual(porOrigem.jscpd, { apontamentos: 1, por_triar: 1, decididos: 0 });
  assert.deepEqual(porOrigem.knip, { apontamentos: 1, por_triar: 1, decididos: 0 });
  assert.equal(total, 3);
  assert.equal(fila.length, 3);
});

test('o tecto da fila é POR ORIGEM — 50 clones do jscpd não podem tapar o semgrep', () => {
  // O mesmo defeito que o `buildFleetState` já corrigiu entre o detector e os
  // recibos. Com um tecto único e o jscpd a produzir 904 clones (medido em
  // hono/src), o semgrep desaparecia da fila sem ninguém dar por isso.
  const muitos = normalizar(
    Array.from({ length: 60 }, (_, i) => bruto({ line: i + 1 })),
    { origem: 'jscpd', geradoEm: GERADO },
  ).itens;
  const um = normalizar([bruto({ file: 'src/z.ts', line: 9, rule: 'semgrep/x' })], { origem: 'semgrep', geradoEm: GERADO }).itens;
  const { fila, porOrigem } = porTriarPorOrigem([...muitos, ...um], new Map());

  assert.equal(porOrigem.jscpd.por_triar, 60, 'a CONTAGEM não é cortada pelo tecto');
  assert.equal(fila.filter((i) => i.origem === 'jscpd').length, LIMITE_TRIAGEM);
  assert.equal(fila.filter((i) => i.origem === 'semgrep').length, 1, 'o semgrep sobrevive ao jscpd');
});

test('o mesmo apontamento duas vezes conta uma — a chave é a identidade', () => {
  const itens = normalizar([bruto({}), bruto({})], { origem: 'knip', geradoEm: GERADO }).itens;
  assert.equal(porTriarPorOrigem(itens, new Map()).porOrigem.knip.apontamentos, 1);
});

// ── 3. o que o /fleet.json publica: n/d nunca vira zero ────────────────────

const manifestoOk = (n, extra = {}) => JSON.stringify({
  gerado_em: GERADO,
  repo: '/repo',
  apontamentos: n,
  origens: {
    semgrep: { estado: 'ok', brutos: 1, rejeitados: 0, ms: 28740 },
    jscpd: { estado: 'ok', brutos: 904, rejeitados: 0, ms: 315 },
    knip: { estado: 'falhou', porque: 'knip sem --knip', brutos: null, rejeitados: null, ms: 1 },
  },
  rede: { rede_zero: true, porque: '0 tentativas' },
  ...extra,
});

test('sem corrida nenhuma, os produtores são n/d COM RAZÃO — nunca zero', () => {
  const fs_ = fakeFs({});
  const p = lerProdutores({ baseDir: '/base', repoRoot: '/repo', readImpl: fs_.read, existsImpl: fs_.exists });
  assert.equal(p.estado, 'n/d');
  assert.equal(p.apontamentos, null, 'zero medido e nada medido são afirmações diferentes');
  assert.equal(p.rede_zero, null);
  assert.match(p.porque, /missing/);
});

test('contagem do manifesto em desacordo com os achados é n/d, não a média das duas', () => {
  const itens = normalizar([bruto({})], { origem: 'jscpd', geradoEm: GERADO }).itens;
  const fs_ = fakeFs({
    [j('/base', ACHADOS_JSON)]: JSON.stringify(itens),
    [j('/base', MANIFESTO_JSON)]: manifestoOk(99),
  });
  const p = lerProdutores({ baseDir: '/base', repoRoot: '/repo', readImpl: fs_.read, existsImpl: fs_.exists });
  assert.equal(p.estado, 'n/d');
  assert.match(p.porque, /disagrees/);
});

test('uma corrida de outro sujeito não entra por proximidade no disco', () => {
  const itens = normalizar([bruto({})], { origem: 'jscpd', geradoEm: GERADO }).itens;
  const fs_ = fakeFs({
    [j('/base', ACHADOS_JSON)]: JSON.stringify(itens),
    [j('/base', MANIFESTO_JSON)]: manifestoOk(1),
  });
  const p = lerProdutores({ baseDir: '/base', repoRoot: '/outro-repo', readImpl: fs_.read, existsImpl: fs_.exists });
  assert.equal(p.estado, 'n/d');
  assert.match(p.porque, /another repository/);
});

test('o rede_zero da corrida viaja tal e qual — um `null` não se arredonda para `true`', () => {
  const itens = normalizar([bruto({})], { origem: 'jscpd', geradoEm: GERADO }).itens;
  const fs_ = fakeFs({
    [j('/base', ACHADOS_JSON)]: JSON.stringify(itens),
    [j('/base', MANIFESTO_JSON)]: manifestoOk(1, { rede: { rede_zero: null, porque: '1 filho sem medição' } }),
  });
  const p = lerProdutores({ baseDir: '/base', repoRoot: '/repo', readImpl: fs_.read, existsImpl: fs_.exists });
  assert.equal(p.estado, 'ok');
  assert.equal(p.rede_zero, null);
  assert.match(p.rede_porque, /sem medição/);
});

test('uma ferramenta que FALHOU fica visível com o seu estado, não some numa soma', () => {
  const itens = normalizar([bruto({})], { origem: 'jscpd', geradoEm: GERADO }).itens;
  const fs_ = fakeFs({
    [j('/base', ACHADOS_JSON)]: JSON.stringify(itens),
    [j('/base', MANIFESTO_JSON)]: manifestoOk(1),
  });
  const p = lerProdutores({ baseDir: '/base', repoRoot: '/repo', readImpl: fs_.read, existsImpl: fs_.exists });
  assert.equal(p.origens.knip.estado, 'falhou');
  assert.equal(p.origens.knip.apontamentos, 0);
  assert.match(p.origens.knip.porque, /sem --knip/);
  assert.equal(p.origens.jscpd.brutos, 904, 'quantos a ferramenta emitiu ≠ quantos entraram no esquema');
  assert.equal(p.origens.jscpd.apontamentos, 1);
});

test('/fleet.json publica o bloco por origem e soma-o ao por_triar', () => {
  const itens = [
    ...normalizar([bruto({ line: 1 })], { origem: 'semgrep', geradoEm: GERADO }).itens,
    ...normalizar([bruto({ line: 2 })], { origem: 'jscpd', geradoEm: GERADO }).itens,
  ];
  const fs_ = fakeFs({
    '/ledger': '', '/state': '{}',
    [j('/base', 'ancora-achados.json')]: '[]',
    [j('/base', 'ancora-manifesto.json')]: JSON.stringify({ repo: '/repo', apontamentos: 0, gerado_em: GERADO, ficheiros_no_ambito: 3 }),
    [j('/base', ACHADOS_JSON)]: JSON.stringify(itens),
    [j('/base', MANIFESTO_JSON)]: manifestoOk(2),
  });
  const s = buildFleetState({
    ledgerPath: '/ledger', statePath: '/state', stopFile: '/STOP',
    baseDir: '/base', repoRoot: '/repo', now: Date.parse(GERADO),
    readImpl: fs_.read, existsImpl: fs_.exists,
  });
  assert.equal(s.triagem.produtores.estado, 'ok');
  assert.equal(s.triagem.produtores.origens.semgrep.por_triar, 1);
  assert.equal(s.triagem.produtores.origens.jscpd.por_triar, 1);
  assert.equal(s.triagem.produtores.origens.knip.por_triar, 0);
  assert.equal(s.triagem.produtores.rede_zero, true);
  assert.equal(s.triagem.por_triar, 2, 'os produtores entram no total, não ficam numa gaveta');
  assert.equal(s.alerta_achados, true);
  assert.equal(s.por_triar.length, 2, 'e chegam mesmo à fila do painel');
});

test('sem ficheiro de produtores o /fleet.json não muda de comportamento', () => {
  // A regressão que este teste tranca: acrescentar um bloco novo ao painel não
  // pode alterar o total nem o alerta de quem nunca correu os produtores.
  const fs_ = fakeFs({
    '/ledger': '', '/state': '{}',
    [j('/base', 'ancora-achados.json')]: '[]',
    [j('/base', 'ancora-manifesto.json')]: JSON.stringify({ repo: '/repo', apontamentos: 0, gerado_em: GERADO, ficheiros_no_ambito: 3 }),
  });
  const s = buildFleetState({
    ledgerPath: '/ledger', statePath: '/state', stopFile: '/STOP',
    baseDir: '/base', repoRoot: '/repo', now: Date.parse(GERADO),
    readImpl: fs_.read, existsImpl: fs_.exists,
  });
  assert.equal(s.triagem.produtores.estado, 'n/d');
  assert.equal(s.triagem.por_triar, 0);
  assert.equal(s.alerta_achados, false);
});

// ── 4. semgrep ─────────────────────────────────────────────────────────────

test('MORDIDA · o check_id poluído pelo caminho das regras é normalizado', () => {
  // Id REAL, copiado de uma corrida de 2026-08-26 sobre hono/src (312 ficheiros,
  // 90 regras, 28,7 s, 1 achado). Sem esta normalização, mudar a pasta das regras
  // dava chave nova a cada apontamento e ressuscitava tudo o que já fosse triado.
  const idReal = 'mnt.c.Users.PAULOL1.AppData.Local.Temp.claude.C--Users-Paulo-Loureiro-frugal--claude-worktrees-moo-pilot-f0-reconcile-560df1.c25deb1f-5122-4068-add2-e23d9cbe6862.scratchpad.onda.regras-semgrep.javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag';
  const dir = 'C:/Users/PAULOL~1/AppData/Local/Temp/claude/C--Users-Paulo-Loureiro-frugal--claude-worktrees-moo-pilot-f0-reconcile-560df1/c25deb1f-5122-4068-add2-e23d9cbe6862/scratchpad/onda/regras-semgrep';
  assert.equal(
    normalizarCheckId(idReal, dir),
    'javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag',
  );
  // E a identidade tem mesmo de deixar de depender do sítio das regras:
  const outroSitio = 'D:/regras/regras-semgrep';
  assert.equal(normalizarCheckId(idReal, outroSitio), normalizarCheckId(idReal, dir));
});

test('semgrep · a saída --json vira {file,line,rule,msg} com os campos medidos', () => {
  const json = {
    version: '1.174.0',
    results: [{
      check_id: 'regras-semgrep.javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag',
      path: 'src/jsx/components.ts',
      start: { line: 234, col: 46 },
      end: { line: 234, col: 55 },
      extra: {
        message: "Cannot determine what 'callbacks' is and it is used with a\n'<script>' tag. This could be susceptible to cross-site scripting (XSS).",
        severity: 'WARNING',
      },
    }],
    paths: { scanned: ['a', 'b'] },
  };
  const [b] = traduzirSemgrep(json, { dirRegras: '/x/regras-semgrep' });
  assert.equal(b.file, 'src/jsx/components.ts');
  assert.equal(b.line, 234);
  assert.equal(b.rule, 'semgrep/javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag');
  assert.ok(!b.msg.includes('\n'), 'o enunciado chega ao juiz numa linha só');
  assert.ok(apontamentoDoDetector(b, GERADO), 'e tem de passar o esquema');
});

test('semgrep · um resultado sem linha utilizável é descartado, não remendado', () => {
  assert.equal(traduzirSemgrep({ results: [{ check_id: 'x', path: 'a.ts', start: {}, extra: {} }] }).length, 0);
});

test('semgrep · o comando embrulha o semgrep no namespace, não o bash', () => {
  const c = comandoWsl({ raiz: 'C:/r', dirRegras: 'C:/g/regras', alvo: 'src' });
  assert.match(c, /^cd '\/mnt\/c\/r' && unshare -rn semgrep scan /);
  assert.match(c, /--metrics=off/);
  assert.equal((c.match(/--config /g) || []).length, 4, 'os quatro conjuntos de §2.1, nem mais nem menos');
  assert.doesNotMatch(c, /--config p\//, 'nenhum --config remoto: o pré-registo congela a cópia local');
  assert.match(comandoWsl({ raiz: 'C:/r', dirRegras: 'C:/g', usarUnshare: false }), /&& semgrep scan/);
});

test('semgrep · caminhos do Windows atravessam para o WSL e as aspas aguentam espaços', () => {
  assert.equal(paraWsl('C:/Users/Paulo Loureiro/x'), '/mnt/c/Users/Paulo Loureiro/x');
  assert.equal(paraWsl('C:\\Users\\a'), '/mnt/c/Users/a');
  assert.equal(citar("/a b/c"), "'/a b/c'");
});

// ── 5. jscpd ───────────────────────────────────────────────────────────────

test('jscpd · um clone dá UM apontamento, e o outro lado viaja no enunciado', () => {
  // Entrada real do relatório de 2026-08-26 (904 clones em hono/src). Emitir os
  // dois lados duplicaria a fila para 1808 e pediria dois julgamentos para a
  // mesma decisão.
  const relatorio = {
    duplicates: [{
      format: 'typescript', lines: 15, tokens: 50,
      firstFile: { name: 'adapter\\aws-lambda\\handler.test.ts', start: 347, startLoc: { line: 347 }, endLoc: { line: 361 } },
      secondFile: { name: 'adapter\\aws-lambda\\handler.test.ts', start: 387, startLoc: { line: 387 }, endLoc: { line: 401 } },
    }],
    statistics: { total: { clones: 904, duplicatedLines: 12150, percentage: 15.428375512691902 } },
  };
  const b = traduzirJscpd(relatorio, { raizVarrida: 'C:/s/hono/src' });
  assert.equal(b.length, 1);
  assert.equal(b[0].file, 'C:/s/hono/src/adapter/aws-lambda/handler.test.ts', 'as barras invertidas do jscpd não sobrevivem');
  assert.equal(b[0].line, 347);
  assert.equal(b[0].rule, 'jscpd/duplicate:typescript');
  assert.match(b[0].msg, /15 linhas \(50 tokens\) duplicadas com .*handler\.test\.ts:387-401/);
  assert.ok(apontamentoDoDetector(b[0], GERADO));
});

test('jscpd · um clone sem posição legível é descartado em vez de ancorado à toa', () => {
  assert.equal(traduzirJscpd({ duplicates: [{ format: 'ts', firstFile: { name: 'a.ts' }, secondFile: { name: 'b.ts' } }] }).length, 0);
});

// ── 6. knip ────────────────────────────────────────────────────────────────

test('MORDIDA · knip sem posição NÃO vira linha 1 — é contado à parte', () => {
  // Medido no relatório real: COM linha exports 24 · types 22 · devDependencies 16;
  // SEM linha files 83 · binaries 12. Carimbar os 95 sem-linha com `line: 1`
  // fá-los-ia caber no esquema e gastaria o julgamento do dono num sítio que
  // ninguém mediu.
  const relatorio = {
    issues: [
      { file: 'src/utils/html.ts', exports: [{ name: 'booleanAttributes', line: 85, col: 14 }], types: [], files: [] },
      { file: 'src/compose.test.ts', exports: [], files: [{ name: 'src/compose.test.ts' }], binaries: [] },
      { file: 'package.json', devDependencies: [{ name: 'msw', line: 689 }], binaries: [{ name: 'tsc' }, { name: 'np' }] },
    ],
  };
  const { brutos, semLinha } = traduzirKnip(relatorio);
  assert.equal(brutos.length, 2);
  assert.ok(!brutos.some((b) => b.line === 1), 'nenhuma linha foi inventada');
  assert.deepEqual(semLinha, { files: 1, binaries: 2 });
  assert.deepEqual(brutos[0], {
    file: 'src/utils/html.ts', line: 85, rule: 'knip/exports',
    msg: "export 'booleanAttributes' sem qualquer utilizador no projecto",
  });
  assert.equal(brutos[1].rule, 'knip/devDependencies');
  for (const b of brutos) assert.ok(apontamentoDoDetector(b, GERADO));
});

test('knip · os tipos com posição medidos no relatório real estão todos previstos', () => {
  for (const t of ['exports', 'types', 'devDependencies']) {
    assert.ok(TIPOS_COM_LINHA.includes(t), `${t} tinha linha na medição e tem de estar previsto`);
  }
});

// ── 6b. o ponto de registo dos filhos não pode ser contornado ───────────

test('MORDIDA · o spawn dos adaptadores é lido VIVO, senão passa ao lado da medição', () => {
  // A falha real, apanhada a correr e não a ler (2026-08-26): com
  // `spawnImpl = spawn` capturado no carregamento do módulo, o jscpd e o knip
  // nasceram, correram e não apareceram em `auditoria.filhos` — e a corrida
  // imprimiu `rede_zero: true` com dois processos por medir. Este teste troca o
  // `child_process.spawn` à quente, exactamente como a instrumentação faz, e
  // exige que os adaptadores VEJAM a troca.
  const original = child_process.spawn;
  let visto = 0;
  child_process.spawn = () => { visto += 1; throw new Error('sentinela'); };
  try {
    assert.throws(() => spawnVivo('x', []), /sentinela/);
    assert.equal(visto, 1, 'um spawn capturado no import nunca teria chegado à sentinela');
  } finally { child_process.spawn = original; }

  // E os três adaptadores têm de estar mesmo pendurados nesse indirecto.
  for (const p of [produtorJscpd({ bin: 'x' }), produtorKnip({ bin: 'x' }), produtorSemgrep({ dirRegras: 'x' })]) {
    assert.ok(p.correr, `${p.id} tem de expor correr`);
  }
  const fonte = [produtorJscpd, produtorKnip, produtorSemgrep].map((f) => f.toString()).join(' | ');
  assert.doesNotMatch(fonte, /spawnImpl = spawn[,)\s]/, 'nenhum adaptador pode voltar a capturar o spawn no import');
  assert.equal((fonte.match(/spawnImpl = spawnVivo/g) || []).length, 3, 'os tres, sem excepcao');
});

// ── 7. a corrida completa ──────────────────────────────────────────────────

const produtorFalso = (origem, brutos, meta = {}) => ({
  id: origem, origem, correr: async () => ({ brutos, meta }),
});

test('correr junta as três origens num só manifesto, com a auditoria de rede colada', async () => {
  const { itens, manifesto, auditoria } = await correr({
    raiz: 'C:/r',
    agora: Date.parse(GERADO),
    produtores: [
      produtorFalso('semgrep', [bruto({ line: 1, rule: 'semgrep/a' })], { versao: '1.174.0' }),
      produtorFalso('jscpd', [bruto({ line: 2 })]),
      produtorFalso('knip', [bruto({ line: 3, rule: 'knip/exports' })]),
    ],
    opcoesRede: { sondaImpl: async () => ({ remotos: [], udp: 0 }) },
  });

  assert.equal(itens.length, 3);
  assert.deepEqual(manifesto.por_origem, { semgrep: 1, jscpd: 1, knip: 1 });
  assert.equal(manifesto.repo, 'C:/r');
  assert.equal(manifesto.origens.semgrep.versao, '1.174.0', 'o meta de cada adaptador chega ao manifesto');
  assert.equal(auditoria.rede_zero, true, 'produtores que não spawnam nada e não ligam a lado nenhum');
  assert.equal(manifesto.rede.rede_zero, true);
});

test('um produtor que rebenta não leva os outros atrás — a falha é um resultado', async () => {
  const { itens, manifesto } = await correr({
    raiz: 'C:/r',
    agora: Date.parse(GERADO),
    produtores: [
      { id: 'semgrep', origem: 'semgrep', correr: async () => { throw new Error('wsl.exe não encontrado'); } },
      produtorFalso('jscpd', [bruto({ line: 2 })]),
      produtorFalso('knip', []),
    ],
    opcoesRede: { sondaImpl: async () => ({ remotos: [], udp: 0 }) },
  });
  assert.equal(manifesto.origens.semgrep.estado, 'falhou');
  assert.match(manifesto.origens.semgrep.porque, /wsl\.exe/);
  assert.equal(manifesto.origens.jscpd.estado, 'ok');
  assert.equal(manifesto.origens.knip.aceites, 0, 'zero AFIRMADO é diferente de não ter corrido');
  assert.equal(itens.length, 1);
});

test('escrever/ler fecham o ciclo: o que sai da corrida é o que o painel lê', () => {
  const escritos = {};
  const { itens, manifesto } = { itens: normalizar([bruto({})], { origem: 'jscpd', geradoEm: GERADO }).itens, manifesto: JSON.parse(manifestoOk(1)) };
  escrever({
    dir: '/base', itens, manifesto,
    writeImpl: (p, c) => { escritos[posix(p)] = c; },
    mkdirImpl: () => {},
  });
  const fs_ = fakeFs(escritos);
  const p = lerProdutores({
    baseDir: '/base', repoRoot: '/repo',
    readImpl: (x) => fs_.read(posix(x)), existsImpl: (x) => fs_.exists(posix(x)),
  });
  assert.equal(p.estado, 'ok');
  assert.equal(p.apontamentos, 1);
  assert.equal(p.por_triar, 1);
});
