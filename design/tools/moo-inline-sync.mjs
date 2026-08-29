#!/usr/bin/env node
/**
 * moo-inline-sync — as superfícies que INLINE-am o CSS gerado deixam de o copiar
 * à mão e passam a recebê-lo escrito.
 *
 * PORQUÊ ISTO EXISTE
 * ------------------
 * `tools/cockpit/moo-pilot-shell.html` e `plugin/mooter/skills/cockpit/cockpit.html`
 * são servidos por HTTP e empacotados; nenhum dos dois pode `@import` um ficheiro
 * do disco. A única forma de lerem do gerado é trazê-lo para dentro. Fizeram-no
 * — por cópia manual, com um comentário a dizer "cópia verbatim".
 *
 * Nesse mesmo dia, 2026-08-27, a cópia já estava errada. `papel.faint` foi
 * corrigido de `#9A8F7E` (2,70:1) para `#726859` no token, e as cópias ficaram
 * com o valor velho. O auditor visual apanhou-o pelo sítio mais irónico
 * possível: **o cartucho que anuncia a folha**, `MOOTER · COCKPIT · DES. 011`,
 * a 2,70:1 — o texto que identifica o desenho, ilegível.
 *
 * É exactamente o defeito que o `design/README.md` diz que este pacote existe
 * para tornar impossível: *«o cockpit.html esteve 20 dias atrás do
 * moo-pilot-shell precisamente por ser cópia»*. Uma cópia com um comentário a
 * dizer que é cópia continua a ser uma cópia.
 *
 * Agora o bloco vive entre marcas e é ESCRITO. Fora das marcas, o ficheiro é de
 * quem o mantém; dentro, é do gerador.
 *
 *   node design/tools/moo-inline-sync.mjs           # escreve
 *   node design/tools/moo-inline-sync.mjs --check   # sai 1 se alguma está velha
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from './moo-tokens-build.mjs';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESIGN = resolve(AQUI, '..');
const REPO = process.env.MOO_REPO ? resolve(process.env.MOO_REPO) : resolve(DESIGN, '..');

export const INICIO = '/* MOO:TOKENS:INICIO — GERADO por design/tools/moo-inline-sync.mjs. NÃO EDITAR. */';
export const FIM = '/* MOO:TOKENS:FIM */';

/** As superfícies que não podem importar e por isso recebem o bloco inline. */
export const ALVOS = [
  'tools/cockpit/moo-pilot-shell.html',
  'plugin/mooter/skills/cockpit/cockpit.html',
];

/**
 * Só o `:root` do CSS gerado. Os primitivos (`.moo-cartucho`, `.moo-secao`…)
 * ficam de fora de propósito: cada cockpit já tem o seu layout, e injectar
 * regras de classe numa folha alheia é como se ganham colisões silenciosas.
 * O que estas superfícies precisam do design system são os VALORES.
 */
export function blocoDeTokens(css = build().css) {
  const i = css.indexOf(':root {');
  const j = css.indexOf('\n}', i);
  if (i === -1 || j === -1) throw new Error('moo-ui.css sem bloco :root — o gerador mudou de forma');
  return css.slice(i, j + 2);
}

/** Devolve o texto novo, ou `null` se o ficheiro não tiver as marcas. */
export function aplicar(texto, bloco) {
  const a = texto.indexOf(INICIO);
  const b = texto.indexOf(FIM);
  if (a === -1 || b === -1) return null;
  const novo = `${INICIO}\n${bloco}\n${FIM}`;
  const actual = texto.slice(a, b + FIM.length);
  return actual === novo ? texto : texto.slice(0, a) + novo + texto.slice(b + FIM.length);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const bloco = blocoDeTokens();
  const check = process.argv.includes('--check');
  const velhas = [], sincronizadas = [], semMarcas = [];

  for (const rel of ALVOS) {
    const abs = join(REPO, rel);
    let texto; try { texto = readFileSync(abs, 'utf8'); } catch { semMarcas.push(`${rel} (ausente)`); continue; }
    const novo = aplicar(texto, bloco);
    if (novo === null) { semMarcas.push(rel); continue; }
    if (novo === texto) { sincronizadas.push(rel); continue; }
    velhas.push(rel);
    if (!check) writeFileSync(abs, novo);
  }

  if (semMarcas.length) {
    console.error(`\n  ❌ sem as marcas MOO:TOKENS — o bloco não pode ser escrito:\n     ${semMarcas.join('\n     ')}\n`);
  }
  if (velhas.length) {
    console.log(`  ${check ? '❌ DESACTUALIZADA' : '✅ reescrita'}: ${velhas.join(', ')}`);
  }
  if (sincronizadas.length) console.log(`  ✅ já em dia: ${sincronizadas.join(', ')}`);
  console.log('');

  if (check && (velhas.length || semMarcas.length)) process.exit(1);
  if (!check && semMarcas.length) process.exit(1);
}
