'use strict';
/**
 * a4.test.js — o guard anti-fabricação para motores sem ferramentas.
 *
 * ⚠️ REGRA DESTA SUITE: cada teste ou corre git a sério, ou exercita a decisão
 * que o servidor toma no caminho real. Uma tentativa anterior teve 15/15 verdes
 * a testar funções isoladas enquanto o caminho real executava `npm test` do
 * package.json por MENÇÃO numa frase — os testes nunca tocaram nesse caminho.
 * Testar a função e não a passagem é como provar a sopa cheirando a panela.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const S = require('./seamless.js');

const REPO = path.resolve(__dirname, '..', '..');
const { pedeExecucao, executarComandos, veredictoSemEvidencia } = S;

// o caso REAL que falhou a 2026-07-26, copiado do goal que foi mesmo despachado
const GOAL_REAL = 'Validar o commit a84e71e em C:\\Users\\Paulo Loureiro\\frugal. '
  + 'Corre: (1) git show --stat --format="%H | %an | %ad" a84e71e ; '
  + '(2) git show --name-only --format="" a84e71e ; '
  + '(3) git status --porcelain -- packages/mooter-bridge ; '
  + '(4) git log --oneline -3 ; (5) dir .git\\index.lock';

// ── 1. o caso real: dispara, e com os argumentos que foram pedidos ──────────

test('o goal real de 2026-07-26 dispara o A4 (antes não disparava nada)', () => {
  const p = pedeExecucao(GOAL_REAL);
  assert.ok(p, 'o guard tem de disparar — foi exactamente isto que passou ao lado');
  assert.ok(p.length >= 4, 'esperava 4+ comandos git, vieram ' + p.length);
});

test('INVARIANTE 2 · os argumentos do utilizador são preservados, não descartados', () => {
  const p = pedeExecucao(GOAL_REAL).filter((x) => !x.recusado);
  const show = p.find((x) => x.sub === 'show');
  assert.ok(show, 'git show tem de estar lá');
  assert.ok(show.args.includes('--stat'), '--stat foi pedido e tem de sobreviver: ' + JSON.stringify(show.args));
  assert.ok(show.args.includes('a84e71e'), 'o sha foi pedido e tem de sobreviver: ' + JSON.stringify(show.args));
  // correr `git show` pelado quando foi pedido `git show --stat <sha>` é dar
  // evidência errada com selo de autenticidade
  assert.notDeepStrictEqual(show.args, ['show'], 'nunca uma versão mutilada do pedido');
});

test('o `|` dentro de --format="%H | %an" não parte o comando ao meio', () => {
  const p = pedeExecucao('corre git show --format="%H | %an" HEAD').filter((x) => !x.recusado);
  assert.strictEqual(p.length, 1);
  assert.ok(p[0].args.some((a) => a.includes('|')), 'o format aspado tem de chegar inteiro: ' + JSON.stringify(p[0].args));
});

test('N comandos distintos, não só o primeiro (a regex tem de ser global)', () => {
  const p = pedeExecucao('git status ; git log ; git diff ; git branch').filter((x) => !x.recusado);
  const subs = p.map((x) => x.sub).sort();
  assert.deepStrictEqual(subs, ['branch', 'diff', 'log', 'status']);
});

test('comandos repetidos contam uma vez', () => {
  const p = pedeExecucao('git status e depois outra vez git status').filter((x) => !x.recusado);
  assert.strictEqual(p.length, 1);
});

// ── 2. INVARIANTE 1 · allowlist só git, e só leitura ────────────────────────

test('INVARIANTE 1 · npm test NUNCA executa, nem mencionado nem pedido', () => {
  for (const t of [
    'corre npm test e diz-me o resultado',
    'o resultado do npm test da wave anterior ficou por analisar, resume-o',
    'npm run build',
  ]) {
    const p = pedeExecucao(t);
    const correriam = (p || []).filter((x) => !x.recusado);
    assert.strictEqual(correriam.length, 0, 'npm nunca pode correr — falhou em: ' + t);
  }
});

test('INVARIANTE 1 · node --test NUNCA executa', () => {
  const p = pedeExecucao('corre node --test e conta quantas suites passam');
  assert.strictEqual((p || []).filter((x) => !x.recusado).length, 0);
});

test('git push, commit, checkout, reset e clean são recusados COM razão dita', () => {
  for (const sub of ['push', 'commit', 'checkout', 'reset', 'clean', 'rebase', 'gc']) {
    const p = pedeExecucao('corre git ' + sub);
    assert.ok(p, 'tem de ser detectado para poder ser recusado: ' + sub);
    const alvo = p.find((x) => x.sub === sub);
    assert.ok(alvo, 'git ' + sub + ' tem de aparecer na lista');
    assert.ok(alvo.recusado, 'git ' + sub + ' TEM de ser recusado');
    assert.strictEqual(alvo.args.length, 0, 'um comando recusado nunca leva argumentos');
  }
});

// ── 3. argumentos perigosos ────────────────────────────────────────────────

test('-c core.pager=X é recusado (faz o git executar outro programa)', () => {
  const p = pedeExecucao('corre git -c core.pager=id status');
  const alvo = p.find((x) => x.recusado);
  assert.ok(alvo, 'tinha de ser recusado');
  assert.match(alvo.recusado, /proibido/i);
});

test('--upload-pack, --exec, --output e --ext-diff são recusados', () => {
  for (const flag of ['--upload-pack=sh', '--exec=id', '--output=/tmp/x', '--ext-diff']) {
    const p = pedeExecucao('git log ' + flag);
    assert.ok(p.some((x) => x.recusado), flag + ' tinha de ser recusado');
  }
});

test('git branch -D é recusado: `branch` lê, mas -D apaga', () => {
  const ok = pedeExecucao('git branch').filter((x) => !x.recusado);
  assert.strictEqual(ok.length, 1, 'git branch pelado é leitura e pode correr');
  for (const flag of ['-D', '-d', '-m', '--delete', '--force']) {
    const p = pedeExecucao('git branch ' + flag + ' alguma-coisa');
    assert.ok(p.some((x) => x.recusado), 'git branch ' + flag + ' tinha de ser recusado');
  }
});

test('metacaracter em argumento NÃO citado é recusado, comando inteiro fora', () => {
  const p = pedeExecucao('git log --format=$(id)');
  const alvo = p.find((x) => x.sub === 'log');
  assert.ok(alvo.recusado, 'tinha de ser recusado');
  assert.strictEqual(alvo.args.length, 0, 'nunca correr uma versão limpa do que foi pedido sujo');
});

// ── 4. execução a sério, contra este repositório ───────────────────────────

test('EXECUÇÃO REAL · a saída de git é literal e entra no bloco', () => {
  const r = executarComandos('corre git rev-parse --abbrev-ref HEAD', REPO);
  assert.ok(r && r.bloco, 'devia ter corrido: ' + JSON.stringify(r && r.recusados));
  assert.strictEqual(r.executados.length, 1);
  assert.match(r.bloco, /SA[ÍI]DAS REAIS/);
  assert.match(r.bloco, /git rev-parse --abbrev-ref HEAD/);
  assert.ok(r.chars > 0, 'tem de ter trazido bytes reais');
});

test('EXECUÇÃO REAL · o bloco carrega a regra do n/d para o modelo', () => {
  const r = executarComandos('corre git rev-parse HEAD', REPO);
  assert.ok(r.bloco);
  assert.match(r.bloco, /n\/d/);
  assert.match(r.bloco, /Nunca PASS/i);
});

test('EXECUÇÃO REAL · git status com pathspec corre e traz saída literal', () => {
  const r = executarComandos('corre git status --porcelain -- packages/mooter-bridge', REPO);
  assert.ok(r && r.bloco, 'devia ter corrido: ' + JSON.stringify(r && r.recusados));
  assert.match(r.bloco, /git status --porcelain/);
});

test('EXECUÇÃO REAL · um comando que falha vira recusa honesta, nunca evidência falsa', () => {
  // pasta que não é repositório: o git falha, e o que NÃO pode acontecer é o
  // bloco sair com o comando a fingir que correu
  const r = executarComandos('corre git rev-parse HEAD', require('os').tmpdir());
  assert.ok(r, 'tem de devolver algo');
  assert.strictEqual(r.bloco, null, 'sem saída real não há bloco');
  assert.strictEqual(r.executados.length, 0);
  assert.strictEqual(r.recusados.length, 1);
  assert.ok(r.recusados[0].porque, 'a razão da falha tem de ser dita, não engolida');
});

test('EXECUÇÃO REAL · o que foi recusado aparece NO PROMPT, não desaparece', () => {
  const r = executarComandos('corre git rev-parse HEAD e depois git push origin main', REPO);
  assert.ok(r.bloco, 'o rev-parse corre');
  assert.ok(r.recusados.length >= 1, 'o push tem de ficar registado como recusado');
  assert.match(r.bloco, /N[ÃA]O tens evid[êe]ncia/i);
  assert.match(r.bloco, /git push/);
});

test('EXECUÇÃO REAL · git status não deixa index.lock para trás', () => {
  const fs = require('fs');
  const lock = path.join(REPO, '.git', 'index.lock');
  const antes = fs.existsSync(lock);
  executarComandos('corre git status --porcelain', REPO);
  assert.strictEqual(fs.existsSync(lock), antes, 'GIT_OPTIONAL_LOCKS=0 tem de evitar o lock');
});

test('texto sem comando nenhum não dispara execução', () => {
  assert.strictEqual(pedeExecucao('explica-me como funciona o Live Preview'), null);
  assert.strictEqual(executarComandos('resume o ficheiro de configuração', REPO), null);
});

// ── 5. INVARIANTE 3 · guard de saída lê do disco, e cala-se quando deve ────

const RESPOSTA_FABRICADA = '| Verificação | Saída Real | PASS/FAIL |\n| (1) git show | n/d | FAIL |\n'
  + '\nEste commit NÃO está seguro para push.';

test('INVARIANTE 3 · veredicto sem evidência nenhuma é degradado', () => {
  const v = veredictoSemEvidencia({ agent: 'moo', evidencia: null }, RESPOSTA_FABRICADA);
  assert.strictEqual(v.degradado, true);
  assert.match(v.texto, /VEREDICTO N[ÃA]O VERIFICADO/);
  assert.ok(v.texto.includes(RESPOSTA_FABRICADA), 'o texto original tem de ser preservado por baixo do aviso');
});

test('INVARIANTE 3 · com comandos corridos, CALA-SE (senão vira ruído)', () => {
  const meta = { agent: 'moo', evidencia: { ficheiros_lidos: [], comandos_corridos: ['git status'], comandos_recusados: [] } };
  assert.strictEqual(veredictoSemEvidencia(meta, RESPOSTA_FABRICADA).degradado, false);
});

test('INVARIANTE 3 · com ficheiros lidos, CALA-SE', () => {
  const meta = { agent: 'moo', evidencia: { ficheiros_lidos: ['moo.js'], comandos_corridos: [], comandos_recusados: [] } };
  assert.strictEqual(veredictoSemEvidencia(meta, RESPOSTA_FABRICADA).degradado, false);
});

test('INVARIANTE 3 · o cc nunca é degradado — tem ferramentas próprias', () => {
  assert.strictEqual(veredictoSemEvidencia({ agent: 'cc', evidencia: null }, RESPOSTA_FABRICADA).degradado, false);
  assert.strictEqual(veredictoSemEvidencia({ agent: 'codex', evidencia: null }, RESPOSTA_FABRICADA).degradado, false);
});

test('resposta sem veredicto nenhum não é degradada, mesmo sem evidência', () => {
  const texto = 'Não consegui verificar nada. Todas as linhas ficam n/d.';
  assert.strictEqual(veredictoSemEvidencia({ agent: 'moo', evidencia: null }, texto).degradado, false);
});

test('o aviso diz QUAIS comandos não correram', () => {
  const meta = { agent: 'moo', evidencia: { ficheiros_lidos: [], comandos_corridos: [], comandos_recusados: [{ comando: 'git push', porque: 'fora da allowlist' }] } };
  const v = veredictoSemEvidencia(meta, RESPOSTA_FABRICADA);
  assert.strictEqual(v.degradado, true);
  assert.match(v.texto, /git push/);
  assert.match(v.texto, /fora da allowlist/);
});

// ── 6. a passagem: os três estão ligados ao caminho real ──────────────────

test('PASSAGEM · as três funções estão exportadas e ligadas ao seamless real', () => {
  for (const n of ['pedeExecucao', 'executarComandos', 'veredictoSemEvidencia']) {
    assert.strictEqual(typeof S[n], 'function', n + ' tem de estar exportada — senão o teste não testa o caminho real');
  }
});

test('PASSAGEM · meta.json guarda a evidência (o guard lê do disco, não da memória)', () => {
  const src = require('fs').readFileSync(path.join(__dirname, 'seamless.js'), 'utf8');
  const bloco = src.slice(src.indexOf("'meta.json'), JSON.stringify("), src.indexOf("'meta.json'), JSON.stringify(") + 700);
  assert.match(bloco, /evidencia/, 'meta.json TEM de gravar `evidencia` — foi este o buraco que matou a 1ª tentativa');
});
