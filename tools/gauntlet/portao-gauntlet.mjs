#!/usr/bin/env node
/**
 * portao-gauntlet.mjs — o estágio 2 que o próprio gauntlet pede e não existia.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PORQUE ESTE FICHEIRO EXISTE
 *
 * `docs/foundation/MEO_GAUNTLET.md` declara três estágios de automação e diz,
 * sobre si próprio, em que estágio está:
 *
 *   1. «**Hoje — contrato de prompt**: o agente corre porque o briefing manda e
 *      declara no fecho. NÃO é automático — depende de obediência. É o estágio
 *      Urbach: funciona enquanto muda comportamento, degrada em tick-box.»
 *   2. «**Próximo — enforcement mecânico (O-2):** hook de fecho de wave verifica
 *      a PRESENÇA e a FORMA da declaração `gauntlet:` (grep, como o wave-gate
 *      faz aos testes) — sem declaração, a wave não fecha.»
 *
 * Medido a 2026-09-01: o estágio 2 **não existia**. Zero ficheiros em `tools/`
 * ou `.github/workflows/` verificavam o gauntlet; `tools/wave-gate.mjs` não o
 * menciona uma única vez. Dezoito perguntas escritas, nenhuma aplicada.
 *
 * É literalmente a lição de 2026-08-19, escrita pelo dono depois de um gauntlet
 * o apanhar a ele: «**uma regra escrita não é uma regra aplicada.** O que a
 * aplicou foi um comando de uma linha corrido por outro motor.»
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE FICHEIRO NÃO FAZ
 *
 * Não avalia QUALIDADE. O próprio documento é explícito sobre a divisão:
 * o estágio 2 é «barato, não avalia qualidade, mata o esquecimento»; distinguir
 * «internalizada» de «carimbada às cegas» é trabalho do estágio 3 (o juiz O-1),
 * que não existe e que este ficheiro não finge ser.
 *
 * E **não acrescenta perguntas**. O tecto é 18, com 0 slots, e a regra é
 * explícita: «Um agente **nunca** eleva o tecto sozinho.» Este portão lê as
 * perguntas do documento — não as declara.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A LISTA VEM DO DOCUMENTO, NÃO DAQUI
 *
 * Uma cópia das 18 neste ficheiro seria uma segunda verdade, e no dia em que
 * entrasse uma G19 (ou saísse uma, pela regra entra-uma-sai-uma) o portão
 * continuava a validar contra a lista velha — verde a fingir. Por isso
 * `lerGauntlet()` faz parse do `MEO_GAUNTLET.md`: a régua de disparo, o tecto e
 * os ids saem todos de lá.
 *
 * É o mesmo princípio que o `sync-runtime.js` aplica aos hooks (importa a lista
 * do `sync-hooks.js` em vez de a duplicar) e que o `ollama-host` aplica à
 * escala. Aqui a fonte é um `.md`, não um módulo — o parse é o preço.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * TRÊS ESTADOS, PORQUE DOIS MENTEM
 *
 *   ok         — declarado e completo para a classe
 *   carimbado  — passa, MAS com marca visível. É o que o documento manda quando
 *                não há segundo motor: «o entregável não sai, ou sai carimbado
 *                `não-verificado` — **nunca sai limpo**». Um portão que
 *                colapsasse isto em `ok` apagava exactamente a marca.
 *   falha      — declaração ausente, mal formada, ou incompleta para a classe
 *
 * E `n/d` para o que não se consegue medir (documento ilegível, classe
 * desconhecida) — nunca um verde por omissão.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Uso:
 *   node tools/gauntlet/portao-gauntlet.mjs <ficheiro-ou-texto>
 *   node tools/gauntlet/portao-gauntlet.mjs --stdin
 *   node tools/gauntlet/portao-gauntlet.mjs <f> --json
 *   node tools/gauntlet/portao-gauntlet.mjs --lista     # o que o doc declara
 *
 * Exits: 0 ok · 1 carimbado · 2 n/d (não consegui medir) · 4 falha
 *
 * Nunca lança.
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const DOC_PADRAO = path.resolve(AQUI, '..', '..', 'docs', 'foundation', 'MEO_GAUNTLET.md');

export const ESTADO = Object.freeze({ OK: 'ok', CARIMBADO: 'carimbado', FALHA: 'falha', ND: 'n/d' });
export const EXIT = Object.freeze({ OK: 0, CARIMBADO: 1, ND: 2, FALHA: 4 });

/**
 * As classes da régua de disparo, com o mínimo que cada uma exige.
 *
 * As chaves saem do documento (`| **Trivial** | … |`); o que cada uma exige
 * também — mas o MAPEAMENTO de «G1, G3, G7 auto-aplicadas» para «estes ids têm
 * de aparecer» é interpretação, e por isso está aqui, à vista, em vez de ficar
 * escondido numa regex sobre a tabela.
 */
export const CLASSES = Object.freeze({
  trivial: { exige: [], todas: false, porque: 'reversível em <5 min, não sai da sessão' },
  rotina: { exige: ['G1', 'G3', 'G7'], todas: false, porque: 'o dono vai ler mas não re-verificar linha a linha' },
  'alto risco': { exige: [], todas: true, porque: 'toca produção/secrets/CI/release/site, ou vira masterprompt' },
});

/** Normaliza «Alto Risco», «alto-risco», «ALTO RISCO» → `alto risco`. */
export function normalizarClasse(bruta) {
  const s = String(bruta || '').trim().toLowerCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  if (!s) return null;
  if (s.startsWith('trivial')) return 'trivial';
  if (s.startsWith('rotina')) return 'rotina';
  if (s.startsWith('alto')) return 'alto risco';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// A fonte de verdade: o próprio documento
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Lê o `MEO_GAUNTLET.md` e devolve o que ele DECLARA — ids, tecto, versão.
 * Nunca lança: sem documento, devolve `{ ok:false }` e o portão sai `n/d`.
 */
export function lerGauntlet(docPath = DOC_PADRAO) {
  let src;
  try { src = fs.readFileSync(docPath, 'utf8'); }
  catch (err) {
    return { ok: false, porque: `não consegui ler ${docPath}: ${(err && err.message) || 'erro'}`, ids: [], tecto: null, versao: null };
  }

  // As perguntas vivem em linhas de tabela `| G7 | … |`. Só o id importa aqui:
  // o portão verifica PRESENÇA e FORMA, não conteúdo.
  const ids = [...new Set([...src.matchAll(/^\|\s*(G\d+)\s*\|/gm)].map((m) => m[1]))]
    .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  const mTecto = src.match(/\*\*Tecto\s+(\d+)\s*[·.]\s*(\d+)\s*slots?\*\*/i)
    || src.match(/Tecto\s+\*\*(\d+)\s+efectivas\*\*/i);
  const tecto = mTecto ? Number(mTecto[1]) : null;

  const mVersao = src.match(/^#\s*MEO\s+GAUNTLET\s+(v\d+)/im);
  const versao = mVersao ? mVersao[1] : null;

  const avisos = [];
  if (tecto != null && ids.length !== tecto) {
    // Não é falha do portão — é uma divergência DO DOCUMENTO, e tem de sair
    // alto. Um tecto que não bate com a lista é o primeiro sinal de que uma
    // entrada foi feita sem a saída correspondente.
    avisos.push(`o documento declara tecto ${tecto} mas a tabela tem ${ids.length} perguntas (${ids.join(', ')})`);
  }

  return { ok: ids.length > 0, porque: ids.length ? null : 'não encontrei perguntas Gn no documento', ids, tecto, versao, avisos };
}

// ─────────────────────────────────────────────────────────────────────────────
// A declaração
// ─────────────────────────────────────────────────────────────────────────────

/**
 * O formato fixo, verbatim do documento:
 *
 *   `gauntlet: [classe] · Gn mudou X · G4 em [motor|auto-DEGRADADO|não-verificado] · não corridos: Gn (porquê)`
 *
 * O parse é deliberadamente tolerante na pontuação e ESTRITO no que conta:
 * quem escreve isto à mão no fecho de uma wave não deve ser reprovado por um
 * `·` a menos. O que não se perdoa é a ausência da classe, ou um `G4 em` sem
 * motor — que é onde a mentira cabe.
 */
export function extrairDeclaracao(texto) {
  const src = String(texto == null ? '' : texto);
  const linha = src.split(/\r?\n/).find((l) => /^\s*gauntlet\s*:/i.test(l));
  if (!linha) return { presente: false, porque: 'nenhuma linha começa por `gauntlet:`' };

  const corpo = linha.replace(/^\s*gauntlet\s*:/i, '').trim();
  if (!corpo) return { presente: false, porque: 'a linha `gauntlet:` está vazia' };

  // classe: `[trivial]`, `[alto risco]`, ou a primeira palavra antes do `·`
  const mClasse = corpo.match(/^\[([^\]]+)\]/) || corpo.match(/^([^·|]+?)(?:\s*[·|]|$)/);
  const classe = normalizarClasse(mClasse ? mClasse[1] : null);

  // Perguntas nomeadas em qualquer sítio da linha.
  const mencionadas = [...new Set([...corpo.matchAll(/\bG(\d+)\b/g)].map((m) => `G${m[1]}`))];

  // `não corridos: G2, G6 (porquê)` — aceita com e sem acento, e `nao`.
  const mNao = corpo.match(/n[ãa]o\s+corridos?\s*:\s*([^·|]*)/i);
  const naoCorridos = mNao
    ? [...new Set([...mNao[1].matchAll(/\bG(\d+)\b/g)].map((m) => `G${m[1]}`))]
    : [];
  const justificaNaoCorridos = mNao ? /\(.+\)/.test(mNao[1]) : null;

  // `G4 em <motor>` — o campo onde o crítico≠autor se declara.
  const mG4 = corpo.match(/\bG4\s+em\s+\[?([^\]·|,]+)\]?/i);
  const g4Motor = mG4 ? mG4[1].trim() : null;

  return {
    presente: true,
    linha: linha.trim(),
    classe,
    classe_bruta: mClasse ? mClasse[1].trim() : null,
    mencionadas,
    nao_corridos: naoCorridos,
    justifica_nao_corridos: justificaNaoCorridos,
    g4_motor: g4Motor,
    // «Gn mudou X» é o sinal de que a pergunta MORDEU. Sem nenhum, ou o
    // trabalho era impecável ou o gauntlet foi carimbado — e o documento manda
    // desconfiar da segunda hipótese.
    mudou: /\bmudou\b/i.test(corpo),
  };
}

const G4_SEM_MOTOR = /^(auto[- ]?degradado|n[ãa]o[- ]verificado|nenhum|none|n\/?d)$/i;

// ─────────────────────────────────────────────────────────────────────────────
// O portão
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} texto  o fecho da wave / handoff / corpo do PR
 * @param {object} [opts]
 * @param {string} [opts.docPath]
 * @param {object} [opts.gauntlet]  injecção do `lerGauntlet` (testes)
 * @returns {object} veredicto — nunca lança
 */
export function avaliar(texto, opts = {}) {
  const g = opts.gauntlet || lerGauntlet(opts.docPath);
  const base = { versao: g.versao, tecto: g.tecto, avisos_documento: g.avisos || [] };

  if (!g.ok) {
    return { ...base, estado: ESTADO.ND, porque: g.porque, declaracao: null, em_falta: [], notas: [] };
  }

  const d = extrairDeclaracao(texto);
  if (!d.presente) {
    return {
      ...base, estado: ESTADO.FALHA, declaracao: null, em_falta: [], notas: [],
      porque: `${d.porque}. O formato é: `
        + '`gauntlet: [classe] · Gn mudou X · G4 em [motor] · não corridos: Gn (porquê)`',
    };
  }

  if (!d.classe) {
    return {
      ...base, estado: ESTADO.FALHA, declaracao: d, em_falta: [], notas: [],
      porque: `classe não reconhecida: ${JSON.stringify(d.classe_bruta)}. `
        + `Tem de ser uma de: ${Object.keys(CLASSES).join(' · ')}`,
    };
  }

  const regra = CLASSES[d.classe];
  const notas = [];

  // ── trivial: o documento diz «nenhum». Declarar já é mais do que se exige.
  if (d.classe === 'trivial') {
    return { ...base, estado: ESTADO.OK, declaracao: d, em_falta: [], notas: ['classe trivial — o documento não exige gauntlet'], porque: 'classe trivial' };
  }

  // ── que perguntas a declaração dá por tratadas
  const tratadas = new Set([...d.mencionadas, ...d.nao_corridos]);
  const exigidas = regra.todas ? g.ids : regra.exige;
  const emFalta = exigidas.filter((id) => !tratadas.has(id));

  if (emFalta.length) {
    return {
      ...base, estado: ESTADO.FALHA, declaracao: d, em_falta: emFalta, notas,
      porque: `classe «${d.classe}» exige ${regra.todas ? `as ${exigidas.length}` : exigidas.join(', ')}`
        + ` e a declaração não trata ${emFalta.length}: ${emFalta.join(', ')}.`
        + ' Uma pergunta não corrida conta — mas tem de ser nomeada em `não corridos:` com o porquê.',
    };
  }

  if (d.nao_corridos.length && d.justifica_nao_corridos === false) {
    return {
      ...base, estado: ESTADO.FALHA, declaracao: d, em_falta: [], notas,
      porque: `«não corridos: ${d.nao_corridos.join(', ')}» sem o porquê entre parênteses. `
        + 'Saltar uma pergunta é legítimo; saltá-la em silêncio não.',
    };
  }

  // ── G4: o crítico ≠ autor. É a única pergunta com exigência de FORMA própria.
  if (regra.todas) {
    if (!d.g4_motor) {
      return {
        ...base, estado: ESTADO.FALHA, declaracao: d, em_falta: ['G4'], notas,
        porque: 'classe «alto risco» exige `G4 em [motor]` — o documento diz que a dissidência '
          + 'tem de vir doutro contexto/motor, e sem o campo não há como saber se veio.',
      };
    }
    if (G4_SEM_MOTOR.test(d.g4_motor)) {
      // O documento: «Sem segundo motor disponível: o entregável não sai, ou sai
      // carimbado `não-verificado` — nunca sai limpo.» Passa, com marca.
      notas.push(`G4 sem motor externo (${d.g4_motor}) — o entregável sai CARIMBADO, nunca limpo`);
      return {
        ...base, estado: ESTADO.CARIMBADO, declaracao: d, em_falta: [], notas,
        porque: 'as perguntas estão tratadas, mas o G4 não teve motor diferente. '
          + 'O documento permite — carimbado, nunca limpo.',
      };
    }
  }

  // ── anti-sycophancy. Não bloqueia: não posso PROVAR que nada mudou é falso.
  // Mas o masterprompt manda desconfiar da frase, e o AGENTS.md é mais duro:
  // «o gate DEVE produzir ≥1 objeção real ou declarar o que tentou refutar;
  // gate que só aprova = não rodou».
  if (regra.todas && !d.mudou) {
    notas.push('nenhuma pergunta declarada como tendo MUDADO nada. '
      + 'Um gauntlet de alto risco que só aprova é indistinguível de um gauntlet que não correu — '
      + 'declara o que tentaste refutar.');
  }

  return { ...base, estado: ESTADO.OK, declaracao: d, em_falta: [], notas, porque: `classe «${d.classe}» tratada por inteiro` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────────────────

const SIMBOLO = { ok: 'OK', carimbado: 'CARIMBADO', falha: 'FALHA', 'n/d': 'n/d' };

export function imprimir(v) {
  const L = [];
  L.push(`portao-gauntlet · ${v.versao || 'versão n/d'} · tecto ${v.tecto ?? 'n/d'}`);
  for (const a of v.avisos_documento || []) L.push(`  ⚠ documento: ${a}`);
  if (v.declaracao?.linha) L.push(`  declaração: ${v.declaracao.linha}`);
  L.push('');
  L.push(`  ${SIMBOLO[v.estado] || v.estado}: ${v.porque}`);
  if (v.em_falta?.length) L.push(`  em falta: ${v.em_falta.join(', ')}`);
  for (const n of v.notas || []) L.push(`  · ${n}`);
  if (v.estado === ESTADO.CARIMBADO) {
    L.push('  (carimbado ≠ limpo: passa, e a marca fica no registo)');
  }
  return L.join('\n');
}

export function exitDe(v) {
  return EXIT[String(v.estado).toUpperCase().replace('/', '')] ?? (
    v.estado === ESTADO.ND ? EXIT.ND : EXIT.FALHA
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

async function lerStdin() {
  const partes = [];
  for await (const c of process.stdin) partes.push(c);
  return Buffer.concat(partes).toString('utf8');
}

export async function main(argv) {
  const comoJson = argv.includes('--json');
  const args = argv.filter((a) => !a.startsWith('--'));

  if (argv.includes('--lista')) {
    const g = lerGauntlet();
    console.log(JSON.stringify(g, null, 2));
    return g.ok ? EXIT.OK : EXIT.ND;
  }

  let texto = '';
  if (argv.includes('--stdin')) {
    texto = await lerStdin();
  } else if (args[0]) {
    try { texto = fs.readFileSync(args[0], 'utf8'); }
    catch { texto = args.join(' '); } // trata o argumento como o próprio texto
  } else {
    console.error('uso: node tools/gauntlet/portao-gauntlet.mjs <ficheiro|--stdin> [--json]');
    return EXIT.ND;
  }

  const v = avaliar(texto);
  console.log(comoJson ? JSON.stringify(v, null, 2) : imprimir(v));
  return exitDe(v);
}

const ESTE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ESTE)) {
  main(process.argv.slice(2))
    .then((c) => process.exit(c))
    .catch((err) => {
      console.error(`portao-gauntlet falhou: ${(err && err.message) || err}`);
      process.exit(EXIT.ND);
    });
}
