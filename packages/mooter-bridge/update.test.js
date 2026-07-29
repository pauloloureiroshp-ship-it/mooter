'use strict';
/**
 * update.test.js — v1.8: codigo que se substitui a si proprio nao pode falhar.
 *
 * Um erro a meio deixa o conector morto e o utilizador sem forma de o consertar
 * de dentro do Cowork. Cada teste aqui e' uma das quatro redes de seguranca.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const up = require('./update.js');

function escreverBundle(ficheiro, versao, servidores) {
  const entradas = [
    { nome: 'manifest.json', dados: Buffer.from(JSON.stringify({ version: versao })) },
    ...Object.entries(servidores).map(([nome, dados]) => ({
      nome: 'server/' + nome,
      dados: Buffer.isBuffer(dados) ? dados : Buffer.from(dados),
    })),
  ];
  const locais = [];
  const centrais = [];
  let offset = 0;
  for (const entrada of entradas) {
    const nome = Buffer.from(entrada.nome);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(entrada.dados.length, 18);
    local.writeUInt32LE(entrada.dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    locais.push(local, nome, entrada.dados);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(entrada.dados.length, 20);
    central.writeUInt32LE(entrada.dados.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt32LE(offset, 42);
    centrais.push(central, nome);
    offset += local.length + nome.length + entrada.dados.length;
  }
  const blocoCentral = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(blocoCentral.length, 12);
  fim.writeUInt32LE(offset, 16);
  fs.writeFileSync(ficheiro, Buffer.concat([...locais, blocoCentral, fim]));
}

function prepararInstalacao(raiz, versao) {
  const installRoot = path.join(raiz, 'instalado');
  const installDir = path.join(installRoot, 'server');
  const mooterDir = path.join(raiz, 'mooter-home');
  fs.mkdirSync(installDir, { recursive: true });
  fs.mkdirSync(mooterDir, { recursive: true });
  fs.writeFileSync(path.join(installRoot, 'manifest.json'), JSON.stringify({ version: versao }));
  fs.writeFileSync(path.join(installDir, 'antigo.js'), 'module.exports = "antigo";\n');
  return { installRoot, installDir, mooterDir };
}

async function esperarEstado(mooterDir, esperado, timeoutMs = 20000) {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    const estado = up.estadoDaInstalacao({ mooterDir });
    if (estado.estado === esperado) return estado;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('estado não chegou a ' + esperado + ': '
    + JSON.stringify(up.estadoDaInstalacao({ mooterDir })));
}

test('U1 — versoes comparam-se por numero, nao por texto', () => {
  assert.strictEqual(up.compara('1.10.0', '1.9.0'), 1, '1.10 tem de ser MAIOR que 1.9');
  assert.strictEqual(up.compara('1.7.0', '1.7.0'), 0);
  assert.strictEqual(up.compara('1.6.9', '1.7.0'), -1);
  assert.strictEqual(up.compara('2.0.0', '1.99.99'), 1);
});

test('U2 — le um .mcpb real e encontra o manifest', () => {
  const cands = [path.join(os.homedir(), 'frugal', '_handoff'), '/sessions/gracious-festive-rubin/mnt/frugal/_handoff'];
  let achou = null;
  for (const d of cands) {
    try { const f = fs.readdirSync(d).filter((x) => x.endsWith('.mcpb'))[0]; if (f) { achou = path.join(d, f); break; } } catch { /* */ }
  }
  if (!achou) { console.log('  (sem .mcpb para testar — saltado)'); return; }
  // ⚠️ o assert era `> 10` e apanhou um bundle antigo de 9 ficheiros — o teste
  // estava errado, nao o codigo. O invariante real e': le TODOS os bundles que
  // ja existiram, do primeiro ao ultimo, e encontra sempre o manifest.
  const dir = path.dirname(achou);
  const todos = fs.readdirSync(dir).filter((x) => x.endsWith('.mcpb'));
  let lidos = 0;
  for (const nome of todos) {
    const zip = up.lerZip(fs.readFileSync(path.join(dir, nome)));
    assert.ok(zip.length >= 5, nome + ' devolveu so ' + zip.length + ' ficheiros');
    const man = zip.find((f) => f.nome === 'manifest.json');
    assert.ok(man, nome + ' nao trouxe manifest');
    assert.ok(JSON.parse(man.dados.toString('utf8')).version, nome + ' com manifest sem versao');
    lidos++;
  }
  assert.ok(lidos >= 1);
  console.log('  (' + lidos + ' bundle(s) lidos, do mais antigo ao mais recente)');
});

test('U3 — REDE 1: um bundle com require em falta e RECUSADO', () => {
  // ⚠️ e' exactamente este o cenario que mataria o conector: um ficheiro que
  // precisa de outro que nao vem no pacote. O repo estaria verde e a instalacao
  // morreria no primeiro require, com o Cowork so a dizer "o servidor falhou".
  const zip = [
    { nome: 'manifest.json', dados: Buffer.from('{"version":"9.9.9"}') },
    { nome: 'server/a.js', dados: Buffer.from("require('./nao-existe.js');") },
  ];
  const p = up.verificar(zip);
  assert.ok(p.length, 'aceitou um bundle que nao arranca');
  assert.ok(/nao-existe\.js/.test(p.join(' ')));
});

test('U4 — REDE 2: um bundle com erro de sintaxe e RECUSADO', () => {
  const zip = [
    { nome: 'manifest.json', dados: Buffer.from('{"version":"9.9.9"}') },
    { nome: 'server/a.js', dados: Buffer.from('function ( { isto nao compila') },
  ];
  const p = up.verificar(zip);
  assert.ok(p.length, 'aceitou codigo que nao compila');
  assert.ok(/sintaxe/i.test(p.join(' ')));
});

test('U5 — REDE 3: um bundle sem manifest e RECUSADO', () => {
  const p = up.verificar([{ nome: 'server/a.js', dados: Buffer.from('var x=1;') }]);
  assert.ok(/manifest/i.test(p.join(' ')));
});

test('U6 — um bundle bom PASSA na verificacao', () => {
  const zip = [
    { nome: 'manifest.json', dados: Buffer.from('{"version":"9.9.9"}') },
    { nome: 'server/a.js', dados: Buffer.from("const b = require('./b.js');\nmodule.exports = { b };\n") },
    { nome: 'server/b.js', dados: Buffer.from('module.exports = 1;\n') },
  ];
  assert.deepStrictEqual(up.verificar(zip), []);
});

test('U7 — nao instala uma versao igual ou mais velha sem forcar', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-u7-'));
  const f = path.join(tmp, 'velho.mcpb');
  fs.writeFileSync(f, Buffer.from('lixo'));
  const r = up.aplicar({ ficheiro: f });
  assert.strictEqual(r.ok, false, 'aceitou um ficheiro que nem e um bundle');
  assert.ok(r.erro);
});

test('U8 — procurar diz SEMPRE onde procurou', () => {
  const r = up.procurar({});
  assert.ok(Array.isArray(r.procurei_em) && r.procurei_em.length,
    '"nao ha actualizacoes" sem dizer onde olhou e indistinguivel de "nao sei procurar"');
  assert.ok(r.versao_instalada, 'nao sabe que versao esta a correr');
  assert.ok(r.onde_instalado, 'nao sabe onde esta instalado — nao poderia escrever-se por cima');
});

test('U9 — a resposta do aplicar diz que E PRECISO REINICIAR', () => {
  // o MCP nao tem forma de reiniciar um conector. Prometer o contrario seria
  // mentir, e o utilizador ficaria a achar que ja tem a versao nova a correr.
  const src = fs.readFileSync(path.join(__dirname, 'update.js'), 'utf8');
  assert.ok(/FECHA O CLAUDE DESKTOP/.test(src), 'nao diz ao utilizador que tem de reiniciar');
  assert.ok(/não tem forma de se reiniciar|nao tem forma de se reiniciar/.test(src),
    'nao explica PORQUE e que o reinicio e inevitavel');
});

test('U10 — a tool de update e invisivel ao modelo', () => {
  const probe = require('./probe.js');
  assert.deepStrictEqual(probe.TOOL_UPDATE._meta.ui.visibility, ['app'],
    'o modelo pode disparar uma substituicao dos ficheiros do servidor');
  const tools6 = require('./tools6.js');
  assert.ok(!tools6.PUBLICAS.includes(probe.TOOL_UPDATE.name));
});

test('U11 — um COMENTARIO que menciona um require nao parte o build', () => {
  // ⚠️ aconteceu mesmo: `// todos os require('./x.js') tem de existir` — uma
  // frase de documentacao — fez o packer recusar o build inteiro. Um guarda que
  // da falsos positivos acaba desligado, e um guarda desligado nao guarda nada.
  const zip = [
    { nome: 'manifest.json', dados: Buffer.from('{"version":"9.9.9"}') },
    { nome: 'server/a.js', dados: Buffer.from("// todos os require('./inventado.js') sao verificados\nvar x=1;\n") },
  ];
  assert.deepStrictEqual(up.verificar(zip), [], 'recusou por causa de um comentario');
});

test('U12 — le bundles COMPRIMIDOS, nao so os que nos escrevemos', () => {
  // um actualizador que so sabe ler o que ele proprio escreveu nao e' um
  // actualizador: bundles antigos e de outras ferramentas usam DEFLATE.
  const src = fs.readFileSync(path.join(__dirname, 'update.js'), 'utf8');
  assert.ok(/inflateRawSync/.test(src), 'nao sabe descomprimir — recusa bundles DEFLATE');
  assert.ok(/off \+ 20/.test(src), 'le o tamanho ORIGINAL onde devia ler o comprimido');
});

test('U13 — a mesma pasta por dois caminhos nao duplica a lista de versoes', () => {
  // ⚠️ medido: MOOTER_REPO aponta para ~/frugal e a lista tambem tinha ~/frugal
  // a mao. Cada bundle apareceu DUAS vezes — 44 entradas para 22 ficheiros. Um
  // utilizador que ve a mesma versao repetida deixa de confiar na lista.
  const antes = process.env.MOOTER_REPO;
  process.env.MOOTER_REPO = os.homedir();          // colide com os candidatos fixos
  try {
    const r = up.procurar({ pasta: os.homedir() });
    const chaves = r.procurei_em.map((d) => path.resolve(d).toLowerCase());
    assert.strictEqual(new Set(chaves).size, chaves.length, 'a mesma pasta aparece duas vezes: ' + chaves.join(' | '));
    if (r.encontrados) {
      const ids = r.encontrados.map((x) => x.ficheiro);
      assert.strictEqual(new Set(ids).size, ids.length, 'o mesmo .mcpb aparece duas vezes na lista');
    }
  } finally {
    if (antes) process.env.MOOTER_REPO = antes; else delete process.env.MOOTER_REPO;
  }
});

test('U14 — o actualizador tem de ser ALCANCAVEL por uma tool publica', () => {
  /**
   * ⚠️ O BOTAO QUE NINGUEM CONSEGUIA CARREGAR.
   *
   * A v1.8 pos a actualizacao numa tool `visibility:['app']`, escondida do
   * `tools/list`. O registo do servidor mostrou ZERO chamadas depois de o
   * utilizador carregar no botao: o painel nao lhe chegou E o modelo tambem
   * nao. Uma proteccao que torna a coisa inalcancavel nao e' uma proteccao —
   * e' um bug com boas intencoes.
   */
  const tools6 = require('./tools6.js');
  const src = fs.readFileSync(path.join(__dirname, 'tools6.js'), 'utf8');
  assert.ok(/atualizar/.test(src), 'nao ha via publica para actualizar');
  assert.ok(/enum: \['ver', 'aplicar', 'reverter'\]/.test(src), 'sem verbo explicito, o modelo adivinha');
  assert.ok(tools6.PUBLICAS.includes('mooter_setup'), 'a via de actualizacao vive numa tool que nao e anunciada');
});

test('U15 — o painel PEDE a conversa em vez de chamar a tool escondida', () => {
  const html = fs.readFileSync(path.join(__dirname, 'fleet-ui.html'), 'utf8');
  const bloco = html.slice(html.indexOf('Actualizar para'), html.indexOf('Actualizar para') + 500);
  assert.ok(/say\(/.test(bloco), 'o botao voltou a chamar directamente uma tool que nao existe para o host');
  assert.ok(/mooter_setup/.test(bloco), 'nao diz a conversa que tool usar');
});

test('U16 — a resposta do painel nao leva a lista inteira de bundles', () => {
  // ⚠️ 37,9 KB de 2 em 2 segundos, medido no registo. A lista completa de todos
  // os bundles ja construidos passava pelo mesmo tubo stdio dos dispatches.
  const src = fs.readFileSync(path.join(__dirname, 'fleet.js'), 'utf8');
  const bloco = src.slice(src.indexOf('versao: (() =>'), src.indexOf('versao: (() =>') + 600);
  assert.ok(!/encontrados/.test(bloco), 'o painel voltou a enviar a lista inteira de versoes');
  assert.ok(/versao_instalada/.test(bloco) && /nova/.test(bloco), 'o painel precisa de saber a versao e se ha nova');
});

test('U17 — aplicarAsync responde em menos de 500 ms e persiste até instalado', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-u17-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const instalacao = prepararInstalacao(tmp, '1.20.0');
  const bundle = path.join(tmp, 'grande.mcpb');
  const servidores = {};
  for (let i = 0; i < 40; i++) {
    servidores['ficheiro-' + i + '.js'] = '// ' + 'x'.repeat(14000)
      + '\nmodule.exports = ' + i + ';\n';
  }
  escreverBundle(bundle, '1.21.0', servidores);
  const bundleBytes = fs.statSync(bundle).size;
  assert.ok(bundleBytes > 500000, 'o bundle sintético não é grande o suficiente');

  const inicio = Date.now();
  const resposta = await up.aplicarAsync({
    ficheiro: bundle,
    installDir: instalacao.installDir,
    mooterDir: instalacao.mooterDir,
  });
  const demorouMs = Date.now() - inicio;
  assert.strictEqual(resposta.estado, 'a-instalar');
  assert.ok(demorouMs < 500, 'a resposta demorou ' + demorouMs + ' ms');
  console.log('  (' + bundleBytes + ' bytes; resposta inicial em ' + demorouMs + ' ms)');

  const inicial = up.estadoDaInstalacao({ mooterDir: instalacao.mooterDir });
  assert.strictEqual(inicial.estado, 'a-instalar');
  assert.strictEqual(inicial.ficheiros_escritos, 0);
  assert.strictEqual(inicial.total, 41);

  const final = await esperarEstado(instalacao.mooterDir, 'instalado');
  assert.strictEqual(final.ficheiros_escritos, final.total);
  assert.strictEqual(final.ficheiros_escritos, 41);
  assert.ok(final.terminado_em);
  assert.strictEqual(final.erro, null);
  const manifest = JSON.parse(fs.readFileSync(path.join(instalacao.installRoot, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.version, '1.21.0');
});

test('U18 — bundle inválido falha antes de escrever na instalação', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-u18-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const instalacao = prepararInstalacao(tmp, '1.20.0');
  const bundle = path.join(tmp, 'invalido.mcpb');
  escreverBundle(bundle, '1.21.0', {
    'partido.js': "module.exports = require('./nao-existe.js');\n",
  });
  const antes = fs.readFileSync(path.join(instalacao.installDir, 'antigo.js'), 'utf8');

  const resposta = await up.aplicarAsync({
    ficheiro: bundle,
    installDir: instalacao.installDir,
    mooterDir: instalacao.mooterDir,
  });
  assert.strictEqual(resposta.estado, 'a-instalar');
  const final = await esperarEstado(instalacao.mooterDir, 'falhou');
  assert.match(final.erro, /não passou na verificação/);
  assert.match(final.erro, /nao-existe\.js/);
  assert.strictEqual(final.ficheiros_escritos, 0);
  assert.strictEqual(final.backup, null);
  assert.strictEqual(fs.readFileSync(path.join(instalacao.installDir, 'antigo.js'), 'utf8'), antes);
  assert.ok(!fs.existsSync(path.join(instalacao.installDir, 'partido.js')));
});

test('U19 — estadoDaInstalacao marca stale depois de cinco minutos', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-u19-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const agora = Date.now();
  fs.writeFileSync(path.join(tmp, 'update-estado.json'), JSON.stringify({
    estado: 'a-instalar',
    de: '1.20.0',
    para: '1.21.0',
    ficheiros_escritos: 7,
    total: 41,
    iniciado_em: new Date(agora - (5 * 60 * 1000) - 1).toISOString(),
    terminado_em: null,
    erro: null,
    backup: null,
  }));
  const estado = up.estadoDaInstalacao({ mooterDir: tmp, agora });
  assert.strictEqual(estado.stale, true);
  assert.match(estado.aviso, /ficou a meio/);
});

test('U20 — o aplicar síncrono continua a instalar como antes', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-u20-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const instalacao = prepararInstalacao(tmp, '1.20.0');
  const updateCopy = path.join(instalacao.installDir, 'update.js');
  fs.copyFileSync(path.join(__dirname, 'update.js'), updateCopy);
  const bundle = path.join(tmp, 'sync.mcpb');
  escreverBundle(bundle, '1.21.0', { 'novo.js': 'module.exports = 21;\n' });
  const antes = process.env.MOOTER_HOME;
  process.env.MOOTER_HOME = instalacao.mooterDir;
  try {
    const localUp = require(updateCopy);
    const resposta = localUp.aplicar({ ficheiro: bundle });
    assert.strictEqual(typeof resposta.then, 'undefined', 'o caminho antigo deixou de ser síncrono');
    assert.strictEqual(resposta.ok, true);
    assert.strictEqual(resposta.ficheiros, 2);
    assert.ok(fs.existsSync(path.join(instalacao.installDir, 'novo.js')));
  } finally {
    delete require.cache[require.resolve(updateCopy)];
    if (antes == null) delete process.env.MOOTER_HOME; else process.env.MOOTER_HOME = antes;
  }
});

test('U21 — mooter_setup aplica em background e ver inclui o recibo', async () => {
  const tools6 = require('./tools6.js');
  const originais = {
    aplicarAsync: up.aplicarAsync,
    procurarAsync: up.procurarAsync,
    estadoDaInstalacao: up.estadoDaInstalacao,
  };
  up.aplicarAsync = async () => ({
    estado: 'a-instalar', de: '1.20.0', para: '1.21.0', bundle: 'x.mcpb', iniciado_em: 'agora',
  });
  up.procurarAsync = async () => ({
    versao_instalada: '1.20.0', nova: { versao: '1.21.0' }, encontrados: [], procurei_em: [], resumo: 'há nova',
    github: { ok: false, erro: 'não tentei', achados: 0 },
  });
  up.estadoDaInstalacao = () => ({ estado: 'a-instalar', stale: false });
  try {
    const setup = tools6.build({}, {}, {}).find((tool) => tool.name === 'mooter_setup');
    const aplicar = await setup.handler({ atualizar: 'aplicar' });
    assert.match(aplicar.resumo, /a instalar em segundo plano/);
    assert.match(aplicar.resumo, /atualizar:'ver'/);
    const ver = await setup.handler({ atualizar: 'ver' });
    assert.strictEqual(ver.instalacao.estado, 'a-instalar');
    assert.strictEqual(ver.github.ok, false, 'o mock de procurarAsync não chegou ao mooter_setup');
  } finally {
    Object.assign(up, originais);
  }
});

/**
 * ⚠️ BUG DE TIJOLO apanhado a 2026-07-27: o verificador rejeitava o shebang
 * `#!/usr/bin/env node`, que os NOSSOS ficheiros reais têm (server.js,
 * server-apps.js, fleet.js). Consequência: a versão instalada recusaria todos os
 * bundles seguintes, incluindo o que a corrigisse.
 *
 * Os 21 testes anteriores passaram porque usavam ficheiros sintéticos sem
 * shebang. Este lê um ficheiro REAL do pacote — um teste que não usa o formato
 * real não testa o caso real.
 */
test('U22 — o verificador aceita o shebang que os nossos proprios ficheiros tem', () => {
  const fsx = require('fs');
  const pathx = require('path');
  const reais = ['fleet.js', 'server.js', 'server-apps.js'];
  let comShebang = 0;
  const zip = [{ nome: 'manifest.json', dados: Buffer.from(JSON.stringify({ version: '9.9.9' })) }];
  for (const nome of reais) {
    const p = pathx.join(__dirname, nome);
    let src;
    try { src = fsx.readFileSync(p, 'utf8'); } catch { continue; }
    if (/^#!/.test(src)) comShebang++;
    zip.push({ nome: 'server/' + nome, dados: Buffer.from(src, 'utf8') });
  }
  assert.ok(comShebang > 0, 'nenhum ficheiro real tem shebang — o teste deixou de cobrir o caso');
  const problemas = up.verificar(zip).filter((p) => /sintaxe/i.test(p));
  assert.deepStrictEqual(problemas, [],
    'o verificador recusou ficheiros REAIS do pacote: ' + problemas.join(' | '));
});

// ── F0 item 5 — GitHub Releases API ─────────────────────────────────────────
// `fetchImpl` é injectado sempre: os testes deste pacote nunca tocam na rede.

function respostaFetch(status, corpo) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  });
}

test('U23 — releasesGitHub lê os assets .mcpb de cada release', async () => {
  const fetchImpl = respostaFetch(200, [
    {
      tag_name: 'v1.27.0', published_at: '2026-07-28T00:00:00Z',
      assets: [
        { name: 'mooter-v1270.mcpb', browser_download_url: 'https://example.test/mooter-v1270.mcpb', size: 12345 },
        { name: 'checksums.txt', browser_download_url: 'https://example.test/checksums.txt', size: 40 },
      ],
    },
    { tag_name: 'v1.26.0', published_at: '2026-07-20T00:00:00Z', assets: [] },
  ]);
  const r = await up.releasesGitHub({ fetchImpl });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.achados.length, 1, 'devia ignorar o asset que não é .mcpb');
  assert.strictEqual(r.achados[0].versao, '1.27.0');
  assert.strictEqual(r.achados[0].download_url, 'https://example.test/mooter-v1270.mcpb');
});

test('U24 — releasesGitHub nunca lança: rede indisponível vira ok:false com motivo', async () => {
  const fetchImpl = async () => { throw new Error('ENOTFOUND api.github.com'); };
  const r = await up.releasesGitHub({ fetchImpl });
  assert.strictEqual(r.ok, false);
  assert.match(r.erro, /ENOTFOUND/);
  assert.deepStrictEqual(r.achados, []);
});

test('U25 — releasesGitHub trata resposta HTTP não-ok como falha honesta, não como "sem novidades"', async () => {
  const fetchImpl = respostaFetch(403, { message: 'rate limited' });
  const r = await up.releasesGitHub({ fetchImpl });
  assert.strictEqual(r.ok, false);
  assert.match(r.erro, /403/);
});

// ⚠️ procurar() le SEMPRE a versão instalada REAL (pastaInstalada() é sempre
// o __dirname deste ficheiro — U20 já documenta que só copiando update.js
// para outro sítio é que isso muda). As versões sintéticas abaixo usam a
// convenção "9.x" já usada em B6/U7 para nunca colidirem com a versão real.

test('U26 — procurarAsync junta locais e GitHub e escolhe a versão mais alta das duas fontes', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-u26-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  escreverBundle(path.join(tmp, 'local.mcpb'), '9.21.0', { 'a.js': 'module.exports=1;\n' });
  const fetchImpl = respostaFetch(200, [
    { tag_name: 'v9.30.0', published_at: 'x', assets: [{ name: 'mooter-v9300.mcpb', browser_download_url: 'https://example.test/v9300.mcpb', size: 1 }] },
  ]);
  const r = await up.procurarAsync({ pasta: tmp, fetchImpl });
  assert.strictEqual(r.github.ok, true);
  assert.strictEqual(r.github.achados, 1);
  assert.ok(r.nova, 'não encontrou nenhuma versão nova');
  assert.strictEqual(r.nova.versao, '9.30.0', 'devia preferir a versão mais alta entre local (9.21.0) e GitHub (9.30.0)');
  assert.strictEqual(r.nova.origem, 'github');
  assert.strictEqual(r.nova.ficheiro, null, 'um achado só-remoto não pode fingir ter um caminho local instalável');
  // ⚠️ outras pastas ambientes (~/frugal/_handoff, Downloads) também entram na
  // busca — não se assume que o nosso é o ÚNICO achado local, só que sobrevive.
  const nosso = r.encontrados.find((x) => x.origem === 'local' && x.versao === '9.21.0');
  assert.ok(nosso, 'perdeu o achado local ao juntar com o GitHub: ' + JSON.stringify(r.encontrados));
});

test('U27 — procurarAsync degrada-se para local-only quando o GitHub falha', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-u27-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  escreverBundle(path.join(tmp, 'local.mcpb'), '9.21.0', { 'a.js': 'module.exports=1;\n' });
  const fetchImpl = async () => { throw new Error('sem rede'); };
  const r = await up.procurarAsync({ pasta: tmp, fetchImpl });
  assert.strictEqual(r.github.ok, false);
  assert.strictEqual(r.nova.versao, '9.21.0', 'devia continuar a mostrar o achado local mesmo sem GitHub');
  assert.strictEqual(r.nova.origem, 'local');
});

test('U28 — o painel (probe.js) usa procurarAsync, não só a busca local', () => {
  const probe = require('./probe.js');
  const src = fs.readFileSync(path.join(__dirname, 'probe.js'), 'utf8');
  const bloco = src.slice(src.indexOf("name: 'mooter_ui_update'"), src.indexOf("name: 'mooter_ui_update'") + 800);
  assert.match(bloco, /procurarAsync/, 'o botão "procurar" do painel ficou preso à busca só-local');
  assert.ok(typeof probe.TOOL_UPDATE.handler === 'function');
});
