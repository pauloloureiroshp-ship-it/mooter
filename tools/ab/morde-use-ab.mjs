#!/usr/bin/env node
/**
 * morde-use-ab.mjs — a prova de que os testes do controlador do R-24 servem.
 *
 * Uso: node tools/ab/morde-use-ab.mjs   (exit 0 sse TODOS os defeitos forem apanhados)
 *
 * Este repositório já aprendeu quatro vezes, só hoje, que uma guarda sem teste
 * de mordida não é uma guarda: a catraca que contava o repo inteiro, o
 * `no_output` que escondia quatro causas, o detector de quota que lia o eco do
 * prompt, e o `pin-local-timeout.test.js` que afirmava o valor errado e nunca
 * corria.
 *
 * Cada defeito abaixo é uma reescrita mínima do controlador — o tipo de
 * "simplificação" que alguém faria de boa-fé — e nomeia o teste que TEM de o
 * apanhar. Se um defeito passar despercebido, o ficheiro sai com 1 e diz qual.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ALVO = path.join(AQUI, 'mooter-use-ab.mjs');
const SUITE = path.join(AQUI, 'mooter-use-ab.test.mjs');

const DEFEITOS = [
  {
    nome: 'binomial bilateral (o defeito da mcnemar antiga)',
    porque: 'duplicar a cauda menor torna o p cego à direcção: 16-7 e 7-16 dão o mesmo valor',
    de: 'export function caudaSuperior(k, n, p) {',
    para: 'export function caudaSuperior(k, n, p) {\n  { const kk = Math.min(k, n - k); let a = 0; for (let i = kk; i <= n; i++) a += coeficiente(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i); return Math.min(1, 2 * a) / 2; }',
    apanhado_por: 'MORDE: uma derrota de 7-16',
  },
  {
    nome: 'Z sem a conjunção da aceitação',
    porque: 'sem ela, um braço ON que desiste depressa e falha o teste marca sucesso',
    de: "  if (on.aceite !== true) return { z: 0, motivo: 'on_nao_passou' };",
    para: '',
    apanhado_por: 'MORDE: um ON rapidíssimo',
  },
  {
    nome: 'validação que confia no exit code',
    porque: 'medido: uma falha de autenticação devolve is_error:true COM exit 0',
    de: '  if (json.is_error === true) return',
    para: '  if (false) return',
    apanhado_por: 'MORDE: o JSON real de uma falha de autenticação',
  },
  {
    nome: 'sem guarda de ambiente',
    porque: 'correr dentro de uma sessão Claude Code produz 46 corridas vazias que parecem dados',
    de: '  if (presentes.length > 0) {',
    para: '  if (false) {',
    apanhado_por: 'MORDE: recusa correr dentro de uma sessão',
  },
  {
    nome: 'analisar aceita menos de 23 pares',
    porque: 'reduzir o n depois de ver os resultados é a forma mais fácil de comprar uma vitória',
    de: '  if (validos.length !== n) {',
    para: '  if (false) {',
    apanhado_por: 'MORDE: 20 vitórias em 20 pares',
  },
  {
    nome: 'seed com valor por omissão',
    porque: 'um default é uma escolha escondida; o pré-registo exige a seed pública e congelada',
    de: "    throw new Error('atribuicao: seed obrigatória",
    para: "    seed = 0; if (false) throw new Error('atribuicao: seed obrigatória",
    apanhado_por: 'a seed é obrigatória',
  },
  {
    nome: 'par incompleto vale zero (derrota) em vez de null',
    porque: 'o orfao contava como derrota do ON E enchia o denominador: 22 medidos + 1 orfao davam PERDEU onde o honesto era ENSAIO INVALIDO',
    de: "  if (!on || !off) return { z: null, motivo: 'par_incompleto' };",
    para: "  if (!on || !off) return { z: 0, motivo: 'par_incompleto' };",
    apanhado_por: 'MORDE: um par a que falta um braço NÃO mediu — z é null, não zero',
  },
  {
    nome: 'validarCorrida volta a falhar ABERTA',
    porque: 'Number(undefined)===0 e falso: um envelope sem os campos passava como valido e os dois bracos falhavam em silencio',
    de: '  if (!Number.isFinite(dur) || dur <= 0) return',
    para: '  if (dur === 0) return',
    apanhado_por: 'MORDE: validarCorrida falha FECHADA',
  },
  {
    nome: 'analisar sem tecto',
    porque: '25 pares com X=16 davam GANHOU p=0,04657 quando a verdade para 25 e p=0,11476 e o limiar honesto 18',
    de: '  if (validos.length !== n) {',
    para: '  if (validos.length < n) {',
    apanhado_por: 'MORDE: analisar tem TECTO — mais pares do que n é ensaio inválido',
  },
  {
    nome: 'o limiar pre-registado deixa de ser afirmado',
    porque: 'limiar_X existia no JSON e nenhuma linha de codigo o lia; mexer no n baixava a fasquia em silencio',
    de: '  if (limiarEsperado !== null && limiar !== limiarEsperado) {',
    para: '  if (false) {',
    apanhado_por: 'MORDE: o limiar pré-registado é afirmado, não assumido',
  },
  {
    nome: 'volta a assimetria da linha de comando',
    porque: 'era o D1: o OFF perdia a camada user inteira (effort xhigh, 4 plugins, 22 hooks, 31 permissoes), nao so o hook do router',
    de: "  const args = ['-p', prompt, '--output-format', 'json', ...extraArgs];",
    para: "  const args = braco === 'OFF' ? ['-p', prompt, '--output-format', 'json'] : ['-p', prompt, '--output-format', 'json', ...extraArgs];",
    apanhado_por: 'MORDE: os dois braços recebem argumentos IDÊNTICOS',
  },
];

function correrSuite() {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', SUITE], { encoding: 'utf8', cwd: path.join(AQUI, '..', '..') });
  const saida = `${r.stdout}\n${r.stderr}`;
  const falhas = [...saida.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
  return { verde: r.status === 0, falhas, saida };
}

const original = fs.readFileSync(ALVO, 'utf8');
let escapou = 0;

console.log('morde-use-ab · o defeito plantado tem de ser apanhado\n');

const base = correrSuite();
if (!base.verde) {
  console.error('A suite JÁ está vermelha antes de plantar nada. Corrige isso primeiro.');
  console.error(base.falhas.join('\n'));
  process.exit(1);
}
console.log('  linha de base: suite verde\n');

try {
  for (const d of DEFEITOS) {
    if (!original.includes(d.de)) {
      console.log(`  ⚠ ${d.nome}: âncora não encontrada — o defeito NÃO foi plantado, logo não prova nada`);
      escapou++;
      continue;
    }
    fs.writeFileSync(ALVO, original.replace(d.de, d.para), 'utf8');
    const r = correrSuite();
    const apanhado = r.falhas.some((f) => f.includes(d.apanhado_por));
    if (r.verde) {
      console.log(`  ✖ ESCAPOU  ${d.nome}`);
      console.log(`             ${d.porque}`);
      escapou++;
    } else if (!apanhado) {
      console.log(`  ⚠ apanhado pelo teste ERRADO  ${d.nome}`);
      console.log(`             esperava "${d.apanhado_por}", falhou: ${r.falhas.slice(0, 3).join(' · ')}`);
      escapou++;
    } else {
      console.log(`  ✓ apanhado  ${d.nome}`);
      console.log(`             por "${d.apanhado_por}"`);
    }
  }
} finally {
  fs.writeFileSync(ALVO, original, 'utf8');
}

const fim = correrSuite();
console.log(`\n  restaurado: suite ${fim.verde ? 'verde' : 'VERMELHA — o ficheiro não voltou ao original!'}`);
if (!fim.verde) process.exit(1);

console.log(`\n${escapou === 0 ? `TODOS os ${DEFEITOS.length} defeitos foram apanhados.` : `${escapou} defeito(s) escaparam.`}`);
process.exit(escapou === 0 ? 0 : 1);
