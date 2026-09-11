#!/usr/bin/env node
// @ts-check
/**
 * agregar.mjs — as duas tabelas: por prompt e agregada.
 *
 *   node _handoff/matriz-12-2026-09-10/agregar.mjs > TABELAS.md
 *
 * Nao decide nada. Junta o que os ficheiros de results/ e juizes/ dizem, e
 * escreve n/d onde nao houve medicao. "pontos por dolar" so aparece onde ha
 * preco de lista: o braco D nao tem preco publicado para o seu modelo, por isso
 * a celula fica n/d em vez de zero — zero seria dizer que foi de graca.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { maximo } from './lib/rubrica.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(AQUI, 'results');
const JUIZES = path.join(AQUI, 'juizes');
const prompts = JSON.parse(fs.readFileSync(path.join(AQUI, 'prompts.json'), 'utf8')).prompts;
const ORDEM = ['A', 'B', 'B2', 'C', 'D'];
const NOME = {
  A: 'A · Opus 5', B: 'B · Mooter', B2: 'B2 · Mooter T0=qwen3:30b',
  C: 'C · Haiku 4.5', D: 'D · Codex (agente)',
};

// `Number(null)` e 0 e `Number.isFinite(0)` e true: um null passava por "0.0000".
// Foi assim que o braco D apareceu a $0 em 12 linhas (adversario, M12-15).
const num = (v, casas = 4) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? 'n/d' : Number(v).toFixed(casas));
const cel = (v) => (v === null || v === undefined || v === '' ? 'n/d' : String(v));

const acc = {};
for (const b of ORDEM) acc[b] = { pontos: 0, maximo: 0, resposta_usd: 0, faturado_usd: 0, ms: 0, n: 0, sem_preco: 0, falhas: [] };

const out = [];
out.push('# MATRIZ 12 — tabelas');
out.push('');
out.push('Gerado por `agregar.mjs`. Nenhuma celula e escrita a mao.');
out.push('');

for (const p of prompts) {
  const fRes = path.join(RESULTS, `${p.id}.json`);
  if (!fs.existsSync(fRes)) { out.push(`## ${p.id} — n/d (nao corrido)`); out.push(''); continue; }
  const res = JSON.parse(fs.readFileSync(fRes, 'utf8'));
  const fJ = path.join(JUIZES, `${p.id}.json`);
  const jz = fs.existsSync(fJ) ? JSON.parse(fs.readFileSync(fJ, 'utf8')) : { notas: {} };

  const rotaB = res.bracos.B && res.bracos.B.rota;
  out.push(`## ${p.id}${p.risco ? ' · [RISCO]' : ''}`);
  out.push('');
  out.push(`Rota do Mooter: **${rotaB ? rotaB.tier : 'n/d'}** -> ${cel(res.bracos.B && res.bracos.B.modelo)} · porque: ${rotaB ? rotaB.porque : 'n/d'} · classify ${rotaB ? rotaB.classify_ms + ' ms' : 'n/d'}`);
  out.push('');
  out.push('| braco | J1 | J2 | J3 | tok in | tok out | cache w/r | custo resposta $ (lista) | custo imputado incl. cache $ | s |');
  out.push('|---|---|---|---|---|---|---|---|---|---|');

  for (const b of ORDEM) {
    const r = res.bracos[b];
    if (!r || r.nao_corrido) { out.push(`| ${NOME[b]} | n/d | n/d | n/d | n/d | n/d | n/d | n/d | n/d | n/d |`); continue; }
    if (!r.texto) {
      acc[b].falhas.push(`${p.id}: ${cel(r.motivo)}`);
      out.push(`| ${NOME[b]} | — | — | — | n/d | n/d | n/d | n/d | n/d | ${num((r.decorrido_ms || 0) / 1000, 1)} | falhou: ${cel(r.motivo)}`);
      continue;
    }
    const n1 = jz.notas.J1 && jz.notas.J1.notas[b];
    const n2 = jz.notas.J2 && jz.notas.J2.notas[b];
    const n3 = jz.notas.J3 && jz.notas.J3.notas[b];
    const max = maximo(!!p.risco);
    const notasHumanas = [n1, n2, n3].map((n) => (n && Number.isFinite(n.total) ? `${n.total}/${max}` : 'n/d'));
    const cw = (r.cache_creation || 0), cr = (r.cache_read || 0);
    out.push(`| ${NOME[b]} | ${notasHumanas[0]} | ${notasHumanas[1]} | ${notasHumanas[2]} | ${cel(r.tokens_in)} | ${cel(r.tokens_out)} | ${cw}/${cr} | ${num(r.custo_resposta_usd)} | ${num(r.custo_faturado_usd)} | ${num((r.decorrido_ms || 0) / 1000, 1)} |`);

    const totais = [n1, n2].filter((n) => n && Number.isFinite(n.total)).map((n) => n.total);
    if (totais.length) { acc[b].pontos += totais.reduce((s, x) => s + x, 0) / totais.length; acc[b].maximo += max; acc[b].n += 1; }
    if (Number.isFinite(r.custo_resposta_usd)) { acc[b].resposta_usd += r.custo_resposta_usd; acc[b].faturado_usd += r.custo_faturado_usd; }
    else acc[b].sem_preco += 1;
    acc[b].ms += r.decorrido_ms || 0;
  }
  out.push('');
}

out.push('## Agregado');
out.push('');
out.push('Pontos = media de J1 e J2 (o J3 entra quando a folha voltar). Um braco que');
out.push('nao corre num prompt nao soma maximo nesse prompt — as colunas nao sao');
out.push('comparaveis sem olhar para `n`.');
out.push('');
out.push('| braco | n | pontos | maximo | custo resposta $ (lista imputada) | custo imputado incl. cache $ | pontos por $ (imputado) | tempo total s |');
out.push('|---|---|---|---|---|---|---|---|');
for (const b of ORDEM) {
  const a = acc[b];
  // Sem preco publicado a celula fica n/d — nunca 0, que se leria como "de graca".
  // Com custo 0 de fornecedor (local) a divisao nao existe: escreve-se o que e,
  // "$0 de fornecedor", e nao um numero infinito que ninguem pode comparar.
  const porDolar = a.sem_preco > 0 ? `n/d (${a.sem_preco} resposta(s) sem preco de lista)`
    : (a.faturado_usd > 0 ? (a.pontos / a.faturado_usd).toFixed(0) : (a.pontos > 0 ? 'sem divisao: $0 de fornecedor' : 'n/d'));
  // Apanhado pelo adversario (M12-15): um braco sem preco de lista somava 0 e a
  // celula imprimia "0.0000" -- exactamente o falso zero que o D5 tinha corrigido
  // na linha por prompt. Se falta preco a UMA resposta, a soma nao existe.
  const somaResp = a.sem_preco > 0 ? 'n/d' : num(a.resposta_usd);
  const somaFat = a.sem_preco > 0 ? 'n/d' : num(a.faturado_usd);
  out.push(`| ${NOME[b]} | ${a.n} | ${a.pontos.toFixed(1)} | ${a.maximo} | ${somaResp} | ${somaFat} | ${porDolar} | ${(a.ms / 1000).toFixed(1)} |`);
}
out.push('');
for (const b of ORDEM) if (acc[b].falhas.length) { out.push(`**${NOME[b]} falhou em:** ${acc[b].falhas.join(' · ')}`); out.push(''); }

// ── controlo de ruido, de borla ────────────────────────────────────────────
// Nos prompts que o classify manda para T3, os bracos A e B correm o MESMO
// modelo com a MESMA configuracao. A diferenca de pontos entre eles nao pode
// ser atribuida a rota: e ruido — do modelo, que nao e determinista, e do juiz,
// que pontua textos parecidos de maneira diferente. Qualquer vantagem menor do
// que isto, em qualquer linha desta matriz, nao e uma vantagem.
const ruido = [];
for (const p of prompts) {
  const f = path.join(RESULTS, `${p.id}.json`);
  if (!fs.existsSync(f)) continue;
  const res = JSON.parse(fs.readFileSync(f, 'utf8'));
  const rota = res.bracos.B && res.bracos.B.rota;
  if (!rota || rota.tier !== 'T3') continue;
  const fJ = path.join(JUIZES, `${p.id}.json`);
  if (!fs.existsSync(fJ)) continue;
  const jz = JSON.parse(fs.readFileSync(fJ, 'utf8'));
  for (const juiz of ['J1', 'J2', 'J3']) {
    const n = jz.notas[juiz] && jz.notas[juiz].notas;
    if (!n || !n.A || !n.B || !Number.isFinite(n.A.total) || !Number.isFinite(n.B.total)) continue;
    ruido.push({ id: p.id, juiz, A: n.A.total, B: n.B.total, dif: Math.abs(n.A.total - n.B.total) });
  }
}
if (ruido.length) {
  out.push('## Controlo de ruido (A vs B nos T3 — mesmo modelo, mesma configuracao)');
  out.push('');
  out.push('| prompt | juiz | A | B | diferenca |');
  out.push('|---|---|---|---|---|');
  for (const r of ruido) out.push(`| ${r.id} | ${r.juiz} | ${r.A} | ${r.B} | ${r.dif} |`);
  const max = Math.max(...ruido.map((r) => r.dif));
  const media = ruido.reduce((s, r) => s + r.dif, 0) / ruido.length;
  out.push('');
  out.push(`Diferenca **maxima** entre dois bracos que correm o mesmo motor: **${max} ponto(s)**; media ${media.toFixed(1)} em ${ruido.length} par(es).`);
  out.push('Uma vantagem de ate esse tamanho, em qualquer linha acima, nao se distingue de ruido.');
  out.push('');
} else {
  out.push('## Controlo de ruido');
  out.push('');
  out.push('n/d — nenhum prompt caiu em T3 com os dois bracos pontuados, por isso nao ha par com o mesmo motor para medir o ruido.');
  out.push('');
}
console.log(out.join('\n'));
