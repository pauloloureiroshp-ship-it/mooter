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

import { fileURLToPath } from 'node:url';
import {
  ORIGENS, normalizar, porTriarPorOrigem, lerProdutores, escrever, correr, posix,
  spawnVivo, ACHADOS_JSON, MANIFESTO_JSON,
  estadoDaCorrida, saudeDaOrigem, redeNaoVacua,
} from './produtores.mjs';
import { produtorJscpd } from './produtor-jscpd.mjs';
import { produtorKnip } from './produtor-knip.mjs';
import { produtorSemgrep } from './produtor-semgrep.mjs';
import { apontamentoDoDetector, LIMITE_TRIAGEM } from './triagem.mjs';
import { buildFleetState } from './fleet-state.mjs';
import {
  traduzir as traduzirSemgrep, normalizarCheckId, paraWsl, comandoWsl, argvWsl, citar,
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
  assert.equal(itens[0].resumo, esperado.resumo);
  assert.equal(itens[0].ficheiro, esperado.ficheiro);
  assert.equal(itens[0].janela, esperado.janela);
  assert.equal(itens[0].regra, esperado.regra);
});

test('MORDIDA · a sobreposição toca nos RÓTULOS e em nenhum campo da identidade', () => {
  // A regra antiga («só a `origem` é sobreposta») deixava quatro campos a mentir
  // sobre o instrumento: `tipo: 'apontamento-regex'`, `escopo: 'regex:…'`,
  // `evidencia: '… · regex …'` e `sev.porque: 'deterministic regex pointer'`.
  // O jscpd é um detector de clones por tokens e o knip é análise de grafo de
  // módulos — nenhum dos dois é uma regex, e o dono lê essas quatro linhas.
  //
  // O que NÃO pode mudar são os quatro campos que entram no hash. Se alguém
  // sobrepuser um deles, a chave muda e as decisões de triagem do dono ficam
  // órfãs — e este teste parte no mesmo commit.
  const b = bruto({});
  const { itens } = normalizar([b], { origem: 'jscpd', geradoEm: GERADO });
  const esperado = apontamentoDoDetector(b, GERADO);
  const i = itens[0];

  assert.equal(i.chave, esperado.chave, 'a IDENTIDADE não se mexe');
  assert.equal(i.origem, 'jscpd');
  assert.equal(i.tipo, 'apontamento-linter', 'não é um apontamento de regex');
  assert.equal(i.escopo, 'jscpd:jscpd/duplicate:typescript');
  assert.match(i.evidencia, /· jscpd jscpd\/duplicate:typescript$/);
  assert.doesNotMatch(i.evidencia, /regex/, 'o instrumento no ecrã tem de ser o verdadeiro');
  assert.doesNotMatch(i.sev.porque, /regex/);
  assert.match(i.sev.porque, /no GPU and no model/);
  assert.equal(i.sev.k, esperado.sev.k, 'a severidade do esquema mantém-se: só a frase muda');
  assert.equal(i.sev.n, esperado.sev.n);
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
    semgrep: { estado: 'ok', brutos: 1, emitidos: 1, rejeitados: 0, ms: 28740 },
    jscpd: { estado: 'ok', brutos: 904, emitidos: 904, rejeitados: 0, ms: 315 },
    knip: { estado: 'falhou', porque: 'knip sem --knip', brutos: null, rejeitados: null, ms: 1 },
  },
  rede: { rede_zero: true, porque: '0 tentativas' },
  ...extra,
});

/** As três limpas. Serve os testes em que o que se julga não é a falha. */
const manifestoTresOk = (n, extra = {}) => JSON.stringify({
  gerado_em: GERADO,
  repo: '/repo',
  apontamentos: n,
  origens: {
    semgrep: { estado: 'ok', brutos: 1, emitidos: 1, rejeitados: 0, ms: 28740 },
    jscpd: { estado: 'ok', brutos: 904, emitidos: 904, rejeitados: 0, ms: 315 },
    knip: { estado: 'ok', brutos: 62, emitidos: 250, descartados_pelo_adaptador: 188, rejeitados: 0, ms: 1118, sem_linha: { files: 176, binaries: 12 } },
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
  assert.equal(p.leitura, 'ok', 'o ficheiro é legível');
  assert.equal(p.estado, 'parcial', 'mas o knip não correu — e são perguntas diferentes');
  assert.equal(p.rede_zero, null);
  assert.match(p.rede_porque, /sem medição/);
});

test('MORDIDA · uma ferramenta que FALHOU não tem contagem — `null`, nunca zero', () => {
  // A doutrina do próprio ficheiro («não medido nunca é zero medido») estava
  // aplicada ao `brutos` e violada nos outros três, com o teste antigo a segurar
  // a violação: assere `apontamentos === 0` para uma ferramenta que rebentou.
  const itens = normalizar([bruto({})], { origem: 'jscpd', geradoEm: GERADO }).itens;
  const fs_ = fakeFs({
    [j('/base', ACHADOS_JSON)]: JSON.stringify(itens),
    [j('/base', MANIFESTO_JSON)]: manifestoOk(1),
  });
  const p = lerProdutores({ baseDir: '/base', repoRoot: '/repo', readImpl: fs_.read, existsImpl: fs_.exists });
  assert.equal(p.origens.knip.estado, 'falhou');
  assert.equal(p.origens.knip.apontamentos, null, 'zero afirmado por uma ferramenta que não olhou');
  assert.equal(p.origens.knip.por_triar, null);
  assert.equal(p.origens.knip.decididos, null);
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
    [j('/base', MANIFESTO_JSON)]: manifestoTresOk(2),
  });
  const s = buildFleetState({
    ledgerPath: '/ledger', statePath: '/state', stopFile: '/STOP',
    baseDir: '/base', repoRoot: '/repo', now: Date.parse(GERADO),
    readImpl: fs_.read, existsImpl: fs_.exists,
  });
  assert.equal(s.triagem.produtores.estado, 'ok');
  assert.equal(s.triagem.produtores.ferramentas_ok, 3);
  assert.equal(s.triagem.produtores.origens.semgrep.por_triar, 1);
  assert.equal(s.triagem.produtores.origens.jscpd.por_triar, 1);
  assert.equal(s.triagem.produtores.origens.knip.por_triar, 0, 'o knip correu e não achou nada: zero MEDIDO');
  assert.deepEqual(s.triagem.produtores.origens.knip.sem_linha, { files: 176, binaries: 12 },
    'o denominador que o cabeçalho do adaptador prometia por escrito chega mesmo ao /fleet.json');
  assert.equal(s.triagem.produtores.origens.knip.emitidos, 250);
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
  const [b] = traduzirSemgrep(json, { dirRegras: '/x/regras-semgrep' }).brutos;
  assert.equal(b.file, 'src/jsx/components.ts');
  assert.equal(b.line, 234);
  assert.equal(b.rule, 'semgrep/javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag');
  assert.ok(!b.msg.includes('\n'), 'o enunciado chega ao juiz numa linha só');
  assert.ok(apontamentoDoDetector(b, GERADO), 'e tem de passar o esquema');
});

test('semgrep · um resultado sem linha utilizável é descartado, CONTADO, não remendado', () => {
  const r = traduzirSemgrep({ results: [{ check_id: 'x', path: 'a.ts', start: {}, extra: {} }] });
  assert.equal(r.brutos.length, 0);
  assert.equal(r.descartados, 1);
  assert.equal(r.emitidos, 1);
});

test('MORDIDA · o namespace embrulha o BASH DE LOGIN, não só o semgrep', () => {
  // A versão anterior punha `unshare -rn` dentro da string, a envolver só o
  // `semgrep scan`. Ficava de fora o `bash -lc` — e `-l` é um shell de LOGIN,
  // que lê /etc/profile, /etc/profile.d/* e ~/.profile com eth0 UP e rota
  // default. Essa parte da corrida tinha como única «medição» a tabela de
  // sockets do Windows, que não vê para dentro da VM: o zero cego que o
  // cabeçalho do próprio adaptador condena.
  //
  // MEDIDO a 2026-08-26 com o namespace por fora:
  //   wsl.exe -- unshare -rn bash -lc 'ip -o link show; command -v semgrep'
  //   1: lo: <LOOPBACK> ... state DOWN        (fora: lo UP + eth0 UP + rota)
  //   /home/paulo/.local/bin/semgrep          (o PATH do login sobrevive)
  const c = comandoWsl({ raiz: 'C:/r', dirRegras: 'C:/g/regras', alvo: 'src' });
  assert.doesNotMatch(c, /unshare/, 'o namespace saiu da string e foi para o argv');
  assert.match(c, /^cd '\/mnt\/c\/r' && semgrep scan /);
  assert.match(c, /--metrics=off/);
  assert.equal((c.match(/--config /g) || []).length, 4, 'os quatro conjuntos de §2.1, nem mais nem menos');
  assert.doesNotMatch(c, /--config p\//, 'nenhum --config remoto: o pré-registo congela a cópia local');

  assert.deepEqual(argvWsl('X'), ['--', 'unshare', '-rn', 'bash', '-lc', 'X'],
    'o unshare tem de estar ANTES do bash, senão o login corre com rede');
  assert.deepEqual(argvWsl('X', { usarUnshare: false }), ['--', 'bash', '-lc', 'X']);
});

test('MORDIDA · um wsl.exe é UM registo, não dois — a cardinalidade não se infla', async () => {
  // «5 filhos, TODOS medidos» tinha denominador 4: o processo do semgrep contava
  // duas vezes, uma como `sondado` (a leitura cega da tabela de sockets do
  // Windows) e outra como `bloqueado` (a prova a sério, num registo sintético).
  const nascidos = [];
  // O falso PASSA pelo `child_process.spawn` vivo de propósito: é o ponto de
  // registo do `rede-zero.mjs`, e o que se julga aqui é quantos registos saem.
  const RESPOSTA = '{"results":[],"paths":{"scanned":["a"]},"errors":[]}';
  const spawnFalso = (cmd, args, opts) => {
    nascidos.push({ cmd, args });
    // A sonda de disponibilidade pede `echo SIM`; a corrida pede o semgrep.
    const diz = String(args[args.length - 1]).includes('echo SIM') ? 'SIM' : RESPOSTA;
    return child_process.spawn(
      process.execPath,
      ['-e', `process.stdout.write(${JSON.stringify(diz)})`],
      opts,
    );
  };
  const { manifesto, auditoria } = await correr({
    raiz: 'C:/r',
    agora: Date.parse(GERADO),
    produtores: [produtorSemgrep({ dirRegras: 'C:/g/regras', spawnImpl: spawnFalso })],
    opcoesRede: { sondaImpl: async () => ({ remotos: [], udp: 0 }), registo: null },
  });
  assert.equal(nascidos.length, 2, 'dois processos de wsl.exe nascem: a sonda e a corrida');
  assert.equal(auditoria.filhos.length, 2, 'e dois registos — nem mais, nem sintéticos');
  for (const f of auditoria.filhos) {
    assert.equal(f.sonda.estado, 'bloqueado');
    assert.match(f.sonda.porque, /bash de login incluído/);
  }
  assert.equal(manifesto.rede.rede_zero, true);
  assert.doesNotMatch(manifesto.rede.porque, /sondado/,
    'nenhum wsl.exe pode ficar em `sondado`: essa tabela não vê para dentro da VM');
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
  const { brutos: b } = traduzirJscpd(relatorio, { alvo: 'src' });
  assert.equal(b.length, 1);
  assert.equal(b[0].file, 'src/adapter/aws-lambda/handler.test.ts', 'as barras invertidas do jscpd não sobrevivem');
  assert.equal(b[0].line, 347);
  assert.equal(b[0].rule, 'jscpd/duplicate:typescript');
  assert.match(b[0].msg, /15 linhas \(50 tokens\) duplicadas com .*handler\.test\.ts:387-401/);
  assert.ok(apontamentoDoDetector(b[0], GERADO));
});

test('MORDIDA · a chave do jscpd não pode depender da máquina onde correu', () => {
  // Medido no artefacto commitado: 972/972 apontamentos do jscpd com CAMINHO
  // ABSOLUTO desta máquina, contra 0/4 do semgrep e 0/62 do knip. O `file` é o
  // primeiro elemento do hash de identidade, portanto o mesmo clone dava chaves
  // diferentes em máquinas diferentes:
  //     Windows  detector:ancora:43acb45a2b000fef
  //     Mac      detector:ancora:df2a786817c98df9   ← chave nova
  // O projecto corre em duas máquinas por canon: a primeira corrida no Mac
  // orfanava 93,6% das decisões de triagem do dono.
  const relatorio = {
    duplicates: [{
      format: 'typescript', lines: 15, tokens: 50,
      firstFile: { name: 'adapter\\aws-lambda\\handler.test.ts', startLoc: { line: 347 }, endLoc: { line: 361 } },
      secondFile: { name: 'adapter\\aws-lambda\\handler.test.ts', startLoc: { line: 387 }, endLoc: { line: 401 } },
    }],
  };
  const chave = (alvo) => apontamentoDoDetector(traduzirJscpd(relatorio, { alvo }).brutos[0], GERADO).chave;
  // O `alvo` é o sub-caminho DENTRO do repositório e é parte legítima da
  // identidade; o que não pode lá estar é a máquina, o utilizador ou a pasta.
  assert.equal(chave('src'), chave('src'));
  const b = traduzirJscpd(relatorio, { alvo: 'src' }).brutos[0];
  assert.doesNotMatch(b.file, /^[A-Za-z]:/, 'nenhuma letra de unidade do Windows na identidade');
  assert.doesNotMatch(b.file, /Users|home/, 'e nenhum home directory a viajar para dentro do painel');
  assert.equal(b.file, 'src/adapter/aws-lambda/handler.test.ts');
  assert.equal(traduzirJscpd(relatorio, { alvo: '.' }).brutos[0].file, 'adapter/aws-lambda/handler.test.ts');
});

test('jscpd · um clone sem posição legível é descartado, CONTADO, e não ancorado à toa', () => {
  // O `rejeitados` do manifesto mede o filtro do ESQUEMA; um clone que morre
  // aqui atrás nunca lá chega. Sem este contador, `rejeitados: 0` não provava
  // que nada se tinha perdido.
  const r = traduzirJscpd({ duplicates: [
    { format: 'ts', firstFile: { name: 'a.ts' }, secondFile: { name: 'b.ts' } },
    { format: 'ts', firstFile: { name: 'a.ts', startLoc: { line: 0 } }, secondFile: { name: 'b.ts' } },
  ] });
  assert.equal(r.brutos.length, 0);
  assert.equal(r.descartados, 2, 'dois clones perdidos não podem sair como zero perdidos');
  assert.equal(r.emitidos, 2);
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
  const { itens, manifesto } = { itens: normalizar([bruto({})], { origem: 'jscpd', geradoEm: GERADO }).itens, manifesto: JSON.parse(manifestoTresOk(1)) };
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

// ────────────────────────────────────────────────────────────────────────────
// 8. O QUE SE PUBLICA QUANDO A CORRIDA CORRE MAL (lente adversarial, 2026-08-26)
//
// A objecção, verbatim e reproduzida: com as três ferramentas a atirar por falta
// de binário — a situação NORMAL em qualquer máquina que não seja a do dono — o
// `/fleet.json` publicava
//
//     triagem.por_triar          = 0
//     produtores.estado          = ok · por_triar 0 · apontamentos 0 · rede_zero true
//         semgrep = falhou · jscpd = falhou · knip = falhou
//     alerta_achados             = false
//     EXIT=0
//
// Quatro afirmações e um código de saída, todos a dizer "correu bem", sobre uma
// corrida em que nada correu. E `rede_zero: true` é a afirmação-título do gate
// da F1, verdadeira aqui por VACUIDADE.
// ────────────────────────────────────────────────────────────────────────────

const manifestoTudoFalhou = (extra = {}) => JSON.stringify({
  gerado_em: GERADO,
  repo: '/repo',
  apontamentos: 0,
  origens: {
    semgrep: { estado: 'falhou', porque: 'semgrep sem --regras', brutos: null, aceites: null, rejeitados: null, ms: 0 },
    jscpd: { estado: 'falhou', porque: 'jscpd sem --jscpd', brutos: null, aceites: null, rejeitados: null, ms: 0 },
    knip: { estado: 'falhou', porque: 'knip sem --knip', brutos: null, aceites: null, rejeitados: null, ms: 0 },
  },
  rede: { rede_zero: true, porque: '0 tentativas de saída no processo e nenhum filho nasceu' },
  ...extra,
});

test('MORDIDA · com as TRÊS ferramentas falhadas, o bloco não pode dizer `ok`', () => {
  const fs_ = fakeFs({
    [j('/base', ACHADOS_JSON)]: '[]',
    [j('/base', MANIFESTO_JSON)]: manifestoTudoFalhou(),
  });
  const p = lerProdutores({ baseDir: '/base', repoRoot: '/repo', readImpl: fs_.read, existsImpl: fs_.exists });

  assert.equal(p.leitura, 'ok', 'o artefacto é legível — essa era a pergunta que o `estado` respondia');
  assert.equal(p.estado, 'falhou', 'e a corrida não produziu nada: são perguntas diferentes');
  assert.equal(p.ferramentas_ok, 0);
  assert.match(p.porque, /nenhuma das 3 ferramentas correu/);
});

test('MORDIDA · `rede_zero` não pode ser `true` por VACUIDADE', () => {
  // Zero saídas de rede numa corrida onde nenhuma ferramenta chegou a arrancar
  // não é uma medição: é a ausência de oportunidade. É a mesma regra que este
  // ramo já aplica à sonda do SO — zero amostras não é zero ligações.
  const fs_ = fakeFs({
    [j('/base', ACHADOS_JSON)]: '[]',
    [j('/base', MANIFESTO_JSON)]: manifestoTudoFalhou(),
  });
  const p = lerProdutores({ baseDir: '/base', repoRoot: '/repo', readImpl: fs_.read, existsImpl: fs_.exists });

  assert.equal(p.rede_zero, null, 'a afirmação-título do gate não sobrevive a uma corrida vazia');
  assert.match(p.rede_porque, /VACUIDADE/);
  assert.match(p.rede_porque, /nenhum filho nasceu/, 'a auditoria crua continua legível dentro da razão');
});

test('a regra da vacuidade é UMA, e vale no escritor e no leitor', () => {
  const origensFalhadas = { semgrep: { estado: 'falhou' }, jscpd: { estado: 'falhou' }, knip: { estado: 'falhou' } };
  const origensUma = { semgrep: { estado: 'ok' }, jscpd: { estado: 'falhou' }, knip: { estado: 'falhou' } };
  assert.equal(redeNaoVacua({ rede_zero: true, porque: 'x' }, origensFalhadas).rede_zero, null);
  assert.equal(redeNaoVacua({ rede_zero: true, porque: 'x' }, origensUma).rede_zero, true,
    'uma ferramenta que correu já dá oportunidade ao zero de ser diferente de zero');
  assert.equal(redeNaoVacua({ rede_zero: false, porque: 'x' }, origensFalhadas).rede_zero, false,
    'um `false` medido nunca é apagado — só o `true` vácuo é');
});

test('MORDIDA · o /fleet.json de uma corrida vazia não diz `alerta_achados: false`', () => {
  const fs_ = fakeFs({
    '/ledger': '', '/state': '{}',
    [j('/base', 'ancora-achados.json')]: '[]',
    [j('/base', 'ancora-manifesto.json')]: JSON.stringify({ repo: '/repo', apontamentos: 0, gerado_em: GERADO, ficheiros_no_ambito: 3 }),
    [j('/base', ACHADOS_JSON)]: '[]',
    [j('/base', MANIFESTO_JSON)]: manifestoTudoFalhou(),
  });
  const s = buildFleetState({
    ledgerPath: '/ledger', statePath: '/state', stopFile: '/STOP',
    baseDir: '/base', repoRoot: '/repo', now: Date.parse(GERADO),
    readImpl: fs_.read, existsImpl: fs_.exists,
  });
  assert.equal(s.triagem.produtores.estado, 'falhou');
  assert.equal(s.triagem.produtores.rede_zero, null);
  assert.equal(s.alerta_achados, null,
    '`false` seria afirmar "não há nada a triar" a partir de três ferramentas que não olharam');
});

test('estadoDaCorrida distingue as três respostas, e `parcial` não é `ok`', () => {
  const e = (a, b, c) => estadoDaCorrida({ semgrep: { estado: a }, jscpd: { estado: b }, knip: { estado: c } });
  assert.equal(e('ok', 'ok', 'ok').estado, 'ok');
  assert.equal(e('ok', 'ok', 'falhou').estado, 'parcial');
  assert.equal(e('ok', 'parcial', 'ok').estado, 'parcial', 'uma ferramenta partida por dentro não é uma corrida limpa');
  assert.equal(e('falhou', 'falhou', 'falhou').estado, 'falhou');
  assert.equal(e('falhou', 'falhou', 'falhou').ferramentas_ok, 0);
});

// ── 9. uma ferramenta que rebentou a meio ──────────────────────────────────

test('MORDIDA · rc≠0, erros próprios ou zero ficheiros varridos ⇒ `parcial`, nunca `ok`', () => {
  // O caso real da lente: um semgrep que morre com rc=7, zero regras carregadas
  // e zero ficheiros varridos devolve JSON válido, e o bloco publicado era
  // literalmente indistinguível de «varreu 312 ficheiros e não achou nada».
  assert.equal(saudeDaOrigem({ rc: 0, erros: 0, ficheiros_varridos: 312 }).estado, 'ok');
  assert.equal(saudeDaOrigem({ rc: 7 }).estado, 'parcial');
  assert.match(saudeDaOrigem({ rc: 7 }).porque, /rc=7/);
  assert.equal(saudeDaOrigem({ rc: 0, erros: 2 }).estado, 'parcial');
  assert.equal(saudeDaOrigem({ rc: 0, ficheiros_varridos: 0 }).estado, 'parcial');
  assert.match(saudeDaOrigem({ rc: 0, ficheiros_varridos: 0 }).porque, /ZERO ficheiros/);
});

test('MORDIDA · a corrida REAL commitada tinha 8 erros do semgrep e dizia `ok`', async () => {
  // Números lidos do manifesto da corrida de 2026-08-26 que está no commit:
  // `origens.semgrep = { estado: "ok", ficheiros_varridos: 477, erros_do_semgrep: 8 }`.
  // Oito erros próprios da ferramenta, publicados como uma corrida limpa — e o
  // campo nem sequer atravessava o filtro do `lerProdutores`.
  const { manifesto } = await correr({
    raiz: 'C:/r',
    agora: Date.parse(GERADO),
    produtores: [produtorFalso('semgrep', [bruto({ line: 1, rule: 'semgrep/a' })], {
      ficheiros_varridos: 477, erros: 8, rc: 0,
    })],
    opcoesRede: { sondaImpl: async () => ({ remotos: [], udp: 0 }), registo: null },
  });
  assert.equal(manifesto.origens.semgrep.estado, 'parcial');
  assert.match(manifesto.origens.semgrep.porque, /8 erro\(s\)/);
  assert.equal(manifesto.estado, 'parcial', 'e a corrida inteira deixa de se chamar limpa');
});

test('MORDIDA · os denominadores atravessam o filtro de campos até ao /fleet.json', () => {
  // Quarta objecção: `ficheiros_varridos` e `erros_do_semgrep` existiam no
  // manifesto e eram deitados fora exactamente aqui, e `brutos` não era bruto —
  // o knip emitiu 250 entradas com nome e o adaptador passou 62, com o painel a
  // mostrar «62 de 62, 0 rejeitados».
  const itens = normalizar([bruto({})], { origem: 'jscpd', geradoEm: GERADO }).itens;
  const fs_ = fakeFs({
    [j('/base', ACHADOS_JSON)]: JSON.stringify(itens),
    [j('/base', MANIFESTO_JSON)]: JSON.stringify({
      gerado_em: GERADO, repo: '/repo', apontamentos: 1,
      origens: {
        semgrep: { estado: 'parcial', porque: 'rc=7', brutos: 0, emitidos: 0, rc: 7, erros: 2, ficheiros_varridos: 0, ms: 5 },
        jscpd: { estado: 'ok', brutos: 1, emitidos: 972, descartados_pelo_adaptador: 971, rejeitados: 0, ms: 228 },
        knip: { estado: 'ok', brutos: 62, emitidos: 250, descartados_pelo_adaptador: 188, sem_linha: { files: 176, binaries: 12 }, rejeitados: 0, ms: 1118 },
      },
      rede: { rede_zero: true, porque: 'x' },
    }),
  });
  const p = lerProdutores({ baseDir: '/base', repoRoot: '/repo', readImpl: fs_.read, existsImpl: fs_.exists });
  assert.equal(p.origens.semgrep.rc, 7, 'o código de saída não pode voltar a ser deitado fora');
  assert.equal(p.origens.semgrep.erros, 2);
  assert.equal(p.origens.semgrep.ficheiros_varridos, 0,
    'é este 0 que distingue "não achou nada" de "não conseguiu carregar uma regra"');
  assert.equal(p.origens.knip.emitidos, 250);
  assert.equal(p.origens.knip.descartados_pelo_adaptador, 188);
  assert.deepEqual(p.origens.knip.sem_linha, { files: 176, binaries: 12 });
  assert.equal(p.origens.jscpd.emitidos, 972);
  assert.equal(p.estado, 'parcial');
});

// ── 10. o código de saída tem de dizer a verdade ───────────────────────────

test('MORDIDA · o CLI sai com 0 só quando as três correram E a rede foi medida a zero', async () => {
  // Antes saía sempre 0, incluindo com as três ferramentas a rebentar. Um cron
  // ou um CI que chamasse isto via sucesso.
  const cli = fileURLToPath(new URL('./produtores.mjs', import.meta.url));
  const r = child_process.spawnSync(process.execPath, [cli, '--raiz', process.cwd(), '--estado'], {
    encoding: 'utf8', timeout: 120_000,
  });
  const saida = String(r.stdout || '') + String(r.stderr || '');
  assert.notEqual(r.status, 0,
    `sem --regras/--jscpd/--knip nenhuma ferramenta corre: o EXIT tinha de o dizer. Saída:\n${saida}`);
  assert.match(saida, /FALHOU/, 'e as três falhas ficam escritas na consola');
  assert.match(saida, /rede_zero: n\/d/, 'e a prova de rede não pode afirmar-se por vacuidade');
});

// ── 11. a severidade que o servidor entrega ao painel ──────────────────────
//
// Objeccao da lente, medida sobre a corrida real da F1 (`f10-server.mjs:472`):
//
//     itens totais                                  : 1038
//     protegidos pelo ramo origem===ORIGEM_DETECTOR :    0
//     RECALCULADOS pela regra dos recibos de MODELO : 1038
//        jscpd/knip/semgrep -> sev=low motivo=trivial
//
//     sev que o ESQUEMA deu   : {"med":104}
//     sev que o PAINEL recebe : {"low":104}
//       porque: "no claim, and not customer-facing"
//
// O guarda listava quem ESCAPA em vez de quem ENTRA, e uma lista de excepcoes
// envelhece mal: qualquer origem nova cai no ramo errado no dia em que nasce.

test('MORDIDA · um achado de produtor NAO e re-pontuado pela regra dos recibos', async () => {
  const { pontuarFila } = await import('./f10-server.mjs');
  const xss = {
    chave: 'k', origem: 'semgrep', regra: 'semgrep/unknown-value-with-script-tag',
    ficheiro: 'src/helper/html/index.ts', janela: '12',
    resumo: 'used with a <script> tag; could be susceptible to cross-site scripting (XSS)',
    evidencia: 'src/helper/html/index.ts:12 · semgrep unknown-value-with-script-tag',
    sev: { k: 'med', n: 2, porque: 'semgrep finding (deterministic linter, no GPU and no model) — needs your judgment' },
  };
  const [saiu] = pontuarFila([xss]);

  assert.equal(saiu.sev.k, 'med', 'o esquema disse `med`; o painel recebia `low`');
  assert.doesNotMatch(saiu.sev.porque, /no claim, and not customer-facing/,
    'a frase da regra dos recibos e falsa sobre um XSS em codigo enviado');
  assert.equal(saiu.suporte, null, 'nao ha citacao de modelo para suportar');
  assert.match(saiu.suporte_porque, /semgrep finding has no model citation/);
});

test('o achado do detector e o do MODELO continuam como estavam', async () => {
  const { pontuarFila } = await import('./f10-server.mjs');
  const [det] = pontuarFila([{ chave: 'd', origem: 'detector-deterministico', sev: { k: 'med', n: 2, porque: 'x' } }]);
  assert.equal(det.suporte, null);
  assert.match(det.suporte_porque, /a regex pointer has no model citation/);
  assert.equal(det.sev.k, 'med');

  const [mod] = pontuarFila([{
    chave: 'm', origem: 'modelo-local', ficheiro: 'landing/app/page.tsx', janela: '10-20',
    resumo: 'the page claims 89.9% savings', evidencia: 'x',
  }]);
  assert.ok(mod.sev && typeof mod.sev.k === 'string', 'o recibo de modelo continua a ser re-pontuado');
  assert.notEqual(mod.suporte_porque, undefined);
});

test('MORDIDA · uma origem futura nao herda a regra dos recibos por omissao', async () => {
  // A causa-raiz: uma lista de excepcoes. Com a lista de quem ENTRA, uma origem
  // que ninguem previu fica com a severidade do seu proprio esquema.
  const { pontuarFila } = await import('./f10-server.mjs');
  const [x] = pontuarFila([{ chave: 'x', origem: 'eslint', sev: { k: 'high', n: 3, porque: 'do esquema' } }]);
  assert.equal(x.sev.k, 'high', 'uma origem nova nao pode ser rebaixada por uma regra que nao e dela');
  assert.equal(x.sev.porque, 'do esquema');
});
