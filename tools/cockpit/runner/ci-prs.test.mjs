/**
 * ci-prs.test.mjs — "zero" e "nao perguntei" nao sao a mesma coisa.
 *
 * Este bloco do Ledger dizia `n/d` por nunca ter perguntado, e a decisao foi
 * alimenta-lo em vez de o remover: os PRs e o CI sao a unica parte do trabalho
 * deste projecto que existe FORA da maquina do dono. O risco de ligar e obvio e
 * e o que estes testes guardam: um `gh` sem sessao a devolver nada podia virar
 * "0 PRs abertos, tudo verde" — que e a mentira mais confortavel que este
 * ficheiro podia contar.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { ciEPrs, TIMEOUT_MS, CORRIDAS } = await import('./ci-prs.mjs');
const { resolverBin, caminhosHabituais, redigirCasa } = await import('./gh-bin.mjs');

/**
 * Um `gh` encontrado, sem tocar no disco desta bancada.
 *
 * Todo o teste abaixo passa um `resolverImpl` explicito: uma resolucao que le o
 * disco real passaria ou falharia conforme a maquina, que e exactamente a
 * classe de teste que nao prova nada.
 */
const achou = (fonte = 'PATH') => () => ({ caminho: '/qualquer/bin/gh', fonte, procurados: [] });
const naoAchou = (pathDoProcesso = '/usr/bin:/bin:/usr/sbin:/sbin', quantos = 8) => () => ({
  caminho: null, fonte: null, path_do_processo: pathDoProcesso,
  procurados: Array.from({ length: quantos }, (_, i) => `/d${i}/gh`),
});
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// O binario deixou de ser o literal `gh`: passou a ser o caminho RESOLVIDO
// (ver `gh-bin.mjs`). A assercao continua a ser real — tem de ser o executavel
// do `gh`, e nao outro qualquer — mas deixa de cravar o formato do caminho.
const gh = (mapa) => (bin, args) => {
  assert.match(bin, /(^|[\\/])gh(\.exe|\.cmd|\.bat)?$/, `binario inesperado: ${bin}`);
  const qual = args[0] === 'pr' ? 'pr' : 'run';
  if (mapa[qual] instanceof Error) throw mapa[qual];
  return JSON.stringify(mapa[qual]);
};

// ── n/d COM MOTIVO, nunca zero ──────────────────────────────────────────────

/**
 * O ACHADO A1 DO LIVE TEST DO DONO (2026-09-01).
 *
 * O `/ledger` servido dizia `n/d — o gh nao esta instalado nesta maquina`. O
 * `gh` estava instalado, em `~/.local/bin/gh`; o que faltava era o PATH do
 * processo — o F10 corre sob launchd, com `PATH=/usr/bin:/bin:/usr/sbin:/sbin`.
 *
 * Estes dois testes guardam as DUAS mensagens que antes eram uma so, e a razao
 * de serem duas e que mandam fazer coisas diferentes: uma manda instalar o
 * `gh`, a outra manda olhar para o ambiente do processo. Um diagnostico errado
 * e pior do que nenhum.
 */
test('nao encontrado em lado nenhum: diz ONDE procurou e NAO afirma que nao esta instalado', () => {
  const r = ciEPrs({
    resolverImpl: naoAchou('/usr/bin:/bin:/usr/sbin:/sbin', 8),
    execImpl: () => { throw new Error('nunca devia chegar aqui'); },
  });
  assert.equal(r.disponivel, false);
  assert.match(r.porque, /^n\/d/);
  assert.match(r.porque, /PATH deste processo/);
  assert.match(r.porque, /PATH=\/usr\/bin:\/bin:\/usr\/sbin:\/sbin/, 'o PATH E o diagnostico — tem de viajar');
  assert.match(r.porque, /8 caminhos habituais/);
  assert.doesNotMatch(r.porque, /nao esta instalado nesta maquina/,
    'esta e a afirmacao que o live test provou falsa — nunca mais pode ser feita');
  assert.match(r.porque, /pode nao estar instalado, ou estar fora deles/,
    'a duvida honesta fica dita, em vez de resolvida a favor da hipotese errada');
  assert.equal(r.prs_abertos, undefined, 'um numero aqui seria inventado');
});

test('fora do PATH mas encontrado: USA-O, responde a serio, e diz que a fonte foi outra', () => {
  const r = ciEPrs({
    resolverImpl: achou('fora-do-PATH'),
    execImpl: gh({ pr: [{ number: 1, isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }] }], run: [] }),
  });
  assert.equal(r.disponivel, true, 'era este o caso exacto do launchd — tem de responder');
  assert.equal(r.prs_abertos, 1);
  assert.equal(r.gh_fonte, 'fora-do-PATH',
    'o ambiente pobre tem de ficar visivel, senao a proxima ferramenta reencontra o mesmo buraco em silencio');
});

test('as duas mensagens sao mesmo DISTINTAS — nao ha texto partilhado que as confunda', () => {
  const semNada = ciEPrs({ resolverImpl: naoAchou(), execImpl: () => { throw new Error('x'); } });
  const semSessao = ciEPrs({
    resolverImpl: achou(),
    execImpl: () => { throw new Error('gh auth login required'); },
  });
  assert.notEqual(semNada.porque, semSessao.porque);
  assert.match(semSessao.porque, /sessao iniciada/);
  assert.doesNotMatch(semSessao.porque, /PATH/, 'ter sessao e ter PATH sao problemas diferentes');
});

test('encontrado mas o binario desapareceu a correr: nao volta a dizer "nao instalado"', () => {
  const r = ciEPrs({
    resolverImpl: achou('fora-do-PATH'),
    execImpl: () => { throw new Error('spawn /qualquer/bin/gh ENOENT'); },
  });
  assert.equal(r.disponivel, false);
  assert.match(r.porque, /encontrei o `gh` \(via fora-do-PATH\) mas nao consegui corre-lo/);
  assert.equal(r.gh_fonte, 'fora-do-PATH');
});

test('sem sessao iniciada diz isso, e nao se confunde com o anterior', () => {
  const r = ciEPrs({ resolverImpl: achou(), execImpl: () => { throw new Error('gh auth login required'); } });
  assert.match(r.porque, /sessao iniciada/);
});

// ── o nome do dono nao viaja para dentro do HTML ────────────────────────────

test('a mensagem de erro nao carrega o caminho da casa — este ficheiro partilha-se', () => {
  // A casa REAL, porque e essa que `redigirCasa` conhece e e essa que revela
  // quem e o dono. Uma casa inventada nao provaria nada.
  const casa = os.homedir();
  const r = ciEPrs({
    resolverImpl: achou(),
    execImpl: () => { throw new Error(`EACCES: ${casa}/.local/bin/gh`); },
  });
  assert.equal(r.porque.includes(casa), false,
    'um `spawn /Users/<alguem>/... ENOENT` poria o nome do dono numa pagina que se envia a terceiros');
  assert.match(r.porque, /~\/\.local\/bin\/gh/, 'a informacao util fica — so o nome sai');
});

test('o payload publica a FONTE, nunca o caminho', () => {
  const r = ciEPrs({
    resolverImpl: () => ({ caminho: '/Users/alguem/.local/bin/gh', fonte: 'fora-do-PATH', procurados: [] }),
    execImpl: gh({ pr: [], run: [] }),
  });
  assert.equal(JSON.stringify(r).includes('/Users/alguem'), false,
    'o caminho resolvido E o nome do utilizador');
});

// ── o resolvedor, sem tocar no disco ────────────────────────────────────────

test('resolverBin prefere o PATH, e so depois os caminhos habituais', () => {
  const r = resolverBin('gh', {
    env: { PATH: '/a:/b' }, home: '/casa', plataforma: 'linux',
    existsImpl: (p) => p === '/b/gh' || p === '/casa/.local/bin/gh',
  });
  assert.equal(r.caminho, '/b/gh');
  assert.equal(r.fonte, 'PATH');
});

test('com o PATH do launchd, encontra-o na `~/.local/bin` — o caso medido a 2026-09-01', () => {
  const r = resolverBin('gh', {
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' }, home: '/casa', plataforma: 'darwin',
    existsImpl: (p) => p === '/casa/.local/bin/gh',
  });
  assert.equal(r.caminho, '/casa/.local/bin/gh');
  assert.equal(r.fonte, 'fora-do-PATH');
});

test('nao encontrado devolve o PATH do processo — e ele o diagnostico', () => {
  const r = resolverBin('gh', {
    env: { PATH: '/usr/bin:/bin' }, home: '/casa', plataforma: 'darwin', existsImpl: () => false,
  });
  assert.equal(r.caminho, null);
  assert.equal(r.path_do_processo, '/usr/bin:/bin');
  assert.ok(r.procurados.length > 5, 'tem de dizer quantos sitios olhou, senao "procurei" nao quer dizer nada');
});

test('nao executa NADA para procurar — `which` precisaria do PATH que falta', () => {
  const fonte = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'runner', 'gh-bin.mjs'), 'utf8');
  // Pelo IMPORT, nao pela palavra: o cabecalho do modulo cita `execFileSync` a
  // explicar o defeito, e um teste que casse a palavra estaria a proibir a
  // explicacao em vez do comportamento.
  assert.doesNotMatch(fonte, /from 'node:child_process'|require\('child_process'\)|import\('node:child_process'\)/,
    'procurar o binario com um binario e o mesmo buraco outra vez');
});

test('no Windows procura os nomes executaveis, nao um `gh` sem extensao', () => {
  const r = resolverBin('gh', {
    env: { PATH: 'C:\\bin' }, home: 'C:\\casa', plataforma: 'win32',
    existsImpl: (p) => p === 'C:\\bin\\gh.exe',
  });
  assert.equal(r.fonte, 'PATH');
  assert.ok(caminhosHabituais({ home: 'C:\\casa', env: {}, plataforma: 'win32' }).length > 0);
});

test('redigirCasa troca a casa por `~` e nao rebenta sem casa', () => {
  assert.equal(redigirCasa('/casa/x/gh', { home: '/casa' }), '~/x/gh');
  assert.equal(redigirCasa('/casa/x/gh', { home: '' }), '/casa/x/gh');
});

test('qualquer outra falha viaja com a mensagem, truncada', () => {
  const r = ciEPrs({ execImpl: () => { throw new Error('x'.repeat(500)); } });
  assert.equal(r.disponivel, false);
  assert.ok(r.porque.length < 160, 'o motivo nao pode despejar 500 caracteres no HTML');
});

// ── contagens reais ─────────────────────────────────────────────────────────

test('classifica os PRs pelo rollup dos checks', () => {
  const r = ciEPrs({
    execImpl: gh({
      pr: [
        { number: 1, isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion: 'SUCCESS' }] },
        { number: 2, isDraft: true, statusCheckRollup: [{ conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }] },
        { number: 3, isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS', conclusion: null }] },
        { number: 4, isDraft: false, statusCheckRollup: [] },
      ],
      run: [{ status: 'completed', conclusion: 'success' }, { status: 'completed', conclusion: 'failure' }],
    }),
  });
  assert.equal(r.prs_abertos, 4);
  assert.equal(r.rascunhos, 1);
  assert.deepEqual(r.prs_por_estado, { verde: 1, vermelho: 1, 'a-correr': 1, 'sem-checks': 1 });
  assert.deepEqual(r.ci, { janela: 2, verdes: 1, vermelhas: 1 });
});

test('UM check vermelho pinta o PR de vermelho — a media esconderia o que interessa', () => {
  const r = ciEPrs({
    execImpl: gh({
      pr: [{ number: 1, isDraft: false, statusCheckRollup: Array(19).fill({ conclusion: 'SUCCESS' }).concat({ conclusion: 'FAILURE' }) }],
      run: [],
    }),
  });
  assert.equal(r.prs_por_estado.vermelho, 1);
});

test('corridas AINDA A CORRER nao entram no numerador nem no denominador', () => {
  const r = ciEPrs({
    execImpl: gh({
      pr: [],
      run: [{ status: 'completed', conclusion: 'success' }, { status: 'in_progress', conclusion: null }],
    }),
  });
  assert.equal(r.ci.janela, 1, 'uma corrida a meio nao tem veredicto');
});

test('sem corridas terminadas, o CI e n/d — nunca "0% verde"', () => {
  const r = ciEPrs({ execImpl: gh({ pr: [], run: [] }) });
  assert.equal(r.disponivel, true, 'os PRs sozinhos ja valem');
  assert.equal(r.ci.verdes, null);
  assert.match(r.ci.porque, /^n\/d/);
});

test('os PRs respondem e as corridas falham: metade medida, metade n/d', () => {
  const r = ciEPrs({
    execImpl: (bin, args) => {
      if (args[0] === 'run') throw new Error('rede em baixo');
      return JSON.stringify([{ number: 1, isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }] }]);
    },
  });
  assert.equal(r.prs_abertos, 1);
  assert.equal(r.ci.verdes, null);
  assert.match(r.ci.porque, /nao consegui listar/);
});

// ── nada de conteudo ────────────────────────────────────────────────────────

test('so se pedem campos sem conteudo — isto acaba num HTML que se envia', () => {
  let pedidos = [];
  ciEPrs({ execImpl: (bin, args) => { pedidos.push(args.join(' ')); return '[]'; } });
  const tudo = pedidos.join(' ');
  for (const proibido of ['title', 'body', 'author', 'headRefName', 'comments']) {
    assert.ok(!tudo.includes(proibido), `pede \`${proibido}\` — conteudo nao entra no Ledger`);
  }
});

test('o timeout e curto — isto corre num launchd diario', () => {
  assert.ok(TIMEOUT_MS <= 10000);
  assert.ok(CORRIDAS <= 30, 'uma janela, nao a historia toda');
  let opcoes = null;
  ciEPrs({ execImpl: (bin, args, o) => { opcoes = o; return '[]'; } });
  assert.equal(opcoes.timeout, TIMEOUT_MS);
});

// ── chega ao Ledger ─────────────────────────────────────────────────────────

test('o snapshot leva o campo e a casca le-o', () => {
  const build = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'runner', 'build-ledger-snapshot.mjs'), 'utf8');
  assert.match(build, /ci_prs: ciPrsImpl\(\)/);
  const casca = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-ledger-shell.html'), 'utf8');
  assert.match(casca, /S\.ci_prs/);
  assert.doesNotMatch(casca, /Not measured by this build/,
    'a seccao ainda declara que nunca perguntou');
  assert.match(casca, /An empty slot beats an invented one/,
    'o caminho de n/d tem de continuar la, para quando o gh falhar');
});
