/**
 * Testes da catraca dos testes fora do CI.
 *
 * O teste que importa e o de MORDIDA: um guarda que nunca falhou e
 * indistinguivel de um guarda partido. A primeira versao deste guarda deu
 * VERDE quando lhe pusemos um ficheiro de teste novo a frente — `git ls-files`
 * so ve o que ja esta no indice do git, e o ficheiro ainda nao estava
 * commitado. Foi um teste de mordida que apanhou isso, nao uma revisao.
 *
 * ── LIMITACAO DESTAS MORDIDAS (escrita, nao corrigida) ──────────────────────
 *
 * As mordidas contra o repositorio real consultam o PROPRIO matcher
 * (`testesGateados`) para decidir se o ficheiro plantado esta ou nao coberto;
 * nao executam o comando do CI para verificar essa premissa. Testam que o
 * guarda detecta aquele caminho — nao provam que o detector e equivalente aos
 * workflows. A premissa de hoje («um glob de um nivel nao desce a
 * subdirectorios») foi confirmada por execucao separada em Node v24.14.0 por
 * um adversario, e esta escrita no cabecalho da mordida; se cair, a mordida
 * diz qual foi a premissa em vez de so dar vermelho.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { comparar, verificar, escreverLinhaBase, lerLinhaBase, semJustificacao, porquesDe, shaDaLista, SHA_INICIO_2026_08_26, MENSAGEM_INICIO_ALTERADO } from './teste-fora-do-ci.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const GUARDA = path.join(AQUI, 'teste-fora-do-ci.mjs');
const LINHA_BASE = path.join(AQUI, 'testes-orfaos.baseline.json');

// ── a comparacao ────────────────────────────────────────────────────────────

test('a catraca aperta nos DOIS sentidos', () => {
  const r = comparar(['a.test.js', 'novo.test.js'], ['a.test.js', 'ja-resolvido.test.js']);
  assert.deepEqual(r.novos, ['novo.test.js'], 'um orfao novo e uma regressao a acontecer agora');
  assert.deepEqual(r.resolvidos, ['ja-resolvido.test.js'], 'um orfao que passou a coberto e trabalho que a linha de base ainda nao reconheceu');
});

test('sem mudanca nenhuma, nao ha nem novos nem resolvidos', () => {
  const r = comparar(['a.test.js'], ['a.test.js']);
  assert.deepEqual(r.novos, []);
  assert.deepEqual(r.resolvidos, []);
});

// ── o veredicto ─────────────────────────────────────────────────────────────

function gateadosFalso({ num, den, orfaos }) {
  return () => ({ id: 'testes_gateados', peso: 2, num, den, valor: num / den, pontos: 0, orfaos });
}
// Uma linha de base em que tudo o que la esta e da lista inicial (sem porque).
const linhaBase = (orfaos, extra = {}) => () => ({ presente: true, orfaos, justificacoes: {}, inicio: { data: '2026-08-26', total: orfaos.length, orfaos }, ...extra });

test('um orfao NOVO faz falhar com codigo 1 e nomeia o ficheiro', () => {
  const r = verificar({
    gateadosImpl: gateadosFalso({ num: 1, den: 2, orfaos: ['a.test.js', 'novo.test.js'] }),
    linhaBaseImpl: linhaBase(['a.test.js']),
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 1);
  assert.deepEqual(r.novos, ['novo.test.js']);
});

test('um orfao RESOLVIDO tambem faz falhar — a catraca tem de apertar', () => {
  // Sem isto, a linha de base ficava eternamente no numero mais alto que
  // alguma vez teve, e passava a proteger o numero em vez do repositorio.
  const r = verificar({
    gateadosImpl: gateadosFalso({ num: 2, den: 2, orfaos: [] }),
    linhaBaseImpl: linhaBase(['a.test.js']),
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 1);
  assert.deepEqual(r.resolvidos, ['a.test.js']);
});

test('SEM linha de base o guarda NAO passa em silencio', () => {
  // Passar seria dizer "esta tudo bem" sobre uma pergunta que nunca foi feita.
  const r = verificar({
    gateadosImpl: gateadosFalso({ num: 1, den: 2, orfaos: ['a.test.js'] }),
    linhaBaseImpl: () => ({ presente: false, porque: 'linha de base ausente ou ilegivel', orfaos: [] }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 2);
  assert.match(r.porque, /linha de base ausente/);
});

test('se a MEDICAO falhar, o guarda devolve 2 — nunca um verde por nao ter conseguido olhar', () => {
  const r = verificar({
    gateadosImpl: () => ({ id: 'testes_gateados', valor: null, porque: 'git ls-files falhou: not a repo' }),
  });
  assert.equal(r.codigo, 2);
  assert.match(r.porque, /nao foi possivel medir/);
});

test('o guarda pede a lista com os ficheiros NAO versionados incluidos', () => {
  // Sem isto morde tarde: so depois do commit, quando corrigir ja custa mais.
  let opts = null;
  verificar({
    gateadosImpl: (o) => { opts = o; return { valor: 1, num: 1, den: 1, orfaos: [] }; },
    linhaBaseImpl: linhaBase([]),
  });
  assert.equal(opts.incluirNaoVersionados, true);
});

// ── a justificacao ──────────────────────────────────────────────────────────
//
// A 2026-09-11 a linha de base foi regravada de 180 para 193 «porque entraram
// 15» — e o proprio ficheiro exigia explicar porque e que cada um NAO deve
// correr. Um adversario apanhou: explicava o crescimento, nao a dispensa.

test('MORDIDA: um orfao na linha de base FORA da lista inicial e SEM porque faz o guarda falhar — mesmo sem nada ter mudado', () => {
  // A lista actual e a linha de base sao iguais: a catraca velha dava 0. Mas
  // `escrito-a-mao.test.js` nao e da divida inicial e ninguem disse porque nao
  // corre. Isso e exactamente «regravar para calar um vermelho».
  const r = verificar({
    gateadosImpl: gateadosFalso({ num: 1, den: 3, orfaos: ['a.test.js', 'escrito-a-mao.test.js'] }),
    linhaBaseImpl: () => ({ presente: true, orfaos: ['a.test.js', 'escrito-a-mao.test.js'], justificacoes: {}, inicio: { data: '2026-08-26', total: 1, orfaos: ['a.test.js'] } }),
  });
  assert.equal(r.codigo, 1, 'sem porque nao passa');
  assert.deepEqual(r.sem_justificacao, ['escrito-a-mao.test.js']);
  assert.deepEqual(r.novos, [], 'nao e um orfao novo — e um orfao sem porque');
  // O par: com o porque escrito, passa.
  const ok = verificar({
    gateadosImpl: gateadosFalso({ num: 1, den: 3, orfaos: ['a.test.js', 'escrito-a-mao.test.js'] }),
    linhaBaseImpl: () => ({ presente: true, orfaos: ['a.test.js', 'escrito-a-mao.test.js'], justificacoes: { 'escrito-a-mao.test.js': 'artefacto de experiencia datada' }, inicio: { data: '2026-08-26', total: 1, orfaos: ['a.test.js'] } }),
  });
  assert.equal(ok.codigo, 0);
  assert.deepEqual(ok.sem_justificacao, []);
});

test('MORDIDA: uma justificacao VAZIA nao e uma justificacao', () => {
  assert.deepEqual(semJustificacao(['x.test.js'], { inicio: { orfaos: [] }, justificacoes: { 'x.test.js': '   ' } }), ['x.test.js']);
  assert.deepEqual(semJustificacao(['x.test.js'], { inicio: { orfaos: [] }, justificacoes: { 'x.test.js': 'porque sim, datado' } }), []);
  assert.deepEqual(semJustificacao(['x.test.js'], { inicio: { orfaos: ['x.test.js'] }, justificacoes: {} }), [], 'a divida inicial nao precisa de porque — e diz-se que e herdada');
});

test('MORDIDA: regravar com um orfao novo SEM --porque sai 1 e NAO escreve', () => {
  let escreveu = false;
  const r = escreverLinhaBase(
    { total: 3, orfaos: ['a.test.js', 'novo.test.js'], justificacoes: {}, inicio: { data: '2026-08-26', total: 1, orfaos: ['a.test.js'] } },
    { writeImpl: () => { escreveu = true; }, shaInicio: shaDaLista(['a.test.js']) },
  );
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 1);
  assert.deepEqual(r.sem_justificacao, ['novo.test.js']);
  assert.equal(escreveu, false, 'recusar e nao escrever — uma linha de base meia-escrita e pior que nenhuma');
});

test('regravar COM --porque escreve a justificacao, COPIA o inicio e data o texto', () => {
  let escrito = null;
  const hoje = new Date('2026-09-11T22:00:00Z');
  const inicio = { data: '2026-08-26', total: 2, orfaos: ['a.test.js', 'resolvido.test.js'] };
  const r = escreverLinhaBase(
    { total: 3, orfaos: ['novo.test.js', 'a.test.js'], justificacoes: {}, inicio },
    { writeImpl: (_p, c) => { escrito = c; }, porques: { 'novo.test.js': 'artefacto de experiencia datada' }, hoje, shaInicio: shaDaLista(inicio.orfaos) },
  );
  assert.equal(r.ok, true);
  const j = JSON.parse(escrito);
  assert.deepEqual(j.orfaos, ['a.test.js', 'novo.test.js'], 'ordenada');
  assert.deepEqual(j.justificacoes, { 'novo.test.js': 'artefacto de experiencia datada' });
  assert.equal(j.inicio.data, '2026-08-26');
  assert.equal(j.inicio.total, 2, 'o total inicial e historico e nao mexe');
  // Ate 2026-09-12 o inicial que passava a coberto SAIA daqui («lista inicial
  // viva»). Com o sha em codigo a lista e uma foto: copia-se inteira, e o
  // que se calcula e quantos dela ainda faltam cobrir.
  assert.deepEqual(j.inicio.orfaos, ['a.test.js', 'resolvido.test.js'], 'a foto de 26/08 copia-se inteira — nao encolhe');
  assert.equal(r.inicio_por_cobrir, 1, 'resolvido.test.js ja corre; a.test.js ainda nao');
  assert.equal(j.regravada_em, '2026-09-11T22:00:00.000Z');
  assert.match(j.porque_existe, /divida conhecida a 2026-09-11 \(inicio 2026-08-26: 2 orfaos\)/, 'datado dinamicamente, com o inicio ao lado');
  assert.match(escrito, /Regravar isto para calar um vermelho/);
});

test('regravar PODA a justificacao de um ficheiro que deixou de ser orfao, e mantem as que ja la estavam', () => {
  let escrito = null;
  escreverLinhaBase(
    { total: 3, orfaos: ['fica.test.js'], justificacoes: { 'fica.test.js': 'continua a mao', 'ja-corre.test.js': 'ja nao interessa' }, inicio: { data: '2026-08-26', total: 0, orfaos: [] } },
    { writeImpl: (_p, c) => { escrito = c; }, shaInicio: shaDaLista([]) },
  );
  const j = JSON.parse(escrito);
  assert.deepEqual(j.justificacoes, { 'fica.test.js': 'continua a mao' });
});

test('MORDIDA: uma linha de base do formato antigo (sem `inicio`) nao se le como boa — e codigo 2 com o porque', () => {
  const r = lerLinhaBase({ readImpl: () => JSON.stringify({ orfaos: ['a.test.js'] }) });
  assert.equal(r.presente, false);
  assert.match(r.porque, /sem o bloco `inicio`/);
  const v = verificar({ gateadosImpl: gateadosFalso({ num: 1, den: 2, orfaos: ['a.test.js'] }), linhaBaseImpl: () => r });
  assert.equal(v.codigo, 2);
});

test('`--porque "<ficheiro>=<texto>"` divide no PRIMEIRO `=` e repete-se', () => {
  const p = porquesDe(['--linha-base', '--porque', 'a/b.test.mjs=x = y', '--porque', 'c.test.js=z', '--porque', 'sem-igual']);
  assert.deepEqual(p, { 'a/b.test.mjs': 'x = y', 'c.test.js': 'z' });
});

test('linha de base ilegivel = ausente, e ausente nao passa', () => {
  const r = lerLinhaBase({ readImpl: () => '{ nao e json' });
  assert.equal(r.presente, false);
});

// ── MORDIDA: o guarda a serio, contra o repositorio a serio ─────────────────

test('MORDIDA: um ficheiro de teste novo na arvore faz o guarda falhar com codigo 1 e NOMEIA-O', () => {
  // ⚠️ Esta mordida passou VERDE durante 16 dias a testar a coisa errada.
  // Plantava o ficheiro AO LADO deste, em tools/cockpit/runner/, e a 2026-08-26
  // isso era um orfao porque o `test:cockpit-runner` era uma lista escrita a
  // mao. Entretanto main trocou a lista por um glob (`tools/cockpit/runner/
  // *.test.mjs`) e o ficheiro plantado passou a ser COBERTO: o guarda dava 0,
  // o teste dava vermelho, e a leitura dizia «a catraca partiu». Nao partiu —
  // a premissa da mordida e que morreu debaixo dela. Um teste de mordida
  // depende do mundo tanto como o guarda que testa.
  //
  // Agora planta-se num SUBDIRECTORIO, que o glob de um nivel nao alcanca
  // (o `*` do node --test nao atravessa `/` — confirmado por execucao em Node
  // v24.14.0), e afirma-se que o guarda nomeia exactamente esse ficheiro — se
  // um dia alguem cobrir o subdirectorio, o teste diz qual foi a premissa que
  // caiu em vez de so dar vermelho. Ver a limitacao no cabecalho do ficheiro.
  const dir = path.join(AQUI, 'zz-prova-da-mordida');
  const alvo = path.join(dir, 'zz-prova-da-mordida.test.mjs');
  const rel = 'tools/cockpit/runner/zz-prova-da-mordida/zz-prova-da-mordida.test.mjs';
  // Nome com `zz-` para nao colidir com nada, e apagado no `finally` mesmo que
  // o assert rebente — um teste que deixa lixo na arvore parte o proximo.
  const antes = fs.readFileSync(LINHA_BASE);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(alvo, "import test from 'node:test';\ntest('so existe para a catraca morder', () => {});\n");
    let codigo = 0;
    let saida = '';
    try {
      saida = execFileSync(process.execPath, [GUARDA, '--json'], { encoding: 'utf8', windowsHide: true });
    } catch (e) {
      codigo = e.status;
      saida = String(e.stdout || '');
    }
    assert.equal(codigo, 1, 'o guarda TEM de falhar com um teste orfao novo na arvore');
    const r = JSON.parse(saida);
    assert.deepEqual(r.novos, [rel], `o guarda tem de nomear o ficheiro plantado; se nao o ve, a premissa «subdirectorio nao e coberto» caiu — ver o cabecalho deste teste`);

    // E regravar SEM porque, com o orfao plantado a frente, e RECUSADO — e a
    // linha de base fica byte a byte como estava.
    let codigoRegravar = 0;
    let erro = '';
    try {
      execFileSync(process.execPath, [GUARDA, '--linha-base'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      codigoRegravar = e.status;
      erro = String(e.stderr || '');
    }
    assert.equal(codigoRegravar, 1, 'regravar sem --porque tem de sair 1');
    assert.match(erro, /NAO regravada/);
    assert.ok(erro.includes(rel), 'diz qual e o orfao sem porque');
    assert.ok(antes.equals(fs.readFileSync(LINHA_BASE)), 'a linha de base nao pode ter sido tocada');
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* o SO que trate */ }
    fs.writeFileSync(LINHA_BASE, antes);
  }
});

test('MORDIDA ao contrario: com a arvore limpa, o guarda passa', () => {
  // O par do teste acima. Um guarda que falha SEMPRE tambem nao serve de nada,
  // e seria indistinguivel de um guarda que morde por acidente.
  const r = execFileSync(process.execPath, [GUARDA], { encoding: 'utf8', windowsHide: true });
  assert.match(r, /a catraca aguenta/);
});

test('a linha de base commitada e do formato novo e nao tem orfao sem porque', () => {
  // A leitura real do ficheiro versionado: se alguem o editar a mao e deixar
  // um orfao fora do inicio sem porque, isto e o primeiro sitio a acusar.
  const lb = lerLinhaBase({});
  assert.equal(lb.presente, true, lb.porque);
  assert.equal(lb.inicio.data, '2026-08-26');
  assert.equal(lb.inicio.total, 180, 'a divida inicial de 2026-08-26 eram 180 — e historico, nao mexe');
  assert.equal(lb.inicio.orfaos.length, 180, 'a foto inteira, nao so os que ainda faltam (ate 2026-09-12 o ficheiro trazia 178)');
  assert.equal(shaDaLista(lb.inicio.orfaos), SHA_INICIO_2026_08_26, 'o ficheiro versionado bate com o sha em codigo');
  assert.deepEqual(semJustificacao(lb.orfaos, lb), []);
});

// ── MORDIDA (g): a lista inicial e imutavel ─────────────────────────────────

test('MORDIDA (g): acrescentar um caminho a `inicio.orfaos` a mao NAO dispensa a justificacao — codigo 2, nao 0', () => {
  // Reproducao de um adversario (2026-09-12), contra a linha de base real:
  //   1. tirou a justificacao de um orfao → codigo 1, com o caminho em
  //      `sem_justificacao` (certo);
  //   2. acrescentou esse caminho a `inicio.orfaos` → codigo 0, sem porque.
  // «O guarda confia na lista que devia fiscalizar.» Agora a lista inicial
  // tem sha em codigo, e um `inicio` que nao bate e uma linha de base
  // ADULTERADA: codigo 2, e nem o `--linha-base` a regrava.
  const real = JSON.parse(fs.readFileSync(LINHA_BASE, 'utf8'));
  const alvo = Object.keys(real.justificacoes)[0];
  assert.ok(alvo, 'a linha de base real tem de ter pelo menos um orfao justificado para esta mordida fazer sentido');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'catraca-g-'));
  const caminho = path.join(dir, 'baseline.json');
  // O contador e fixo — o que se mede aqui e a LEITURA da linha de base.
  const gate = () => ({ valor: 0.5, num: 1, den: 2, orfaos: real.orfaos });
  const correr = (j) => { fs.writeFileSync(caminho, JSON.stringify(j)); return verificar({ gateadosImpl: gate, linhaBaseImpl: () => lerLinhaBase({ caminho }) }); };
  try {
    // 0. intacta: passa.
    assert.equal(correr(real).codigo, 0, 'a linha de base real, intacta, passa contra ela propria');
    // 1. sem a justificacao: codigo 1, nomeia.
    const semPorque = JSON.parse(JSON.stringify(real));
    delete semPorque.justificacoes[alvo];
    const r1 = correr(semPorque);
    assert.equal(r1.codigo, 1);
    assert.deepEqual(r1.sem_justificacao, [alvo]);
    // 2. o ataque: o caminho passa para `inicio.orfaos`.
    const forjada = JSON.parse(JSON.stringify(semPorque));
    forjada.inicio.orfaos.push(alvo);
    const r2 = correr(forjada);
    assert.notEqual(r2.codigo, 0, 'ate 2026-09-12 isto dava 0 — a dispensa sem porque por edicao');
    assert.equal(r2.codigo, 2);
    assert.match(r2.porque, /a lista inicial foi alterada; a lista inicial e imutavel/);
    assert.match(r2.porque, /181 entradas/);
    // 3. E tirar um do inicio (para o empurrar para «novo» e depois justificar
    //    com um porque de conveniencia) tambem nao bate.
    const encolhida = JSON.parse(JSON.stringify(real));
    encolhida.inicio.orfaos.pop();
    assert.equal(correr(encolhida).codigo, 2, 'encolher a foto tambem e alterar a foto');
    // 4. `--linha-base` por cima de uma lista inicial alterada: recusa, nada
    //    escrito. (`escreverLinhaBase` e a segunda porta; a primeira e a leitura.)
    let escreveu = false;
    const w = escreverLinhaBase({ total: 2, orfaos: real.orfaos, justificacoes: real.justificacoes, inicio: forjada.inicio }, { writeImpl: () => { escreveu = true; } });
    assert.equal(w.codigo, 2);
    assert.equal(w.porque, MENSAGEM_INICIO_ALTERADO);
    assert.equal(escreveu, false);
    // 5. E a leitura de uma lista inicial sintetica (o `attacks.mjs` do
    //    adversario usava `inicio.orfaos: ['old.test.js']`) e adulterada: so a
    //    foto de 26/08 deste repositorio e que bate com o sha em codigo.
    const sintetica = lerLinhaBase({ readImpl: () => JSON.stringify({ inicio: { data: '2026-08-26', total: 1, orfaos: ['old.test.js'] }, orfaos: ['old.test.js', 'new.test.js'], justificacoes: {} }) });
    assert.equal(sintetica.presente, false);
    assert.equal(sintetica.adulterada, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('(g) o sha em codigo e o da lista de 2026-08-26 tal como foi commitada — nao um sha de conveniencia', () => {
  // `git show 2d5fd762:tools/cockpit/runner/testes-orfaos.baseline.json` traz
  // os 180 `orfaos` daquele dia (o ficheiro ainda sem bloco `inicio`). O sha
  // em codigo tem de ser o dessa lista, e nao o dos 178 que o ficheiro trazia
  // ate 2026-09-12. Se o git nao tiver o commit (clone raso), diz-se e a
  // comparacao contra o ficheiro versionado (teste anterior) continua a valer.
  let bruto = null;
  try {
    bruto = execFileSync('git', ['show', '2d5fd762:tools/cockpit/runner/testes-orfaos.baseline.json'], { cwd: AQUI, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  } catch { /* sem o commit */ }
  if (!bruto) return;
  const lista = JSON.parse(bruto).orfaos;
  assert.equal(lista.length, 180);
  assert.equal(shaDaLista(lista), SHA_INICIO_2026_08_26);
});

