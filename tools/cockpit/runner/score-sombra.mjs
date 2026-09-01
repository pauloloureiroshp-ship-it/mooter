#!/usr/bin/env node
/**
 * score-sombra.mjs — o score existe, e NAO decide nada. Por desenho (M3).
 *
 * A ideia e simples e o risco tambem: pedir ao modelo que classifique a
 * confianca do proprio achado (1-10) e, com isso, filtrar os fracos. A segunda
 * metade e que e perigosa — um limiar escolhido antes de haver dados e um
 * numero inventado com aparencia de rigor, e a coisa que ele filtra primeiro e
 * a evidencia de que estava errado.
 *
 * Por isso: MODO SOMBRA. O campo viaja no recibo, acumula, e nao tem poder
 * nenhum. O limiar e `n/d` ate existirem >=20 keeps ASSINADOS PELO DONO sobre
 * achados produzidos pelo instrumento novo. Antes disso nao ha populacao para
 * calibrar contra — e calibrar contra a populacao antiga seria afinar o
 * instrumento novo pela regua do que ele veio substituir.
 *
 * DUAS coisas que este ficheiro NAO faz, e as duas sao guardadas por testes:
 *
 *  1. Nao filtra. `podeFiltrar()` devolve SEMPRE false enquanto o limiar for
 *     n/d, e nao ha caminho de codigo que salte a funcao.
 *  2. Nao inventa o score. Se o modelo nao o escreveu, o campo e `null` — nunca
 *     um valor calculado por nos com o nome de "auto-refletido". Um score
 *     derivado por heuristica NAO e o modelo a reflectir sobre si; chamar-lhe
 *     isso seria medir uma coisa e rotular outra.
 *
 * ⚠️ POR ISSO O CAMPO NASCE `null` EM TODAS AS RONDAS, e isso esta certo.
 * Para o modelo o escrever, o prompt tem de o pedir — e este repositorio TEM
 * medicao de que alongar o prompt colapsa a deteccao: «a first live pass with a
 * softer prompt made qwen2.5-coder:14b answer SEM ACHADO on every round»
 * (context-pack.mjs, SYSTEM_PROMPT). Por isso o pedido existe atras de
 * `MOO_SCORE_PROMPT=1`, DESLIGADO por omissao: liga-lo e uma mudanca do
 * instrumento e tem de ser medida contra `baseline-2026-09-01.json`, nao
 * assumida.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

/** Quantos keeps assinados pelo dono, sobre o instrumento NOVO, para calibrar. */
export const MIN_KEEPS_PARA_LIMIAR = 20;

/** O instrumento novo comeca aqui. Antes disto e outra populacao. */
export const DESDE = '2026-09-01T00:00:00Z';

/** `SCORE: 7` / `CONFIANCA: 7` / `CONFIDENCE: 7/10`, em qualquer sitio da resposta. */
const SCORE_RE = /\b(?:SCORE|CONFIAN[CÇ]A|CONFIDENCE)\s*[:=]\s*(\d{1,2})(?:\s*\/\s*10)?/i;

/**
 * O score que o MODELO escreveu. `null` quando ele nao escreveu nenhum — que
 * e o caso normal enquanto o prompt nao o pedir.
 */
export function extrairScore(texto) {
  const m = SCORE_RE.exec(String(texto || ''));
  if (!m) return null;
  const n = Number(m[1]);
  // Fora de 1-10 nao se aparava para dentro: um 47 nao e um 10, e aparar
  // fabricaria um valor plausivel a partir de um valor sem sentido.
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

/** O que viaja no recibo. Sempre os dois campos, para o painel saber distinguir. */
export function campoDeScore(texto) {
  const score = extrairScore(texto);
  return score == null
    ? { score: null, score_fonte: null }
    : { score, score_fonte: 'auto-refletido' };
}

/**
 * Quantos keeps assinados PELO DONO existem sobre o instrumento novo.
 * `por: 'dono'` e obrigatorio: um keep assinado por um agente nao calibra
 * nada, porque quem se quer imitar e o dono.
 */
export function keepsAssinados(decisoes, { desde = DESDE } = {}) {
  const t0 = Date.parse(desde);
  return (decisoes || []).filter((d) => d
    && d.por === 'dono'
    && (d.decisao === 'aceite' || d.decisao === 'issue')
    && Date.parse(String(d.ts || '')) >= t0).length;
}

/**
 * O limiar. `null` = n/d, e n/d nao e zero: zero deixaria passar tudo com ar
 * de decisao tomada.
 */
export function limiar(decisoes, { desde = DESDE, minimo = MIN_KEEPS_PARA_LIMIAR } = {}) {
  const n = keepsAssinados(decisoes, { desde });
  return {
    valor: null,
    keeps: n,
    faltam: Math.max(0, minimo - n),
    porque: n >= minimo
      ? `ha ${n} keeps assinados desde ${desde.slice(0, 10)} — ja da para CALIBRAR um limiar, `
        + 'mas escolher o numero e uma decisao do dono, nao deste ficheiro'
      : `n/d — ${n} de ${minimo} keeps assinados pelo dono desde ${desde.slice(0, 10)}`,
  };
}

/**
 * A porta. Devolve sempre `false` enquanto o limiar for n/d — e ele e n/d
 * sempre, porque `limiar().valor` e literalmente `null` neste ficheiro. Quem
 * quiser filtrar tem de MUDAR ISTO e explicar porque, que e o ponto.
 */
export function podeFiltrar(estado = null) {
  const l = estado || { valor: null, porque: 'sem estado' };
  return {
    filtra: false,
    porque: l.valor == null
      ? `nao — o limiar e n/d (${l.porque})`
      : 'nao — o modo sombra nao filtra, mesmo com limiar; ligar a filtragem e uma decisao do dono',
  };
}

/** O pedido a acrescentar ao prompt. DESLIGADO por omissao — ver o cabecalho. */
export function pedidoDeScore({ env = process.env } = {}) {
  if (env.MOO_SCORE_PROMPT !== '1') return null;
  return 'No fim, acrescenta uma linha `SCORE: <1-10>` com a tua confianca neste achado.';
}

function main() {
  const p = path.join(process.env.HOME || os.homedir(), '.mooter', 'triagem.jsonl');
  let decisoes = [];
  try {
    decisoes = fs.readFileSync(p, 'utf8').trim().split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { /* sem triagem, keeps = 0 */ }
  const l = limiar(decisoes);
  process.stdout.write(
    `score em modo sombra\n  limiar: ${l.valor == null ? 'n/d' : l.valor}\n  ${l.porque}\n` +
    `  filtra? ${podeFiltrar(l).porque}\n` +
    `  pedido no prompt: ${pedidoDeScore() ? 'LIGADO (MOO_SCORE_PROMPT=1)' : 'desligado'}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
