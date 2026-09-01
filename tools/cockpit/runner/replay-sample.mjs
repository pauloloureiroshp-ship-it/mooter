#!/usr/bin/env node
/**
 * replay-sample.mjs — 50 propostas ja triadas, para o dono voltar a julgar.
 *
 * O gate diz: «instrumento discrimina: nao-discrimina <10% no replay de 50,
 * rotulado pelo dono». Nada disto se pode medir com achados NOVOS — gerar
 * rondas novas para provar que o instrumento melhorou seria pedir ao
 * instrumento que se avaliasse a si proprio (M2), e alem disso o loop esta
 * PARADO por decisao do dono e so reabre por ata (W2). Por isso: replay. $0 de
 * geracao nova, o ciclo continua fechado.
 *
 * TRES decisoes deliberadas:
 *
 *  1. A ROTULAGEM E AS CEGAS. A decisao anterior NAO entra no pacote — vai para
 *     um `gabarito.json` a parte. Um replay que mostra o rotulo antigo nao mede
 *     nada: mede se a pessoa concorda consigo propria. E o julgamento anterior
 *     foi feito sobre o achado CRU; este vai enriquecido, que e precisamente a
 *     variavel em teste.
 *  2. AMOSTRA DETERMINISTICA. Sem `Math.random`: a ordem sai de um sha256 da
 *     chave do achado. Duas pessoas em duas maquinas tiram a MESMA amostra, e
 *     uma amostra que ninguem consegue reproduzir nao e evidencia.
 *  3. ESTRATIFICADA POR MOTIVO, com o metodo dos maiores restos. A proporcao
 *     do `instrumento-nao-discrimina` tem de sobreviver a amostragem — e a
 *     unica celula que o gate mede.
 *
 * NAO ROTULA NADA. Este ficheiro escreve perguntas; as respostas sao do dono.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(AQUI, '..', '..', '..');
export const TAMANHO = 50;
export const DESTINO = path.join(REPO, '_handoff', 'replay-50');

/** A ordem da amostra: determinística, e sem relacao com o conteudo do juizo. */
export function ordem(chave, { semente = 'replay-50-2026-09-01' } = {}) {
  return createHash('sha256').update(`${semente}|${chave}`).digest('hex');
}

/**
 * Quantos de cada estrato, com maiores restos (Hare).
 *
 * Arredondar cada celula por si daria uma soma diferente de 50 quase sempre —
 * e "50 propostas" e o numero que o gate cita. Os maiores restos somam sempre
 * exactamente o total pedido.
 */
export function repartir(populacao, total = TAMANHO) {
  const chaves = Object.keys(populacao).sort();
  const N = chaves.reduce((s, k) => s + populacao[k], 0);
  if (!N) return {};
  const bruto = chaves.map((k) => ({ k, exacto: (populacao[k] / N) * total }));
  const saida = {};
  let dados = 0;
  for (const b of bruto) { saida[b.k] = Math.floor(b.exacto); dados += saida[b.k]; }
  const restos = bruto
    .map((b) => ({ k: b.k, resto: b.exacto - Math.floor(b.exacto) }))
    // Empate desfeito pelo nome do estrato: sem isto a amostra deixava de ser
    // reproduzivel exactamente onde e mais facil haver empates.
    .sort((a, b) => (b.resto - a.resto) || (a.k < b.k ? -1 : 1));
  for (let i = 0; dados < total && i < restos.length; i += 1, dados += 1) {
    saida[restos[i].k] += 1;
  }
  return saida;
}

/** O estrato de uma decisao: o motivo quando existe, senao a propria decisao. */
export function estratoDe(decisao) {
  const d = decisao || {};
  if (d.decisao === 'descartado') return d.motivo || 'descartado-sem-motivo';
  return d.decisao || 'sem-decisao';
}

/**
 * A amostra. `decisoes` sao as ultimas por chave; `recibos` o ledger.
 * So entram achados que EXISTEM no ledger — sem recibo nao ha o que enriquecer.
 */
export function amostrar(decisoes, recibos, { total = TAMANHO, semente } = {}) {
  const porChave = new Map();
  for (const r of recibos || []) if (r && r.chave && r.conclusao === 'achado') porChave.set(r.chave, r);

  const estratos = new Map();
  for (const d of decisoes || []) {
    const r = porChave.get(d.chave);
    if (!r) continue;
    const e = estratoDe(d);
    if (!estratos.has(e)) estratos.set(e, []);
    estratos.get(e).push({ decisao: d, recibo: r });
  }
  const populacao = {};
  for (const [e, itens] of estratos) populacao[e] = itens.length;
  const quotas = repartir(populacao, total);

  const escolhidos = [];
  for (const e of Object.keys(quotas).sort()) {
    const ordenados = [...estratos.get(e)]
      .sort((a, b) => (ordem(a.recibo.chave, { semente }) < ordem(b.recibo.chave, { semente }) ? -1 : 1));
    escolhidos.push(...ordenados.slice(0, quotas[e]).map((x) => ({ ...x, estrato: e })));
  }
  return { populacao, quotas, escolhidos, total_populacao: Object.values(populacao).reduce((a, b) => a + b, 0) };
}

/**
 * Que linha mostrar em volta.
 *
 * A CITADA pelo modelo, quando ela existe — nao o inicio da janela. Sao coisas
 * diferentes e a diferenca importa: a janela pode ter 70 linhas, e centrar o
 * contexto no principio dela mostrava ao dono um sitio que o achado nem
 * menciona. Sem citacao nenhuma, cai-se no inicio da janela, que e o unico
 * outro sitio honesto.
 */
export function linhaDoAlvo(recibo) {
  const r = recibo || {};
  for (const c of r.citacoes || []) {
    const n = Number(String((c && c.ref) || '').split(':').pop());
    if (Number.isInteger(n) && n > 0) return n;
  }
  const inicio = Number(String(r.janela || '').split('-')[0]);
  return Number.isInteger(inicio) && inicio > 0 ? inicio : 1;
}

/** A pergunta que o dono responde. Sem o rotulo antigo — as cegas, de propósito. */
export function fichaDoItem(n, item, pacote) {
  const r = item.recibo;
  const p = pacote || {};
  const linhas = [
    `# Replay ${String(n).padStart(2, '0')} de ${TAMANHO}`,
    '',
    '> Rotula **as cegas**: a decisao que foi tomada sobre este achado da primeira',
    '> vez NAO esta neste ficheiro (esta em `gabarito.json`, e so se abre depois).',
    '> O que mudou entre as duas vezes e o CONTEXTO, e e isso que esta em teste.',
    '',
    '## O achado, tal como o motor o produziu',
    '',
    `- **pilar** \`${r.pilar || 'n/d'}\` — ${r.pilar_label || 'n/d'}`,
    `- **ficheiro** \`${r.ficheiro || 'n/d'}\`${r.janela ? ` (janela ${r.janela})` : ''}`,
    `- **modelo** ${r.modelo || 'n/d'} · ${r.engine || 'n/d'} · ${r.dur_s ?? 'n/d'}s · ${r.tokens_out ?? 'n/d'} tokens · $${r.usd ?? 0}`,
    `- **veredicto do L0** \`${r.verdict || 'n/d'}\``,
    '',
    '```',
    String(r.resultado_resumo || '(o recibo nao traz resumo)').slice(0, 2000),
    '```',
    '',
    '## O contexto que ele NAO tinha',
    '',
  ];
  if (p.porque && !p.snippet) {
    linhas.push(`_nao foi possivel enriquecer: ${p.porque}_`, '');
  } else {
    if (p.alvo) linhas.push(`Alvo: \`${p.alvo.ficheiro}:${p.alvo.linha}\`${p.alvo.simbolo ? ` · simbolo \`${p.alvo.simbolo}\`` : ''}`, '');
    if (p.trace && p.trace.length) {
      linhas.push(`Onde vive: ${p.trace.map((t) => `\`${t.linha}: ${t.texto}\``).join(' › ')}`, '');
    }
    linhas.push('```', p.snippet.texto, '```', '');
    linhas.push(`Ferramenta: ${p.via || (p.ferramenta && p.ferramenta.nome) || 'n/d'}`);
    if (p.aviso) linhas.push('', `⚠️ ${p.aviso}`);
    if (p.defs && p.defs.length) {
      linhas.push('', '**Definido em**', ...p.defs.slice(0, 5).map((d) => `- \`${d.ficheiro}:${d.linha}\` — ${d.texto}`));
    }
    if (p.callers && p.callers.length) {
      linhas.push('', `**Chamado em** (${p.callers.length})`, ...p.callers.slice(0, 5).map((d) => `- \`${d.ficheiro}:${d.linha}\``));
    }
  }
  linhas.push(
    '',
    '---',
    '',
    '## A tua decisao',
    '',
    'Apaga o que nao se aplica. Nao ha resposta certa — o que se mede e se este',
    'achado, COM este contexto, te diz alguma coisa.',
    '',
    '```yaml',
    `chave: "${r.chave}"`,
    'decisao: aceite | descartado | issue',
    'motivo: nao-e-um-problema | ja-sabido | fora-do-que-estou-a-fazer |',
    '        citacao-certa-conclusao-errada | trivial |',
    '        instrumento-nao-discrimina | sem-evidencia',
    'nota: ""',
    '```',
    '',
  );
  return linhas.join('\n');
}

/** O manifesto: o que se amostrou, como, e o que esta amostra NAO pode dizer. */
export function manifesto({ populacao, quotas, escolhidos, total_populacao }, { agora = Date.now() } = {}) {
  const nd = quotas['instrumento-nao-discrimina'] || 0;
  const ndPop = populacao['instrumento-nao-discrimina'] || 0;
  const pct = (n, d) => (d ? `${(n / d * 100).toFixed(1)}%` : 'n/d');
  const linhas = [
    '# Replay de 50 — para o DONO rotular',
    '',
    `Gerado em ${new Date(agora).toISOString()} por \`tools/cockpit/runner/replay-sample.mjs\`.`,
    'Zero geracao nova: sao achados que ja existiam no ledger, com contexto acrescentado.',
    '',
    '## Como rotular',
    '',
    '1. Abre `01-*.md` … `50-*.md` por ordem. Cada um tem um bloco `yaml` no fim.',
    '2. Preenche `decisao` e (se descartares) `motivo`. Nao abras o `gabarito.json`.',
    '3. So no fim: compara com o `gabarito.json` — as decisoes da primeira vez.',
    '',
    '**As cegas de proposito.** A primeira vez estes achados foram julgados CRUS.',
    'Estes vao enriquecidos, e a diferenca entre os dois julgamentos e exactamente',
    'o que se quer medir. Ver o rotulo antigo mediria outra coisa: se concordas',
    'contigo proprio.',
    '',
    '## A amostra',
    '',
    `Populacao: ${total_populacao} achados triados que ainda existem no ledger.`,
    `Amostra: ${escolhidos.length}. Estratificada por motivo, maiores restos (Hare).`,
    'Ordem determinística: sha256(semente | chave). Repetivel em qualquer maquina.',
    '',
    '| estrato | na populacao | % | na amostra | % |',
    '|---|---:|---:|---:|---:|',
    ...Object.keys(populacao).sort().map((k) => `| \`${k}\` | ${populacao[k]} | ${pct(populacao[k], total_populacao)} | ${quotas[k] || 0} | ${pct(quotas[k] || 0, escolhidos.length)} |`),
    '',
    `A celula que o gate mede — \`instrumento-nao-discrimina\` — vale ${pct(ndPop, total_populacao)} na`,
    `populacao e ${pct(nd, escolhidos.length)} na amostra.`,
    '',
    '## O que esta amostra NAO pode dizer',
    '',
    '- **Nao mede keep-rate.** Os aceites e os issues sao 4 em toda a populacao;',
    '  a quota proporcional deles e menor do que meio item. Um keep-rate tirado',
    '  daqui seria um numero sobre uma populacao errada.',
    '- **Nao mede o instrumento contra si proprio.** Ela so vale depois de',
    '  rotulada pelo dono. Ate la nao ha veredicto nenhum.',
    '- **50 e uma amostra pequena.** Uma diferenca de 1 item vale 2 pontos',
    '  percentuais. Comparar 56,7% com um numero destes exige dize-lo.',
    '',
  ];
  return linhas.join('\n');
}

async function main() {
  const home = process.env.HOME || os.homedir();
  const ler = (f) => fs.readFileSync(path.join(home, '.mooter', f), 'utf8')
    .trim().split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

  const ultimas = new Map();
  for (const d of ler('triagem.jsonl')) ultimas.set(d.chave, d);
  const recibos = ler('runner-ledger.jsonl');
  const a = amostrar([...ultimas.values()], recibos);

  if (process.argv.includes('--so-plano')) {
    process.stdout.write(`${JSON.stringify({ populacao: a.populacao, quotas: a.quotas }, null, 2)}\n`);
    return;
  }
  fs.mkdirSync(DESTINO, { recursive: true });
  const { enriquecer } = await import('./enrich.mjs');
  const gabarito = [];
  a.escolhidos.forEach((item, i) => {
    const n = i + 1;
    const r = item.recibo;
    const linhaAlvo = linhaDoAlvo(r);
    const pacote = enriquecer({ ...r, linha: linhaAlvo });
    const nome = `${String(n).padStart(2, '0')}-${(r.pilar || 'PX').toLowerCase()}.md`;
    fs.writeFileSync(path.join(DESTINO, nome), fichaDoItem(n, item, pacote));
    gabarito.push({
      n, ficheiro: nome, chave: r.chave, estrato: item.estrato,
      decisao_anterior: item.decisao.decisao, motivo_anterior: item.decisao.motivo || null,
      por: item.decisao.por || null, decidido_em: item.decisao.ts || null,
    });
  });
  fs.writeFileSync(path.join(DESTINO, 'MANIFESTO.md'), manifesto(a));
  fs.writeFileSync(path.join(DESTINO, 'gabarito.json'),
    `${JSON.stringify({ _: 'NAO ABRIR antes de rotular os 50. Isto sao as decisoes da PRIMEIRA vez.', itens: gabarito }, null, 2)}\n`);
  process.stdout.write(`replay-50: ${a.escolhidos.length} pacotes em ${path.relative(REPO, DESTINO)}\n`);
  for (const k of Object.keys(a.quotas).sort()) process.stdout.write(`  ${k.padEnd(34)} ${a.quotas[k]}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
