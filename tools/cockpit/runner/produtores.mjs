#!/usr/bin/env node
/**
 * produtores.mjs — a interface comum dos produtores da F1 do A/B do Moo Audit.
 *
 * O MP pede três ferramentas de fora (semgrep, jscpd, knip) a produzir «no
 * MESMO esquema do detector determinista (`apontamentoDoDetector`), cada uma com
 * a sua `origem`». Este ficheiro é esse "mesmo": recebe `{file,line,rule,msg}`
 * cru de cada adaptador e passa-o pela função que já existe em `triagem.mjs`.
 *
 * ⚠️ O ESQUEMA NÃO É REESCRITO AQUI, E ISSO É A DECISÃO CENTRAL DO FICHEIRO.
 * `apontamentoDoDetector` calcula a chave como
 * `sha256([file,line,rule,msg]).slice(0,16)` — ou seja, os quatro campos SÃO a
 * identidade do apontamento. Uma segunda cópia do esquema aqui, mesmo idêntica
 * ao carácter, seria uma segunda definição de identidade: no dia em que uma das
 * duas mudasse o texto de um `msg`, todos os apontamentos já triados voltariam
 * à fila com chaves novas e as decisões do dono ficariam órfãs. Por isso este
 * ficheiro IMPORTA e nunca redefine.
 *
 * A `chave` que sai continua a ser `detector:ancora:<sha>`, herdada do esquema.
 * Não se muda o prefixo: o que distingue um apontamento do jscpd de um da âncora
 * é a `rule`, que cada adaptador namespaceia (`jscpd/duplicate:ts`,
 * `semgrep/<id>`, `knip/unused-export`) e que entra no hash. Reescrever a chave
 * para `produtor:<origem>:...` daria chaves novas para os mesmos achados e
 * ressuscitaria decisões — exactamente o que o comentário de `porTriarDetector`
 * diz que não pode acontecer.
 *
 * O que sobrepõe é a `origem`, e é o único campo sobreposto: o gate da F1 exige
 * «contagem própria no /fleet.json», e sem `origem` os três produtores seriam um
 * bolo único onde ninguém saberia qual deles trouxe o quê.
 *
 * A corrida inteira acontece dentro de `medirRede` (ver `rede-zero.mjs`), que é
 * a outra metade do gate: «0 chamadas de rede durante a corrida (medido)».
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import child_process from 'node:child_process';

import { apontamentoDoDetector, LIMITE_TRIAGEM } from './triagem.mjs';
import { medirRede } from './rede-zero.mjs';

const HOME = os.homedir();
const MOO_DIR = process.env.MOOTER_HOME || path.join(HOME, '.mooter');

/**
 * As três origens da F1. Lista fechada, como `DECISOES` e `MOTIVOS` em
 * `triagem.mjs`: uma origem nova é uma decisão do dono, não um efeito lateral de
 * alguém acrescentar um ficheiro.
 */
export const ORIGENS = Object.freeze(['semgrep', 'jscpd', 'knip']);

export const ACHADOS_JSON = 'produtores-achados.json';
export const MANIFESTO_JSON = 'produtores-manifesto.json';

/**
 * O spawn VIVO: lido do objecto do módulo A CADA CHAMADA.
 *
 * MEDIDO a 2026-08-26, na primeira corrida a sério dos três produtores contra
 * `ab-audit-subjects/hono`. Os adaptadores faziam `import { spawn } from
 * 'node:child_process'` e guardavam essa referência como valor por omissão de
 * `spawnImpl`. O valor por omissão é avaliado ao carregar o módulo, portanto
 * apontava para a função ORIGINAL e passava ao lado do ponto de registo do
 * `rede-zero.mjs`. Resultado da corrida: o jscpd e o knip nasceram, correram e
 * NENHUM apareceu em `auditoria.filhos` — e o relatório imprimiu
 * `rede_zero: true` com dois processos por medir.
 *
 * Era exactamente a falsa prova que o `rede-zero.mjs` existe para impedir, e
 * não foi a leitura do código que a apanhou: foi correr.
 *
 * Este indirecto lê `child_process.spawn` no momento da chamada, que é a mesma
 * propriedade que a instrumentação substitui.
 */
export const spawnVivo = (...a) => child_process.spawn(...a);

/** Caminho no formato POSIX, sempre. Os três adaptadores devolvem separadores diferentes. */
export function posix(p) {
  return String(p).replace(/\\/g, '/');
}

/**
 * Passa apontamentos crus pelo esquema e marca-os com a origem do produtor.
 *
 * `apontamentoDoDetector` devolve `null` em silêncio para tudo o que não bata
 * certo (linha não inteira, regra vazia, ficheiro vazio). Silêncio é o que fez o
 * modo ANCORADO correr zero vezes durante 10 624 recibos: aqui os rejeitados são
 * CONTADOS e a razão de cada um fica no manifesto.
 */
export function normalizar(brutos, { origem, geradoEm = null } = {}) {
  if (!ORIGENS.includes(origem)) throw new Error(`origem desconhecida: ${origem} (aceites: ${ORIGENS.join(', ')})`);
  const itens = [];
  const rejeitados = [];
  for (const b of brutos || []) {
    const item = apontamentoDoDetector(b, geradoEm);
    if (!item) { rejeitados.push(b); continue; }
    itens.push({ ...item, origem });
  }
  return { itens, aceites: itens.length, rejeitados: rejeitados.length, amostraRejeitada: rejeitados.slice(0, 3) };
}

/**
 * A contagem por origem que o `/fleet.json` publica, e a fila que dela sai.
 *
 * Cada origem tem o SEU tecto de fila. Fundir as três num tecto único faria com
 * que 50 clones do jscpd tornassem o semgrep invisível — é o mesmo defeito que
 * `buildFleetState` já corrigiu ao separar o corte do detector do dos recibos.
 */
export function porTriarPorOrigem(itens, decisoes, { limite = LIMITE_TRIAGEM } = {}) {
  const porOrigem = Object.fromEntries(ORIGENS.map((o) => [o, { apontamentos: 0, por_triar: 0, decididos: 0 }]));
  const vistos = new Set();
  const filaPorOrigem = Object.fromEntries(ORIGENS.map((o) => [o, []]));

  for (const item of itens || []) {
    if (!item || !ORIGENS.includes(item.origem) || !item.chave) continue;
    if (vistos.has(item.chave)) continue;
    vistos.add(item.chave);
    const c = porOrigem[item.origem];
    c.apontamentos += 1;
    if (decisoes && decisoes.has(item.chave)) { c.decididos += 1; continue; }
    c.por_triar += 1;
    if (filaPorOrigem[item.origem].length < limite) filaPorOrigem[item.origem].push(item);
  }

  const fila = ORIGENS.flatMap((o) => filaPorOrigem[o]);
  const total = ORIGENS.reduce((s, o) => s + porOrigem[o].por_triar, 0);
  return { fila, porOrigem, total };
}

/** Escreve os dois ficheiros. Achados é um ARRAY, como o da âncora. */
export function escrever({ dir, itens, manifesto, writeImpl = fs.writeFileSync, mkdirImpl = fs.mkdirSync }) {
  mkdirImpl(dir, { recursive: true });
  const alvoAchados = path.join(dir, ACHADOS_JSON);
  const alvoManifesto = path.join(dir, MANIFESTO_JSON);
  writeImpl(alvoAchados, JSON.stringify(itens, null, 0));
  writeImpl(alvoManifesto, JSON.stringify(manifesto, null, 2));
  return { alvoAchados, alvoManifesto };
}

/** O estado `n/d` do bloco dos produtores. Ausência nunca vira zero medido. */
export function produtoresND(porque) {
  return {
    estado: 'n/d',
    porque,
    origens: null,
    apontamentos: null,
    por_triar: null,
    gerado_em: null,
    rede_zero: null,
    fila: [],
  };
}

/**
 * Lê o que a corrida escreveu, para o `/fleet.json`. Espelha `lerDetector` de
 * `fleet-state.mjs` de propósito: a ausência de ficheiro é `n/d` com razão, e
 * nunca uma lista vazia — para o painel, não medido é diferente de zero medido.
 */
export function lerProdutores({
  baseDir, repoRoot, decisoes = new Map(),
  readImpl = fs.readFileSync, existsImpl = fs.existsSync, limite = LIMITE_TRIAGEM,
} = {}) {
  if (!baseDir) return produtoresND('producer state directory not provided');
  if (!repoRoot) return produtoresND('served repository not provided');
  const pAchados = path.join(baseDir, ACHADOS_JSON);
  const pManifesto = path.join(baseDir, MANIFESTO_JSON);
  const existe = (p) => { try { return Boolean(existsImpl(p)); } catch { return false; } };
  if (!existe(pAchados)) return produtoresND('producer output missing — nobody has run the F1 producers here');
  if (!existe(pManifesto)) return produtoresND('producer manifest missing');

  let itens;
  let manifesto;
  try { itens = JSON.parse(String(readImpl(pAchados, 'utf8'))); }
  catch { return produtoresND('producer output unreadable'); }
  try { manifesto = JSON.parse(String(readImpl(pManifesto, 'utf8'))); }
  catch { return produtoresND('producer manifest unreadable'); }

  if (!Array.isArray(itens)) return produtoresND('producer output has invalid shape');
  if (!manifesto || typeof manifesto !== 'object' || Array.isArray(manifesto)) {
    return produtoresND('producer manifest has invalid shape');
  }
  if (itens.some((i) => !i || !ORIGENS.includes(i.origem) || typeof i.chave !== 'string' || !i.chave)) {
    return produtoresND('producer output carries an item without a known origin or key');
  }
  if (!Number.isInteger(manifesto.apontamentos) || manifesto.apontamentos !== itens.length) {
    return produtoresND('producer count disagrees with manifest');
  }
  if (posix(manifesto.repo || '') !== posix(repoRoot)) {
    return produtoresND('producer run belongs to another repository or subject');
  }
  const geradoEm = typeof manifesto.gerado_em === 'string' && Number.isFinite(Date.parse(manifesto.gerado_em))
    ? manifesto.gerado_em : null;
  if (!geradoEm) return produtoresND('producer generation time is invalid');

  const { fila, porOrigem, total } = porTriarPorOrigem(itens, decisoes, { limite });

  // A contagem por origem publicada junta o que a corrida MEDIU (quantos brutos
  // cada ferramenta emitiu, quanto tempo levou, se correu de todo) com o que a
  // fila diz hoje. Uma ferramenta que não correu fica visível com `estado`
  // próprio em vez de desaparecer numa soma.
  const origens = Object.fromEntries(ORIGENS.map((o) => {
    const m = (manifesto.origens && manifesto.origens[o]) || null;
    return [o, {
      ...porOrigem[o],
      estado: m ? m.estado : 'n/d',
      porque: m ? (m.porque ?? null) : 'origin absent from the manifest',
      brutos: m && Number.isInteger(m.brutos) ? m.brutos : null,
      rejeitados: m && Number.isInteger(m.rejeitados) ? m.rejeitados : null,
      ms: m && Number.isInteger(m.ms) ? m.ms : null,
    }];
  }));

  return {
    estado: 'ok',
    porque: null,
    origens,
    apontamentos: itens.length,
    por_triar: total,
    gerado_em: geradoEm,
    // Três estados, herdados de `auditar()`: `null` é "não se conseguiu medir",
    // e nunca se deixa colapsar em `true`.
    rede_zero: manifesto.rede && 'rede_zero' in manifesto.rede ? manifesto.rede.rede_zero : null,
    rede_porque: manifesto.rede ? (manifesto.rede.porque ?? null) : 'run carries no network audit',
    fila,
  };
}

/**
 * Corre os produtores dados, todos dentro da mesma medição de rede.
 *
 * Um produtor é `{ id, origem, correr(ctx) -> { brutos, meta } }`. Um que atire
 * não derruba os outros: fica com `estado: 'falhou'` e o texto do erro, porque
 * uma ferramenta que rebentou é um resultado e não um silêncio.
 */
export async function correr({
  produtores,
  raiz,
  agora = Date.now(),
  opcoesRede = {},
} = {}) {
  const geradoEm = new Date(agora).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const origens = {};
  let itens = [];

  const { auditoria } = await medirRede(async (ctx) => {
    for (const p of produtores) {
      const t0 = Date.now();
      try {
        const { brutos, meta = {} } = await p.correr({ ...ctx, raiz });
        const n = normalizar(brutos, { origem: p.origem, geradoEm });
        itens = itens.concat(n.itens);
        origens[p.origem] = {
          estado: 'ok',
          porque: null,
          brutos: brutos.length,
          aceites: n.aceites,
          rejeitados: n.rejeitados,
          amostra_rejeitada: n.amostraRejeitada,
          ms: Date.now() - t0,
          ...meta,
        };
      } catch (e) {
        origens[p.origem] = {
          estado: 'falhou',
          porque: String(e && e.message ? e.message : e).slice(0, 400),
          brutos: null, aceites: 0, rejeitados: null, ms: Date.now() - t0,
        };
      }
    }
    return itens;
  }, opcoesRede);

  const manifesto = {
    gerado_em: geradoEm,
    repo: posix(raiz),
    origens,
    apontamentos: itens.length,
    por_origem: Object.fromEntries(ORIGENS.map((o) => [o, itens.filter((i) => i.origem === o).length])),
    rede: auditoria,
  };

  return { itens, manifesto, auditoria };
}

// ─────────────────────────────────────────────────────────────── CLI

async function principal(argv) {
  const arg = (nome, omissao = null) => {
    const i = argv.indexOf(nome);
    return i === -1 ? omissao : argv[i + 1];
  };
  const raiz = posix(arg('--raiz', process.cwd()));
  const soRelato = argv.includes('--estado');
  const dir = arg('--saida', MOO_DIR);

  const { produtorSemgrep } = await import('./produtor-semgrep.mjs');
  const { produtorJscpd } = await import('./produtor-jscpd.mjs');
  const { produtorKnip } = await import('./produtor-knip.mjs');

  const regras = arg('--regras', null);
  const binJscpd = arg('--jscpd', null);
  const binKnip = arg('--knip', null);

  const produtores = [
    produtorSemgrep({ dirRegras: regras }),
    produtorJscpd({ bin: binJscpd }),
    produtorKnip({ bin: binKnip }),
  ];

  const { itens, manifesto, auditoria } = await correr({ produtores, raiz });

  console.log(`produtores · raiz ${raiz}`);
  for (const o of ORIGENS) {
    const m = manifesto.origens[o];
    if (!m) { console.log(`  ${o.padEnd(8)} n/d (não correu)`); continue; }
    if (m.estado !== 'ok') { console.log(`  ${o.padEnd(8)} FALHOU · ${m.porque}`); continue; }
    console.log(`  ${o.padEnd(8)} ${m.aceites} apontamentos (${m.brutos} brutos, ${m.rejeitados} fora do esquema) · ${m.ms} ms`);
  }
  console.log(`  total    ${manifesto.apontamentos} apontamentos`);
  console.log(`\nrede_zero: ${auditoria.rede_zero === null ? 'n/d' : auditoria.rede_zero}`);
  console.log(`  ${auditoria.porque}`);
  for (const f of auditoria.filhos) {
    console.log(`  filho ${f.cmd} → ${f.sonda.estado}${f.sonda.porque ? ` (${f.sonda.porque})` : ` · ${f.sonda.amostras} amostra(s)`}`);
  }

  if (soRelato) { console.log('\n(--estado: não escrevi nada)'); return; }
  const { alvoAchados, alvoManifesto } = escrever({ dir, itens, manifesto });
  console.log(`\nescrito: ${alvoAchados}`);
  console.log(`         ${alvoManifesto}`);
}

if (process.argv[1] && process.argv[1].endsWith('produtores.mjs')) {
  principal(process.argv.slice(2)).catch((e) => { console.error(e); process.exitCode = 1; });
}
