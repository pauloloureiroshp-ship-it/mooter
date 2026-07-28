'use strict';
/**
 * bundle.test.js — o que vai dentro do .mcpb tem de bater certo com o código.
 *
 * Duas classes de bug que já custaram uma release cada:
 *
 *  1. um ficheiro novo (`paths.js`) fica fora da lista do `pack-mcpb.mjs`.
 *     O repo tem 12 suites verdes, o bundle morre no primeiro `require` e o
 *     Cowork só sabe dizer "o servidor falhou".
 *  2. a versão está colada no código e o bump só toca no manifest. O conector
 *     diz ao host que é a 1.4.1 quando é a 1.4.2 — e deixa de ser possível
 *     responder a "é esta a build que eu instalei?".
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const HERE = __dirname;
const PACK = fs.readFileSync(path.join(HERE, 'pack-mcpb.mjs'), 'utf8');

/** A lista de ficheiros declarada no packer, tal como ele a vê. */
function ficheirosDoBundle() {
  const bloco = PACK.slice(PACK.indexOf('const FILES = ['), PACK.indexOf('];', PACK.indexOf('const FILES = [')));
  const out = [];
  const re = /\[\s*['"]([^'"]+)['"]\s*,\s*['"]([^'"]+)['"]\s*\]/g;
  let m;
  while ((m = re.exec(bloco)) !== null) out.push({ src: m[1], dest: m[2] });
  return out;
}

test('B1 — todo o require(./x.js) de um ficheiro empacotado também é empacotado', () => {
  const files = ficheirosDoBundle();
  assert.ok(files.length >= 15, 'não consegui ler a lista de ficheiros do packer');
  const dentro = new Set(files.map((f) => f.src));
  const faltam = [];
  for (const f of files) {
    if (!f.src.endsWith('.js')) continue;
    // ⚠️ um comentário que MENCIONE um require não é um require: o detector
    // recusou um build inteiro por causa de uma frase de documentação.
    const texto = fs.readFileSync(path.join(HERE, f.src), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    const re = /require\(\s*['"]\.\/([\w.-]+\.js)['"]\s*\)/g;
    let m;
    while ((m = re.exec(texto)) !== null) if (!dentro.has(m[1])) faltam.push(f.src + ' -> ' + m[1]);
  }
  assert.deepStrictEqual(faltam, [], 'o bundle instalaria um conector que não arranca');
});

test('B2 — todos os ficheiros da lista existem em disco', () => {
  for (const f of ficheirosDoBundle()) {
    assert.ok(fs.existsSync(path.join(HERE, f.src)), 'falta no repo: ' + f.src);
  }
});

test('B3 — o packer recusa uma lista incompleta (a verificação existe mesmo)', () => {
  assert.ok(/verificarRequires\(FILES\)/.test(PACK),
    'a verificação de requires deixou de correr no build');
});

test('B4 — a versão anunciada vem do manifest, não de uma string colada', () => {
  const srv = fs.readFileSync(path.join(HERE, 'server-apps.js'), 'utf8');
  const linha = srv.split('\n').find((l) => l.includes('serverInfo:'));
  assert.ok(linha, 'não encontrei o serverInfo');
  assert.ok(!/version:\s*['"]\d+\.\d+/.test(linha),
    'a versão está colada no código — vai mentir ao host no próximo bump');
  assert.ok(/version:\s*VERSION/.test(linha));
});

test('B5 — manifest e lista de tools do manifest batem com as 6 públicas', () => {
  const man = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
  const tools6 = require('./tools6.js');
  const publicas = tools6.PUBLICAS.slice().sort();
  const noManifest = man.tools.map((t) => t.name).sort();
  assert.deepStrictEqual(noManifest, publicas,
    'o manifest promete portas diferentes das que o servidor abre');
});

test('B6 — o pack falha com entrega declarada ausente e passa quando ela existe no bundle', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-pack-entregas-'));
  const previousImportOnly = process.env.MOOTER_PACK_IMPORT_ONLY;
  try {
    process.env.MOOTER_PACK_IMPORT_ONLY = '1';
    const moduleUrl = pathToFileURL(path.join(HERE, 'pack-mcpb.mjs')).href + '?test=' + Date.now();
    const { verifyDeliveries } = await import(moduleUrl);
    const files = [['sentinela.js', 'server/sentinela.js']];
    fs.writeFileSync(path.join(dir, 'sentinela.js'), 'existe');
    assert.throws(
      () => verifyDeliveries('9.9.0', { '9.9': ['nao-existe.js'] }, files, dir),
      (error) => /9\.9\.0/.test(error.message) && /nao-existe\.js/.test(error.message)
        && /faz assim/i.test(error.message),
    );
    assert.doesNotThrow(
      () => verifyDeliveries('9.9.0', { '9.9': ['sentinela.js'] }, files, dir),
    );
    fs.writeFileSync(path.join(dir, 'fora-do-pack.js'), 'existe');
    assert.throws(
      () => verifyDeliveries('9.9.0', { '9.9': ['fora-do-pack.js'] }, files, dir),
      /não entram em FILES: fora-do-pack\.js/i,
    );
    assert.throws(
      () => verifyDeliveries('9.9.0', {}, files, dir),
      /não existe declaração para 9\.9/i,
    );
    assert.match(PACK, /verifyDeliveries\(manifest\.version, deliveries, FILES, HERE\)/,
      'o verificador existe mas o pack não o chama');
  } finally {
    if (previousImportOnly == null) delete process.env.MOOTER_PACK_IMPORT_ONLY;
    else process.env.MOOTER_PACK_IMPORT_ONLY = previousImportOnly;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * B7 — F0 item 2. `verificarRequires`/B1 só apanham `require('./x.js')` COM
 * extensão — classify.js faz `require('./patterns')`, sem `.js`, por isso o
 * detector automático não vê essa dependência. Um `existsSync` sozinho passa
 * mesmo que falte `patterns.js`: prova-se copiando exactamente o subconjunto
 * que o pack copia para um directório à parte e correndo `classify()` isolado,
 * sem o resto de tools/router/ ao lado.
 */
test('B7 — classify.js entra no bundle com as dependências que precisa para correr isolado', () => {
  const files = ficheirosDoBundle();
  const porDest = new Map(files.map((f) => [f.dest, f.src]));
  assert.ok(porDest.has('server/classify.js'), 'classify.js não está na lista do bundle');
  assert.ok(porDest.has('server/patterns.js'), 'patterns.js (require duro de classify.js) não está na lista do bundle');
  assert.ok(porDest.has('server/tuning-state.defaults.json'),
    'tuning-state.defaults.json (lido sem try/catch de fallback) não está na lista do bundle');

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-classify-isolado-'));
  try {
    for (const dest of ['server/classify.js', 'server/patterns.js', 'server/tuning-state.defaults.json', 'server/version.json']) {
      const src = porDest.get(dest);
      if (!src) continue; // version.json é opcional — classify.js degrada-se sem ele
      fs.copyFileSync(path.join(HERE, src), path.join(dir, path.basename(dest)));
    }
    const isolado = require(path.join(dir, 'classify.js'));
    const d = isolado.classify('rename x to y');
    assert.strictEqual(typeof d.tier, 'string', 'classify() isolado no bundle não devolveu uma decisão válida');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('B8 — manifest.json declara user_config e o mcp_config lê os 3 valores', () => {
  const man = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));
  assert.ok(man.user_config, 'falta user_config no manifest');
  for (const chave of ['vault_path', 'repo_path', 'ollama_host']) {
    assert.ok(man.user_config[chave], 'user_config não declara ' + chave);
  }
  const env = man.server && man.server.mcp_config && man.server.mcp_config.env;
  assert.ok(env, 'mcp_config não passa nenhum env ao servidor — user_config fica sem efeito');
  assert.strictEqual(env.MOOTER_VAULT, '${user_config.vault_path}');
  assert.strictEqual(env.MOOTER_REPO, '${user_config.repo_path}');
  assert.strictEqual(env.OLLAMA_HOST, '${user_config.ollama_host}');
});
