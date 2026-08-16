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
};

const CITATION_RE =
  /([A-Za-z0-9_.\-/]+\.(?:js|mjs|cjs|ts|tsx|jsx|md|json|ya?ml|html|sh|py|command|txt)):(\d+)/g;

const MAX_CITATIONS = 12;

/** A model that finds nothing must be able to say so without being punished. */
export function isNoFinding(text) {
  return /\bSEM\s+ACHADO\b/i.test(String(text || ''));
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
export function verifyEvidence({ repoRoot, text, allowedFiles = [] }) {
  if (isNoFinding(text)) {
    return {
      verdict: VERDICT.NO_FINDING,
      citations: [],
      checked: 0,
      failed: 0,
      offSlice: 0,
      evidence: 'sem-achado: a ronda declarou nada a reportar',
    };
  }

  const citations = extractCitations(text);
  if (citations.length === 0) {
    return {
      verdict: VERDICT.UNCITED,
      citations: [],
      checked: 0,
      failed: 0,
      offSlice: 0,
      evidence: 'sem-citacao: resposta sem ficheiro:linha, nao verificavel',
    };
  }

  const allow = new Set(allowedFiles);
  const checked = citations.map((c) => {
    const res = checkCitation(repoRoot, c);
    return { ...res, off_slice: res.ok && allow.size > 0 && !allow.has(res.file) };
  });

  const failed = checked.filter((c) => !c.ok);
  const offSlice = checked.filter((c) => c.off_slice).length;

  if (failed.length > 0) {
    const first = failed[0];
    return {
      verdict: VERDICT.REFUTED,
      citations: checked,
      checked: checked.length,
      failed: failed.length,
      offSlice,
      evidence: `refutado: ${first.file}:${first.line} ${first.reason}`,
    };
  }

  const head = checked[0];
  return {
    verdict: VERDICT.CITED,
    citations: checked,
    checked: checked.length,
    failed: 0,
    offSlice,
    // "linha existe", never "achado confirmado" — the claim stays untriaged.
    evidence: `citacao-ok (achado NAO triado): ${head.file}:${head.line} => ${head.snippet}`,
  };
}

/** Rolls a ledger of receipts into the honest counters the cockpit shows. */
export function tallyVerdicts(receipts) {
  const tally = {
    total: 0,
    [VERDICT.CITED]: 0,
    [VERDICT.REFUTED]: 0,
    [VERDICT.UNCITED]: 0,
    [VERDICT.NO_FINDING]: 0,
    erro: 0,
  };
  for (const r of receipts || []) {
    tally.total += 1;
    const v = r && r.verdict;
    if (v && Object.prototype.hasOwnProperty.call(tally, v)) tally[v] += 1;
    else tally.erro += 1;
  }
  return tally;
}
