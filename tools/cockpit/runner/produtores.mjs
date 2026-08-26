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
 * O que sobrepõe são os campos de APRESENTAÇÃO — nunca os quatro que entram no
 * hash. Até 2026-08-26 sobrepunha só a `origem`, e o argumento era «só a
 * contagem depende dela». Uma lente adversarial mostrou que era falso duas
 * vezes: (1) `f10-server.mjs` ramifica na `origem` para decidir se re-pontua a
 * severidade, e (2) `moo-pilot-shell.html` ramifica na `origem` para decidir a
 * etiqueta — com o resultado medido de 104 achados de três linters de CPU
 * apresentados ao dono como **«GPU · model»**. E os campos que ficavam intactos
 * (`tipo: 'apontamento-regex'`, `escopo: 'regex:…'`, `evidencia: '… · regex …'`,
 * `sev.porque: 'deterministic regex pointer'`) mentiam sobre o instrumento: o
 * jscpd é um detector de clones por tokens e o knip é análise de grafo de
 * módulos — nenhum dos dois é uma regex.
 *
 * A regra passa a ser explícita e é a única que importa: **`file`, `line`,
 * `rule` e `msg` SÃO a identidade e não se tocam; tudo o resto é rótulo e tem
 * de nomear o instrumento verdadeiro.** A chave continua idêntica à que
 * `apontamentoDoDetector` produz sozinho, e há um teste que o compara.
 *
 * A corrida inteira acontece dentro de `medirRede` (ver `rede-zero.mjs`), que é
 * a outra metade do gate: «0 chamadas de rede durante a corrida (medido)».
 *
 * ── O `estado` DE FORA E O `estado` DE CADA ORIGEM SÃO PERGUNTAS DIFERENTES ──
 *
 * Segunda objecção da lente, e a mais grave deste ficheiro: com as três
 * ferramentas a falhar por falta de binário — a situação NORMAL em qualquer
 * máquina que não seja a do dono — o `/fleet.json` publicava
 * `estado: "ok", rede_zero: true, por_triar: 0, alerta_achados: false` e o
 * processo saía com `EXIT=0`. O `estado` de fora significava «o ficheiro é
 * legível» e o de cada origem significa «a ferramenta correu»; a mesma palavra
 * para duas perguntas, e a de fora contradizia as três de dentro.
 *
 * Agora são campos separados: `leitura` responde «o artefacto é legível» e
 * `estado` responde «a corrida produziu alguma coisa» (`ok` · `parcial` ·
 * `falhou` · `n/d`). E o `rede_zero` deixa de poder ser `true` por VACUIDADE:
 * zero saídas de rede numa corrida onde nenhuma ferramenta chegou a arrancar
 * não é uma medição, é a ausência de oportunidade.
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
 * Os campos do esquema que são RÓTULO e não identidade. `apontamentoDoDetector`
 * escreve-os para o detector de regex da âncora; para um produtor, cada um
 * deles nomeia um instrumento que não é o que produziu o achado.
 *
 * Nenhum destes entra no hash — a identidade é `sha256([file,line,rule,msg])` e
 * fica intacta. É isso que torna esta sobreposição segura: corrigir o rótulo não
 * ressuscita uma decisão de triagem.
 */
export function rotulosDoProdutor(item, origem) {
  return {
    origem,
    tipo: 'apontamento-linter',
    escopo: `${origem}:${item.regra}`,
    evidencia: `${item.ficheiro}:${item.janela} · ${origem} ${item.regra}`,
    sev: {
      ...item.sev,
      porque: `${origem} finding (deterministic linter, no GPU and no model) — needs your judgment`,
    },
  };
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
    itens.push({ ...item, ...rotulosDoProdutor(item, origem) });
  }
  return { itens, aceites: itens.length, rejeitados: rejeitados.length, amostraRejeitada: rejeitados.slice(0, 3) };
}

/**
 * A saúde de UMA origem, a partir do que a corrida mediu dela.
 *
 * Terceira objecção da lente: nenhum adaptador lia o código de saída, e um
 * semgrep que morreu com `rc=7`, zero regras carregadas e zero ficheiros
 * varridos publicava-se como `estado: "ok", apontamentos: 0` — literalmente
 * indistinguível de «varreu 312 ficheiros e não achou nada». `parcial` é o
 * estado que essas duas coisas deixam de partilhar.
 */
export function saudeDaOrigem(meta = {}) {
  const problemas = [];
  if (Number.isInteger(meta.rc) && meta.rc !== 0) problemas.push(`o processo saiu com rc=${meta.rc}`);
  if (Number.isInteger(meta.erros) && meta.erros > 0) problemas.push(`a ferramenta reportou ${meta.erros} erro(s) próprio(s)`);
  if (meta.ficheiros_varridos === 0) problemas.push('varreu ZERO ficheiros');
  if (!problemas.length) return { estado: 'ok', porque: null };
  return { estado: 'parcial', porque: `correu mas ${problemas.join(' e ')} — aqui "0 achados" não é "não há nada"` };
}

/**
 * O estado da CORRIDA, derivado do estado das três ferramentas. Responde a
 * «alguma coisa correu?», que é uma pergunta diferente de «o ficheiro é
 * legível?» — e era a mesma palavra para as duas.
 */
export function estadoDaCorrida(origens) {
  const estados = ORIGENS.map((o) => ((origens && origens[o] && origens[o].estado) || 'n/d'));
  const correram = estados.filter((e) => e === 'ok' || e === 'parcial').length;
  const limpas = estados.filter((e) => e === 'ok').length;
  if (limpas === ORIGENS.length) return { estado: 'ok', porque: null, ferramentas_ok: correram };
  if (correram === 0) {
    return {
      estado: 'falhou',
      porque: `nenhuma das ${ORIGENS.length} ferramentas correu: ${ORIGENS.map((o, i) => `${o}=${estados[i]}`).join(', ')}`,
      ferramentas_ok: 0,
    };
  }
  return {
    estado: 'parcial',
    porque: `${correram} de ${ORIGENS.length} ferramentas correram: ${ORIGENS.map((o, i) => `${o}=${estados[i]}`).join(', ')}`,
    ferramentas_ok: correram,
  };
}

/**
 * O `rede_zero` que se pode publicar, dado o que correu.
 *
 * `auditar()` devolve `true` com «nenhum filho nasceu» quando nada nasceu —
 * o que é correcto do ponto de vista da rede e VÁCUO do ponto de vista do gate.
 * A afirmação-título da F1 é «0 chamadas de rede DURANTE A CORRIDA»; sem
 * corrida, o zero não teve oportunidade de ser diferente de zero. É a mesma
 * regra que este ramo já aplica à sonda do SO: zero amostras não é zero
 * ligações.
 *
 * Uma função, dois pontos de chamada — o escritor (`correr`) e o leitor
 * (`lerProdutores`), para que um manifesto antigo não entre por uma porta que a
 * regra nova já fechou na outra.
 */
export function redeNaoVacua(rede, origens) {
  const base = (rede && 'rede_zero' in rede) ? { ...rede } : { rede_zero: null, porque: 'run carries no network audit' };
  if (estadoDaCorrida(origens).ferramentas_ok === 0 && base.rede_zero === true) {
    return {
      ...base,
      rede_zero: null,
      porque: 'nenhuma ferramenta chegou a correr: "0 chamadas de rede" seria verdadeiro por VACUIDADE, '
        + `e um zero que ninguém teve oportunidade de contrariar não é uma medição · auditoria da corrida: ${base.porque}`,
    };
  }
  return base;
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
    // `leitura` responde «o artefacto é legível», `estado` responde «a corrida
    // produziu alguma coisa». Eram a mesma palavra e contradiziam-se.
    leitura: 'n/d',
    porque,
    origens: null,
    apontamentos: null,
    por_triar: null,
    ferramentas_ok: null,
    gerado_em: null,
    rede_zero: null,
    rede_porque: null,
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
  //
  // A lista de campos continua fechada de propósito (o manifesto tem `meta` de
  // cada adaptador e não se despeja tudo no `/fleet.json`), mas os DENOMINADORES
  // passaram a estar dentro dela. Quarta objecção da lente: o knip emitiu 157
  // entradas com nome, o adaptador passou 62 adiante, e o painel mostrava
  // «62 de 62, 0 rejeitados» — o `rejeitados` só conta o que o ESQUEMA recusa,
  // nunca o que o adaptador filtrou antes. `emitidos` e
  // `descartados_pelo_adaptador` são o denominador que faltava; sem eles um 62
  // e um 157 são a mesma linha no ecrã.
  const inteiro = (m, k) => (m && Number.isInteger(m[k]) ? m[k] : null);
  const origens = Object.fromEntries(ORIGENS.map((o) => {
    const m = (manifesto.origens && manifesto.origens[o]) || null;
    const correu = Boolean(m) && (m.estado === 'ok' || m.estado === 'parcial');
    return [o, {
      // Uma ferramenta que NÃO correu não tem contagem: `null` com razão, nunca
      // um zero afirmado. Era a doutrina do próprio ficheiro («não medido nunca
      // é zero medido»), aplicada ao `brutos` e violada nos outros três — com um
      // teste a segurar a violação.
      apontamentos: correu ? porOrigem[o].apontamentos : null,
      por_triar: correu ? porOrigem[o].por_triar : null,
      decididos: correu ? porOrigem[o].decididos : null,
      estado: m ? m.estado : 'n/d',
      porque: m ? (m.porque ?? null) : 'origin absent from the manifest',
      brutos: inteiro(m, 'brutos'),
      emitidos: inteiro(m, 'emitidos'),
      descartados_pelo_adaptador: inteiro(m, 'descartados_pelo_adaptador'),
      rejeitados: inteiro(m, 'rejeitados'),
      // Os dois números que separam «varreu 312 ficheiros e não achou nada» de
      // «não conseguiu carregar uma regra». Existiam no manifesto e eram
      // deitados fora exactamente aqui.
      ficheiros_varridos: inteiro(m, 'ficheiros_varridos'),
      erros: inteiro(m, 'erros'),
      rc: inteiro(m, 'rc'),
      sem_linha: (m && m.sem_linha && typeof m.sem_linha === 'object' && !Array.isArray(m.sem_linha)) ? m.sem_linha : null,
      ms: inteiro(m, 'ms'),
    }];
  }));

  const corrida = estadoDaCorrida(origens);
  const rede = redeNaoVacua(manifesto.rede, origens);

  return {
    // «a corrida produziu alguma coisa?» — ok · parcial · falhou
    estado: corrida.estado,
    // «o artefacto no disco é legível?» — a pergunta que o `estado` respondia.
    leitura: 'ok',
    porque: corrida.porque,
    ferramentas_ok: corrida.ferramentas_ok,
    origens,
    apontamentos: itens.length,
    por_triar: total,
    gerado_em: geradoEm,
    // Três estados, herdados de `auditar()`: `null` é "não se conseguiu medir",
    // e nunca se deixa colapsar em `true` — nem por vacuidade.
    rede_zero: rede.rede_zero,
    rede_porque: rede.porque ?? null,
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
        // `ok` deixou de ser a consequência automática de «não atirou». Uma
        // ferramenta pode devolver JSON válido e ter rebentado por dentro.
        const saude = saudeDaOrigem(meta);
        origens[p.origem] = {
          ...meta,
          estado: saude.estado,
          porque: saude.porque,
          // `brutos` é o que o ADAPTADOR passou adiante; `emitidos` é o que a
          // FERRAMENTA disse. Só o segundo é denominador.
          brutos: brutos.length,
          emitidos: Number.isInteger(meta.emitidos) ? meta.emitidos : brutos.length,
          descartados_pelo_adaptador: Number.isInteger(meta.descartados_pelo_adaptador)
            ? meta.descartados_pelo_adaptador : 0,
          aceites: n.aceites,
          rejeitados: n.rejeitados,
          amostra_rejeitada: n.amostraRejeitada,
          ms: Date.now() - t0,
        };
      } catch (e) {
        origens[p.origem] = {
          estado: 'falhou',
          porque: String(e && e.message ? e.message : e).slice(0, 400),
          // Uma ferramenta que não correu não tem contagem NENHUMA — nem de
          // aceites. `0 aceites` era um zero afirmado ao lado de `brutos: null`.
          brutos: null, emitidos: null, descartados_pelo_adaptador: null,
          aceites: null, rejeitados: null, ms: Date.now() - t0,
        };
      }
    }
    return itens;
  }, opcoesRede);

  // A auditoria CRUA fica em `rede_bruta` (é o que o mecanismo mediu) e o que se
  // publica é a versão que não pode ser verdadeira por vacuidade. Guardam-se as
  // duas: esconder a crua tornaria a regra impossível de auditar.
  const corrida = estadoDaCorrida(origens);
  const rede = redeNaoVacua(auditoria, origens);

  const manifesto = {
    gerado_em: geradoEm,
    repo: posix(raiz),
    estado: corrida.estado,
    porque: corrida.porque,
    ferramentas_ok: corrida.ferramentas_ok,
    origens,
    apontamentos: itens.length,
    por_origem: Object.fromEntries(ORIGENS.map((o) => [o, itens.filter((i) => i.origem === o).length])),
    rede: { ...auditoria, ...rede },
    rede_bruta: { rede_zero: auditoria.rede_zero, porque: auditoria.porque },
  };

  return { itens, manifesto, auditoria: { ...auditoria, ...rede } };
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
    if (m.estado === 'falhou') { console.log(`  ${o.padEnd(8)} FALHOU · ${m.porque}`); continue; }
    const marca = m.estado === 'parcial' ? 'PARCIAL' : 'ok';
    console.log(`  ${o.padEnd(8)} ${marca} · ${m.aceites} apontamentos (${m.emitidos} emitidos pela ferramenta, `
      + `${m.descartados_pelo_adaptador} sem posição, ${m.rejeitados} fora do esquema) · ${m.ms} ms`);
    if (m.porque) console.log(`           ↳ ${m.porque}`);
  }
  console.log(`  total    ${manifesto.apontamentos} apontamentos`);
  console.log(`\nestado da corrida: ${manifesto.estado}${manifesto.porque ? ` — ${manifesto.porque}` : ''}`);
  console.log(`rede_zero: ${manifesto.rede.rede_zero === null ? 'n/d' : manifesto.rede.rede_zero}`);
  console.log(`  ${manifesto.rede.porque}`);
  for (const f of [...auditoria.filhos, ...(auditoria.descendentes || [])]) {
    console.log(`  processo ${f.cmd} → ${f.sonda.estado}${f.sonda.porque ? ` (${f.sonda.porque})` : ` · ${f.sonda.amostras} amostra(s)`}`);
  }

  if (!soRelato) {
    const { alvoAchados, alvoManifesto } = escrever({ dir, itens, manifesto });
    console.log(`\nescrito: ${alvoAchados}`);
    console.log(`         ${alvoManifesto}`);
  } else {
    console.log('\n(--estado: não escrevi nada)');
  }

  // O CÓDIGO DE SAÍDA TEM DE DIZER A VERDADE.
  //
  // Antes saía sempre 0 — inclusive com as três ferramentas a rebentar por falta
  // de binário e `rede_zero: true` por vacuidade. Um cron ou um CI que chamasse
  // isto via sucesso. Agora: 3 se a prova de rede não é `true` (é a afirmação
  // do gate), 2 se alguma ferramenta não correu ou correu partida, 0 só quando
  // as três correram limpas E a rede foi medida a zero.
  if (manifesto.rede.rede_zero !== true) return 3;
  if (manifesto.estado !== 'ok') return 2;
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('produtores.mjs')) {
  principal(process.argv.slice(2))
    .then((codigo) => { process.exitCode = codigo; })
    .catch((e) => { console.error(e); process.exitCode = 1; });
}
