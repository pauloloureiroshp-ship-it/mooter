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

const {
  ciEPrs, TIMEOUT_MS, CORRIDAS,
  ciEPrsCacheado, limparCache, espreitarCache, CACHE_TTL_MS,
} = await import('./ci-prs.mjs');
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
  const r = ciEPrs({ resolverImpl: achou(), execImpl: () => { throw new Error('x'.repeat(500)); } });
  assert.equal(r.disponivel, false);
  assert.ok(r.porque.length < 160, 'o motivo nao pode despejar 500 caracteres no HTML');
});

// ── contagens reais ─────────────────────────────────────────────────────────

test('classifica os PRs pelo rollup dos checks', () => {
  const r = ciEPrs({ resolverImpl: achou(),
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
  const r = ciEPrs({ resolverImpl: achou(),
    execImpl: gh({
      pr: [{ number: 1, isDraft: false, statusCheckRollup: Array(19).fill({ conclusion: 'SUCCESS' }).concat({ conclusion: 'FAILURE' }) }],
      run: [],
    }),
  });
  assert.equal(r.prs_por_estado.vermelho, 1);
});

test('corridas AINDA A CORRER nao entram no numerador nem no denominador', () => {
  const r = ciEPrs({ resolverImpl: achou(),
    execImpl: gh({
      pr: [],
      run: [{ status: 'completed', conclusion: 'success' }, { status: 'in_progress', conclusion: null }],
    }),
  });
  assert.equal(r.ci.janela, 1, 'uma corrida a meio nao tem veredicto');
});

test('sem corridas terminadas, o CI e n/d — nunca "0% verde"', () => {
  const r = ciEPrs({ resolverImpl: achou(), execImpl: gh({ pr: [], run: [] }) });
  assert.equal(r.disponivel, true, 'os PRs sozinhos ja valem');
  assert.equal(r.ci.verdes, null);
  assert.match(r.ci.porque, /^n\/d/);
});

test('os PRs respondem e as corridas falham: metade medida, metade n/d', () => {
  const r = ciEPrs({ resolverImpl: achou(),
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
  ciEPrs({ resolverImpl: achou(), execImpl: (bin, args) => { pedidos.push(args.join(' ')); return '[]'; } });
  const tudo = pedidos.join(' ');
  for (const proibido of ['title', 'body', 'author', 'headRefName', 'comments']) {
    assert.ok(!tudo.includes(proibido), `pede \`${proibido}\` — conteudo nao entra no Ledger`);
  }
});

test('o timeout e curto — isto corre num launchd diario', () => {
  assert.ok(TIMEOUT_MS <= 10000);
  assert.ok(CORRIDAS <= 30, 'uma janela, nao a historia toda');
  let opcoes = null;
  ciEPrs({ resolverImpl: achou(), execImpl: (bin, args, o) => { opcoes = o; return '[]'; } });
  assert.equal(opcoes.timeout, TIMEOUT_MS);
});

// ── chega ao Ledger ─────────────────────────────────────────────────────────

test('o snapshot leva o campo e a casca le-o', () => {
  const build = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'runner', 'build-ledger-snapshot.mjs'), 'utf8');
  assert.match(build, /ci_prs: ciPrsImpl\(\{ agora: now \}\)/);
  const casca = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-ledger-shell.html'), 'utf8');
  assert.match(casca, /S\.ci_prs/);
  assert.doesNotMatch(casca, /Not measured by this build/,
    'a seccao ainda declara que nunca perguntou');
  assert.match(casca, /An empty slot beats an invented one/,
    'o caminho de n/d tem de continuar la, para quando o gh falhar');
});

// ── a cache de 60 s (C1.1) ──────────────────────────────────────────────────
//
// O que estes testes defendem nao e "ser rapido": e que a rapidez nao custou
// verdade. Um bloco cacheado que se apresente como medicao de agora seria pior
// do que os 2368 ms que a cache poupa.

test('a segunda leitura dentro do TTL nao volta a chamar o gh', () => {
  limparCache();
  let chamadas = 0;
  const impl = () => { chamadas += 1; return { disponivel: true, prs_abertos: 7 }; };
  const a = ciEPrsCacheado({ agora: 1_000_000, impl });
  const b = ciEPrsCacheado({ agora: 1_000_000 + 59_000, impl });
  assert.equal(chamadas, 1, 'perguntou duas vezes dentro do TTL');
  assert.equal(a.prs_abertos, 7);
  assert.equal(b.prs_abertos, 7);
});

test('passado o TTL volta a perguntar', () => {
  limparCache();
  let chamadas = 0;
  const impl = () => { chamadas += 1; return { disponivel: true, prs_abertos: chamadas }; };
  ciEPrsCacheado({ agora: 0, impl });
  const b = ciEPrsCacheado({ agora: CACHE_TTL_MS, impl });
  assert.equal(chamadas, 2);
  assert.equal(b.prs_abertos, 2, 'serviu o valor velho depois de o TTL expirar');
});

test('a IDADE viaja com o numero — e e a idade real, nao zero', () => {
  limparCache();
  const impl = () => ({ disponivel: true, prs_abertos: 3 });
  const a = ciEPrsCacheado({ agora: 1_000_000, impl });
  assert.equal(a.idade_s, 0);
  assert.equal(a.medido_em, new Date(1_000_000).toISOString());
  const b = ciEPrsCacheado({ agora: 1_000_000 + 41_000, impl });
  assert.equal(b.idade_s, 41, 'serviu um numero de ha 41 s a dizer que era de agora');
  assert.equal(b.medido_em, a.medido_em, 'a marca temporal e a da MEDICAO, nao a da leitura');
  assert.equal(b.cache_ttl_s, 60);
});

test('o `n/d` tambem se guarda — perguntar e falhar tambem e uma medicao', () => {
  limparCache();
  let chamadas = 0;
  const impl = () => { chamadas += 1; return { disponivel: false, porque: 'n/d — sem sessao' }; };
  ciEPrsCacheado({ agora: 5_000, impl });
  const b = ciEPrsCacheado({ agora: 20_000, impl });
  assert.equal(chamadas, 1);
  assert.equal(b.disponivel, false);
  assert.equal(b.idade_s, 15, 'o n/d cacheado tem de dizer a idade como qualquer outro');
});

test('um relogio que anda para tras nao serve um bloco do futuro', () => {
  limparCache();
  let chamadas = 0;
  const impl = () => { chamadas += 1; return { disponivel: true, prs_abertos: chamadas }; };
  ciEPrsCacheado({ agora: 1_000_000, impl });
  const b = ciEPrsCacheado({ agora: 900_000, impl });
  assert.equal(chamadas, 2, 'com o relogio para tras a cache ficava presa ate ao futuro');
  assert.equal(b.idade_s, 0);
});

test('limparCache limpa mesmo — os testes nao herdam estado uns dos outros', () => {
  limparCache();
  ciEPrsCacheado({ agora: 1, impl: () => ({ disponivel: true }) });
  assert.ok(espreitarCache());
  limparCache();
  assert.equal(espreitarCache(), null);
});

test('a casca mostra a idade nos DOIS caminhos — com dados e em n/d', () => {
  const casca = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'moo-ledger-shell.html'), 'utf8');
  assert.match(casca, /c\.idade_s/, 'a casca nunca le a idade');
  const seccao = casca.slice(casca.indexOf('CI &amp; pull requests'));
  const corpo = seccao.slice(0, seccao.indexOf('chapter VIII'));
  const usos = (corpo.match(/\$\{idade\}/g) || []).length;
  assert.ok(usos >= 2, `a idade so aparece ${usos}x — o caminho de n/d ou o de dados ficou sem ela`);
});

test('o snapshot importa a versao cacheada, nao a crua', () => {
  const build = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'runner', 'build-ledger-snapshot.mjs'), 'utf8');
  assert.match(build, /import \{ ciEPrsCacheado \} from '\.\/ci-prs\.mjs'/);
});

/* ── a classe inteira: sem `gh` na maquina (C1.7) ─────────────────────────── */

/**
 * O DEFEITO DE CLASSE, medido a 2026-09-01 num Linux limpo sem `gh`:
 *
 *     node --test tools/cockpit/runner/ci-prs.test.mjs
 *     # tests 22 · pass 15 · fail 7
 *
 * A mesma suite passava no Mac (tem `gh` em `~/.local/bin`) e passou no CI
 * (os runners do GitHub trazem `gh`). O verde nao provava a propriedade —
 * provava que o ambiente era generoso. E o padrao «provado na maquina do
 * autor» apanhado dentro do proprio instrumento de medicao.
 *
 * REPRODUZIDO AQUI a 2026-09-02, com `HOME` e `PATH` vazios:
 *
 *     env -i PATH=/usr/bin:/bin HOME=/tmp/casa-vazia node --test ci-prs.test.mjs
 *     # fail 6
 *
 * SEIS, e nao sete — e a diferenca vale a pena. O setimo
 * («so se pedem campos sem conteudo») nao FALHAVA: passava VAZIO. Sem `gh`, o
 * `execImpl` nunca corria, a lista de pedidos ficava a zero e o `for` que
 * procura campos proibidos nao iterava nada. Um teste que passa por nao ter
 * corrido e pior do que um que falha: o vermelho chama, o verde cala.
 *
 * Este teste trava a classe: se algum caso voltar a depender do disco, o
 * numero de chamadas ao resolvedor real deixa de ser zero.
 */
test('NENHUM caso de logica consulta o disco a procura do `gh`', () => {
  const fonte = fs.readFileSync(path.join(REPO, 'tools', 'cockpit', 'runner', 'ci-prs.test.mjs'), 'utf8');
  const chamadas = [...fonte.matchAll(/ciEPrs\(\{/g)];
  const semResolver = [];
  for (const m of chamadas) {
    const fatia = fonte.slice(m.index, m.index + 120);
    if (!/resolverImpl|ghBin/.test(fatia)) semResolver.push(fonte.slice(Math.max(0, m.index - 90), m.index + 40));
  }
  assert.deepEqual(semResolver, [],
    'ha chamadas a ciEPrs sem resolvedor injectado — numa maquina sem `gh` elas testam o ambiente, nao o codigo');
});

test('o caso dos campos sem conteudo prova mesmo alguma coisa — nao passa vazio', () => {
  // Sem esta guarda, `pedidos` a zero fazia o `for` nao iterar e o teste
  // passava numa maquina onde o `gh` nao existe. Um verde por ausencia.
  const pedidos = [];
  ciEPrs({ resolverImpl: achou(), execImpl: (bin, args) => { pedidos.push(args.join(' ')); return '[]'; } });
  assert.ok(pedidos.length >= 2, `so ${pedidos.length} chamada(s) ao gh — o teste dos campos passaria sem olhar para nada`);
});

test('com o `gh` em lado nenhum, a resposta e n/d — e continua a ser um teste, nao o ambiente', () => {
  const r = ciEPrs({
    resolverImpl: naoAchou(),
    execImpl: () => { throw new Error('nunca devia ser chamado'); },
  });
  assert.equal(r.disponivel, false);
  assert.match(r.porque, /nao encontrei o `gh`/);
  assert.equal(r.gh_fonte, null);
});
