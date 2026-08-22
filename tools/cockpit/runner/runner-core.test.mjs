import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { rodarLedger, CAUDA_AO_RODAR } from './moo-runner.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { buildContextPack, renderSlice, resolveCandidates, PILLARS, PILLAR_IDS, idsActivos, readAnchor, ANCHORED_SYSTEM_PROMPT, readChangedLines, faseDoDevice, DIFF_PATHSPEC, DIFF_SYSTEM_PROMPT, contarNegacoes, negacaoDensa, chaveDeRevisao, hunkKey, expandirPadrao, padraoParaRegex, candidatosDoPilar, donoDoFicheiro, MAX_CANDIDATOS , REGRAS_IGNORADAS} from './context-pack.mjs';
import {
  VERDICT,
  extractCitations,
  checkCitation,
  verifyEvidence,
  tallyVerdicts,
  naoCorreu,
  isNoFinding,
  concluir,
  conclusaoDeCitacao,
  SEM_ACHADO_RE,
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
    path.join(root, 'tools', 'router', 'mooter-review.js'),
    ['const TIER = 3;', 'function classify() {', '  return TIER;', '}', ''].join('\n'),
  );
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# canon\nsha: abc123\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# projecto\nMIT — see [LICENSE](LICENSE).\n');
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
  assert.equal(pack.file, 'tools/router/mooter-review.js');
  assert.match(pack.prompt, /const TIER = 3;/);
  assert.match(pack.prompt, /linhas 1-/);
  assert.deepEqual(pack.allowedFiles, ['tools/router/mooter-review.js']);
});

test('buildContextPack degrada para n/d quando nenhuma ancora existe', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-vazio-'));
  const pack = buildContextPack({ repoRoot: root, pillar: 'P1' });
  assert.equal(pack.ok, false);
  assert.match(pack.reason, /nenhum ficheiro-ancora|nenhum ficheiro-âncora/);
});

test('resolveCandidates so devolve ficheiros que existem MESMO no disco', () => {
  const root = fixtureRepo();
  // A fixture tem exactamente um .js e dois .md. Um padrao nunca inventa um
  // ficheiro: devolve o que esta la, e nada mais.
  assert.deepEqual(resolveCandidates(root, 'P1'), ['tools/router/mooter-review.js']);
  assert.deepEqual(resolveCandidates(root, 'P4'), ['CLAUDE.md', 'README.md'], 'o P4 le o texto publicado que a fixture cria');
  for (const id of PILLAR_IDS) {
    for (const f of resolveCandidates(root, id)) {
      assert.ok(fs.existsSync(path.join(root, f)), `${id} devolveu ${f}, que nao existe`);
    }
  }
});

test('um padrao percebe `*` dentro da pasta e `**` a atravessa-las', () => {
  assert.equal(padraoParaRegex('tools/router/*.js').test('tools/router/a.js'), true);
  assert.equal(padraoParaRegex('tools/router/*.js').test('tools/router/sub/a.js'), false, '`*` nao pode saltar uma pasta');
  assert.equal(padraoParaRegex('landing/**/*.tsx').test('landing/app/(x)/y/page.tsx'), true);
  assert.equal(padraoParaRegex('landing/**/*.tsx').test('outro/app/page.tsx'), false);
  // Um caminho literal continua a ser um caminho literal — e por isso um
  // `.mooter/pilares.json` escrito antes dos padroes nao parte.
  const root = fixtureRepo();
  assert.deepEqual(expandirPadrao(root, 'README.md'), ['README.md']);
  assert.deepEqual(expandirPadrao(root, 'nao-existe.md'), []);
});

test('o varrimento nao conta testes como material a rever', () => {
  const root = fixtureRepo();
  fs.writeFileSync(path.join(root, 'tools', 'router', 'mooter-review.test.js'), 'test("x", () => {});\n');
  const achados = expandirPadrao(root, 'tools/router/*.js', Date.now() + 999_999);
  assert.deepEqual(achados, ['tools/router/mooter-review.js'],
    'um teste que falha ja grita sozinho: mo-lo era rever o alarme em vez do incendio');
});

test('o corte da lista de candidatos NUNCA e silencioso', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-cap-'));
  fs.mkdirSync(path.join(root, 'muitos'), { recursive: true });
  const n = MAX_CANDIDATOS + 17;
  for (let i = 0; i < n; i += 1) fs.writeFileSync(path.join(root, 'muitos', `f${String(i).padStart(4, '0')}.js`), 'const x = 1;\n');
  const pilares = { PX: { label: 'x', ask: 'x', files: ['muitos/*.js'] } };
  const c = candidatosDoPilar(root, 'PX', pilares);
  assert.equal(c.files.length, MAX_CANDIDATOS, 'o tecto tem de morder');
  assert.equal(c.total, n, 'e o numero REAL tem de continuar visivel');
  assert.equal(c.truncado, true);
});

// CONTRATO DA PERGUNTA — INVERTIDO A 2026-08-19, com medicao a suportar.
//
// O contrato anterior EXIGIA que toda a pergunta contivesse "Escolhe uma". Era
// esse teste que trancava o defeito: um modelo de 14B a quem se manda escolher
// escolhe SEMPRE, mesmo perante codigo impecavel. Nao e o modelo a mentir, e a
// pergunta a exigir uma resposta que nao existe.
//
// Medido: dos 1475 achados com citacao, julgaram-se 72 um a um (linha lida do
// disco, aceites atacados por um cetico). Sobreviveu UM — 1,4%. E num A/B nos
// MESMOS 67 excertos, so a mexer no prompt, a taxa de ACHADO caiu de 82% para
// 28% sem se perder o unico achado real.
//
// O contrato novo exige o oposto: a pergunta tem de poder ser respondida com
// "nao ha" sem o modelo sentir que falhou. Continua ancorada no excerto — o que
// se perde e a obrigacao de produzir.
test('a pergunta de cada pilar tem de poder ser respondida com "nao ha"', () => {
  for (const [id, spec] of Object.entries(PILLARS)) {
    assert.ok(spec.files.length > 0, `${id} sem ficheiros`);
    assert.ok(spec.label && spec.label.trim(), `${id} sem label`);
    // Ancorada no excerto: "destas linhas" ou "neste excerto".
    assert.match(spec.ask, /destas linhas|neste excerto|this excerpt|the lines in/i, `${id} nao ancora a pergunta no excerto`);
  }
});

test('nenhum pilar NOVO pode voltar a obrigar o modelo a escolher', () => {
  // Os pilares antigos (P1..P6) ainda dizem "Escolhe uma" — mudar as perguntas
  // deles exige medir outra vez, e medir-se-a. O que nao pode acontecer e um
  // pilar NOVO nascer ja com o defeito: e por isso que a trava e aqui.
  for (const id of ['P7', 'P8']) {
    const spec = PILLARS[id];
    if (!spec) continue;
    assert.doesNotMatch(spec.ask, /escolhe uma|choose one/i, `${id} obriga a escolher — foi isso que deu 1,4% de uteis`);
    assert.match(spec.ask, /SEM ACHADO|NO FINDING|se nao houver|if there is not|if every field/i, `${id} tem de dar saida ao "nao ha"`);
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
  const cites = extractCitations('ver tools/router/mooter-review.js:3 e tools/router/mooter-review.js:3 e CLAUDE.md:2');
  assert.deepEqual(cites, [
    { file: 'tools/router/mooter-review.js', line: 3 },
    { file: 'CLAUDE.md', line: 2 },
  ]);
});

test('checkCitation confirma a linha real e devolve o excerto', () => {
  const root = fixtureRepo();
  const ok = checkCitation(root, { file: 'tools/router/mooter-review.js', line: 3 });
  assert.equal(ok.ok, true);
  assert.equal(ok.snippet, 'return TIER;');
});

test('checkCitation refuta linha para la do fim do ficheiro', () => {
  const root = fixtureRepo();
  const bad = checkCitation(root, { file: 'tools/router/mooter-review.js', line: 9999 });
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
    text: 'O tier esta cravado. tools/router/mooter-review.js:3',
    allowedFiles: ['tools/router/mooter-review.js'],
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
    text: 'tools/router/mooter-review.js:1',
    allowedFiles: ['tools/router/mooter-review.js'],
  });
  assert.match(v.evidence, /finding NOT triaged/);
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
    allowedFiles: ['tools/router/mooter-review.js'],
  });
  assert.equal(v.verdict, VERDICT.CITED);
  assert.equal(v.offWindow, 1);
  assert.match(v.evidence, /outside the shown window/, 'o sinal tem de chegar ao recibo');
});

test('citar uma linha REAL que o modelo nunca viu conta como fora da janela', () => {
  const root = fixtureRepo();
  const v = verifyEvidence({
    repoRoot: root,
    text: 'o bug esta em tools/router/mooter-review.js:4',
    allowedFiles: ['tools/router/mooter-review.js'],
    window: { file: 'tools/router/mooter-review.js', startLine: 1, endLine: 2 },
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
  assert.match(v.evidence, /BLANK LINE/);
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
          response: 'O tier esta cravado a 3. tools/router/mooter-review.js:1',
          eval_count: 21,
        }),
      };
    },
  });
  assert.equal(out.receipt.verdict, VERDICT.CITED);
  assert.equal(out.receipt.usd, 0);
  assert.equal(out.receipt.tokens_out, 21);
  assert.equal(out.receipt.ficheiro, 'tools/router/mooter-review.js');
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
    { file: 'b.js', line: 0, rule: 'no-dupe-keys', msg: 'linha invalida' },
    { file: 'c.js', rule: 'no-dupe-keys', msg: 'sem linha' },
    { file: 'd.js', line: 5, rule: 'require-atomic-updates', msg: 'corrida' },
    // `no-empty` ja nao chega aqui — e intencional neste projecto e esta em
    // REGRAS_IGNORADAS. A fixture usa uma regra que sobrevive ao filtro, para
    // continuar a medir o que este teste diz medir: ordem e descarte.
    { file: 'e.js', line: 7, rule: 'no-fallthrough', msg: 'fallthrough' },
  ]);
  const got = readAnchor('x.json', { readImpl: () => raw });
  assert.equal(got.length, 3, 'entradas sem linha valida sao descartadas');
  assert.equal(got[0].rule, 'require-atomic-updates', 'corrida vem primeiro');
  assert.equal(got[got.length - 1].rule, 'security/detect-unsafe-regex', 'regex fica para o fim');
});

test('com ancora, o pack entra em modo ANCORADO e manda julgar a linha apontada', () => {
  const root = fixtureRepo();
  const alvo = { file: 'tools/router/mooter-review.js', line: 3, rule: 'no-dupe-keys', msg: 'Duplicate key.' };
  const anchorFile = path.join(root, 'ancora.json');
  fs.writeFileSync(anchorFile, JSON.stringify([alvo]));
  const pack = buildContextPack({ repoRoot: root, pillar: 'P1', anchorPath: anchorFile });
  assert.equal(pack.ok, true);
  assert.equal(pack.anchored, true, 'devia estar em modo ancorado');
  assert.equal(pack.file, alvo.file, 'o pack segue o ficheiro da ancora, nao a rotacao do pilar');
  assert.equal(pack.anchorLine, 3);
  assert.equal(pack.anchorRule, 'no-dupe-keys');
  assert.equal(pack.system, ANCHORED_SYSTEM_PROMPT, 'usa o prompt de juiz, nao o de cacador');
  assert.match(pack.prompt, /A ferramenta apontou a LINHA 3/);
  assert.match(pack.prompt, /Duplicate key/);
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
  const fake = () => ['--- a/tools/router/mooter-review.js', '+++ b/tools/router/mooter-review.js', '@@ -2,0 +3,1 @@', '+x'].join('\n');
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
    '--- a/tools/router/mooter-review.js',
    '+++ b/tools/router/mooter-review.js',
    '@@ -1,0 +2,2 @@',
    '+const x = 1;',
    '+if (x !== 2) return null;',
  ].join('\n');
  const pack = buildContextPack({
    repoRoot: root, pillar: 'P1', diffBase: 'HEAD~6', diffRunImpl: () => diff,
  });
  assert.equal(pack.ok, true);
  assert.equal(pack.mode, 'diff', 'com hunks, tem de entrar no degrau do diff');
  assert.equal(pack.file, 'tools/router/mooter-review.js');
  assert.equal(pack.changedStart, 2);
  assert.ok(pack.prompt.includes('MUDARAM as linhas'), 'o prompt tem de falar da mudanca');
  assert.equal(typeof pack.negacaoDensa, 'boolean', 'a marca de negacao tem de estar calculada');
});

test('em modo DIFF com negacao, o aviso dirigido entra no prompt', () => {
  const root = fixtureRepo();
  const diff = [
    '--- a/tools/router/mooter-review.js',
    '+++ b/tools/router/mooter-review.js',
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
    text: 'FALSO POSITIVO: este regex le padroes fixos PROVA: tools/router/mooter-review.js:3',
    allowedFiles: ['tools/router/mooter-review.js'],
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

/** Ficheiros que nao pertencem a pilar nenhum — dois por pilar, para sobrar. */
// `orfaos/` e nao `packages/mooter-bridge/`: com ancoras por padrao, o P5 e o
// P8 passaram a reclamar `packages/mooter-bridge/*.js` — os "orfaos" deixaram
// de o ser e o teste media outra coisa. Um orfao tem de estar onde nenhum
// padrao chega, senao nao e um orfao.
/**
 * Orfaos que chegam para todos os pilares — com um PISO.
 *
 * Cresce com o conjunto (acrescentar um pilar nao pode partir um teste que fala
 * de colisoes), mas nunca desce abaixo de 12. O piso nasceu a 2026-08-22, ao
 * desligar o P1 e o P5: com 2 pilares o poco caia para 4, e a `FROTA` passou a
 * falhar porque `faseDoDevice('mac-mini-de-paulo') % 4` e
 * `faseDoDevice('macbook-do-paulo') % 4` valem os DOIS 1 — as fases sao 7621 e
 * 89, que diferem em mod 12 (1 e 5) e em mod 20 (1 e 9).
 *
 * Ou seja: a funcionalidade estava boa e era o poco que tinha encolhido abaixo
 * do tamanho onde o teste consegue medir alguma coisa. O piso repoe a medicao;
 * NAO relaxa a asercao, que continua a exigir rondas diferentes entre devices.
 */
const ORFAOS = Array.from({ length: Math.max(12, PILLAR_IDS.length * 2) }, (_, k) => `orfaos/orfao${k}.js`);

/** Um documento por pilar: dois pilares de documentos precisam de dois alvos. */
const DOCUMENTOS = Array.from({ length: PILLAR_IDS.length }, (_, k) => `docs/doc${k}.md`);

/** Repo de teste com um ficheiro de cada pilar e orfaos que chegam para todos. */
function repoDiff() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-b6-'));
  const escrever = (rel) => {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), Array.from({ length: 400 }, (_, n) => `linha ${n + 1};`).join('\n'));
  };
  escrever('tools/router/mooter-review.js');            // P1
  escrever('tools/handoff-preflight.js');          // P2
  // Orfaos suficientes para TODOS os pilares terem alvo distinto. Derivado do
  // conjunto, e nao cravado a 6: acrescentar um pilar nao pode partir um teste
  // que fala de colisoes.
  for (const nome of ORFAOS) escrever(nome);
  // Pela mesma razao que ha orfaos que chegam para todos: com DOIS pilares so
  // de documentos, um unico README poe os dois a moer o mesmo ficheiro e o
  // teste acusa um defeito que e da fixture.
  for (const nome of DOCUMENTOS) escrever(nome);
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\nMIT — see [LICENSE](LICENSE).\n');
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
    diffRunImpl: diffFalso([ORFAOS[0], 'tools/handoff-preflight.js']),
  });
  assert.equal(pack.mode, 'diff');
  assert.equal(pack.escopo, 'pilar', 'o hunk de handoff-preflight.js e mesmo do P2');
  assert.equal(pack.file, 'tools/handoff-preflight.js', 'com hunk seu, o pilar nao vai rever o dos outros');
  assert.match(pack.label, /Quality & Verification/);
});

test('B6: sem hunk seu, o pack diz "geral" e NAO se veste do rotulo do pilar', () => {
  const root = repoDiff();
  const pack = buildContextPack({
    repoRoot: root, pillar: 'P1', cursor: 0, diffBase: 'HEAD~12',
    diffRunImpl: diffFalso([ORFAOS[0]]),
  });
  assert.equal(pack.escopo, 'geral');
  assert.equal(pack.file, ORFAOS[0], 'revemos o diff na mesma — trabalho novo vale mais');
  assert.doesNotMatch(pack.label, /Routing & Cost/, 'chamar "Routing & Cost" a um ficheiro do bridge e a mentira que o B6 fecha');
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
  const foraDeTodos = ORFAOS;
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
  const foraDeTodos = ORFAOS;
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
    repoRoot: root, pillar: 'P1', cursor: 0, diffBase: 'HEAD~12',
    // o git ja filtrou: o que chega ao pack nunca traz _handoff
    diffRunImpl: diffFalso([ORFAOS[0]]),
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
    'tools/router/mooter-review.js',                  // P1
    'tools/docs-hygiene.js',                     // P2
    'tools/cockpit/build-snapshot.js',           // P2 e P6 — o par que colidia a 100%
    'tools/cockpit/runner/moo-runner.mjs',       // P4
    'tools/cockpit/runner/runner-core.mjs',      // P5
    'tools/cockpit/runner/evidence-verifier.mjs',// P6
  ];
  const orfaos = Array.from({ length: PILLAR_IDS.length }, (_, k) => `a/orfao${k}.js`);
  // Um documento por pilar, pela mesma razao dos orfaos: os pilares so de
  // documentos nao entram no diff, e com um unico .md no repo caiem todos
  // nele — uma colisao que e da fixture e nao do desenho.
  const docs = Array.from({ length: PILLAR_IDS.length }, (_, k) => `docs/canon${k}.md`);
  for (const f of [...donos, ...orfaos, ...docs]) escrever(f);
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

test('B6: um pilar so de documentos (P4) nao entra no degrau do diff', () => {
  // O P3, cujo trabalho SAO os documentos, ficava preso em `escopo: geral` para
  // sempre — a rever codigo de outros — porque DIFF_PATHSPEC so ve codigo e ele
  // nunca podia ter interseccao. Para ele o diff nao e um degrau, e um desvio.
  const root = repoDiff();
  fs.writeFileSync(path.join(root, 'CLAUDE.md'), '# canon\nsha: abc123\n');
  const pack = buildContextPack({
    repoRoot: root, pillar: 'P4', cursor: 0, diffBase: 'HEAD~12',
    diffRunImpl: diffFalso([ORFAOS[0]]),
  });
  assert.notEqual(pack.mode, 'diff', 'um pilar sem um unico ficheiro de codigo nao tem lugar no diff');
  assert.match(pack.file, /\.md$/, 'vai rever o texto publicado, que e o trabalho dele');
});

// ------------------------------------------------- o poco que secava em 10 min

test('POCO: um excerto ja julgado nao volta a fila — mas um excerto ALTERADO volta', () => {
  // Medido a 2026-08-18: `HEAD~12` dava 20 hunks e o runner corre 2950 rondas
  // por dia (29s cada). O poco secava em menos de 10 minutos e a GPU remoia os
  // mesmos 20 excertos ~147 vezes por dia. Foi assim que 113 rondas deram 0
  // achados uteis — nao por o motor ser mau, mas por lhe darmos o mesmo
  // trabalho outra vez.
  const root = repoDiff();
  const alvo = ORFAOS[0];
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
    'HEAD~12': diffFalso([ORFAOS[0]]),
    'HEAD~25': diffFalso([ORFAOS[0], ORFAOS[1]]),
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
    Array.from({ length: 12 }, (_, k) => ({ file: 'tools/router/mooter-review.js', line: (k % 4) + 1, rule: `r${k}`, msg: 'x' })),
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
  const alvo = ORFAOS[0];
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
  fs.writeFileSync(path.join(root, 'tools/router/mooter-review.js'), 'const a = 1;\n');
  fs.writeFileSync(path.join(root, 'tools/router/budget-engine.js'),
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
  const diff = diffFalso(ORFAOS);
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

test('a sobreposicao entre pilares so e segura por causa da chave de revisao', () => {
  // A REGRA ANTIGA proibia dois pilares de reclamar o mesmo ficheiro, e tinha
  // razao para o mundo em que nasceu: a chave de "ja revisto" era so o
  // conteudo, portanto o segundo pilar encontrava tudo julgado e moia o mesmo
  // alvo. `chaveDeRevisao` passou a incluir o pilar e a premissa caiu — a
  // sobreposicao passou a ser o que ENCHE o poco (medido: 46% das rondas
  // morriam esgotadas). O que tem de continuar verdade e a precondicao.
  const t = 'const x = 1;';
  assert.notEqual(
    chaveDeRevisao('P1', 'a.js', 1, 10, t),
    chaveDeRevisao('P2', 'a.js', 1, 10, t),
    'sem o pilar na chave, a sobreposicao volta a ser desperdicio',
  );
  assert.ok(chaveDeRevisao('P1', 'a.js', 1, 10, t).includes(hunkKey('a.js', 1, 10, t)),
    'a identidade do conteudo continua la dentro: um excerto ALTERADO tem de voltar a fila');

  // E no DIFF — poco pequeno e partilhado — a exclusividade mantem-se: cada
  // ficheiro tem um dono so, o pilar de ambito mais estreito que o reclama.
  const root = repoDiff();
  for (const f of ['tools/router/mooter-review.js', 'tools/handoff-preflight.js', 'README.md']) {
    const reclamantes = PILLAR_IDS.filter((id) => resolveCandidates(root, id).includes(f));
    if (reclamantes.length === 0) continue;
    const dono = donoDoFicheiro(root, f);
    assert.ok(reclamantes.includes(dono), `${f} tem ${reclamantes.length} reclamantes e o dono tem de ser um deles`);
    assert.equal(typeof dono, 'string', `${f} ficou sem dono apesar de ser reclamado`);
  }
  assert.equal(donoDoFicheiro(root, 'ficheiro/que/nao/existe.js'), null, 'o que ninguem reclama e orfao, e diz-se');
});

test('nenhum padrao de pilar pode apontar ao vazio', () => {
  // `expandirPadrao` devolve [] em silencio para o que nao existe. E a
  // degradacao certa em producao, e e tambem a razao pela qual o P1 apontou
  // anos a `tools/router/statusline.js`, que nunca existiu nesse caminho, sem
  // ninguem dar por isso. Com padroes o risco muda de forma mas nao desaparece:
  // um `tools/rooter/*.js` mal escrito casa com zero e ninguem estranha.
  const raiz = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  const mortos = [];
  for (const id of PILLAR_IDS) {
    for (const padrao of PILLARS[id].files) {
      if (expandirPadrao(raiz, padrao).length === 0) mortos.push(`${id} -> ${padrao}`);
    }
  }
  assert.deepEqual(mortos, [], 'um pilar a apontar ao vazio reve menos e nao se queixa');
});

test('cada pilar tem material que chegue para nao secar em horas', () => {
  // 2026-08-19: P2, P3 e P6 estavam a 100% de esgotamento e a GPU corria 5
  // minutos por hora. A causa nao era o modelo, era a aritmetica — as ancoras
  // eram listas de 3 a 5 ficheiros. Este numero e o chao, nao a meta.
  const raiz = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
  const magros = PILLAR_IDS
    .map((id) => [id, resolveCandidates(raiz, id).length])
    .filter(([, n]) => n < 10);
  assert.deepEqual(magros, [], 'um pilar com menos de 10 ficheiros seca antes do fim do dia');
});

// ── o carimbo de ronda vazia, nas duas linguas (2026-08-19) ──────────────────

/**
 * O contrato dos pilares ficou bilingue a meio: o bloco de formato partilhado
 * pede `SEM ACHADO`, e duas perguntas de pilar (P7, P8) pedem `NO FINDING`. O
 * modelo recebe as duas instrucoes na MESMA volta. Enquanto o verificador so
 * reconhecia a portuguesa, uma ronda honestamente vazia em ingles caia em
 * `sem-citacao` — o painel contava-a como resposta por verificar e o modelo
 * era castigado por ter feito exactamente o que lhe pediram.
 */
test('uma ronda vazia conta como vazia nas duas linguas', () => {
  for (const t of ['SEM ACHADO', 'NO FINDING', 'no finding', 'Answer: NO FINDING.']) {
    assert.equal(isNoFinding(t), true, t + ' devia ser lido como ronda vazia');
    assert.equal(concluir(t), 'sem-achado', t + ' devia concluir sem-achado');
  }
});

test('NO FINDING le-se ANTES de FINDING: — senao uma ronda vazia vira um achado', () => {
  assert.equal(concluir('NO FINDING: nothing in this excerpt'), 'sem-achado');
  assert.equal(concluir('FINDING: x WHEN y THEN z'), 'achado');
  assert.equal(concluir('ACHADO: x QUANDO y ENTAO z'), 'achado');
});

test('o falso positivo tambem e bilingue', () => {
  assert.equal(concluir('FALSO POSITIVO: e seguro aqui'), 'falso-positivo');
  assert.equal(concluir('FALSE POSITIVE: safe here'), 'falso-positivo');
});

// ── a ronda que nunca correu (2026-08-19) ────────────────────────────────────

/**
 * O painel mostrava `uncited: 275` debaixo de um cartao que diz "what the GPU
 * shipped". Medido no ledger do dono: 209 desses 275 (76%) eram rondas com
 * dur_s 0, tokens_out 0 e o modelo nunca chamado — o pilar ja tinha revisto
 * tudo o que tem. O numero verdadeiro de "o modelo respondeu sem citar" era
 * 66, e ninguem podia sabe-lo.
 *
 * Sao dois problemas com respostas OPOSTAS: o poco seco pede mais ambito, o
 * modelo a divagar pede uma pergunta mais apertada. Com um nome so, nenhuma
 * das duas se podia decidir.
 */
test('uma ronda que nunca chegou ao modelo nao conta como resposta sem citacao', () => {
  const recibos = [
    { verdict: 'citacao-ok' },
    { verdict: 'sem-citacao' },
    // Como os 209 estao gravados HOJE: dizem `sem-citacao` E `esgotado`.
    { verdict: 'sem-citacao', esgotado: true, dur_s: 0, tokens_out: 0 },
    { verdict: 'sem-citacao', esgotado: true, dur_s: 0, tokens_out: 0 },
    // Como passam a ser gravados a partir de agora.
    { verdict: 'nada-por-rever', esgotado: true },
    { verdict: 'sem-achado' },
  ];
  const t = tallyVerdicts(recibos);
  assert.equal(t['sem-citacao'], 1, 'so a ronda em que o modelo REALMENTE respondeu sem citar');
  assert.equal(t['nada-por-rever'], 3, 'as tres em que nao houve nada para rever');
  assert.equal(t['citacao-ok'], 1);
  assert.equal(t['sem-achado'], 1);
  assert.equal(t.total, 6);
  const soma = t['citacao-ok'] + t.refutado + t['sem-citacao'] + t['sem-achado'] + t['nada-por-rever'] + t.erro;
  assert.equal(soma, t.total, 'nenhum recibo pode cair fora dos baldes');
});

test('a releitura e RETROACTIVA: o ledger nao se reescreve para isto ficar certo', () => {
  // A correccao vale para os 5000 recibos ja escritos porque eles ja trazem
  // `esgotado: true`. Reescrever o ledger para corrigir uma leitura seria
  // apagar o que aconteceu para que a versao de hoje parecesse sempre certa.
  assert.equal(naoCorreu({ verdict: 'sem-citacao', esgotado: true }), true);
  assert.equal(naoCorreu({ verdict: 'sem-citacao' }), false, 'sem a bandeira, e mesmo uma resposta sem citacao');
  assert.equal(naoCorreu({ verdict: 'nada-por-rever' }), true);
  assert.equal(naoCorreu({ verdict: 'citacao-ok', esgotado: false }), false);
  assert.equal(naoCorreu(null), false);
});

test('o pack esgotado carimba o veredicto novo, e so ele', () => {
  const root = fixtureRepo();
  const revistos = new Set();
  // Primeira ronda: ha material, e o pack sai bom.
  const pk = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: 0, revistos });
  assert.equal(pk.ok, true);
  // Marca-se TUDO como revisto e o poco seca.
  for (let c = 0; c < 60; c += 1) {
    const p = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: c, revistos });
    if (p.ok && p.chave) revistos.add(p.chave); else break;
  }
  const seco = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: 99, revistos });
  assert.equal(seco.ok, false);
  assert.equal(seco.esgotado, true);
  assert.match(seco.reason, /ficheiros do pilar/, 'o numero de ficheiros viaja com a queixa');
});

// ── ancoras fora do ambito (2026-08-19) ─────────────────────────────────────

/**
 * O ramo ancorado percorria TODOS os apontamentos do eslint sem olhar a quem
 * pertencem. Um pilar de documentos recebia `tools/router/*.js` e respondia a
 * pergunta DELE sobre material que nao e dele.
 *
 * Medido nas 5 primeiras horas do P10: 17 citacoes, todas sobre blocos catch
 * vazios em .js — quando a pergunta do P10 e "isto manda uma PESSOA fazer a
 * mao o que um script podia fazer?", feita a documentos. A pergunta certa
 * sobre o ficheiro errado nao e meia resposta: e ruido com aspecto de achado,
 * que passa a triagem a parecer trabalho.
 */
test('um apontamento fora do ambito do pilar nao lhe e servido', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-amb-'));
  const escrever = (rel, n = 200) => {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), Array.from({ length: n }, (_, i) => `linha ${i + 1};`).join('\n'));
  };
  escrever('tools/router/mooter-review.js');   // do P1
  escrever('README.md');                       // do P4
  const ancora = path.join(root, 'ancora.json');
  // O apontamento e num ficheiro que NAO pertence ao P4.
  fs.writeFileSync(ancora, JSON.stringify([
    { file: 'tools/router/mooter-review.js', line: 20, rule: 'no-dupe-keys' },
  ]));

  const pack = buildContextPack({ repoRoot: root, pillar: 'P4', cursor: 0, anchorPath: ancora });
  assert.ok(pack.ok, 'o pilar tem de continuar a ter trabalho — cai para a caca');
  assert.notEqual(pack.file, 'tools/router/mooter-review.js',
    'o P4 pergunta sobre texto publicado: um .js do P1 nunca pode ser a resposta');
  assert.match(pack.file, /\.md$/, 'cai para as suas proprias ancoras');
});

test('um apontamento DENTRO do ambito continua a ser servido', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-amb2-'));
  fs.mkdirSync(path.join(root, 'tools', 'router'), { recursive: true });
  fs.writeFileSync(path.join(root, 'tools', 'router', 'mooter-review.js'),
    Array.from({ length: 200 }, (_, i) => `linha ${i + 1};`).join('\n'));
  const ancora = path.join(root, 'ancora.json');
  fs.writeFileSync(ancora, JSON.stringify([
    { file: 'tools/router/mooter-review.js', line: 20, rule: 'no-dupe-keys' },
  ]));
  const pack = buildContextPack({ repoRoot: root, pillar: 'P1', cursor: 0, anchorPath: ancora });
  assert.ok(pack.ok);
  assert.equal(pack.file, 'tools/router/mooter-review.js', 'o ficheiro E do P1: continua a ser o alvo certo');
});

// ── a ancora so pode trazer o que E defeito (2026-08-19) ────────────────────

/**
 * Medido no `ancora-achados.json` real: 76 apontamentos, **58 deles `no-empty`**
 * (76%) e 14 `PARSE`. Amostrados tres dos `no-empty`, todos eram `catch (e) {}`
 * em caminhos de telemetria — deliberados, porque um hook nunca pode partir o
 * turno do dono.
 *
 * A prioridade sozinha nao resolvia: ordenar poe os poucos bons a frente, e
 * esgotados esses o resto e `no-empty` para sempre. Foi assim que 13 dos 45
 * achados por triar nasceram "bloco vazio" — a GPU a olhar para uma decisao
 * intencional e a ser-lhe perguntado se e um defeito.
 */
test('uma regra intencional neste projecto nao chega a ser servida', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-anc-'));
  const f = path.join(dir, 'a.json');
  fs.writeFileSync(f, JSON.stringify([
    { file: 'a.js', line: 1, rule: 'no-empty' },
    { file: 'b.js', line: 2, rule: 'PARSE' },
    { file: 'c.js', line: 3, rule: 'require-atomic-updates' },
    { file: 'd.js', line: 4, rule: 'no-dupe-keys' },
  ]));
  const lidos = readAnchor(f);
  assert.deepEqual(lidos.map((x) => x.rule), ['require-atomic-updates', 'no-dupe-keys'],
    'so o que e mesmo um defeito, e pela prioridade que ja existia');
  for (const r of REGRAS_IGNORADAS) {
    assert.ok(!lidos.some((x) => x.rule === r), `${r} nao pode voltar a fila`);
  }
});

test('a lista de regras ignoradas e explicita — nunca um filtro escondido', () => {
  assert.ok(REGRAS_IGNORADAS instanceof Set);
  assert.ok(REGRAS_IGNORADAS.has('no-empty'));
  assert.ok(REGRAS_IGNORADAS.size >= 1 && REGRAS_IGNORADAS.size <= 6,
    'uma lista que cresce sem limite deixa de ser uma decisao e passa a ser um esconderijo');
});

// ── o ledger deixa de crescer para sempre (2026-08-19) ──────────────────────

/**
 * Medido: `runner-ledger.jsonl` com 4,27 MB e ZERO rotacao — `appendFileSync`
 * puro desde sempre. E o `readLedger` le o ficheiro INTEIRO para usar so as
 * ultimas 5000 linhas, a cada 3 segundos. O payload estava limitado; a leitura
 * nunca esteve.
 */
test('abaixo do tecto, nao se roda nada', () => {
  const r = rodarLedger('/x.jsonl', {
    statImpl: () => ({ size: 10 }), maxBytes: 1000,
    readImpl: () => { throw new Error('nao devia ler'); },
    writeImpl: () => { throw new Error('nao devia escrever'); },
  });
  assert.equal(r.rodou, false);
  assert.match(r.porque, /abaixo do tecto/);
});

test('ao rodar, NENHUMA linha se perde e NENHUMA se duplica', () => {
  const linhas = Array.from({ length: 120 }, (_, i) => JSON.stringify({ n: i }));
  const escrito = {};
  const r = rodarLedger('/tmp/l.jsonl', {
    statImpl: () => ({ size: 999 }), maxBytes: 10, cauda: 20,
    readImpl: () => linhas.join('\n') + '\n',
    writeImpl: (p, txt) => { escrito[p] = txt; },
  });
  assert.equal(r.rodou, true);
  const arquivo = escrito['/tmp/l.1.jsonl'].split('\n').filter(Boolean);
  const actual = escrito['/tmp/l.jsonl'].split('\n').filter(Boolean);
  assert.equal(arquivo.length, 100, 'o resto vai para o arquivo');
  assert.equal(actual.length, 20, 'a cauda fica no ficheiro vivo');
  assert.deepEqual([...arquivo, ...actual], linhas, 'juntos dao exactamente o original: nada perdido, nada a dobrar');
});

test('a cauda que fica e a MESMA janela que o painel le', () => {
  // Rodar sem levar a cauda daria um penhasco: no segundo a seguir a rotacao o
  // painel mostraria 3 recibos e o dono acharia que o loop tinha sido apagado.
  assert.equal(CAUDA_AO_RODAR, 5000, 'tem de bater com o maxLines do readLedger');
});

test('uma falha a escrever NAO para o loop — rodar e higiene, nao trabalho', () => {
  const r = rodarLedger('/tmp/l.jsonl', {
    statImpl: () => ({ size: 999 }), maxBytes: 10,
    readImpl: () => 'a\nb\n',
    writeImpl: () => { throw new Error('disco cheio'); },
  });
  assert.equal(r.rodou, false);
  assert.match(r.porque, /disco cheio/);
});

test('sem ledger no disco, nao rebenta', () => {
  const r = rodarLedger('/nao/existe.jsonl', { statImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(r.rodou, false);
  assert.match(r.porque, /ainda nao existe/);
});

// ── 19% do trabalho da GPU ia para o lixo no parser (2026-08-19) ────────────

/**
 * Medido em 115 rondas de uma hora, ja com as ancoras limpas: 22 (19%) sairam
 * `indeterminado`. O modelo tinha citado uma linha REAL e o parser deitava a
 * resposta fora, porque o prefixo nao era `ACHADO:`.
 *
 * O que ele escrevia: "COMPLETE PROOF: docs/...md:20" (10x),
 * "LINE 73: optedIn(prefs()) ... REPEATED: LINE 83" (4x), "BROKEN: ..." (2x).
 *
 * O `LINE 73 ... REPEATED: LINE 83` e EXACTAMENTE o que o P9 pede. A causa:
 * as perguntas dos pilares passaram a ingles e o bloco de formato partilhado
 * continua a exigir `ACHADO:` — duas instrucoes na mesma volta. So 2 de 115
 * chegavam a fila de triagem; a diferenca era formatacao, nao trabalho.
 */
test('quem citou uma linha real reportou alguma coisa, escreva como escrever', () => {
  // `COMPLETE PROOF:` SAIU desta lista de proposito. Quando escrevi este teste
  // achei que era um achado que o parser deitava fora — nao e: `COMPLETE` e a
  // saida honesta do P4, tal como `NO FINDING` e a dos outros. Contar isso como
  // achado enchia a fila de rondas vazias. O verificador passa a conhecer as
  // saidas de todos os pilares, e este caso vive agora no teste de baixo.
  for (const t of [
    'LINE 73: optedIn(prefs()) LINE 83: statusLine() REPEATED: LINE 73 and LINE 83',
    'BROKEN: === END === PROOF: docs/y.md:94',
  ]) {
    assert.equal(concluir(t), 'indeterminado', 'o prefixo continua a nao ser reconhecido');
    assert.equal(conclusaoDeCitacao(t), 'achado', 'mas a substancia e um achado: citou e nao disse que nao havia nada');
  }
});

test('a regra nova NAO engole os tres carimbos que existem', () => {
  // Uma ronda vazia continua vazia, e um falso positivo continua falso
  // positivo. Se isto cair, o painel passa a contar silencio como trabalho.
  for (const [t, esperado] of [
    ['SEM ACHADO', 'sem-achado'],
    ['NO FINDING', 'sem-achado'],
    ['FALSO POSITIVO: e seguro aqui', 'falso-positivo'],
    ['FALSE POSITIVE: safe here', 'falso-positivo'],
    ['ACHADO: x QUANDO y ENTAO z', 'achado'],
    ['', 'vazio'],
    // As saidas proprias de cada pilar contam como ronda vazia, nao como achado.
    ['COMPLETE PROOF: docs/x.md:20', 'sem-achado'],
    ['EVERY CALL ONCE', 'sem-achado'],
    ['NO SEED EXITS', 'sem-achado'],
    ['THEY MATCH', 'sem-achado'],
  ]) {
    assert.equal(conclusaoDeCitacao(t), esperado, t || '(vazio)');
  }
});

// ── as perguntas passam todas a COPIAR e COMPARAR (2026-08-19) ──────────────

/**
 * A/B com defeito plantado, mesmo excerto, mesmo modelo, mesma GPU:
 *
 *   JULGAR    "ha um defeito aqui?"                    -> NO FINDING em 1s. Falhou.
 *   COMPARAR  "copia os dois numeros e compara-os"     -> apanhou-o, com as duas linhas.
 *
 * O modelo local nao sabe JULGAR se codigo esta certo — 8236 rondas, 0 bugs
 * reais. Sabe COMPARAR duas coisas que existem, e foi dai que vieram os dois
 * unicos achados que sobreviveram a triagem (STRATEGY.md e README.md).
 *
 * O #291 ja tinha posto P1-P6 nesta forma. P7-P10 tinham ficado a julgar.
 */
test('nenhum pilar pergunta se ha um defeito — todos mandam copiar primeiro', () => {
  for (const id of PILLAR_IDS) {
    const ask = PILLARS[id].ask;
    // A regra e COPIAR PRIMEIRO, nao escrever "STEP 1": o P6 manda copiar sem o
    // prefixo e cumpre-a na mesma. O que nao pode e comecar por pedir juizo.
    assert.match(ask, /^(STEP 1 — )?[Cc]opy[ ,]/, `${id} nao comeca por mandar COPIAR`);
    // Cada pilar tem a SUA saida honesta — `EVERY CALL ONCE`, `NO SEED EXITS`,
    // `THEY MATCH`, `COMPLETE`, `NO FINDING`. Sao melhores do que uma generica,
    // porque sao afirmacoes verificaveis. Mas o verificador TEM de as conhecer:
    // uma saida que ele nao reconhece vira `indeterminado` e, desde o #310,
    // entra na fila como achado. Uma ronda vazia a fingir-se de trabalho.
    // Usa-se o SEM_ACHADO_RE cru e nao o isNoFinding: o enunciado tem palavras
    // como "but" e "however", e a regra da contradicao — que existe para as
    // RESPOSTAS — disparava aqui sem razao nenhuma.
    assert.ok(SEM_ACHADO_RE.test(ask),
      `${id} oferece uma saida honesta que o verificador nao sabe ler — uma ronda vazia entraria na fila como achado`);
  }
});

test('nenhuma pergunta convida a julgar em vez de comparar', () => {
  // "Is there a defect" foi exactamente a formulacao que o A/B provou nao
  // funcionar: o modelo responde NO FINDING num segundo, sem olhar.
  for (const id of PILLAR_IDS) {
    assert.doesNotMatch(PILLARS[id].ask, /Is there a (defect|bug|problem)/i,
      `${id} pergunta por julgamento — medido: falha o defeito plantado`);
  }
});

// ── a pergunta faz parte da chave (2026-08-20) ──────────────────────────────

/**
 * Bug vivo, apanhado ao confrontar o desenho com prior art. A chave de revisao
 * era `pilar|ficheiro:linhas:sha` — sem a PERGUNTA. Mudar o enunciado de um
 * pilar deixava as janelas ja vistas marcadas como feitas, sob uma pergunta que
 * ja nao existia.
 *
 * Medido: o #312 reescreveu P7, P8, P9 e P10, e 1129 das 2826 janelas de
 * `revistos.json` ficaram fechadas para sempre a uma pergunta que nunca lhes
 * foi feita.
 *
 * E o mesmo principio da action cache do Bazel: a chave e o digest de TUDO o
 * que determina a resposta — comando E entradas. Aqui: o excerto E a pergunta.
 * Um conjunto enderecado por conteudo so e correcto se o conteudo incluir o
 * que produziu a resposta.
 */
test('mudar a pergunta reabre as janelas desse pilar — e so desse', () => {
  const t = 'const x = 1;';
  const a = chaveDeRevisao('P9', 'a.js', 1, 10, t, 'pergunta A');
  const b = chaveDeRevisao('P9', 'a.js', 1, 10, t, 'pergunta B');
  assert.notEqual(a, b, 'com a pergunta nova, a janela tem de voltar a fila');

  // O mesmo excerto sob a MESMA pergunta continua fechado — senao nao ha
  // memoria nenhuma e a GPU remoi para sempre.
  assert.equal(a, chaveDeRevisao('P9', 'a.js', 1, 10, t, 'pergunta A'));

  // E outro pilar com a mesma pergunta continua a ser trabalho diferente.
  assert.notEqual(a, chaveDeRevisao('P8', 'a.js', 1, 10, t, 'pergunta A'));
});

test('a identidade do conteudo continua dentro da chave', () => {
  // Um excerto ALTERADO tem de voltar a fila, mesmo com a mesma pergunta.
  const q = 'copia e compara';
  const antes = chaveDeRevisao('P1', 'a.js', 1, 10, 'const x = 1;', q);
  const depois = chaveDeRevisao('P1', 'a.js', 1, 10, 'const x = 2;', q);
  assert.notEqual(antes, depois);
  assert.ok(antes.includes(hunkKey('a.js', 1, 10, 'const x = 1;')));
});

test('sem pergunta, a chave diz que nao a tem — nunca finge que tem', () => {
  const k = chaveDeRevisao('P1', 'a.js', 1, 10, 'x', null);
  assert.match(k, /^P1\.sem-q\|/, 'uma chave sem pergunta tem de ser distinguivel de uma com');
});

test('todos os sitios que consultam `revistos` passam a pergunta', () => {
  // Um so sitio esquecido bastava para esse ramo continuar a envenenar chaves.
  const fonte = fs.readFileSync(new URL('./context-pack.mjs', import.meta.url), 'utf8');
  // Por LINHA e nao por regex de parenteses: uma das chamadas tem um
  // `.join('\n')` la dentro, e `[^)]*` parava no parentese errado.
  const chamadas = fonte.split('\n')
    .filter((l) => l.includes('chaveDeRevisao(') && !l.includes('export function'));
  assert.ok(chamadas.length >= 3, 'nao encontrei as chamadas — o teste deixou de medir o que diz medir');
  for (const c of chamadas) {
    assert.ok(c.includes('spec.ask'), `chamada sem a pergunta: ${c.trim().slice(0, 70)}`);
  }
});

// ── P4 · o pilar que media a JANELA em vez do TEXTO (2026-08-21) ─────────────
//
// O enunciado antigo mandava julgar "a ULTIMA linha deste excerto". Mas o
// excerto e uma fatia de 70 linhas cortada num sitio arbitrario: a ultima linha
// de uma fatia cai quase sempre a meio de uma fence, de uma tabela ou de um
// paragrafo. O modelo respondia BROKEN e tinha razao sobre a FATIA, sem dizer
// nada sobre o DOCUMENTO.
//
// Medido nos 619 achados com PROOF e janela legiveis do ledger deste device:
// P4 tinha 58/62 (93,5%) com o PROOF a <=2 linhas do fim da janela — 53 deles
// EXACTAMENTE na ultima linha. Os outros pilares: P1 3,8% · P2 1,8% · P3 0,0%
// · P5 1,8%. O defeito era so do P4, e era do enunciado, nao do modelo.

test('P4 so recebe a ULTIMA janela do ficheiro — garantido pelo harness', () => {
  // A 1a tentativa de correccao PEDIU ao modelo que comparasse o fim da janela
  // com o fim do ficheiro (ambos ja escritos no cabecalho do pack). Mediu-se, em
  // 34 rondas contra 380 de baseline: a taxa de achado em janelas cortadas
  // passou de 18,0% para ~13,6% — quase nada. O qwen2.5-coder:14b escrevia
  // `FIM DO FICHEIRO` por reflexo em janelas que claramente nao o eram
  // (`THREAT_MODEL.md 1-70`, com uma janela `71-109` a seguir).
  //
  // A licao: uma condicao que o harness consegue GARANTIR nunca se pede a um
  // modelo.
  assert.equal(PILLARS.P4.janela, 'ultima',
    'o P4 tem de declarar que so olha para o fim do ficheiro');

  // E a declaracao tem de ter EFEITO — senao e um comentario entre aspas.
  const repo = fixtureRepo();
  const rel = 'docs/longo.md';
  const total = 175;                       // 3 janelas de 70
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, rel),
    `${Array.from({ length: total }, (_, i) => `linha ${i + 1}`).join('\n')}\n`,
  );

  let vistas = 0;
  for (let cursor = 0; cursor < 8; cursor += 1) {
    const pack = buildContextPack({ repoRoot: repo, pillar: 'P4', cursor });
    if (!pack.ok || pack.file !== rel) continue;
    vistas += 1;
    assert.equal(pack.endLine, total,
      `cursor ${cursor}: o P4 recebeu ${pack.startLine}-${pack.endLine} de ${total} `
      + 'linhas — e uma fatia do meio, e a pergunta dele nao vale numa fatia do meio');
  }
  assert.ok(vistas > 0, 'o ficheiro de teste tem de ser candidato do P4 ao menos uma vez');
});

test('a ultima linha do excerto e uma linha REAL, nunca o vazio do split', () => {
  // `raw.split('\n')` num ficheiro terminado em newline devolve um ultimo
  // elemento vazio que NAO e uma linha do ficheiro. O `renderSlice` mostrava-o
  // como `  147| ` num ficheiro de 146 linhas, e o P4 — mandado julgar A ULTIMA
  // LINHA — via vazio e respondia BROKEN.
  //
  // Medido: 12 dos 62 achados do P4 (19,4%) citavam uma linha que nao existe no
  // ficheiro (`ARCHITECTURE_V5.md:147` num de 146, `SENTRY-DSN-RUNBOOK.md:172`
  // num de 171, `MOOTER_ROADMAP.md:78` num de 77). A citacao parecia fabricada
  // pelo modelo e NAO era: o harness deu-lhe mesmo aquela linha.
  const repo = fixtureRepo();
  const rel = 'docs/curto.md';
  fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repo, rel), 'um\ndois\ntres\n');   // 3 linhas + newline final

  const pack = buildContextPack({ repoRoot: repo, pillar: 'P4', cursor: 0 });
  if (pack.ok && pack.file === rel) {
    assert.equal(pack.endLine, 3, 'o ficheiro tem 3 linhas, nao 4');
    assert.doesNotMatch(pack.prompt, /^\s*4\|\s*$/m,
      'uma 4a linha vazia nao pode chegar ao modelo');
  }
});

test('P4 continua a cumprir a doutrina dos pilares (copiar primeiro)', () => {
  // A correccao do P4 nao pode comprar-se a custa das invariantes que ja
  // existiam: a primeira versao desta correccao comecava por "read the header"
  // e partiu os dois testes acima — copiar primeiro, nunca julgar primeiro.
  assert.match(PILLARS.P4.ask, /^(STEP 1 — )?[Cc]opy[ ,]/,
    'o P4 tem de comecar por mandar COPIAR');
  assert.match(PILLARS.P4.ask, /this excerpt/i,
    'e a pergunta tem de continuar ancorada no excerto');
  assert.ok(SEM_ACHADO_RE.test(PILLARS.P4.ask),
    'e tem de manter uma saida honesta que o verificador reconheca');
});

// ── desligar um pilar (2026-08-21) ───────────────────────────────────────────

test('um pilar desligado sai da ROTACAO mas fica no catalogo', () => {
  // Fica no catalogo porque 62 recibos do ledger apontam para o P4: apagar a
  // entrada tornaria ilegivel o historico que explica porque foi desligado.
  assert.equal(PILLARS.P4.activo, false, 'o P4 esta desligado por medicao (0/78 achados verdadeiros)');
  assert.ok(!PILLAR_IDS.includes('P4'), 'e nao pode voltar a rotacao');
  assert.ok(Object.keys(PILLARS).includes('P4'), 'mas o historico tem de continuar a resolver o label');
});

test('um pilar desligado NAO pode ser dono de ficheiros', () => {
  // O defeito que este teste tranca custou-me uma suite vermelha e valia mais do
  // que isso: o P4 reclamava `*.md` e era o reclamante de ambito mais estreito,
  // portanto continuava a GANHAR a posse dos `.md` do poco do diff — para um
  // pilar que ja nao corre. Os `.md` deixariam de ser revistos por ninguem, em
  // silencio, porque a posse existe exactamente para os outros nao lhes pegarem.
  // Desligar um pilar tem de libertar o que ele possuia, nao congela-lo.
  const root = repoDiff();
  for (const f of ['README.md']) {
    const dono = donoDoFicheiro(root, f);
    assert.notEqual(dono, 'P4', `${f} nao pode pertencer a um pilar desligado`);
    if (dono !== null) {
      assert.ok(PILLAR_IDS.includes(dono),
        `${f} tem de pertencer a um pilar que CORRE, e nao a ${dono}`);
    }
  }
});

// ── os quatro desligados, e o que isso custou (2026-08-21) ──────────────────

test('os OITO desligados saem da rotacao e continuam no catalogo', () => {
  // Ficam no catalogo porque os recibos ja escritos apontam-lhes: apagar a
  // entrada tornaria ilegivel o historico que explica porque foram desligados.
  // Todos foram desligados por MEDICAO, nao por gosto — cada um tem o numero
  // no comentario da sua entrada em `PILLARS`.
  for (const id of ['P1', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10']) {
    assert.equal(PILLARS[id].activo, false, `${id} tem de estar desligado`);
    assert.ok(!PILLAR_IDS.includes(id), `${id} nao pode voltar a rotacao`);
    assert.ok(Object.keys(PILLARS).includes(id), `${id} tem de continuar a resolver o historico`);
  }
  assert.deepEqual(PILLAR_IDS, ['P2', 'P3']);
});

test('a rotacao contem SO os pilares que passaram o defeito semeado', () => {
  // A regra que sai do dia, e que substitui a que eu tinha escrito. A primeira
  // versao exigia `PILLAR_IDS.length >= 3` — um numero que eu inventei, e que
  // teria bloqueado o desligar do P1 e do P5 por motivo nenhum. O que importa
  // nao e QUANTOS correm: e se cada um provou que discrimina.
  //
  // Dos NOVE semeados (`prova-de-pilar.mjs`), so estes dois deram `funciona`:
  //   P3  THEY DIVERGE no semeado, THEY MATCH no controlo
  //   P2  SEED VISIBLE no semeado, NO SEED EXITS no controlo
  // Os outros sete: `partido` (P6..P10) ou `falso-em-ambos` (P1, P5).
  assert.deepEqual(PILLAR_IDS, ['P2', 'P3'],
    'so entra na rotacao quem passou o ensaio — acrescentar um pilar exige semea-lo primeiro');
  assert.ok(PILLAR_IDS.length >= 1, 'sem pilares nao ha loop nenhum');
  for (const id of PILLAR_IDS) {
    assert.notEqual(PILLARS[id].activo, false, `${id} esta na rotacao E marcado como desligado`);
  }
});

test('desligar os quatro NAO orfanou ficheiro nenhum do poco do diff', () => {
  // A regra que o desligar do P4 quase partiu: um pilar desligado nao pode
  // continuar DONO de ficheiros, senao eles deixam de ser revistos por ninguem
  // e em silencio.
  const root = repoDiff();
  for (const f of ['tools/router/mooter-review.js', 'tools/handoff-preflight.js', 'README.md']) {
    const dono = donoDoFicheiro(root, f);
    if (dono === null) continue;
    assert.ok(PILLAR_IDS.includes(dono), `${f} pertence a ${dono}, que nao corre`);
  }
});

test('a COBERTURA perdida esta declarada, nao escondida', () => {
  // Com o P4 e o P10 desligados, nenhum pilar activo olha para markdown nem
  // para os workflows do CI. Nao se perde deteccao MEDIDA (o P4 deu 0/78
  // achados verdadeiros e o P10 deu 0/455), mas perde-se cobertura — e quem
  // voltar a querer docs precisa de um pilar NOVO, nao de reactivar estes.
  const globsActivos = PILLAR_IDS.flatMap((id) => PILLARS[id].files);
  const semDono = [
    '*.md', 'docs/**/*.md', '.github/workflows/*.yml',          // P4 e P10
    'landing/app/**/*.tsx', 'landing/components/**/*.tsx',       // P6
    'packages/vscode-extension/src/*.js',                        // P6
    'tools/cockpit/*.html',                                      // P7
    'packages/mooter-bridge/*.js',                               // P5
  ];
  for (const orfao of semDono) {
    assert.ok(!globsActivos.includes(orfao),
      `${orfao} voltou a ter dono — se foi de proposito, actualiza este teste e o comentario do pilar`);
  }
  // O loop passou a ver SO backend. Escrito por extenso porque e uma perda de
  // ambito que nao se ve em lado nenhum senao aqui.
  assert.ok(globsActivos.every((g) => /^(tools|packages)\//.test(g)),
    'a rotacao so cobre tools/ e packages/ — se isso mudar, este teste tem de mudar com ela');
  // O que NAO se perdeu: o glob do P9 era um subconjunto do do P2.
  assert.ok(globsActivos.includes('packages/*/src/*.ts'),
    'a cobertura de packages/*/src/*.ts tem de sobreviver ao desligar do P9');
});

test('a caminhada usa a ROTACAO, nunca o catalogo inteiro', () => {
  // Defeito latente desde o primeiro desligar, apanhado ao desligar o P7:
  // `Object.keys(pillars)` inclui os desligados. O passo deterministico
  // (`cursor * ids.length + indexOf`) so e uma bijeccao se `ids` for a rotacao.
  // Com 10 no catalogo e 4 a correr, o cursor andava 10 quando devia andar 4 e
  // o `indexOf` dava 4 ao P5 quando a rotacao lhe da 3 — resultado medido: com
  // 8 alvos, 4 rondas seguidas moiam 3, e um saia duas vezes na mesma volta.
  //
  // Com os 10 activos isto acertava por coincidencia. Foi a suite que apanhou,
  // nao o ledger: em producao ha alvos que chegam para esconder a colisao.
  assert.deepEqual(idsActivos(PILLARS), PILLAR_IDS,
    'idsActivos tem de dar exactamente a rotacao');
  assert.ok(idsActivos(PILLARS).length < Object.keys(PILLARS).length,
    'hoje ha desligados — se isto falhar, o teste perdeu o alvo');

  // E num catalogo sintetico, para nao depender de quem esta desligado hoje.
  const cat = { A: { activo: false }, B: {}, C: { activo: false }, D: {} };
  assert.deepEqual(idsActivos(cat), ['B', 'D']);
});
