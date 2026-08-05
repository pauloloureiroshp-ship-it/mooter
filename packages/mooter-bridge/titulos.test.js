'use strict';
/**
 * ══════════════════════════════════════════════════════════════════════════
 * titulos.test.js — o texto que o Cowork desenha na linha cinzenta.
 *
 * PORQUE ESTE FICHEIRO EXISTE
 * O `annotations.title` é a ÚNICA coisa que a maioria das pessoas vai ler
 * sobre uma tool: aparece na linha cinzenta da conversa, sem descrição e sem
 * schema. Estavam escritos em três línguas e cinco registos («Mooter fleet»,
 * «Pedir trabalho», «Where work can happen», «Mapa de elementos») porque cada
 * onda acrescentou os seus e ninguém tinha uma régua. Uma convenção que
 * ninguém verifica volta a partir-se na primeira pressa — este ficheiro é o
 * mecanismo, não a esperança.
 *
 * AS TRÊS TRAVAS
 *   1. todo o `title` começa por `🐄 Mooter · ` — a marca é a primeira coisa
 *      que se lê, e é assim que uma linha do Mooter se distingue de uma linha
 *      de outro conector qualquer na mesma conversa.
 *   2. nenhum `title` passa de 40 caracteres — medidos em CODE POINTS, porque
 *      `'🐄'.length === 2` em JavaScript e um tecto medido em unidades UTF-16
 *      recusaria títulos que cabem no ecrã.
 *   3. nenhum `title` nem `description` leva acentos (/[À-ÿ]/). O produto é
 *      internacional e o texto que sai por aqui é customer-facing; PT-BR é a
 *      língua da conversa com o dono, não a do produto. Um acento é o sinal
 *      barato e mecânico de que uma frase em PT escapou para fora.
 *
 * ⚠️ Varre TODOS os registos declarados, não só os que o `tools/list` anuncia.
 * As tools antigas continuam chamáveis como aliases e as `mooter_ui_*` vivem
 * atrás do painel: um título morto hoje é um título vivo na onda seguinte.
 * ══════════════════════════════════════════════════════════════════════════
 */

const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

/* O conector escreve em ~/.mooter ao carregar. Uma suite não escreve no $HOME
   de quem a corre — lição de 2026-07-25, a nota que aterrou no vault REAL. */
process.env.MOOTER_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-titulos-'));
process.env.MOOTER_LIB = '1';
process.env.MOOTER_SKIP_INSTALL_ID = '1';

const base = require('./server.js');
const seam = require('./seamless.js');
const fleet = require('./fleet.js');
const probe = require('./probe.js');
const tools6 = require('./tools6.js');
const trilhaTool = require('./trilha-tool.js');

/** Cada tool declarada, e de que ficheiro veio — o erro tem de dizer onde. */
function todas() {
  const out = [];
  const junta = (ficheiro, lista) => {
    for (const t of lista) if (t && t.name) out.push({ ficheiro, tool: t });
  };
  junta('server.js', base.TOOLS);
  junta('seamless.js', seam.TOOLS);
  junta('fleet.js', fleet.TOOLS);
  junta('probe.js', [probe.TOOL, probe.TOOL_DESCOBRIR, probe.TOOL_UPDATE, probe.TOOL_MAPA]);
  junta('tools6.js', tools6.build(seam, fleet, base));
  junta('trilha-tool.js', [trilhaTool.TOOL]);
  return out;
}

const PREFIXO = '🐄 Mooter · ';
const TECTO_CP = 40;
const ACENTO = /[À-ÿ]/;

test('todas as tools declaram um title — nenhuma chega ao Cowork sem nome', () => {
  const lista = todas();
  assert.ok(lista.length >= 20, 'só encontrei ' + lista.length + ' tools — algum registo deixou de ser varrido');
  const sem = lista.filter((x) => !(x.tool.annotations && x.tool.annotations.title));
  assert.deepStrictEqual(sem.map((x) => x.ficheiro + ':' + x.tool.name), [],
    'sem title o host desenha o nome cru da tool');
});

test('todo o title comeca por "🐄 Mooter · "', () => {
  const maus = todas()
    .filter((x) => !String((x.tool.annotations || {}).title || '').startsWith(PREFIXO))
    .map((x) => x.ficheiro + ':' + x.tool.name + ' → ' + JSON.stringify((x.tool.annotations || {}).title));
  assert.deepStrictEqual(maus, [],
    'sem esta trava os títulos voltam a divergir onda a onda:\n  ' + maus.join('\n  '));
});

test('nenhum title passa de 40 caracteres (code points, nao unidades UTF-16)', () => {
  const maus = todas()
    .map((x) => ({ id: x.ficheiro + ':' + x.tool.name, t: String((x.tool.annotations || {}).title || '') }))
    .filter((x) => [...x.t].length > TECTO_CP)
    .map((x) => x.id + ' → ' + [...x.t].length + ' cp: ' + x.t);
  assert.deepStrictEqual(maus, [], 'um título que não cabe na linha cinzenta é cortado pelo host:\n  ' + maus.join('\n  '));
});

test('nenhum title nem description leva acentos — o produto e em ingles', () => {
  /* PT-BR é a língua da conversa com o dono; o que sai pela porta do MCP é
     customer-facing e o produto é internacional. O acento é o detector
     mecânico: apanha a frase em português antes de ela chegar ao cliente.
     ⚠️ Cobre `title` e `description` da tool. As descrições dos PARÂMETROS do
     inputSchema ainda estão em PT e NÃO são varridas por esta trava — é uma
     dívida declarada, não um esquecimento. */
  const maus = [];
  for (const { ficheiro, tool } of todas()) {
    const titulo = String((tool.annotations || {}).title || '');
    const desc = String(tool.description || '');
    if (ACENTO.test(titulo)) maus.push(ficheiro + ':' + tool.name + ' · title: ' + titulo);
    if (ACENTO.test(desc)) {
      maus.push(ficheiro + ':' + tool.name + ' · description: …'
        + desc.slice(Math.max(0, desc.search(ACENTO) - 30), desc.search(ACENTO) + 30) + '…');
    }
  }
  assert.deepStrictEqual(maus, [], 'texto em PT a escapar para o produto:\n  ' + maus.join('\n  '));
});

test('nas SEIS anunciadas, nem os parametros levam acentos', () => {
  /* Estas são as únicas que o `tools/list` mostra ao cliente — e o schema
     viaja com elas em cada conversa. Aqui a trava desce ao parâmetro.
     ⚠️ Os VALORES dos enums ficam de fora de propósito (`registar`,
     `retomar`, `afericao`, `baixo`/`médio`/`alto`): são o contrato da API,
     não texto. Traduzi-los partia toda a automação que já os usa. */
  const seis = tools6.build(seam, fleet, base);
  const maus = [];
  for (const t of seis) {
    for (const [campo, def] of Object.entries((t.inputSchema && t.inputSchema.properties) || {})) {
      if (ACENTO.test(String(def.description || ''))) maus.push(t.name + '.' + campo + ': ' + def.description);
    }
  }
  assert.deepStrictEqual(maus, [], 'PT nos parâmetros das tools anunciadas:\n  ' + maus.join('\n  '));
});

test('a historia do routing le-se de cima para baixo', () => {
  /* Os títulos não são etiquetas soltas: lidos em sequência contam o que o
     produto faz — classificar local, despachar, ver, receber. Esta trava
     protege os quatro verbos que carregam a tese; renomear um deles é uma
     decisão de produto, e uma decisão de produto tem de partir um teste. */
  const porNome = new Map(todas().map((x) => [x.tool.name, String((x.tool.annotations || {}).title || '')]));
  assert.strictEqual(porNome.get('mooter_route'), '🐄 Mooter · classify locally · <50ms · $0',
    'o <50ms · $0 é o número MEDIDO do classificador congelado — é o único título com promessa de velocidade');
  assert.strictEqual(porNome.get('mooter_work'), '🐄 Mooter · route to the right model');
  assert.strictEqual(porNome.get('mooter_check'), '🐄 Mooter · check and collect');
  assert.strictEqual(porNome.get('mooter_fleet'), '🐄 Mooter · fleet and receipts');
});

test('so o classificador promete velocidade — mais nenhum titulo o faz', () => {
  /* Um job ao kimi levou 240 s no dia em que isto foi escrito. «rápido»
     escrito onde não é seria exactamente a fabricação que este produto existe
     para não fazer. A promessa de latência fica onde é medida: o classify. */
  const promete = todas()
    .filter((x) => /\d+\s?ms|\bfast\b|\binstant|\bquick\b|\brapid/i.test(String((x.tool.annotations || {}).title || '')))
    .map((x) => x.tool.name);
  assert.deepStrictEqual([...new Set(promete)], ['mooter_route'],
    'só o classify tem latência medida para publicar: ' + promete.join(', '));
});

process.on('exit', () => {
  try { fs.rmSync(process.env.MOOTER_HOME, { recursive: true, force: true }); } catch { /* */ }
});
