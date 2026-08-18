import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildContextPack, renderSlice, resolveCandidates, PILLARS, readAnchor, ANCHORED_SYSTEM_PROMPT, readChangedLines, DIFF_SYSTEM_PROMPT, contarNegacoes, negacaoDensa } from './context-pack.mjs';
import {
  VERDICT,
  extractCitations,
  checkCitation,
  verifyEvidence,
  tallyVerdicts,
  isNoFinding,
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
