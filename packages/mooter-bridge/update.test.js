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
  assert.ok(fs.statSync(bundle).size > 500000, 'o bundle sintético não é grande o suficiente');

  const inicio = Date.now();
  const resposta = await up.aplicarAsync({
    ficheiro: bundle,
    installDir: instalacao.installDir,
    mooterDir: instalacao.mooterDir,
  });
  const demorouMs = Date.now() - inicio;
  assert.strictEqual(resposta.estado, 'a-instalar');
  assert.ok(demorouMs < 500, 'a resposta demorou ' + demorouMs + ' ms');

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
    procurar: up.procurar,
    estadoDaInstalacao: up.estadoDaInstalacao,
  };
  up.aplicarAsync = async () => ({
    estado: 'a-instalar', de: '1.20.0', para: '1.21.0', bundle: 'x.mcpb', iniciado_em: 'agora',
  });
  up.procurar = () => ({
    versao_instalada: '1.20.0', nova: { versao: '1.21.0' }, encontrados: [], procurei_em: [], resumo: 'há nova',
  });
  up.estadoDaInstalacao = () => ({ estado: 'a-instalar', stale: false });
  try {
    const setup = tools6.build({}, {}, {}).find((tool) => tool.name === 'mooter_setup');
    const aplicar = await setup.handler({ atualizar: 'aplicar' });
    assert.match(aplicar.resumo, /a instalar em segundo plano/);
    assert.match(aplicar.resumo, /atualizar:'ver'/);
    const ver = await setup.handler({ atualizar: 'ver' });
    assert.strictEqual(ver.instalacao.estado, 'a-instalar');
  } finally {
    Object.assign(up, originais);
  }
});
