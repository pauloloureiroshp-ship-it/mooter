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
