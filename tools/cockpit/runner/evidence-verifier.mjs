/**
 * evidence-verifier.mjs — the L0 gate that turns "nao-verificado" into a verdict.
 *
 * Zero LLM, zero network, zero cost: it reads the model's answer, extracts every
 * `path:line` citation, and confronts each one with the real file on disk. A
 * citation that points at a file that does not exist, or past the end of the
 * file, is a fabricated reference and sinks the whole receipt.
 *
 * The host-side prototype stamped every receipt `ollama:<model> nao-verificado`
 * regardless of content, which is how 174 hallucinated findings were counted as
 * work. This module is the difference between a counter and a proof.
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Verdicts, ordered from best to worst.
 *
 * `citacao-ok` is deliberately NOT called "verificado": this gate proves the
 * cited line exists and shows what is on it — it does NOT prove the finding is
 * correct. Labelling an untriaged claim "verificado" would be exactly the
 * green-that-lies this runner exists to remove. Triage of the claim itself is a
 * separate, human- or critic-side step.
 */
export const VERDICT = {
  CITED: 'citacao-ok',
  REFUTED: 'refutado',
  UNCITED: 'sem-citacao',
  NO_FINDING: 'sem-achado',
  // Uma ronda que nao chegou ao modelo por nao haver nada para rever. Nao e
  // um veredicto sobre uma resposta: e a ausencia de resposta, e ate hoje
  // vestia-se de `sem-citacao`.
  NOT_RUN: 'nada-por-rever',
};

const CITATION_RE =
  /([A-Za-z0-9_.\-/]+\.(?:js|mjs|cjs|ts|tsx|jsx|md|json|ya?ml|html|sh|py|command|txt)):(\d+)/g;

const MAX_CITATIONS = 12;

/** A model that finds nothing must be able to say so without being punished. */
/**
 * O carimbo de ronda vazia, nas DUAS linguas.
 *
 * O contrato partilhado pede `SEM ACHADO`; duas perguntas de pilar (P7, P8)
 * pedem `NO FINDING`. O modelo recebe as duas instrucoes na mesma volta e
 * responde numa das duas — e quem le tem de aceitar ambas. Enquanto so se
 * reconhecia a portuguesa, uma ronda honestamente vazia em ingles caia em
 * `sem-citacao`: o painel contava-a como resposta por verificar, e o modelo
 * era castigado por ter feito exactamente o que lhe pediram.
 */
export const SEM_ACHADO_RE = /\b(SEM\s+ACHADO|NO\s+FINDING|EVERY\s+CALL\s+ONCE|NO\s+SEED\s+EXITS|THEY\s+MATCH|SHAPE\s+IS\s+UNIQUE|EVERY\s+NUMBER\s+HAS\s+AN\s+ORIGIN|COMPLETE)\b/i;

/** Palavras com que uma resposta se desdiz depois de ter dito que nao ha nada. */
export const CONTRADIZ_RE = /\b(however|but|although|porem|por[eé]m|contudo|no entanto|todavia|entretanto|mas)\b/i;

export function isNoFinding(text) {
  const t = String(text || '');
  if (!SEM_ACHADO_RE.test(t)) return false;
  // ⚠️ O carimbo tem de ser a resposta INTEIRA, nao o principio dela.
  //
  // Medido a 2026-08-19 num A/B com defeito plantado: perguntando ao modelo
  // para COMPARAR dois numeros, ele respondeu
  //
  //     "NO FINDING. The comment on line 20 states 75 ... However, the code on
  //      line 21 uses 300. The numbers do not match digit by digit."
  //
  // — apanhou o defeito, e comecou por dizer que nao havia nenhum. Com o teste
  // a procurar o carimbo em qualquer sitio do texto, um achado CERTO era
  // classificado como ronda vazia e deitado fora.
  //
  // Tirado o carimbo e a pontuacao, o que sobra decide: uma ronda mesmo vazia
  // nao tem mais nada para dizer.
  // O sinal NAO e o comprimento — um "SEM ACHADO: todas as linhas conferem" e
  // uma ronda vazia legitima que se explica. O sinal e a CONTRADICAO: quem diz
  // "nao ha nada" e depois escreve "no entanto" acabou de encontrar alguma
  // coisa, e o carimbo com que comecou nao vale mais do que o que se seguiu.
  const resto = t.replace(SEM_ACHADO_RE, ' ');
  return !CONTRADIZ_RE.test(resto);
}

/** Extracts unique `file:line` pairs, capped so a runaway answer cannot stall a round. */
export function extractCitations(text) {
  const seen = new Set();
  const out = [];
  const src = String(text || '');
  CITATION_RE.lastIndex = 0;
  let m;
  while ((m = CITATION_RE.exec(src)) !== null) {
    const file = m[1].replace(/^\.\//, '');
    const line = Number(m[2]);
    const key = `${file}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ file, line });
    if (out.length >= MAX_CITATIONS) break;
  }
  return out;
}

/** Rejects anything that escapes the repo before it ever reaches the filesystem. */
function insideRepo(repoRoot, relPath) {
  const root = path.resolve(repoRoot);
  const abs = path.resolve(root, relPath);
  return abs === root || abs.startsWith(root + path.sep) ? abs : null;
}

/**
 * Confronts one citation with disk.
 * @returns {{file, line, ok: boolean, reason: string, snippet: string|null}}
 */
export function checkCitation(repoRoot, { file, line }) {
  const abs = insideRepo(repoRoot, file);
  if (!abs) return { file, line, ok: false, reason: 'fora-do-repo', snippet: null };
  if (!Number.isInteger(line) || line < 1) {
    return { file, line, ok: false, reason: 'linha-invalida', snippet: null };
  }
  let raw;
  try {
    if (!fs.statSync(abs).isFile()) {
      return { file, line, ok: false, reason: 'nao-e-ficheiro', snippet: null };
    }
    raw = fs.readFileSync(abs, 'utf8');
  } catch {
    return { file, line, ok: false, reason: 'ficheiro-inexistente', snippet: null };
  }
  const lines = raw.split('\n');
  if (line > lines.length) {
    return {
      file,
      line,
      ok: false,
      reason: `linha-fora-do-ficheiro (tem ${lines.length})`,
      snippet: null,
    };
  }
  return {
    file,
    line,
    ok: true,
    reason: 'ok',
    snippet: lines[line - 1].trim().slice(0, 160),
  };
}

/**
 * Verifies a whole answer.
 *
 * Rules, deliberately strict — a receipt that cannot be checked is not a receipt:
 *  - literal `SEM ACHADO`            → `sem-achado` (honest empty round)
 *  - no citation at all              → `sem-citacao`
 *  - any citation fails on disk      → `refutado` (fabricated reference)
 *  - all citations resolve           → `verificado`
 *
 * `allowedFiles` is advisory: citing a real file outside the slice is still a
 * real citation, so it is recorded as `off_slice` rather than refuted.
 *
 * @returns {{verdict: string, citations: Array, checked: number, failed: number,
 *            offSlice: number, evidence: string}}
 */
/**
 * A CONCLUSAO do modelo, lida do prefixo que ele proprio escreve.
 *
 * O `verdict` responde a uma pergunta so: "a linha citada existe no disco?".
 * Nunca respondeu a "o modelo achou alguma coisa?". Resultado medido a
 * 2026-08-18: dos 1888 recibos com verdict `citacao-ok`, 614 (32,5%) eram o
 * modelo a escrever FALSO POSITIVO — ou seja, um TERCO do numero verde do
 * painel era o motor a dizer que NAO ha problema. Sao dois eixos diferentes e
 * tem de viver em dois campos diferentes.
 */
/**
 * A conclusao de uma resposta QUE CITOU, quando o prefixo nao bate com nenhum
 * dos formatos conhecidos.
 *
 * Medido a 2026-08-19, 115 rondas de uma hora: 22 (19%) sairam
 * `indeterminado` — o modelo tinha citado uma linha REAL e o parser deitava a
 * resposta fora. O que ele escrevia:
 *
 *     10x  "COMPLETE PROOF: docs/...md:20"
 *      4x  "LINE 73: optedIn(prefs()) ... REPEATED: LINE 83"
 *      2x  "BROKEN: ..."
 *
 * O `LINE 73 ... REPEATED: LINE 83` e EXACTAMENTE o que o P9 pede — repeticao,
 * com as duas linhas citadas. O modelo fez o trabalho e o parser chamou-lhe
 * indeterminado, porque as perguntas dos pilares passaram a ingles e o bloco de
 * formato partilhado continua a exigir `ACHADO:`. Duas instrucoes, uma volta.
 *
 * A regra passa a ser a substancia e nao o prefixo: se citou uma linha que
 * existe, nao disse que nao havia nada, e nao se declarou falso positivo,
 * entao reportou alguma coisa. So 2 de 115 chegavam a fila; a diferenca era
 * formatacao.
 */
export function conclusaoDeCitacao(text) {
  const c = concluir(text);
  return c === 'indeterminado' ? 'achado' : c;
}

export function concluir(text) {
  const t = String(text || '').trim().toUpperCase();
  if (!t) return 'vazio';
  if (t.startsWith('FALSO POSITIVO') || t.startsWith('FALSE POSITIVE')) return 'falso-positivo';
  // A ordem importa: `NO FINDING` tem de ser lido ANTES de `FINDING:`, senao
  // uma ronda vazia em ingles seria lida como um achado.
  if (SEM_ACHADO_RE.test(t)) return 'sem-achado';
  if (/\b(ACHADO|FINDING)\s*:/.test(t)) return 'achado';
  return 'indeterminado';
}

export function verifyEvidence({ repoRoot, text, allowedFiles = [], window: win = null }) {
  const citations = extractCitations(text);

  // ORDER MATTERS. The first version tested `SEM ACHADO` before extracting
  // citations, which meant an answer containing both the escape hatch and a
  // fabricated citation returned the most benign verdict without the disk ever
  // being touched — the exact hole this module exists to close. The empty
  // verdict is now only available to an answer that cites nothing at all.
  if (citations.length === 0) {
    return isNoFinding(text)
      ? {
          conclusao: concluir(text),
      verdict: VERDICT.NO_FINDING, citations: [], checked: 0, failed: 0,
          offWindow: 0, evidence: 'no finding: the round reported nothing',
        }
      : {
          conclusao: concluir(text),
      verdict: VERDICT.UNCITED, citations: [], checked: 0, failed: 0,
          offWindow: 0, evidence: 'uncited: answer has no file:line, not verifiable',
        };
  }

  const allow = new Set(allowedFiles);
  const checked = citations.map((c) => {
    const res = checkCitation(repoRoot, c);
    const offFile = res.ok && allow.size > 0 && !allow.has(res.file);
    // A real line the model was never shown is not evidence of reading — it is
    // a lucky guess. Both "wrong file" and "right file, unseen line" count.
    const offLine =
      res.ok && win && res.file === win.file && (res.line < win.startLine || res.line > win.endLine);
    return { ...res, off_window: Boolean(offFile || offLine) };
  });

  const failed = checked.filter((c) => !c.ok);
  const offWindow = checked.filter((c) => c.off_window).length;

  if (failed.length > 0) {
    const first = failed[0];
    return {
      conclusao: concluir(text),
      verdict: VERDICT.REFUTED,
      citations: checked, checked: checked.length, failed: failed.length, offWindow,
      evidence: `refuted: ${first.file}:${first.line} ${first.reason}`,
    };
  }

  // Prefer a citation inside the window as the headline evidence, so the string
  // the owner reads is the strongest one available rather than merely the first.
  const head = checked.find((c) => !c.off_window) || checked[0];
  const blank = !head.snippet;
  const suffix = offWindow > 0 ? ` · ${offWindow} citation(s) outside the shown window` : '';
  return {
    // Citou uma linha que existe: a conclusao vem da substancia, nao do prefixo.
    conclusao: conclusaoDeCitacao(text),
    verdict: blank && offWindow === checked.length ? VERDICT.UNCITED : VERDICT.CITED,
    citations: checked, checked: checked.length, failed: 0, offWindow,
    // "linha existe", never "achado confirmado" — the claim stays untriaged.
    // A blank cited line is said out loud instead of rendering as green nothing.
    evidence: blank
      ? `cited (finding NOT triaged): ${head.file}:${head.line} => BLANK LINE${suffix}`
      : `cited (finding NOT triaged): ${head.file}:${head.line} => ${head.snippet}${suffix}`,
  };
}

/** Rolls a ledger of receipts into the honest counters the cockpit shows. */
/**
 * Uma ronda que NUNCA chegou ao modelo.
 *
 * O `runner-core` carimbava `sem-citacao` numa ronda sem contexto — 0 s de
 * GPU, 0 tokens, modelo nunca chamado. O painel mostrava-a debaixo de um
 * cartao que diz "what the GPU shipped", como se o modelo tivesse falhado em
 * citar. Medido a 2026-08-19 no ledger do dono: 209 dos 275 `sem-citacao`
 * (76%) eram isto. O numero verdadeiro de "o modelo respondeu sem citar" era
 * 66, e ninguem podia sabe-lo.
 *
 * A leitura e RETROACTIVA de proposito: os 209 recibos antigos ja trazem
 * `esgotado: true`, portanto a correccao vale para o historico todo sem
 * reescrever uma linha do ledger.
 */
export function naoCorreu(r) {
  if (!r) return false;
  if (r.esgotado === true || r.esgotado === 'true') return true;
  return r.verdict === VERDICT.NOT_RUN;
}

export function tallyVerdicts(receipts) {
  const tally = {
    total: 0,
    [VERDICT.CITED]: 0,
    [VERDICT.REFUTED]: 0,
    [VERDICT.UNCITED]: 0,
    [VERDICT.NO_FINDING]: 0,
    [VERDICT.NOT_RUN]: 0,
    erro: 0,
  };
  for (const r of receipts || []) {
    tally.total += 1;
    // Primeiro pergunta-se se a ronda chegou a correr. Um recibo antigo diz
    // `sem-citacao` E `esgotado: true` ao mesmo tempo; ganha o esgotado.
    if (naoCorreu(r)) { tally[VERDICT.NOT_RUN] += 1; continue; }
    const v = r && r.verdict;
    if (v && Object.prototype.hasOwnProperty.call(tally, v)) tally[v] += 1;
    else tally.erro += 1;
  }
  return tally;
}
