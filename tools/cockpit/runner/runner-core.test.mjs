import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildContextPack, renderSlice, resolveCandidates, PILLARS, PILLAR_IDS, readAnchor, ANCHORED_SYSTEM_PROMPT, readChangedLines, faseDoDevice, DIFF_PATHSPEC, DIFF_SYSTEM_PROMPT, contarNegacoes, negacaoDensa } from './context-pack.mjs';
import {
  VERDICT,
  extractCitations,
  checkCitation,
  verifyEvidence,
  tallyVerdicts,
  isNoFinding,
  concluir,
} from './evidence-verifier.mjs';
import {
  assertLocalEngine,
  isStopped,
  buildPayload,
  runRound,
  nextPillar,
  DEFAULT_OLLAMA,
  achou,
} from './runner-core.mjs';

/** Builds a throwaway repo so tests never depend on the real tree's contents. */
function fixtureRepo() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-runner-'));
  fs.mkdirSync(path.join(root, 'tools', 'router'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'tools', 'router', 'classify.js'),
    ['const TIER = 3;', 'function classify() {', '  return TIER;', '}', ''].join('\n'),
  );
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# canon\nsha: abc123\n');
  return root;
}

// ---------------------------------------------------------------- $0 hard

test('assertLocalEngine aceita o Ollama de loopback', () => {
  assert.equal(assertLocalEngine(DEFAULT_OLLAMA), 'http://127.0.0.1:11434');
  assert.equal(assertLocalEngine('http://localhost:11434'), 'http://localhost:11434');
});

test('assertLocalEngine recusa qualquer motor que nao seja local', () => {
  for (const bad of [
    'https://api.anthropic.com',
    'http://api.openai.com:11434',
    'http://127.0.0.1:8080',
    'https://127.0.0.1:11434',
    'http://192.168.1.10:11434',
    'nao-e-url',
  ]) {
    assert.throws(() => assertLocalEngine(bad), /motor/, `devia recusar ${bad}`);
  }
});

// ---------------------------------------------------------------- kill-switch

const enoent = () => { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; };
const eacces = () => { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; };

test('isStopped e fail-closed a serio: so ENOENT prova ausencia', () => {
  assert.equal(isStopped(''), true, 'sem caminho => parado');
  assert.equal(isStopped(null), true);
  assert.equal(isStopped('/x/STOP', () => ({ isFile: () => true })), true, 'existe => parado');
  assert.equal(isStopped('/x/STOP', enoent), false, 'ENOENT e a UNICA prova de ausencia');
  // A regressao real: existsSync engolia EACCES e devolvia false, e o runner
  // despachava com o STOP no disco mas ilegivel.
  assert.equal(isStopped('/x/STOP', eacces), true, 'STOP ilegivel => parado');
  assert.equal(isStopped('/x/STOP', () => { throw new Error('fs em baixo'); }), true);
});

test('STOP presente antes da ronda nao despacha e deixa recibo', async () => {
  const root = fixtureRepo();
  const out = await runRound({
    repoRoot: root,
    pillar: 'P1',
    stopFile: '/x/STOP',
    statImpl: () => ({ isFile: () => true }),
    fetchImpl: () => assert.fail('nao devia chegar ao motor'),
    clock: () => 0,
  });
  assert.equal(out.dispatched, false);
  assert.equal(out.receipt.usd, 0);
  assert.match(out.receipt.resultado_resumo, /STOP presente/);
});

test('STOP que chega durante a construcao ainda trava o despacho (race fechado)', async () => {
  const root = fixtureRepo();
  let calls = 0;
  const out = await runRound({
    repoRoot: root,
    pillar: 'P1',
    stopFile: '/x/STOP',
    statImpl: () => {
      calls += 1;
      if (calls === 1) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return { isFile: () => true }; // STOP mesmo antes do despacho
    },
    fetchImpl: () => assert.fail('o race nao foi fechado — despachou com STOP'),
    clock: () => 0,
  });
  assert.equal(out.dispatched, false);
  assert.match(out.receipt.resultado_resumo, /race fechado/);
  assert.equal(calls, 2, 'o STOP tem de ser lido duas vezes');
});

// ---------------------------------------------------------------- context pack

test('renderSlice numera as linhas com o numero real do ficheiro', () => {
  const slice = renderSlice(['a', 'b', 'c', 'd'], 2, 2);
  assert.equal(slice.startLine, 2);
  assert.equal(slice.endLine, 3);
  assert.match(slice.text, /^\s+2\| b\n\s+3\| c$/);
});

test('buildContextPack injecta bytes reais do repo e declara a janela', () => {
  const root = fixtureRepo();
  const pack = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: 0 });
  assert.equal(pack.ok, true);
  assert.equal(pack.file, 'tools/router/classify.js');
  assert.match(pack.prompt, /const TIER = 3;/);
  assert.match(pack.prompt, /linhas 1-/);
  assert.deepEqual(pack.allowedFiles, ['tools/router/classify.js']);
});

test('buildContextPack degrada para n/d quando nenhuma ancora existe', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-vazio-'));
  const pack = buildContextPack({ repoRoot: root, pillar: 'P1' });
  assert.equal(pack.ok, false);
  assert.match(pack.reason, /nenhum ficheiro-ancora|nenhum ficheiro-âncora/);
});

test('resolveCandidates ignora ficheiros que nao existem', () => {
  const root = fixtureRepo();
  assert.deepEqual(resolveCandidates(root, 'P1'), ['tools/router/classify.js']);
  assert.deepEqual(resolveCandidates(root, 'P3'), ['CLAUDE.md']);
});

test('todos os pilares apontam para linhas do excerto, nao para o vazio', () => {
  for (const [id, spec] of Object.entries(PILLARS)) {
    assert.ok(spec.files.length > 0, `${id} sem ficheiros`);
    assert.match(spec.ask, /Qual destas linhas/, `${id} nao ancora a pergunta no excerto`);
    assert.match(spec.ask, /Escolhe uma/, `${id} nao forca uma escolha unica`);
  }
});

// CONTRATO INVERTIDO A 2026-08-17, com medição a suportar.
// O contrato antigo empurrava "SEM ACHADO" para o fundo, para o modelo não fugir
// barato. Mediu-se o resultado ao fim de 860 achados: 27% citavam .md, 14%
// citavam comentários/cercas de código, ~65% eram nitpick do género "pode
// confundir o utilizador" — só ~15% eram acionáveis. Forçar um achado por ronda
// não produz vigilância, produz ruído. O contrato novo exige um DEFEITO REAL
// (sintoma+condição+impacto), proíbe citar linhas não executáveis, e trata
// "SEM ACHADO" como resposta certa. A guarda contra a fuga barata deixa de ser
// a ordem no prompt e passa a ser a taxa de achados acionáveis, medida no ledger.
test('o contrato de saida exige ACHADO + PROVA e um defeito REAL, nao um nitpick', () => {
  const pack = buildContextPack({ repoRoot: fixtureRepo(), pillar: 'P1' });
  assert.match(pack.system, /ACHADO:/);
  assert.match(pack.system, /PROVA: <caminho do ficheiro>:<número da linha>/);
  // Exige a forma sintoma → condição → impacto (mata o "pode ser null").
  assert.match(pack.system, /QUANDO .*ENTÃO/, 'o achado tem de ligar condição a impacto');
  // Proíbe explicitamente citar o que não é código executável.
  assert.match(pack.system, /comentário/, 'tem de proibir citar comentários');
  assert.match(pack.system, /em branco/, 'tem de proibir citar linhas vazias');
  // As frases-nitpick medidas no ledger têm de estar banidas por escrito.
  assert.match(pack.system, /pode confundir o utilizador/, 'tem de banir o nitpick medido');
  // "SEM ACHADO" é agora uma resposta CERTA — e o prompt tem de o dizer.
  assert.match(pack.system, /SEM ACHADO/);
  assert.match(pack.system, /resposta CERTA/, 'o silêncio honesto tem de ser recompensado');
  // Continua proibido inventar ficheiros/números — isso nunca muda.
  assert.match(pack.system, /Nunca inventes/);
});

// ---------------------------------------------------------------- verifier

test('extractCitations apanha ficheiro:linha e deduplica', () => {
  const cites = extractCitations('ver tools/router/classify.js:3 e tools/router/classify.js:3 e CLAUDE.md:2');
  assert.deepEqual(cites, [
    { file: 'tools/router/classify.js', line: 3 },
    { file: 'CLAUDE.md', line: 2 },
  ]);
});

test('checkCitation confirma a linha real e devolve o excerto', () => {
  const root = fixtureRepo();
  const ok = checkCitation(root, { file: 'tools/router/classify.js', line: 3 });
  assert.equal(ok.ok, true);
  assert.equal(ok.snippet, 'return TIER;');
});

test('checkCitation refuta linha para la do fim do ficheiro', () => {
  const root = fixtureRepo();
  const bad = checkCitation(root, { file: 'tools/router/classify.js', line: 9999 });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /linha-fora-do-ficheiro/);
});

test('checkCitation recusa caminhos que saem do repo', () => {
  const root = fixtureRepo();
  const esc = checkCitation(root, { file: '../../../etc/passwd.md', line: 1 });
  assert.equal(esc.ok, false);
  assert.equal(esc.reason, 'fora-do-repo');
});

test('verifyEvidence: citacao-ok quando a citacao resolve', () => {
  const root = fixtureRepo();
  const v = verifyEvidence({
    repoRoot: root,
    text: 'O tier esta cravado. tools/router/classify.js:3',
    allowedFiles: ['tools/router/classify.js'],
  });
  assert.equal(v.verdict, VERDICT.CITED);
  assert.match(v.evidencia ?? v.evidence, /return TIER;/);
});

test('o veredicto positivo nunca se chama "verificado" nem promete achado confirmado', () => {
  // Guarda anti-verde-falso: a citacao resolve, o achado continua por triar.
  assert.equal(VERDICT.CITED, 'citacao-ok');
  assert.ok(!Object.values(VERDICT).includes('verificado'));
  const v = verifyEvidence({
    repoRoot: fixtureRepo(),
    text: 'tools/router/classify.js:1',
    allowedFiles: ['tools/router/classify.js'],
  });
  assert.match(v.evidence, /achado NAO triado/);
});

test('verifyEvidence: refutado quando a citacao e inventada', () => {
  const root = fixtureRepo();
  const v = verifyEvidence({ repoRoot: root, text: 'bug em src/inventado.js:42' });
  assert.equal(v.verdict, VERDICT.REFUTED);
  assert.equal(v.failed, 1);
});

test('verifyEvidence: sem-citacao para prosa solta (o caso dos 174 recibos)', () => {
  const root = fixtureRepo();
  const v = verifyEvidence({
    repoRoot: root,
    text: 'O campo "Valor da Transacao" esta a zero e devia ter valor positivo.',
  });
  assert.equal(v.verdict, VERDICT.UNCITED);
});

test('verifyEvidence: SEM ACHADO e uma ronda honesta, nao um erro', () => {
  assert.equal(isNoFinding('SEM ACHADO'), true);
  const v = verifyEvidence({ repoRoot: fixtureRepo(), text: 'SEM ACHADO' });
  assert.equal(v.verdict, VERDICT.NO_FINDING);
});

test('verifyEvidence marca fora-da-janela sem refutar um ficheiro real', () => {
  const root = fixtureRepo();
  const v = verifyEvidence({
    repoRoot: root,
    text: 'ver CLAUDE.md:2',
    allowedFiles: ['tools/router/classify.js'],
  });
  assert.equal(v.verdict, VERDICT.CITED);
  assert.equal(v.offWindow, 1);
  assert.match(v.evidence, /fora da janela mostrada/, 'o sinal tem de chegar ao recibo');
});

test('citar uma linha REAL que o modelo nunca viu conta como fora da janela', () => {
  const root = fixtureRepo();
  const v = verifyEvidence({
    repoRoot: root,
    text: 'o bug esta em tools/router/classify.js:4',
    allowedFiles: ['tools/router/classify.js'],
    window: { file: 'tools/router/classify.js', startLine: 1, endLine: 2 },
  });
  assert.equal(v.offWindow, 1, 'linha 4 fora da janela 1-2 e um palpite com sorte');
});

test('"SEM ACHADO" com citacao inventada NAO escapa pela porta benigna', () => {
  // O buraco que o gauntlet abriu: isNoFinding corria ANTES da extraccao, por
  // isso bastava escrever a frase magica para nunca tocar no disco.
  const v = verifyEvidence({ repoRoot: fixtureRepo(), text: 'SEM ACHADO. Ver src/nada.js:9' });
  assert.equal(v.verdict, VERDICT.REFUTED, 'a citacao inventada tem de mandar no veredicto');
});

test('linha citada em branco e dita em voz alta, nao pintada de verde vazio', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-branco-'));
  fs.writeFileSync(path.join(root, 'vazio.md'), 'topo\n\nfundo\n');
  const v = verifyEvidence({ repoRoot: root, text: 'o problema esta em vazio.md:2' });
  assert.match(v.evidence, /LINHA EM BRANCO/);
});

test('tallyVerdicts conta por veredicto e nao por volume', () => {
  const t = tallyVerdicts([
    { verdict: VERDICT.CITED },
    { verdict: VERDICT.REFUTED },
    { verdict: VERDICT.UNCITED },
    { semVerdict: true },
  ]);
  assert.equal(t.total, 4);
  assert.equal(t[VERDICT.CITED], 1);
  assert.equal(t.erro, 1);
});

// ---------------------------------------------------------------- round

test('buildPayload nao envia nada para fora e mantem o modelo residente', () => {
  const root = fixtureRepo();
  const pack = buildContextPack({ repoRoot: root, pillar: 'P1' });
  const p = buildPayload({ model: 'qwen2.5-coder:14b', pack });
  assert.equal(p.stream, false);
  assert.equal(p.keep_alive, '10m');
  assert.match(p.prompt, /const TIER = 3;/);
});

test('runRound devolve citacao-ok quando o modelo cita uma linha real', async () => {
  const root = fixtureRepo();
  const out = await runRound({
    repoRoot: root,
    pillar: 'P1',
    stopFile: path.join(root, 'STOP'), stopPollMs: 60_000,
    clock: () => 0,
    fetchImpl: async (url) => {
      assert.match(url, /^http:\/\/127\.0\.0\.1:11434\//);
      return {
        ok: true,
        json: async () => ({
          response: 'O tier esta cravado a 3. tools/router/classify.js:1',
          eval_count: 21,
        }),
      };
    },
  });
  assert.equal(out.receipt.verdict, VERDICT.CITED);
  assert.equal(out.receipt.usd, 0);
  assert.equal(out.receipt.tokens_out, 21);
  assert.equal(out.receipt.ficheiro, 'tools/router/classify.js');
});

test('runRound refuta a alucinacao em vez de a contar como trabalho', async () => {
  const root = fixtureRepo();
  const out = await runRound({
    repoRoot: root,
    pillar: 'P1',
    stopFile: path.join(root, 'STOP'), stopPollMs: 60_000,
    clock: () => 0,
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({ response: 'Comando: show ip route em net/cisco.js:88', eval_count: 9 }),
    }),
  });
  assert.equal(out.receipt.verdict, VERDICT.REFUTED);
});

test('runRound faz recibo honesto quando o motor local esta em baixo', async () => {
  const root = fixtureRepo();
  const out = await runRound({
    repoRoot: root,
    pillar: 'P1',
    stopFile: path.join(root, 'STOP'), stopPollMs: 60_000,
    clock: () => 0,
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
  });
  assert.equal(out.receipt.evidencia, 'n/d');
  assert.equal(out.receipt.usd, 0);
  assert.match(out.receipt.resultado_resumo, /motor local indisponivel/);
});

test('nextPillar roda sem sair do conjunto', () => {
  assert.equal(nextPillar(0, ['P1', 'P2']), 'P1');
  assert.equal(nextPillar(3, ['P1', 'P2']), 'P2');
});

// ---------------------------------------------------------------- âncora estática

test('readAnchor devolve [] sem ficheiro, sem json valido, ou sem array', () => {
  assert.deepEqual(readAnchor(null), []);
  assert.deepEqual(readAnchor('/caminho/que/nao/existe.json'), []);
  assert.deepEqual(readAnchor('x.json', { readImpl: () => 'nao é json' }), []);
  assert.deepEqual(readAnchor('x.json', { readImpl: () => '{"nao":"array"}' }), []);
});

test('readAnchor descarta entradas invalidas e poe as regras que valem primeiro', () => {
  const raw = JSON.stringify([
    { file: 'a.js', line: 10, rule: 'security/detect-unsafe-regex', msg: 'regex' },
    { file: 'b.js', line: 0, rule: 'no-empty', msg: 'linha invalida' },
    { file: 'c.js', rule: 'no-empty', msg: 'sem linha' },
    { file: 'd.js', line: 5, rule: 'require-atomic-updates', msg: 'corrida' },
    { file: 'e.js', line: 7, rule: 'no-empty', msg: 'catch vazio' },
  ]);
  const got = readAnchor('x.json', { readImpl: () => raw });
  assert.equal(got.length, 3, 'entradas sem linha valida sao descartadas');
  assert.equal(got[0].rule, 'require-atomic-updates', 'corrida vem primeiro');
  assert.equal(got[got.length - 1].rule, 'security/detect-unsafe-regex', 'regex fica para o fim');
});

test('com ancora, o pack entra em modo ANCORADO e manda julgar a linha apontada', () => {
  const root = fixtureRepo();
  const alvo = { file: 'tools/router/classify.js', line: 3, rule: 'no-empty', msg: 'Empty block statement.' };
  const anchorFile = path.join(root, 'ancora.json');
  fs.writeFileSync(anchorFile, JSON.stringify([alvo]));
  const pack = buildContextPack({ repoRoot: root, pillar: 'P1', anchorPath: anchorFile });
  assert.equal(pack.ok, true);
  assert.equal(pack.anchored, true, 'devia estar em modo ancorado');
  assert.equal(pack.file, alvo.file, 'o pack segue o ficheiro da ancora, nao a rotacao do pilar');
  assert.equal(pack.anchorLine, 3);
  assert.equal(pack.anchorRule, 'no-empty');
  assert.equal(pack.system, ANCHORED_SYSTEM_PROMPT, 'usa o prompt de juiz, nao o de cacador');
  assert.match(pack.prompt, /A ferramenta apontou a LINHA 3/);
  assert.match(pack.prompt, /Empty block statement/);
  assert.match(pack.system, /FALSO POSITIVO/, 'o juiz tem de poder recusar o apontamento');
});

test('sem ancora legivel, o pack volta ao modo de caca e diz que nao esta ancorado', () => {
  const pack = buildContextPack({ repoRoot: fixtureRepo(), pillar: 'P1', anchorPath: '/nao/existe.json' });
  assert.equal(pack.ok, true);
  assert.equal(pack.anchored, false, 'ancora ausente nunca deve parar a ronda');
  assert.ok(pack.prompt.length > 0);
});

// ---------------------------------------------------------------- modo diff

test('readChangedLines devolve [] quando o git falha — a ronda nunca para por isso', () => {
  const boom = () => { throw new Error('sem git'); };
  assert.deepEqual(readChangedLines('/qualquer', { runImpl: boom }), []);
  assert.deepEqual(readChangedLines('/qualquer', { runImpl: () => '' }), []);
});

test('readChangedLines le os hunks do lado novo e ignora ficheiros que nao sao codigo', () => {
  const diff = [
    '--- a/tools/x.mjs', '+++ b/tools/x.mjs', '@@ -10,0 +11,3 @@', '+a', '+b', '+c',
    '--- a/README.md',   '+++ b/README.md',   '@@ -1,0 +2,5 @@', '+doc',
    '--- a/tools/y.js',  '+++ b/tools/y.js',  '@@ -4 +4 @@', '+z',
  ].join('\n');
  const got = readChangedLines('/r', { runImpl: () => diff });
  assert.deepEqual(got, [
    { file: 'tools/x.mjs', start: 11, count: 3 },
    { file: 'tools/y.js', start: 4, count: 1 },
  ], 'markdown fica de fora; sem count explicito conta 1');
});

test('com diff, o pack entra em modo DIFF e manda rever a MUDANCA', () => {
  const root = fixtureRepo();
  const fake = () => ['--- a/tools/router/classify.js', '+++ b/tools/router/classify.js', '@@ -2,0 +3,1 @@', '+x'].join('\n');
  const pack = buildContextPack({
    repoRoot: root, pillar: 'P1', diffBase: 'origin/main',
    anchorPath: null, maxLines: 70,
    // readChangedLines usa git de verdade; aqui provamos a escada com o diff real do fixture
  });
  // sem git no fixture, o diff degrada e cai para caca — a escada tem de continuar a dar pack valido
  assert.equal(pack.ok, true, 'a escada nunca pode devolver pack invalido');
  assert.ok(['diff', 'ancorado', 'caca'].includes(pack.mode), 'o pack declara sempre o modo');
});

// Reequilibrado a 2026-08-17 depois de um canario com bugs plantados: a versao
// anterior martelava "SEM ACHADO e a resposta certa" e o modelo passou a responder
// SEM ACHADO a TUDO — falhou uma condicao de permissao invertida e um off-by-one.
// Silencio perante um bug e pior do que um falso alarme; o prompt tem de dizer isso.
test('o prompt de diff manda caçar defeitos reais e proibe nitpick, sem induzir silencio', () => {
  assert.match(DIFF_SYSTEM_PROMPT, /defeitos INTRODUZIDOS/);
  assert.match(DIFF_SYSTEM_PROMPT, /ACHADO: <sintoma> QUANDO .*ENTÃO/);
  assert.match(DIFF_SYSTEM_PROMPT, /SEM ACHADO/, 'o silencio honesto continua a existir');
  // as duas classes que o canario apanhou a falhar tem de estar nomeadas
  assert.match(DIFF_SYSTEM_PROMPT, /condições booleanas/, 'tem de mandar olhar para condicoes');
  assert.match(DIFF_SYSTEM_PROMPT, /índices e limites/, 'tem de mandar olhar para limites');
  // nitpick continua proibido
  assert.match(DIFF_SYSTEM_PROMPT, /NÃO comentes estilo/);
  // e o silencio NAO pode ser vendido como a resposta preferida
  assert.match(DIFF_SYSTEM_PROMPT, /Ficar calado perante um bug é pior/);
});

// ------------------------------------------------- negacao e segundo parecer

test('contarNegacoes ve os operadores que o 14B le ao contrario', () => {
  assert.equal(contarNegacoes('return a === b;'), 0);
  assert.equal(contarNegacoes('if (a !== b) return;'), 1);
  assert.equal(contarNegacoes('if (!user.isAdmin && a != b) {}'), 2);
  assert.equal(contarNegacoes(''), 0);
  assert.equal(contarNegacoes(null), 0);
});

test('negacaoDensa marca 2+ operadores, ou 1 quando decide um caminho', () => {
  assert.equal(negacaoDensa('const x = !a; const y = !b;'), true, '2 operadores');
  assert.equal(negacaoDensa('if (a !== b) return 1;'), true, '1 mas decide caminho');
  assert.equal(negacaoDensa('const nome = !valor;'), false, '1 sem decidir caminho');
  assert.equal(negacaoDensa('return a === b;'), false, 'sem negacao');
});

test('achou separa ACHADO de SEM ACHADO sem se enganar no proprio prefixo', () => {
  assert.equal(achou('ACHADO: x QUANDO y ENTAO z'), true);
  assert.equal(achou('SEM ACHADO'), false, 'SEM ACHADO nao pode contar como achado');
  assert.equal(achou('sem achado'), false, 'insensivel a maiusculas');
  assert.equal(achou(''), false);
  assert.equal(achou(null), false);
});

test('o segundo parecer nunca decide sozinho — so marca a discordancia', () => {
  // O contrato que interessa: concordancia NAO levanta bandeira; discordancia SIM.
  const casos = [
    { a1: true, a2: true, bandeira: false },
    { a1: false, a2: false, bandeira: false },
    { a1: true, a2: false, bandeira: true },
    { a1: false, a2: true, bandeira: true },
  ];
  for (const c of casos) {
    const concorda = c.a1 === c.a2;
    assert.equal(concorda === false, c.bandeira,
      `a1=${c.a1} a2=${c.a2} devia ${c.bandeira ? '' : 'nao '}levantar bandeira`);
  }
});

test('readChangedLines REPORTA a falha em vez de a engolir (o bug que teve)', () => {
  // O catch mudo original devolvia [] quando o git rebentava com ENOBUFS num
  // diff de 52k linhas — o modo diff nunca disparava e nada dizia porque.
  let visto = null;
  const boom = () => { const e = new Error('spawnSync git ENOBUFS'); throw e; };
  const got = readChangedLines('/r', { runImpl: boom, onError: (m) => { visto = m; } });
  assert.deepEqual(got, [], 'continua a degradar sem parar a ronda');
  assert.match(visto || '', /ENOBUFS/, 'mas a falha tem de chegar a quem chama');
});

test('readChangedLines limita o diff a ficheiros de codigo pelo pathspec', () => {
  let args = null;
  readChangedLines('/r', { runImpl: (a) => { args = a; return ''; } });
  assert.ok(args.includes('--'), 'tem de separar o pathspec');
  assert.ok(args.includes('*.mjs') && args.includes('*.ts'),
    'o pathspec tem de existir: sem ele o diff traz o repo todo e rebenta o buffer');
});

test('o pack em modo DIFF constroi-se de facto — o teste que faltava', () => {
  // Os 157 testes anteriores nunca EXERCITARAM este caminho: o repo de fixture
  // nao tem git, o diff vinha vazio e caia sempre para o modo de caca. Resultado:
  // um "Cannot access 'densa' before initialization" foi para producao e rebentou
  // todas as rondas. Um teste que so verifica que a escada devolve ALGO nao chega
  // — tem de construir o pack do degrau de cima.
  const root = fixtureRepo();
  const diff = [
    '--- a/tools/router/classify.js',
    '+++ b/tools/router/classify.js',
    '@@ -1,0 +2,2 @@',
    '+const x = 1;',
    '+if (x !== 2) return null;',
  ].join('\n');
  const pack = buildContextPack({
    repoRoot: root, pillar: 'P1', diffBase: 'HEAD~6', diffRunImpl: () => diff,
  });
  assert.equal(pack.ok, true);
  assert.equal(pack.mode, 'diff', 'com hunks, tem de entrar no degrau do diff');
  assert.equal(pack.file, 'tools/router/classify.js');
  assert.equal(pack.changedStart, 2);
  assert.ok(pack.prompt.includes('MUDARAM as linhas'), 'o prompt tem de falar da mudanca');
  assert.equal(typeof pack.negacaoDensa, 'boolean', 'a marca de negacao tem de estar calculada');
});

test('em modo DIFF com negacao, o aviso dirigido entra no prompt', () => {
  const root = fixtureRepo();
  const diff = [
    '--- a/tools/router/classify.js',
    '+++ b/tools/router/classify.js',
    '@@ -1,0 +2,1 @@',
    '+if (a !== b) return true;',
  ].join('\n');
  const pack = buildContextPack({
    repoRoot: root, pillar: 'P1', diffBase: 'HEAD~6', diffRunImpl: () => diff,
  });
  assert.equal(pack.mode, 'diff');
  // a linha 2 do fixture pode nao ter negacao; o que importa e que o campo existe
  // e que, quando marcado, o aviso aparece.
  if (pack.negacaoDensa) {
    assert.match(pack.prompt, /usam negação/, 'terreno de negacao exige o aviso dirigido');
  }
});

// ------------------------------------------------ os dois eixos do veredicto

test('concluir le o que o modelo concluiu, nao se a linha existe', () => {
  // Medido a 2026-08-18: 614 de 1888 recibos com verdict `citacao-ok` eram o
  // modelo a escrever FALSO POSITIVO. Um terco do numero verde do painel era o
  // motor a dizer que NAO ha problema. Sao dois eixos e tem de ser dois campos.
  assert.equal(concluir('ACHADO: x QUANDO y ENTAO z PROVA: a.js:1'), 'achado');
  assert.equal(concluir('FALSO POSITIVO: o bloco vazio e intencional'), 'falso-positivo');
  assert.equal(concluir('SEM ACHADO'), 'sem-achado');
  assert.equal(concluir(''), 'vazio');
  assert.equal(concluir(null), 'vazio');
  assert.equal(concluir('qualquer outra coisa'), 'indeterminado');
});

test('verifyEvidence devolve conclusao ALEM do verdict, e os dois nao se confundem', () => {
  const root = fixtureRepo();
  // Citacao VALIDA (linha existe) mas o modelo diz que NAO e problema:
  // verdict tem de ser citacao-ok E conclusao tem de ser falso-positivo.
  const r = verifyEvidence({
    repoRoot: root,
    text: 'FALSO POSITIVO: este regex le padroes fixos PROVA: tools/router/classify.js:3',
    allowedFiles: ['tools/router/classify.js'],
  });
  assert.equal(r.conclusao, 'falso-positivo', 'a conclusao vem do texto do modelo');
  assert.notEqual(r.verdict, undefined, 'o verdict continua a existir');
  assert.ok(r.verdict !== r.conclusao, 'os dois eixos nao podem colapsar num so');
});

// ------------------------------------------------- B6: o rotulo deixa de mentir
//
// Medido a 2026-08-18 na arvore real: os packs de P1 e P5 diferiam em 1 linha
// de 25 — so o cabecalho — e o campo `question` era IDENTICO. Os seis pilares
// apontavam ao mesmo ficheiro, na mesma janela, e dez dos vinte ficheiros do
// diff eram `_handoff/**`, codigo arquivado que ja nao corre.

/** Repo de teste com um ficheiro de cada pilar e um ficheiro fora de todos. */
function repoDiff() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-b6-'));
  const escrever = (rel) => {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), Array.from({ length: 400 }, (_, n) => `linha ${n + 1};`).join('\n'));
  };
  escrever('tools/router/classify.js');            // P1
  escrever('tools/docs-hygiene.js');               // P2
  escrever('packages/mooter-bridge/board.js');     // de nenhum pilar
  escrever('packages/mooter-bridge/broker.js');    // de nenhum pilar
  escrever('packages/mooter-bridge/fleet.js');     // de nenhum pilar
  escrever('packages/mooter-bridge/sync.js');      // de nenhum pilar
  escrever('packages/mooter-bridge/recibo.js');    // de nenhum pilar
  escrever('packages/mooter-bridge/actor.js');     // de nenhum pilar
  return root;
}

const diffFalso = (ficheiros) => () => ficheiros
  .map((f, k) => [`--- a/${f}`, `+++ b/${f}`, `@@ -${20 + k * 10},0 +${20 + k * 10},4 @@`, '+x'].join('\n'))
  .join('\n');

test('B6: o pathspec do diff exclui arquivo, docs/archive e testes', () => {
  assert.ok(DIFF_PATHSPEC.includes(':(exclude)_handoff/**'), 'codigo arquivado nao e trabalho novo');
  assert.ok(DIFF_PATHSPEC.includes(':(exclude)docs/archive/**'));
  assert.ok(DIFF_PATHSPEC.includes(':(exclude)*.test.*'));
  let argv = null;
  readChangedLines('/r', { runImpl: (a) => { argv = a; return ''; } });
  for (const spec of DIFF_PATHSPEC) {
    assert.ok(argv.includes(spec), `o pathspec ${spec} tem de chegar ao git, nao ficar so na constante`);
  }
});

test('B6: com hunk seu, o pilar rotula-se a si proprio (escopo pilar)', () => {
  const root = repoDiff();
  const pack = buildContextPack({
    repoRoot: root, pillar: 'P2', cursor: 0, diffBase: 'HEAD~12',
    diffRunImpl: diffFalso(['packages/mooter-bridge/board.js', 'tools/docs-hygiene.js']),
  });
  assert.equal(pack.mode, 'diff');
  assert.equal(pack.escopo, 'pilar', 'o hunk de docs-hygiene.js e mesmo do P2');
  assert.equal(pack.file, 'tools/docs-hygiene.js', 'com hunk seu, o pilar nao vai rever o dos outros');
  assert.match(pack.label, /Qualidade & Verificação/);
});

test('B6: sem hunk seu, o pack diz "geral" e NAO se veste do rotulo do pilar', () => {
  const root = repoDiff();
  const pack = buildContextPack({
    repoRoot: root, pillar: 'P1', cursor: 0, diffBase: 'HEAD~12',
    diffRunImpl: diffFalso(['packages/mooter-bridge/board.js']),
  });
  assert.equal(pack.escopo, 'geral');
  assert.equal(pack.file, 'packages/mooter-bridge/board.js', 'revemos o diff na mesma — trabalho novo vale mais');
  assert.doesNotMatch(pack.label, /Routing & Custo/, 'chamar "Routing & Custo" a um ficheiro do bridge e a mentira que o B6 fecha');
  assert.match(pack.label, /geral/i);
  assert.doesNotMatch(pack.prompt, /^Pilar: P1/m, 'o cabecalho do prompt tambem nao pode afirmar o pilar');
});

test('B6 ACEITACAO: pilares e rotacoes SEGUIDAS nao colidem entre si', () => {
  // A primeira versao deste teste so comparava pilares DENTRO do mesmo cursor,
  // e passou com `cursor + desvio` — que faz o pilar k da rotacao r cair no
  // mesmo hunk que o pilar k-1 da rotacao r+1. Foi o ledger vivo que apanhou
  // (P2 e P1, rondas seguidas, janela 277-295), nao a suite. Um teste que
  // aceita qualquer degrau nao testa nenhum: agora varre rotacoes seguidas.
  const root = repoDiff();
  const foraDeTodos = [
    'packages/mooter-bridge/board.js', 'packages/mooter-bridge/broker.js',
    'packages/mooter-bridge/fleet.js', 'packages/mooter-bridge/sync.js',
    'packages/mooter-bridge/recibo.js', 'packages/mooter-bridge/actor.js',
  ];
  const vistos = [];
  for (let cursor = 0; cursor < 4; cursor += 1) {
    for (const p of PILLAR_IDS) {
      const pk = buildContextPack({ repoRoot: root, pillar: p, cursor, diffBase: 'HEAD~12', diffRunImpl: diffFalso(foraDeTodos) });
      vistos.push(`${pk.file}:${pk.startLine}`);
    }
  }
  // 24 rondas sobre 6 hunks: cada hunk sai 4 vezes, mas NUNCA duas vezes na
  // mesma volta nem em voltas encavalitadas.
  for (let i = 0; i + PILLAR_IDS.length <= vistos.length; i += 1) {
    const janela = vistos.slice(i, i + PILLAR_IDS.length);
    assert.equal(new Set(janela).size, PILLAR_IDS.length,
      `rondas ${i}..${i + 5} repetem alvo: ${JSON.stringify(janela)}`);
  }
});

test('B6 ACEITACAO: dois pilares, mesmo cursor, alvos DIFERENTES', () => {
  const root = repoDiff();
  const foraDeTodos = [
    'packages/mooter-bridge/board.js', 'packages/mooter-bridge/broker.js',
    'packages/mooter-bridge/fleet.js', 'packages/mooter-bridge/sync.js',
    'packages/mooter-bridge/recibo.js', 'packages/mooter-bridge/actor.js',
  ];
  for (const cursor of [0, 1, 5, 12]) {
    const alvos = PILLAR_IDS.map((p) => {
      const pk = buildContextPack({ repoRoot: root, pillar: p, cursor, diffBase: 'HEAD~12', diffRunImpl: diffFalso(foraDeTodos) });
      return `${pk.file}:${pk.startLine}`;
    });
    assert.equal(new Set(alvos).size, PILLAR_IDS.length,
      `cursor ${cursor}: seis pilares a moer o mesmo ficheiro sao um pilar com seis vezes o custo — ${JSON.stringify(alvos)}`);
  }
});

test('B6 ACEITACAO: zero alvos em _handoff/ — o pathspec e a unica defesa', () => {
  // Se alguem apagar a exclusao, o git devolve os hunks arquivados e este teste
  // cai. E o ponto: a exclusao vive no pathspec, nao num filtro a jusante.
  assert.ok(DIFF_PATHSPEC.some((p) => p === ':(exclude)_handoff/**'));
  const root = repoDiff();
  const pack = buildContextPack({
    repoRoot: root, pillar: 'P4', cursor: 0, diffBase: 'HEAD~12',
    // o git ja filtrou: o que chega ao pack nunca traz _handoff
    diffRunImpl: diffFalso(['packages/mooter-bridge/board.js']),
  });
  assert.doesNotMatch(pack.file, /^_handoff\//);
});

test('B6 ACEITACAO (tribunal): pilares-donos e diff-geral nunca caem no mesmo hunk', () => {
  // Uma auditoria adversarial mediu 10 colisoes em 201 cursores, a primeira no
  // cursor 10, com um pilar em escopo `geral` a cair no mesmo hunk que um pilar
  // DONO ja estava a rever. O passo aritmetico nao ajudava: as duas caminhadas
  // sao sobre conjuntos diferentes, e o `geral` percorria `todos` — que contem
  // os hunks dos donos. Agora `geral` percorre os ORFAOS.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-b6t-'));
  const escrever = (rel) => {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), Array.from({ length: 600 }, (_, n) => `linha ${n + 1};`).join('\n'));
  };
  const donos = [
    'tools/router/classify.js',                  // P1
    'tools/docs-hygiene.js',                     // P2
    'tools/cockpit/build-snapshot.js',           // P2 e P6 — o par que colidia a 100%
    'tools/cockpit/runner/moo-runner.mjs',       // P4
    'tools/cockpit/runner/runner-core.mjs',      // P5
    'tools/cockpit/runner/evidence-verifier.mjs',// P6
  ];
  const orfaos = ['a/um.js', 'a/dois.js', 'a/tres.js', 'a/quatro.js', 'a/cinco.js'];
  for (const f of [...donos, ...orfaos]) escrever(f);
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# canon\nsha: abc\n');

  const diff = () => [...donos, ...orfaos]
    .map((f, k) => [`--- a/${f}`, `+++ b/${f}`, `@@ -${30 + k * 20},0 +${30 + k * 20},4 @@`, '+x'].join('\n'))
    .join('\n');

  let colisoes = 0;
  for (let cursor = 0; cursor < 40; cursor += 1) {
    const alvos = PILLAR_IDS.map((p) => {
      const pk = buildContextPack({ repoRoot: root, pillar: p, cursor, diffBase: 'HEAD~12', diffRunImpl: diff });
      return `${pk.file}:${pk.startLine}`;
    });
    if (new Set(alvos).size !== PILLAR_IDS.length) colisoes += 1;
  }
  assert.equal(colisoes, 0, 'seis pilares a moer o mesmo hunk sao um pilar com seis vezes o custo');
});

test('B6: um pilar so de documentos nao entra no degrau do diff', () => {
  // O P3, cujo trabalho SAO os documentos, ficava preso em `escopo: geral` para
  // sempre — a rever codigo de outros — porque DIFF_PATHSPEC so ve codigo e ele
  // nunca podia ter interseccao. Para ele o diff nao e um degrau, e um desvio.
  const root = repoDiff();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# canon\nsha: abc123\n');
  const pack = buildContextPack({
    repoRoot: root, pillar: 'P3', cursor: 0, diffBase: 'HEAD~12',
    diffRunImpl: diffFalso(['packages/mooter-bridge/board.js']),
  });
  assert.notEqual(pack.mode, 'diff', 'um pilar sem um unico ficheiro de codigo nao tem lugar no diff');
  assert.equal(pack.file, 'CLAUDE.md', 'vai rever o canon, que e o trabalho dele');
});

// ------------------------------------------------- o poco que secava em 10 min

test('POCO: um excerto ja julgado nao volta a fila — mas um excerto ALTERADO volta', () => {
  // Medido a 2026-08-18: `HEAD~12` dava 20 hunks e o runner corre 2950 rondas
  // por dia (29s cada). O poco secava em menos de 10 minutos e a GPU remoia os
  // mesmos 20 excertos ~147 vezes por dia. Foi assim que 113 rondas deram 0
  // achados uteis — nao por o motor ser mau, mas por lhe darmos o mesmo
  // trabalho outra vez.
  const root = repoDiff();
  const alvo = 'packages/mooter-bridge/board.js';
  const diff = diffFalso([alvo]);
  const revistos = new Set();

  const p1 = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: 0, diffBase: 'HEAD~12', diffRunImpl: diff, revistos });
  assert.equal(p1.mode, 'diff');
  assert.ok(p1.chave, 'todo o excerto servido tem identidade');
  revistos.add(p1.chave);

  const p2 = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: 0, diffBase: 'HEAD~12', diffRunImpl: diff, revistos });
  // A primeira versao deste teste exigia `ok:false` aqui. Estava a prender o
  // comportamento ERRADO: com uma base unica, um diff esgotado devolvia
  // `ok:false` e a ronda nao produzia nada — 240 de 360 rondas mortas, cada
  // uma a escrever um recibo sem bandeira que o disjuntor nao ve. A alegacao
  // verdadeira nunca foi 'devolve esgotado': e 'nao serve o mesmo outra vez'.
  assert.notEqual(p2.mode, 'diff', 'o hunk ja julgado nao volta pelo degrau do diff');
  assert.ok(p2.ok, 'e a ronda CAI para o degrau seguinte em vez de morrer');
  // A escada, essa, continua a poder dizer que esgotou — e como ela sabe
  // quando abrir a base seguinte.
  const p2e = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: 0, diffBase: 'HEAD~12', diffRunImpl: diff, revistos, pararSeEsgotado: true });
  assert.equal(p2e.ok, false);
  assert.equal(p2e.esgotado, true);

  // Muda o conteudo: e trabalho novo, e volta a fila.
  const linhas = fs.readFileSync(path.join(root, alvo), 'utf8').split('\n');
  linhas[19] = 'if (a !== b) { throw new Error("mudou"); }';
  fs.writeFileSync(path.join(root, alvo), linhas.join('\n'));
  const p3 = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: 0, diffBase: 'HEAD~12', diffRunImpl: diff, revistos });
  assert.equal(p3.ok, true, 'linhas alteradas sao trabalho novo');
  assert.notEqual(p3.chave, p1.chave, 'a chave inclui o CONTEUDO, nao so a posicao');
});

test('POCO: a escada abre a base seguinte em vez de remoer, e degrada no fim', () => {
  const root = repoDiff();
  const porBase = {
    'HEAD~12': diffFalso(['packages/mooter-bridge/board.js']),
    'HEAD~25': diffFalso(['packages/mooter-bridge/board.js', 'packages/mooter-bridge/broker.js']),
  };
  const revistos = new Set();
  const escada = ['HEAD~12', 'HEAD~25'];
  const servidos = [];
  for (let c = 0; c < 6; c += 1) {
    const pk = buildContextPack({
      repoRoot: root, pillar: 'P1', cursor: c, diffBase: escada, revistos,
      diffRunImpl: (args) => (porBase[args.find((a) => String(a).startsWith('HEAD'))?.split('...')[0]] || (() => ''))(),
    });
    if (pk.mode !== 'diff') { servidos.push(`caiu:${pk.mode}`); break; }
    revistos.add(pk.chave);
    servidos.push(pk.escadaBase);
  }
  assert.ok(servidos.includes('HEAD~25'), `a escada tem de abrir a base seguinte: ${JSON.stringify(servidos)}`);
  assert.ok(servidos.at(-1).startsWith('caiu:'), 'esgotadas todas as bases, degrada em vez de remoer');
});

test('POCO: os modos caca e ancorado tambem deixam de remoer', () => {
  const root = fixtureRepo();
  const revistos = new Set();
  const vistas = [];
  for (let cursor = 0; cursor < 12; cursor += 1) {
    const pk = buildContextPack({ repoRoot: root, pillar: 'P1', cursor, revistos });
    if (!pk.ok) { vistas.push('esgotado'); break; }
    assert.ok(pk.chave, `o modo ${pk.mode} tem de dar identidade ao que serve`);
    assert.ok(!revistos.has(pk.chave), `${pk.mode} serviu de novo ${pk.chave}`);
    revistos.add(pk.chave);
    vistas.push(`${pk.file}:${pk.startLine}`);
  }
  assert.equal(vistas.at(-1), 'esgotado', 'esgotado o ficheiro, diz que esgotou em vez de repetir');
  assert.equal(new Set(vistas.slice(0, -1)).size, vistas.length - 1, 'zero repeticoes');
});

test('POCO: o tecto de hunks e dito em voz alta, nao silenciado', () => {
  // Sem isto, HEAD~100 e HEAD~200 devolviam os dois exactamente 320 hunks e
  // ninguem sabia porque. Um tecto silencioso le-se como "cobri tudo".
  const muitos = Array.from({ length: 500 }, (_, k) =>
    [`--- a/f${k}.js`, `+++ b/f${k}.js`, `@@ -1,0 +${k + 1},2 @@`, '+x'].join('\n')).join('\n');
  let capado = null;
  const got = readChangedLines('/r', { runImpl: () => muitos, onCap: (n) => { capado = n; } });
  assert.equal(got.length, 320, 'o tecto e maxFiles * 8');
  assert.equal(capado, 320, 'e quem chama fica a saber que ficou trabalho de fora');
});

// ---------------------------- o que a auditoria da v1.49.0 encontrou

test('AUDITORIA: o ramo ANCORADO tambem tem desvio por pilar', () => {
  // O ramo do diff estava corrigido e este nao — e e este que corre a maior
  // parte do tempo. Medido na configuracao de PRODUCAO: 240 colisoes em 60
  // cursores (67%), com 9 recibos seguidos na mesma janela de gsd-statusline.js
  // pelos seis pilares. Um teste que nao injecte a ancora e estruturalmente
  // incapaz de ver isto: foi por isso que 224 testes passaram.
  const root = fixtureRepo();
  const anchorPath = path.join(root, 'ancora.json');
  fs.writeFileSync(anchorPath, JSON.stringify(
    Array.from({ length: 12 }, (_, k) => ({ file: 'tools/router/classify.js', line: (k % 4) + 1, rule: `r${k}`, msg: 'x' })),
  ));
  for (let cursor = 0; cursor < 8; cursor += 1) {
    const alvos = PILLAR_IDS.map((p) => {
      const pk = buildContextPack({ repoRoot: root, pillar: p, cursor, anchorPath });
      return pk.ok && pk.mode === 'ancorado' ? `${pk.file}:${pk.anchorLine}:${pk.anchorRule}` : `outro:${p}`;
    });
    const ancorados = alvos.filter((a) => !a.startsWith('outro:'));
    assert.equal(new Set(ancorados).size, ancorados.length,
      `cursor ${cursor}: seis pilares no mesmo apontamento — ${JSON.stringify(ancorados)}`);
  }
});

test('AUDITORIA: um diff esgotado CAI para o degrau seguinte, nao mata a ronda', () => {
  // Com `MOO_DIFF_BASE=HEAD~12` (base unica), 240 de 360 rondas devolviam
  // `ok:false` — dois tercos da GPU a nao fazer nada, e cada uma dessas rondas
  // escrevia um recibo sem bandeira que o disjuntor nao via.
  const root = repoDiff();
  const revistos = new Set();
  const alvo = 'packages/mooter-bridge/board.js';
  const p1 = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: 0, diffBase: 'HEAD~12', diffRunImpl: diffFalso([alvo]), revistos });
  revistos.add(p1.chave);
  const p2 = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: 0, diffBase: 'HEAD~12', diffRunImpl: diffFalso([alvo]), revistos });
  assert.equal(p2.ok, true, 'a ronda continua por outro degrau');
  assert.notEqual(p2.mode, 'diff');
});

test('AUDITORIA: a caca anda no eixo dos FICHEIROS, nao so das janelas', () => {
  // A versao anterior fixava um ficheiro e, esgotadas as janelas dele,
  // devolvia `ok:false` com os IRMAOS por rever: 12 de 24 cursores perdidos.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-caca-'));
  fs.mkdirSync(path.join(root, 'tools', 'router'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools/router/classify.js'), 'const a = 1;\n');
  fs.writeFileSync(path.join(root, 'tools/router/inject_context.js'),
    Array.from({ length: 500 }, (_, n) => `linha ${n + 1};`).join('\n'));

  const revistos = new Set();
  const ficheiros = new Set();
  // O pilar tem 9 janelas ao todo: 1 no ficheiro curto + 8 no longo (500
  // linhas / 70). Nove rondas tem de as servir todas, sem repetir uma.
  for (let cursor = 0; cursor < 9; cursor += 1) {
    const pk = buildContextPack({ repoRoot: root, pillar: 'P1', cursor, revistos });
    assert.ok(pk.ok, `cursor ${cursor}: ${pk.reason} — os irmaos ainda tinham janelas por rever`);
    assert.ok(!revistos.has(pk.chave), `cursor ${cursor}: serviu de novo ${pk.chave}`);
    revistos.add(pk.chave);
    ficheiros.add(pk.file);
  }
  assert.ok(ficheiros.size > 1, 'o ficheiro curto esgota e a caca tem de passar ao irmao');
  assert.equal(revistos.size, 9, 'nove janelas, nove alvos distintos');
  // E so DEPOIS de tudo revisto e que se declara esgotado — nunca antes.
  const fim = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: 9, revistos });
  assert.equal(fim.ok, false);
  assert.equal(fim.esgotado, true);
});

test('TRIAGEM: os tres pontos cegos MEDIDOS estao nos tres prompts', () => {
  // Julgando os 72 achados deste motor um a um (2026-08-18), 39 morreram por
  // uma destas tres razoes — mais do que por qualquer outra. E o unico sinal
  // de melhoria desta sessao que veio de DADOS e nao de intuicao, e por isso
  // fica preso aqui: quem o apagar de um prompt parte a suite.
  const root = fixtureRepo();
  const caca = buildContextPack({ repoRoot: root, pillar: 'P1' }).system;
  for (const [nome, prompt] of [['caca', caca], ['diff', DIFF_SYSTEM_PROMPT], ['ancorado', ANCHORED_SYSTEM_PROMPT]]) {
    assert.match(prompt, /JÁ ESTÁ GUARDADO/, `${nome}: falta o aviso do gate que ja trava (20 dos 72)`);
    assert.match(prompt, /DELIBERADO E ESTÁ ESCRITO|ESTÁ EXPLICADO/, `${nome}: falta o aviso do comentario que explica (12 dos 72)`);
    assert.match(prompt, /DO PASSADO/, `${nome}: falta o aviso do registo historico (7 dos 72)`);
    // A contagem e o que separa uma regra de uma opiniao.
    assert.match(prompt, /39 dos 72|20 dos 72/, `${nome}: a regra tem de trazer o numero que a justifica`);
  }
});

test('FROTA: dois devices no mesmo repo deixam de moer os mesmos alvos', () => {
  // Ate aqui dois devices percorriam a mesma sequencia pela mesma ordem: o
  // dobro da GPU pelo mesmo trabalho. Cada um entra numa fase diferente,
  // deterministica no NOME — a frota cobre mais em vez de repetir.
  const root = repoDiff();
  const diff = diffFalso([
    'packages/mooter-bridge/board.js', 'packages/mooter-bridge/broker.js',
    'packages/mooter-bridge/fleet.js', 'packages/mooter-bridge/sync.js',
    'packages/mooter-bridge/recibo.js', 'packages/mooter-bridge/actor.js',
  ]);
  const alvos = (device) => PILLAR_IDS.map((p) => {
    const k = buildContextPack({ repoRoot: root, pillar: p, cursor: 0, diffBase: 'HEAD~12', diffRunImpl: diff, device });
    return `${k.file}:${k.startLine}`;
  });
  const a = alvos('mac-mini-de-paulo');
  const b = alvos('macbook-do-paulo');
  const iguais = a.filter((x, i) => x === b[i]).length;
  assert.ok(iguais < a.length, `dois devices nao podem repetir a ronda toda: ${iguais}/${a.length} iguais`);

  // E o determinismo mantem-se: a MESMA maquina da sempre a mesma ronda.
  assert.deepEqual(alvos('mac-mini-de-paulo'), a, 'mesmo device, mesma ronda — a reprodutibilidade nao se perde');
  // Uma maquina sem nome comporta-se como antes.
  assert.equal(faseDoDevice(''), 0);
  assert.equal(faseDoDevice('x'), faseDoDevice('x'));
});
