/**
 * init-v2.test.js — enrolment e registo de conectores.
 *
 * Sem rede, sem CLIs instaladas, e sem tocar no `claude_desktop_config.json`
 * de ninguem: tudo por `MOOTER_HOME` temporario e implementacoes injectadas.
 */

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const E = require('./enrolment.js');
const C = require('./conectores.js');

function comTmp(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-w3-'));
  const limpa = () => fs.rmSync(dir, { recursive: true, force: true });
  let r;
  try {
    r = fn(dir);
  } catch (e) {
    limpa();
    throw e;
  }
  if (r && typeof r.then === 'function') return r.then((v) => { limpa(); return v; }, (e) => { limpa(); throw e; });
  limpa();
  return r;
}

const CODIGO = 'abcdefghijklmnop1234';
const respostaOk = { ok: true, status: 200, json: async () => ({ device_key: 'dk_' + 'x'.repeat(40), device_id: 'dev-1' }) };

// ── a troca: codigo de uso unico -> chave de device (D3) ──────────────────

test('enrolar troca o codigo por uma chave, e escreve-a com 0600', async () => {
  await comTmp(async (dir) => {
    const r = await E.enrolar(CODIGO, { env: { MOOTER_HOME: dir }, fetchImpl: async () => respostaOk });
    assert.equal(r.ok, true);
    assert.equal(r.codigo, 'ligado');
    const f = path.join(dir, 'credentials');
    assert.equal(JSON.parse(fs.readFileSync(f, 'utf8')).device_key.startsWith('dk_'), true);
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(f).mode & 0o777, 0o600, 'a credencial nao ficou 0600');
    }
  });
});

test('a PRIVADA nunca sai — so a publica vai no pedido', async () => {
  await comTmp(async (dir) => {
    let corpo = null;
    await E.enrolar(CODIGO, {
      env: { MOOTER_HOME: dir },
      fetchImpl: async (_u, opts) => { corpo = JSON.parse(opts.body); return respostaOk; },
    });
    assert.ok(corpo.device_pub, 'nao mandou publica nenhuma');
    const cru = JSON.stringify(corpo);
    assert.ok(!cru.includes('PRIVATE'), 'a chave privada foi no pedido');
    assert.ok(!cru.includes(CODIGO.slice(0, 4) + 'X'), 'sanidade');
  });
});

test('a chave de device NUNCA volta no resultado impresso — nem truncada', async () => {
  await comTmp(async (dir) => {
    const r = await E.enrolar(CODIGO, { env: { MOOTER_HOME: dir }, fetchImpl: async () => respostaOk });
    const impresso = JSON.stringify(r);
    assert.ok(!impresso.includes('dk_'), 'a chave apareceu no recibo — meia chave e um bom principio para adivinhar a outra metade');
  });
});

test('a privada e REUTILIZADA entre tentativas — senao o servidor fica com a errada', async () => {
  await comTmp(async (dir) => {
    const o = { env: { MOOTER_HOME: dir } };
    const a = E.parDoDevice(o);
    const b = E.parDoDevice(o);
    assert.equal(a.nova, true);
    assert.equal(b.nova, false);
    assert.equal(a.pub, b.pub, 'gerou par novo: o device passaria a assinar com uma chave desconhecida');
  });
});

test('a privada fica 0600', () => {
  comTmp((dir) => {
    E.parDoDevice({ env: { MOOTER_HOME: dir } });
    if (process.platform === 'win32') return;
    assert.equal(fs.statSync(path.join(dir, 'device-enrol.key')).mode & 0o777, 0o600);
  });
});

// ── B10: codigo invalido ou gasto ─────────────────────────────────────────

test('B10 · um codigo malformado nem chega a sair da maquina', async () => {
  await comTmp(async (dir) => {
    let bateu = false;
    const r = await E.enrolar('nao é um código!', {
      env: { MOOTER_HOME: dir },
      fetchImpl: async () => { bateu = true; return respostaOk; },
    });
    assert.equal(bateu, false, 'gastou um pedido de rede com um codigo obviamente mau');
    assert.equal(r.codigo, 'codigo-invalido');
  });
});

test('B10 · 410 e 401 dizem «expirou ou ja foi usado» e caem em Free local', async () => {
  for (const status of [401, 410]) {
    await comTmp(async (dir) => {
      const r = await E.enrolar(CODIGO, {
        env: { MOOTER_HOME: dir },
        fetchImpl: async () => ({ ok: false, status }),
      });
      assert.equal(r.codigo, 'codigo-gasto');
      assert.match(r.porque, /Free local/);
      assert.equal(fs.existsSync(path.join(dir, 'credentials')), false);
    });
  }
});

test('sem codigo nenhum e Free local — nao um erro', async () => {
  await comTmp(async (dir) => {
    const r = await E.enrolar(null, { env: { MOOTER_HOME: dir } });
    assert.equal(r.codigo, 'sem-codigo');
    assert.match(r.porque, /Free local/);
  });
});

test('sem rede nao bloqueia nada, e a frase nao e um codigo de erro', async () => {
  await comTmp(async (dir) => {
    const r = await E.enrolar(CODIGO, {
      env: { MOOTER_HOME: dir },
      fetchImpl: async () => { throw new Error('ENOTFOUND'); },
    });
    assert.equal(r.codigo, 'sem-rede');
    assert.doesNotMatch(r.porque, /ENOTFOUND/);
  });
});

test('uma resposta sem chave nao escreve credencial nenhuma', async () => {
  await comTmp(async (dir) => {
    const r = await E.enrolar(CODIGO, {
      env: { MOOTER_HOME: dir },
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }),
    });
    assert.equal(r.codigo, 'sem-chave');
    assert.equal(fs.existsSync(path.join(dir, 'credentials')), false);
  });
});

// ── B12: revogado ─────────────────────────────────────────────────────────

test('B12 · esquecer apaga a credencial mas GUARDA a privada', async () => {
  await comTmp(async (dir) => {
    const o = { env: { MOOTER_HOME: dir } };
    await E.enrolar(CODIGO, Object.assign({}, o, { fetchImpl: async () => respostaOk }));
    assert.equal(E.ligado(o), true);
    const r = E.esquecerCredencial(o);
    assert.equal(r.ok, true);
    assert.equal(E.ligado(o), false);
    // Gerar par novo por causa de uma revogacao so enche o registo de chaves mortas.
    assert.equal(fs.existsSync(path.join(dir, 'device-enrol.key')), true);
    assert.match(r.porque, /Free local/);
  });
});

// ── conectores ────────────────────────────────────────────────────────────

test('Desktop · o backup tem o CONTEUDO DE ANTES, nao o de depois', () => {
  // A primeira versao deste teste so verificava que `r.codigo` existia — o que
  // e' verdade mesmo quando o backup esta vazio, corrompido, ou e uma copia do
  // ficheiro JA reescrito. Um backup que nao restaura nao e um backup, e um
  // teste que so olha para o rotulo parece cobertura sem ser.
  comTmp((dir) => {
    const alvo = path.join(dir, 'Claude', 'claude_desktop_config.json');
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    const antes = JSON.stringify({ mcpServers: { outro: { command: 'x', env: { K: 'v' } } } }, null, 2);
    fs.writeFileSync(alvo, antes);

    const r = C.registarNoDesktop({ home: dir, plataforma: 'linux', env: { XDG_CONFIG_HOME: dir }, comando: '/n' });

    assert.ok(r.backup, 'nao ha caminho de backup no resultado');
    assert.equal(fs.readFileSync(r.backup, 'utf8'), antes, 'o backup nao e o ficheiro de ANTES');
    // E restaurar tem de devolver exactamente o estado original.
    fs.copyFileSync(r.backup, alvo);
    assert.deepEqual(JSON.parse(fs.readFileSync(alvo, 'utf8')), JSON.parse(antes));
    // O caminho do backup e IMPRESSO — a recuperacao nao pode depender de adivinhar.
    assert.ok(r.backup.startsWith(alvo), `o backup nao esta ao lado do original: ${r.backup}`);
  });
});

test('Desktop · o conector que ja la estava SOBREVIVE', () => {
  comTmp((dir) => {
    const alvo = path.join(dir, 'Claude', 'claude_desktop_config.json');
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, JSON.stringify({ mcpServers: { outro: { command: 'x' } } }));
    const r = C.registarNoDesktop({ home: dir, plataforma: 'linux', env: { XDG_CONFIG_HOME: dir }, comando: '/n', args: ['/l.js'] });
    assert.equal(r.ok, true);
    const depois = JSON.parse(fs.readFileSync(alvo, 'utf8'));
    assert.ok(depois.mcpServers.outro, 'apagou o conector de outra pessoa');
    assert.equal(depois.mcpServers.mooter.command, '/n');
    assert.ok(r.backup && fs.existsSync(r.backup), 'nao ha copia de seguranca');
    assert.match(r.porque, /Reinicia o Claude Desktop/);
  });
});

test('Desktop · um JSON ilegivel NAO e reescrito — nem com backup', () => {
  comTmp((dir) => {
    const alvo = path.join(dir, 'Claude', 'claude_desktop_config.json');
    fs.mkdirSync(path.dirname(alvo), { recursive: true });
    fs.writeFileSync(alvo, '{ isto nao e json');
    const r = C.registarNoDesktop({ home: dir, plataforma: 'linux', env: { XDG_CONFIG_HOME: dir } });
    assert.equal(r.ok, false);
    assert.equal(r.codigo, 'json-invalido');
    assert.equal(fs.readFileSync(alvo, 'utf8'), '{ isto nao e json', 'tocou num ficheiro que nao percebeu');
  });
});

test('Desktop · sem ficheiro nenhum, cria-o sem backup e sem drama', () => {
  comTmp((dir) => {
    const r = C.registarNoDesktop({ home: dir, plataforma: 'linux', env: { XDG_CONFIG_HOME: dir }, comando: '/n' });
    assert.equal(r.ok, true);
    assert.equal(r.codigo, 'registado');
    assert.equal(r.backup, null);
  });
});

test('Desktop · o caminho e o certo em cada plataforma', () => {
  assert.match(C.caminhoDoDesktop({ plataforma: 'darwin', home: '/h' }), /Library\/Application Support\/Claude/);
  assert.match(C.caminhoDoDesktop({ plataforma: 'win32', home: '/h', env: { APPDATA: 'C:\\A' } }), /Claude/);
  assert.match(C.caminhoDoDesktop({ plataforma: 'linux', home: '/h', env: {} }), /\.config\/Claude/);
});

test('B9 · uma CLI ausente NAO e erro — devolve o comando para depois', () => {
  const r = C.registarNaCli('codex', { ondeImpl: () => null, comando: '/n', args: ['/l.js'] });
  assert.equal(r.ok, true);
  assert.equal(r.codigo, 'cli-ausente');
  assert.match(r.comando_para_depois, /^codex mcp add mooter -- \/n \/l\.js$/);
});

test('CLI presente: corre o `mcp add` da propria CLI', () => {
  let chamada = null;
  const r = C.registarNaCli('claude', {
    ondeImpl: () => '/bin/claude',
    execImpl: (bin, argv) => { chamada = { bin, argv }; return ''; },
    comando: '/n',
    args: ['/l.js'],
  });
  assert.equal(r.ok, true);
  assert.equal(chamada.bin, '/bin/claude');
  assert.deepEqual(chamada.argv, ['mcp', 'add', 'mooter', '--', '/n', '/l.js']);
});

test('um `mcp add` que falha diz porque, e deixa o comando para a mao', () => {
  const r = C.registarNaCli('claude', {
    ondeImpl: () => '/bin/claude',
    execImpl: () => { throw new Error('already exists'); },
  });
  assert.equal(r.ok, false);
  assert.match(r.porque, /already exists/);
  assert.ok(r.comando_para_depois);
});

test('registarTudo devolve um relatorio por destino e nunca lanca', () => {
  comTmp((dir) => {
    const r = C.registarTudo({ home: dir, plataforma: 'linux', env: { XDG_CONFIG_HOME: dir }, ondeImpl: () => null, comando: '/n' });
    assert.equal(r.desktop.ok, true);
    assert.equal(r.claude.codigo, 'cli-ausente');
    assert.equal(r.codex.codigo, 'cli-ausente');
  });
});

// ── o perfil: derivado, nao perguntado ────────────────────────────────────

const PERFIL = require('./perfil.js');
const R = require('./rota.js');

const RETRATO = {
  clis: [
    { nome: 'claude', presente: true, versao: '2.1.267', login: 'n/d' },
    { nome: 'codex', presente: false, versao: null, login: 'n/d' },
  ],
  ollama: { presente: true, modelos: ['a', 'b'] },
  gpu: { name_short: 'Apple M4 Pro' },
  ram_mb: 24576,
};

test('o init passa de ONZE perguntas para UMA — e o numero fica guardado', () => {
  // Um numero que ninguem vigia volta a crescer.
  assert.equal(PERFIL.PERGUNTAS.length, 1);
  assert.deepEqual(PERFIL.PERGUNTAS, ['claude_max']);
});

test('a FORMA do subscription-profile.json nao muda — dez ficheiros leem-na', () => {
  const p = PERFIL.construir(RETRATO, {}, { env: {} });
  for (const k of ['anthropic', 'claude_code', 'openai', 'openai_plus', 'gemini', 'cursor', 'github']) {
    assert.ok(k in p.profiles, `perdeu-se a chave ${k}`);
  }
  for (const k of ['updated_at', 'profiles', 'budget_strategy', 'detection', 'notes']) {
    assert.ok(k in p, `perdeu-se a chave de topo ${k}`);
  }
});

test('o que a maquina sabe, a maquina responde', () => {
  const p = PERFIL.construir(RETRATO, {}, { env: { OPENAI_API_KEY: 'x', GOOGLE_API_KEY: 'y' } });
  assert.equal(p.profiles.openai, 'api-paid');
  assert.equal(p.profiles.gemini, 'api-paid');
  assert.equal(p.detection.openai_env, true);
  assert.equal(p.detection.gemini_env, true);
});

test('uma CLI INSTALADA nao vira uma subscricao inventada', () => {
  // `claude` instalado nao prova plano nenhum. `n/d` e a resposta certa.
  const p = PERFIL.construir(RETRATO, {}, { env: {} });
  assert.equal(p.profiles.claude_code, 'n/d');
  assert.equal(p.profiles.anthropic, 'none', 'inventou um plano a partir da presenca da CLI');
  // mas a medicao fica registada em `detection`, que e' o que ela e'
  assert.equal(p.detection.clis.find((c) => c.nome === 'claude').presente, true);
});

test('sem CLI, `claude_code` e `none` e nao `n/d`', () => {
  const p = PERFIL.construir({ clis: [], ollama: null, gpu: null, ram_mb: null }, {}, { env: {} });
  assert.equal(p.profiles.claude_code, 'none');
});

test('a unica pergunta que sobra e a que muda a rota', () => {
  assert.equal(PERFIL.construir(RETRATO, { claude_max: true }, { env: {} }).profiles.anthropic, 'max');
  assert.equal(PERFIL.construir(RETRATO, { claude_max: false }, { env: { ANTHROPIC_API_KEY: 'x' } }).profiles.anthropic, 'api-paid');
});

test('o perfil nunca guarda sessoes nem tokens (R6)', () => {
  const p = PERFIL.construir(RETRATO, {}, { env: { ANTHROPIC_API_KEY: 'sk-super-secreto' } });
  assert.ok(!JSON.stringify(p).includes('sk-super-secreto'), 'a chave entrou no perfil');
  assert.equal(p.detection.anthropic_env, true, 'devia registar QUE existe, sem o valor');
});

// ── a rota: politica, nunca logica ────────────────────────────────────────

test('a rota NAO toca no classificador — e politica sobre classes existentes', () => {
  const src = require('node:fs').readFileSync(path.join(__dirname, 'rota.js'), 'utf8');
  assert.ok(!src.includes("require('../../router/classify"), 'a rota importa o classificador');
  assert.ok(!/patterns\.js/.test(src));
});

test('sem ficheiro, a politica de omissao e local-para-leitura', () => {
  comTmp((dir) => {
    const r = R.ler({ env: { MOOTER_HOME: dir } });
    assert.equal(r.politica, 'local-leitura');
    assert.equal(r.fonte, 'omissao');
    assert.equal(r.leitura, 'local');
    assert.equal(r.escrita, 'cloud');
  });
});

test('escrever e reler devolve a mesma politica', () => {
  comTmp((dir) => {
    const o = { env: { MOOTER_HOME: dir } };
    assert.equal(R.escrever('local-tudo', o).ok, true);
    assert.equal(R.ler(o).politica, 'local-tudo');
    assert.equal(R.ler(o).fonte, 'ficheiro');
  });
});

test('uma politica desconhecida e RECUSADA — nao se inventa comportamento', () => {
  comTmp((dir) => {
    const r = R.escrever('faz-o-que-quiseres', { env: { MOOTER_HOME: dir } });
    assert.equal(r.ok, false);
    assert.match(r.porque, /conhecidas:/);
  });
});

test('um route.json com lixo cai na omissao, e diz porque', () => {
  comTmp((dir) => {
    require('node:fs').writeFileSync(path.join(dir, 'route.json'), JSON.stringify({ politica: 'inventada' }));
    const r = R.ler({ env: { MOOTER_HOME: dir } });
    assert.equal(r.politica, 'local-leitura');
    assert.match(r.porque, /desconhecida/);
  });
});

test('cada politica declara o que faz com leitura e com escrita', () => {
  for (const [nome, p] of Object.entries(R.POLITICAS)) {
    assert.ok(p.titulo && p.descricao, `${nome} sem texto`);
    assert.ok(p.leitura && p.escrita, `${nome} nao diz o que faz`);
  }
});
