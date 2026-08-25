'use strict';
/**
 * portas-do-projecto.js — perguntar ao projecto em que porta ele corre.
 *
 * O DEFEITO QUE ISTO FECHA, medido em 2026-08-04:
 *
 * A lista de portas do `preview.js` são as 14 mais prováveis da indústria.
 * O `landing` deste repo corre em **7819** (`next dev -H 127.0.0.1 -p 7819`) e
 * o `dashboard` em **7820**. Nenhuma das duas está na lista. Ou seja: o Paulo
 * podia arrancar a app dele e o Live Preview **nunca a encontrava** — sondava
 * 14 portas alheias e concluía "não tens nada a correr".
 *
 * ⚠️ E o modo de falha é o pior possível: se por acaso houvesse um servidor de
 * OUTRA pasta numa das 14, esse era encontrado e o dela não. O painel mostrava
 * a app errada com toda a confiança, por a certa estar fora do alcance.
 * (Furo nº3 do kimi-k3: *"app da sessão fora da lista"*.)
 *
 * A SAÍDA É NÃO ADIVINHAR: o projecto já declara as suas portas, nos `scripts`
 * do `package.json`. Ler ali é medição com fonte — e por isso cada porta volta
 * acompanhada do ficheiro e do script onde foi encontrada, para o painel poder
 * dizer *"7819, declarada em landing/package.json → dev"* em vez de a fazer
 * aparecer do nada.
 *
 * É a mesma doutrina do resto do produto aplicada a um sítio onde faltava:
 * exigir que o utilizador saiba a porta do próprio dev server é exigir
 * conhecimento a quem comprou isto precisamente para não ter de o ter.
 */

const fs = require('fs');
const path = require('path');

/** Quantos níveis abaixo da raiz do projecto vale a pena procurar. */
const PROFUNDIDADE = 2;
const IGNORAR = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', '.next', '.vercel',
  'coverage', '.venv-lora', '.tmp', 'logs', '_handoff', '_to_delete',
]);

/**
 * As formas em que um script declara uma porta. Deliberadamente conservador:
 * um falso positivo aqui faz o painel sondar uma porta que não existe (barato),
 * mas um padrão demasiado solto apanharia números que não são portas nenhumas
 * — e uma lista poluída torna a sondagem lenta sem ganhar nada.
 */
const PADROES = [
  { re: /(?:^|\s)-p[ =](\d{2,5})(?=\s|$)/g, como: '-p' },
  { re: /(?:^|\s)--port[ =](\d{2,5})(?=\s|$)/g, como: '--port' },
  { re: /(?:^|\s)-l[ =](\d{2,5})(?=\s|$)/g, como: '-l' },
  { re: /(?:^|\s)PORT=(\d{2,5})(?=\s|$)/g, como: 'PORT=' },
];

/** Só scripts que arrancam alguma coisa. `build` e `test` não servem nada. */
const SCRIPTS_DE_SERVIR = /^(dev|start|serve|preview|dev:.*|start:.*)$/i;

function portasDeUmScript(nome, comando) {
  const achadas = [];
  for (const p of PADROES) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(String(comando || ''))) !== null) {
      const porta = Number(m[1]);
      if (porta > 0 && porta < 65536) achadas.push({ porta, como: p.como, script: nome });
    }
  }
  return achadas;
}

function lerPackage(ficheiro) {
  try { return JSON.parse(fs.readFileSync(ficheiro, 'utf8')); } catch { return null; }
}

function subpastas(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !IGNORAR.has(e.name) && !e.name.startsWith('.'))
      .map((e) => e.name);
  } catch { return null; }
}

/**
 * As portas que ESTE projecto declara, com a proveniência de cada uma.
 *
 * @param {string} raiz  a pasta da sessão
 * @param {object} opts  { profundidade, fsImpl }
 * @returns {{portas:number[], detalhe:Array, procurado:number, porque:string|null}}
 */
function portasDoProjecto(raiz, opts) {
  const o = opts || {};
  if (!raiz) return { portas: [], detalhe: [], procurado: 0, porque: 'não há pasta de sessão onde procurar' };
  const limite = Number.isInteger(o.profundidade) ? o.profundidade : PROFUNDIDADE;

  const porVer = [{ dir: String(raiz), nivel: 0 }];
  const detalhe = [];
  let procurado = 0;

  while (porVer.length) {
    const { dir, nivel } = porVer.shift();
    const pkg = path.join(dir, 'package.json');
    if (fs.existsSync(pkg)) {
      procurado++;
      const dados = lerPackage(pkg);
      const scripts = (dados && dados.scripts && typeof dados.scripts === 'object') ? dados.scripts : {};
      for (const [nome, comando] of Object.entries(scripts)) {
        if (!SCRIPTS_DE_SERVIR.test(nome)) continue;
        for (const achada of portasDeUmScript(nome, comando)) {
          detalhe.push({
            porta: achada.porta,
            // ⚠️ caminho relativo à raiz: é o que o utilizador reconhece.
            onde: path.relative(String(raiz), pkg).replace(/\\/g, '/') || 'package.json',
            script: achada.script,
            como: achada.como,
          });
        }
      }
    }
    if (nivel < limite) {
      const nomes = subpastas(dir);
      if (nomes === null) {
        // Uma pasta ilegível e uma pasta sem subpastas acabavam ambas como
        // `procurado: 0`. A travessia ficou incompleta: não se contam portas
        // parciais como se todo o projecto tivesse sido medido.
        return {
          portas: [], detalhe: [], procurado: null,
          porque: 'n/d — não consegui listar ' + dir + '; a procura de portas ficou incompleta',
        };
      }
      for (const nome of nomes) porVer.push({ dir: path.join(dir, nome), nivel: nivel + 1 });
    }
  }

  // primeira ocorrência ganha; a ordem é a da travessia, que começa na raiz
  const vistas = new Set();
  const portas = [];
  for (const d of detalhe) {
    if (vistas.has(d.porta)) continue;
    vistas.add(d.porta);
    portas.push(d.porta);
  }

  return {
    portas,
    detalhe,
    procurado,
    // ⚠️ zero portas não é a mesma coisa que zero package.json. Distinguir, porque
    // a acção que se segue é diferente: um pede a porta ao utilizador, o outro
    // diz-lhe que este sítio não parece um projecto de front-end.
    porque: portas.length ? null
      : (procurado ? 'li ' + procurado + ' package.json e nenhum script de arranque declara uma porta'
                   : 'não encontrei nenhum package.json até ' + limite + ' níveis abaixo da pasta da sessão'),
  };
}

module.exports = { portasDoProjecto, portasDeUmScript, PADROES, SCRIPTS_DE_SERVIR, PROFUNDIDADE, IGNORAR };
