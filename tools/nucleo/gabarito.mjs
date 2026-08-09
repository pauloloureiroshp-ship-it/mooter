/**
 * gabarito.mjs — implementacoes de referencia do padrao afericao.
 *
 * A propriedade que interessa (a mesma de packages/mooter-bridge/afericao.test.js:14):
 * o gabarito nao e uma opiniao escrita a mao, e re-derivavel. Cada tarefa declara
 * de onde a sua resposta vem — de uma funcao pura aqui, ou de uma linha viva do
 * repo — e o gabarito.test.mjs re-deriva TODAS e compara. Se o repo mudar, ou se
 * uma verificacao deixar de aceitar a propria resposta de referencia, o teste fica
 * vermelho. Um gabarito que apodrece em silencio nao existe.
 */

import fs from 'node:fs';

export function portaDeLog(linha) {
  const m = /:(\d+)\b/.exec(String(linha));
  return m ? m[1] : null;
}

export function paraSnake(ident) {
  return String(ident).replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

export function paraKebabMinusculas(nome) {
  return String(nome).toLowerCase().replace(/_/g, '-');
}

export function inverteLista(lista) {
  return String(lista).split(',').map((s) => s.trim()).filter(Boolean).reverse().join(', ');
}

export function listaParaArray(lista) {
  return String(lista).split(',').map((s) => s.trim()).filter(Boolean);
}

export function renomeiaUsr(codigo) {
  return String(codigo).replace(/\busr\b/g, 'currentUser');
}

export function entradasValidas({ total, expiradas }) {
  return total - expiradas;
}

export function chamadasTotais({ primeira, retentativas }) {
  return primeira + retentativas;
}

export function contaDistintos(lista) {
  return new Set(String(lista).split(',').map((s) => s.trim()).filter(Boolean)).size;
}

export function paresParaLinhas(pares) {
  const linhas = String(pares).split(',').map((p) => p.trim().split('=').map((s) => s.trim()));
  const corpo = linhas.map(([k, v]) => `| ${k} | ${v} |`).join('\n');
  return `| k | v |\n| --- | --- |\n${corpo}`;
}

export function expressaoDistintos(arr) {
  return `new Set(${arr}).size`;
}

const FUNCOES = {
  portaDeLog, paraSnake, paraKebabMinusculas, inverteLista, listaParaArray,
  renomeiaUsr, entradasValidas, chamadasTotais, contaDistintos, paresParaLinhas,
  expressaoDistintos,
};

/**
 * Devolve a resposta de referencia de uma tarefa, seja qual for a origem
 * declarada. `raiz` e a raiz do repo, usada pelas fontes do tipo "ficheiro".
 */
export function derivarGabarito(tarefa, raiz) {
  const f = tarefa.gabarito_fonte;
  if (!f) throw new Error(`${tarefa.id}: sem gabarito_fonte`);

  if (f.tipo === 'computado') {
    const fn = FUNCOES[f.fn];
    if (!fn) throw new Error(`${tarefa.id}: funcao de referencia desconhecida: ${f.fn}`);
    return { valor: fn(f.entrada), origem: `gabarito.mjs:${f.fn}` };
  }

  if (f.tipo === 'ficheiro') {
    const caminho = `${raiz}/${f.caminho}`;
    const texto = fs.readFileSync(caminho, 'utf8');
    const re = new RegExp(f.padrao, 'm');
    const m = re.exec(texto);
    if (!m) throw new Error(`${tarefa.id}: /${f.padrao}/ nao casa em ${f.caminho} — o gabarito apodreceu`);
    return { valor: m[1] ?? m[0], origem: `${f.caminho} · /${f.padrao}/`, linha: m[0] };
  }

  throw new Error(`${tarefa.id}: gabarito_fonte.tipo desconhecido: ${f.tipo}`);
}

export { FUNCOES };
