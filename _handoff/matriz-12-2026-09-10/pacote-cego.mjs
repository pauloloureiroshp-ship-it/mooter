#!/usr/bin/env node
// @ts-check
/**
 * pacote-cego.mjs — a folha do J3 (o Paulo), e a chave selada.
 *
 *   node _handoff/matriz-12-2026-09-10/pacote-cego.mjs
 *
 * Escreve dois ficheiros:
 *   PACOTE-CEGO.md  — os 12 pedidos e as respostas com rotulo cego, mais a
 *                     grelha para preencher. Nao diz que motor escreveu o que,
 *                     nem quanto custou, nem quanto demorou. Nada de custo:
 *                     quem ve o preco deixa de pontuar a resposta.
 *   CHAVE-SELADA.json — rotulo -> braco, com o sha do PACOTE-CEGO dentro. So se
 *                     abre depois de o J3 entregar a folha preenchida; o sha
 *                     prova que a folha julgada e esta e nao outra.
 *
 * A mesma ordem que os juizes automaticos viram (mesmo sorteio, mesma semente).
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { baralhar } from './lib/cego.mjs';
import { CRITERIOS } from './lib/rubrica.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(AQUI, 'results');

const prereg = JSON.parse(fs.readFileSync(path.join(AQUI, 'protocol.json'), 'utf8'));
const prompts = JSON.parse(fs.readFileSync(path.join(AQUI, 'prompts.json'), 'utf8')).prompts;
const SEMENTE = prereg.semente_do_sorteio;

const md = [];
md.push('# PACOTE CEGO — MATRIZ 12 · folha do J3');
md.push('');
md.push('Nao ha nomes de modelo, custos nem tempos nesta folha: sao exactamente as');
md.push('coisas que fazem uma pessoa pontuar a tese em vez da resposta.');
md.push('');
md.push('Para cada pedido, da **0, 1 ou 2** a cada resposta em cada criterio:');
md.push('');
for (const c of CRITERIOS) md.push(`- **${c.chave}** — ${c.pergunta}  \n  ${c.escala}`);
md.push('');
md.push('Nos pedidos marcados **[RISCO]**, o criterio RISCO conta a dobrar.');
md.push('');
md.push('---');
md.push('');

const chaveGlobal = {};
for (const p of prompts) {
  const f = path.join(RESULTS, `${p.id}.json`);
  if (!fs.existsSync(f)) continue;
  const res = JSON.parse(fs.readFileSync(f, 'utf8'));
  const comTexto = Object.entries(res.bracos)
    .filter(([, v]) => v && typeof v.texto === 'string' && v.texto.trim().length > 0)
    .map(([k]) => k);
  if (comTexto.length < 2) continue;
  const { rotulos, chave } = baralhar(comTexto, SEMENTE, p.id);
  chaveGlobal[p.id] = chave;

  md.push(`## ${p.id}${p.risco ? ' **[RISCO]**' : ''}`);
  md.push('');
  md.push('**Pedido:**');
  md.push('');
  md.push('> ' + p.texto.split('\n').join('\n> '));
  md.push('');
  for (const r of Object.keys(chave).sort()) {
    md.push(`### ${p.id} · ${r}`);
    md.push('');
    md.push('```text');
    md.push(res.bracos[chave[r]].texto.trimEnd());
    md.push('```');
    md.push('');
  }
  md.push('| resposta | ' + CRITERIOS.map((c) => c.chave).join(' | ') + ' |');
  md.push('|---|' + CRITERIOS.map(() => '---').join('|') + '|');
  for (const r of Object.keys(chave).sort()) md.push(`| ${r} | ` + CRITERIOS.map(() => ' ').join(' | ') + ' |');
  md.push('');
  md.push('---');
  md.push('');
}

const destMd = path.join(AQUI, 'PACOTE-CEGO.md');
fs.writeFileSync(destMd, md.join('\n'));
const shaMd = crypto.createHash('sha256').update(fs.readFileSync(destMd)).digest('hex');
fs.writeFileSync(path.join(AQUI, 'CHAVE-SELADA.json'), JSON.stringify({
  aviso: 'NAO ABRIR antes de o J3 entregar a folha preenchida.',
  semente_do_sorteio: SEMENTE,
  pacote_cego_sha256: shaMd,
  selada_em: new Date().toISOString(),
  chave: chaveGlobal,
}, null, 1) + '\n');
console.log(`${destMd}\nsha256: ${shaMd}\nchave selada em CHAVE-SELADA.json`);
