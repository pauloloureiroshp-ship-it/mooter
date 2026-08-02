'use strict';

/**
 * onboarding.test.js — os 5 gaps da auditoria, cada um com o seu vermelho.
 *
 * Régua desta suite: **um teste que só corre no PC do Paulo não prova nada.** Por isso cada caso
 * injecta o ambiente em vez de o ler (`validarUserConfig(env)`), usa portas fechadas em vez de
 * esperar que o Ollama esteja em baixo, e nunca depende de haver (ou não haver) vault na máquina.
 *
 * O que NÃO é testado aqui, e porquê: a persistência real do install-id em `~/.mooter` —
 * escrever no home do utilizador durante os testes é exactamente o tipo de efeito colateral que
 * a auditoria de 2026-07-25 apanhou (uma suite escreveu no vault REAL). `estadoInstallId()` é
 * exercitada em modo leitura; o caminho de escrita fica coberto pelo teste de arranque em
 * tools6.test.js, que corre contra o HOME real de quem o corre e não afirma nada sobre ele.
 */

const { test } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

const onboarding = require('./onboarding.js');

// ─────────────────────────────────────────────────────────── GAP 1 · git/gh ──

test('gap 1 · git e gh são verificados e cada ausência traz conserto por OS', () => {
  const r = onboarding.verificarFerramentas();
  assert.ok(Array.isArray(r.itens) && r.itens.length === 2, 'esperava git e gh');
  const bins = r.itens.map((i) => i.binario).sort();
  assert.deepStrictEqual(bins, ['gh', 'git']);

  const git = r.itens.find((i) => i.binario === 'git');
  assert.strictEqual(git.obrigatorio, true, 'git tem de ser duro — sem ele o 1º job com write:true falha');
  const gh = r.itens.find((i) => i.binario === 'gh');
  assert.strictEqual(gh.obrigatorio, false, 'gh só bloqueia releases/PRs — não pode travar o produto todo');

  for (const it of r.itens) {
    if (!it.presente) assert.ok(it.conserto && it.conserto.length > 5, it.binario + ' ausente sem instrução de conserto');
    else assert.strictEqual(it.conserto, null, it.binario + ' presente não devia trazer conserto');
  }
  // `ok` segue só o obrigatório: uma máquina sem `gh` continua utilizável.
  assert.strictEqual(r.ok, !!git.presente, 'o veredicto tem de seguir o git, não o gh');
});

test('gap 1 · a instrução de conserto é a do OS onde se corre', () => {
  const g = onboarding.comoInstalar('git');
  const esperado = process.platform === 'win32' ? /winget/ : process.platform === 'darwin' ? /brew|xcode-select/ : /apt|distro/;
  assert.match(g, esperado, 'conserto de git não corresponde a ' + process.platform);
  assert.match(onboarding.comoInstalar('desconhecido'), /n\/d/, 'binário sem instrução tem de dizer n/d, não inventar');
});

// ──────────────────────────────────────────────────────────── GAP 2 · Ollama ──

test('gap 2 · daemon em baixo distingue-se de timeout, de porta ocupada e de sem-modelos', async () => {
  // 1. sem_daemon — porta fechada (porta 1 nunca tem nada à escuta)
  const semDaemon = await onboarding.probeOllama('127.0.0.1:1', 800);
  assert.ok(['sem_daemon', 'erro_rede'].includes(semDaemon.estado), 'esperava sem_daemon/erro_rede, veio ' + semDaemon.estado);
  assert.ok(semDaemon.porque && semDaemon.conserto, 'falha sem porquê ou sem conserto');

  // 2. resposta_inesperada — há algo à escuta, mas não é o Ollama
  const impostor = http.createServer((req, res) => { res.statusCode = 404; res.end('nope'); });
  await new Promise((r) => impostor.listen(0, '127.0.0.1', r));
  const portaImpostor = impostor.address().port;
  const inesperada = await onboarding.probeOllama('127.0.0.1:' + portaImpostor, 1500);
  assert.strictEqual(inesperada.estado, 'resposta_inesperada', 'HTTP 404 devia ser resposta_inesperada, veio ' + inesperada.estado);
  assert.match(inesperada.porque, /404/, 'o porquê devia citar o código HTTP real');
  impostor.close();

  // 3. resposta_ilegivel — 200 com corpo que não é JSON
  const lixo = http.createServer((req, res) => { res.statusCode = 200; res.end('<html>não sou json</html>'); });
  await new Promise((r) => lixo.listen(0, '127.0.0.1', r));
  const ilegivel = await onboarding.probeOllama('127.0.0.1:' + lixo.address().port, 1500);
  assert.strictEqual(ilegivel.estado, 'resposta_ilegivel', 'corpo não-JSON devia ser resposta_ilegivel, veio ' + ilegivel.estado);
  lixo.close();

  // 4. sem_modelos — Ollama vivo, zero modelos: o conserto tem de ser um `ollama pull`
  const vazio = http.createServer((req, res) => { res.statusCode = 200; res.end(JSON.stringify({ models: [] })); });
  await new Promise((r) => vazio.listen(0, '127.0.0.1', r));
  const semModelos = await onboarding.probeOllama('127.0.0.1:' + vazio.address().port, 1500);
  assert.strictEqual(semModelos.estado, 'sem_modelos');
  assert.match(semModelos.conserto, /ollama pull/, 'sem modelos, o conserto tem de ser um pull concreto');
  vazio.close();

  // 5. ok — modelos presentes, sem porquê nem conserto (nada a consertar)
  const cheio = http.createServer((req, res) => {
    res.statusCode = 200;
    res.end(JSON.stringify({ models: [{ model: 'qwen2.5-coder:7b' }] }));
  });
  await new Promise((r) => cheio.listen(0, '127.0.0.1', r));
  const bom = await onboarding.probeOllama('127.0.0.1:' + cheio.address().port, 1500);
  assert.strictEqual(bom.estado, 'ok');
  assert.deepStrictEqual(bom.modelos, ['qwen2.5-coder:7b']);
  assert.strictEqual(bom.porque, null);
  assert.strictEqual(bom.conserto, null);
  cheio.close();

  // Os 5 estados são REALMENTE distintos — era este o gap.
  const estados = new Set([semDaemon.estado, inesperada.estado, ilegivel.estado, semModelos.estado, bom.estado]);
  assert.strictEqual(estados.size, 5, 'os modos de falha voltaram a colapsar num só: ' + [...estados].join(', '));
});

test('gap 2 · timeout distingue-se de daemon em baixo', async () => {
  // Servidor que aceita a ligação e nunca responde → só o timeout o apanha.
  const mudo = http.createServer(() => { /* nunca responde */ });
  await new Promise((r) => mudo.listen(0, '127.0.0.1', r));
  const r = await onboarding.probeOllama('127.0.0.1:' + mudo.address().port, 300);
  assert.strictEqual(r.estado, 'timeout', 'servidor mudo devia dar timeout, veio ' + r.estado);
  assert.match(r.porque, /300 ms/, 'o porquê do timeout devia dizer quanto esperou');
  mudo.close();
});

test('G4 nº2 · JSON válido com a forma errada não rebenta o probe', async () => {
  // O codex apanhou isto: `((j && j.models) || []).map(...)` — um objecto é truthy, o `||` não o
  // apanha, e o `.map` lançava TypeError DENTRO do handler de `end`, onde não há catch.
  for (const corpo of ['{"models":{}}', '{"models":"nenhum"}', '{}', 'null', '[]', '{"models":[null,{},{"name":"bom"}]}']) {
    const srv = http.createServer((req, res) => { res.statusCode = 200; res.end(corpo); });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    const r = await onboarding.probeOllama('127.0.0.1:' + srv.address().port, 1500);
    assert.ok(r && r.estado, 'corpo ' + corpo + ' não devolveu estado — a Promise rebentou ou ficou pendurada');
    assert.ok(['resposta_inesperada', 'sem_modelos', 'ok'].includes(r.estado),
      'corpo ' + corpo + ' deu estado inesperado: ' + r.estado);
    if (r.estado !== 'ok') assert.ok(r.porque && r.conserto, 'corpo ' + corpo + ' sem porquê/conserto');
    srv.close();
  }
});

test('G4 nº3 · servidor que responde a conta-gotas não pendura a Promise para sempre', async () => {
  // Timeout de inactividade nunca dispara se houver tráfego lento e constante. O prazo é absoluto.
  const lento = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // escreve um byte a cada 60 ms e NUNCA termina
    const t = setInterval(() => { try { res.write(' '); } catch { clearInterval(t); } }, 60);
    res.on('close', () => clearInterval(t));
  });
  await new Promise((r) => lento.listen(0, '127.0.0.1', r));
  const inicio = Date.now();
  const r = await onboarding.probeOllama('127.0.0.1:' + lento.address().port, 300);
  const decorrido = Date.now() - inicio;
  assert.strictEqual(r.estado, 'timeout', 'o conta-gotas devia dar timeout, veio ' + r.estado);
  assert.ok(decorrido < 5000, 'demorou ' + decorrido + ' ms — o prazo absoluto não disparou');
  lento.close();
});

test('gap 2 · a degradação sem Ollama é dita, não escondida', () => {
  assert.strictEqual(onboarding.degradacaoSemOllama('ok'), null, 'com Ollama não há degradação a declarar');
  const d = onboarding.degradacaoSemOllama('sem_daemon');
  assert.match(d, /\$0/, 'a degradação tem de dizer que o modo $0 cai');
  assert.match(d, /resto do Mooter funciona/, 'e tem de dizer o que CONTINUA a funcionar — senão é alarme, não informação');
});

// ───────────────────────────────────────────────────────────── GAP 3 · vault ──

test('gap 3 · vault ausente traz dica accionável e diz o que se perde', () => {
  const r = onboarding.estadoVault(() => ({ available: false, root: null, reason: 'nada encontrado', checked: 3 }));
  assert.strictEqual(r.ok, false);
  assert.match(r.conserto, /MOOTER_VAULT|formulário/, 'sem vault tem de dizer COMO se configura');
  assert.ok(r.perde && r.perde.length > 10, 'sem vault tem de dizer o que se perde');
});

test('gap 3 · vault presente não inventa dica nem alarme', () => {
  const r = onboarding.estadoVault(() => ({ available: true, root: '/tmp/v', source: 'MOOTER_VAULT', last_note: null }));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.root, '/tmp/v');
  assert.strictEqual(r.conserto, null);
  assert.strictEqual(r.perde, null);
});

test('gap 3 · journal.js em falta é linha vermelha, nunca excepção', () => {
  const r = onboarding.estadoVault(() => { throw new Error('módulo em falta'); });
  assert.strictEqual(r.ok, false);
  assert.match(r.porque, /módulo em falta/);
  assert.ok(r.conserto, 'nem no caminho de excepção pode faltar o conserto');
});

// ────────────────────────────────────────────────────── GAP 4 · user_config ──

test('gap 4 · caminho inexistente é apanhado no boot, não no primeiro job', () => {
  const r = onboarding.validarUserConfig({ MOOTER_VAULT: path.join(os.tmpdir(), 'nao-existe-' + process.pid) });
  const campo = r.campos.find((c) => c.campo.startsWith('vault_path'));
  assert.strictEqual(campo.estado, 'caminho_inexistente');
  assert.strictEqual(r.ok, false);
  assert.ok(campo.conserto, 'caminho errado sem conserto não ajuda ninguém');
});

test('gap 4 · ficheiro onde se esperava pasta é apanhado', () => {
  const f = path.join(os.tmpdir(), 'onb-ficheiro-' + process.pid + '.txt');
  fs.writeFileSync(f, 'x', 'utf8');
  try {
    const r = onboarding.validarUserConfig({ MOOTER_REPO: f });
    const campo = r.campos.find((c) => c.campo.startsWith('repo_path'));
    assert.strictEqual(campo.estado, 'nao_e_pasta');
  } finally { try { fs.unlinkSync(f); } catch { /* */ } }
});

test('gap 4 · campos vazios são válidos — os 4 são opcionais por desenho', () => {
  const r = onboarding.validarUserConfig({});
  assert.strictEqual(r.ok, true, 'uma instalação sem nada preenchido tem de arrancar: ' + r.detalhe);
  assert.strictEqual(r.campos.length, 4, 'os 4 campos do manifest.json:40-66 têm de ser todos verificados');
});

test('gap 4 · placeholder por expandir (${user_config.x}) conta como vazio, não como caminho', () => {
  const r = onboarding.validarUserConfig({ MOOTER_VAULT: '${user_config.vault_path}' });
  const campo = r.campos.find((c) => c.campo.startsWith('vault_path'));
  assert.strictEqual(campo.estado, 'vazio', 'o placeholder não expandido não pode virar "caminho inexistente"');
});

test('gap 4 · ollama_host mal formado é apanhado pela FORMA, sem tocar na rede', () => {
  const mau = onboarding.validarUserConfig({ OLLAMA_HOST: 'http://127.0.0.1:11434/api/tags' });
  const c = mau.campos.find((x) => x.campo.startsWith('ollama_host'));
  assert.strictEqual(c.ok, false, 'host com caminho devia ser forma_invalida');
  assert.match(c.conserto, /11434/);

  const bom = onboarding.validarUserConfig({ OLLAMA_HOST: 'http://127.0.0.1:11434' });
  assert.strictEqual(bom.campos.find((x) => x.campo.startsWith('ollama_host')).ok, true, 'o prefixo http:// é tolerado, como no moo.js');
});

test('gap 4 · a key NUNCA aparece no output — nem valor, nem prefixo, nem sufixo', () => {
  const SEGREDO = 'sk-super-secreto-1234567890-abcdefghij';
  const r = onboarding.validarUserConfig({ MOONSHOT_API_KEY: SEGREDO });
  const serializado = JSON.stringify(r);
  assert.ok(!serializado.includes(SEGREDO), 'a key inteira vazou para o output');
  assert.ok(!serializado.includes('sk-'), 'o prefixo da key vazou — mascarar ainda é revelar');
  assert.ok(!serializado.includes('abcdefghij'), 'o sufixo da key vazou');
  const c = r.campos.find((x) => x.campo === 'moonshot_api_key');
  assert.strictEqual(c.estado, 'presente');
  assert.strictEqual(c.ok, true);
});

test('gap 4 · key com espaços (erro de cópia) é apanhada sem a imprimir', () => {
  const r = onboarding.validarUserConfig({ MOONSHOT_API_KEY: '  sk-com espaco-no-meio-1234567890  ' });
  const c = r.campos.find((x) => x.campo === 'moonshot_api_key');
  assert.strictEqual(c.ok, false);
  assert.match(c.detalhe, /espaços|erro de cópia/);
  assert.ok(!JSON.stringify(r).includes('sk-'), 'até no erro a key tem de ficar fora do output');
});

test('gap 4 · key ausente não bloqueia — só o kimi cai', () => {
  const r = onboarding.validarUserConfig({});
  const c = r.campos.find((x) => x.campo === 'moonshot_api_key');
  assert.strictEqual(c.ok, true, 'sem key o produto continua utilizável');
  assert.match(c.detalhe, /kimi/, 'tem de dizer O QUE fica indisponível');
});

// ──────────────────────────────────────────────────────── GAP 5 · install-id ──

test('gap 5 · o estado do install-id é medido, nunca assumido', () => {
  const r = onboarding.estadoInstallId();
  assert.ok(typeof r.ok === 'boolean' && typeof r.persistente === 'boolean', 'estado incompleto: ' + JSON.stringify(r));
  // Efémero é a única combinação que obriga a explicação — é o silêncio que era o gap.
  if (!r.persistente) {
    assert.ok(r.porque && r.conserto, 'install-id efémero sem porquê/conserto é exactamente o gap 5');
  }
});

// ────────────────────────────────────────────────────────────────── boot ──

test('boot · nunca lança e devolve sempre veredicto + passos', async () => {
  const r = await onboarding.boot({
    env: { MOOTER_VAULT: path.join(os.tmpdir(), 'nao-existe-' + process.pid) },
    vaultStatusFn: () => ({ available: false, root: null, reason: 'teste', checked: 1 }),
    ollamaHost: '127.0.0.1:1',
    timeoutMs: 500,
  });
  assert.strictEqual(typeof r.pronto_para_trabalhar, 'boolean');
  assert.ok(Array.isArray(r.proximos_passos) && r.proximos_passos.length <= 3, 'próximos passos tem de caber em 3');
  assert.ok(r.resumo && r.resumo.length > 5);
  // Um caminho de vault inexistente é bloqueio; a ordem tem de o pôr à frente da degradação.
  const prioridades = r.passos_todos.map((p) => p.prioridade);
  const iBloqueia = prioridades.indexOf('bloqueia');
  const iDegrada = prioridades.indexOf('degrada');
  assert.ok(iBloqueia >= 0, 'um caminho inexistente tinha de gerar bloqueio');
  if (iDegrada >= 0) assert.ok(iBloqueia < iDegrada, 'o que bloqueia tem de vir antes do que só degrada');
});

test('boot · nenhum passo sai sem comando accionável', async () => {
  const r = await onboarding.boot({ env: {}, vaultStatusFn: () => ({ available: false, reason: 'teste', checked: 1 }), ollamaHost: '127.0.0.1:1', timeoutMs: 500 });
  for (const p of r.passos_todos) {
    assert.ok(p.o_que, 'passo sem descrição');
    assert.ok(p.comando, 'passo «' + p.o_que + '» sem comando — é o gap do "diagnóstico que não diz o que fazer"');
    assert.ok(p.porque, 'passo «' + p.o_que + '» sem porquê');
  }
});

test('boot · máquina degradada continua a poder trabalhar — a distinção que faltava', async () => {
  // Sem Ollama e sem vault: perde-se o $0 e a memória, mas o produto trabalha.
  const r = await onboarding.boot({ env: {}, vaultStatusFn: () => ({ available: false, reason: 'teste', checked: 1 }), ollamaHost: '127.0.0.1:1', timeoutMs: 500 });
  const temGit = onboarding.verificarFerramentas().itens.find((i) => i.binario === 'git').presente;
  if (temGit) {
    assert.strictEqual(r.pronto_para_trabalhar, true, 'sem Ollama e sem vault ainda se trabalha: ' + JSON.stringify(r.passos_todos));
    assert.ok(r.passos_todos.length >= 2, 'e ainda assim tem de haver passos a propor');
  }
});
