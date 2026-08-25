/**
 * alignment.mjs — "o projeto está alinhado?" answered by measurement only.
 *
 * Every field here is either measured or `null`. There is no default-true and no
 * default-zero: a git command that fails, a vault that is not mounted, an
 * upstream that does not exist — all of those produce `null` plus a reason, so
 * the cockpit renders `n/d` instead of a green tick nobody earned.
 *
 * Nothing in this file touches the network. `behind/ahead` is computed against
 * the upstream ref already on disk, so an offline device reports an honestly
 * stale comparison rather than blocking or inventing one.
 */

import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const GIT_TIMEOUT_MS = 4000;
const VAULT_SCAN_LIMIT = 400;

/** The canon sha lives in CLAUDE.md; parsing it is how doc and code stay tied. */
const CANON_SHA_RE = /`([0-9a-f]{64})`/;

function git(repoRoot, args, timeoutMs = GIT_TIMEOUT_MS) {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', repoRoot, ...args],
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true },
      (err, stdout) => resolve(err ? null : String(stdout).trim()),
    );
  });
}

/** `null` when git cannot answer — never `true`, never `0`. */
export function parseAheadBehind(text) {
  if (text === null || text === undefined) return { ahead: null, behind: null };
  const m = /^(\d+)\s+(\d+)$/.exec(String(text).trim());
  if (!m) return { ahead: null, behind: null };
  return { behind: Number(m[1]), ahead: Number(m[2]) };
}

/** Extracts the declared sha from the canon doc. Unparseable => null. */
export function parseCanonSha(claudeMd) {
  if (!claudeMd) return null;
  for (const line of String(claudeMd).split('\n')) {
    if (!/classify\.js|CI-enforced|sha256/i.test(line)) continue;
    const m = CANON_SHA_RE.exec(line);
    if (m) return m[1];
  }
  const any = CANON_SHA_RE.exec(String(claudeMd));
  return any ? any[1] : null;
}

export function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Confronts the frozen classifier against the sha its own canon declares.
 * A missing file or an unparseable canon is `null` — an unknown invariant is
 * not a satisfied one.
 */
export function checkClassifySha(repoRoot, { readImpl = fs.readFileSync } = {}) {
  let actual = null;
  let declared = null;
  try {
    actual = sha256(readImpl(path.join(repoRoot, 'tools', 'router', 'classify.js')));
  } catch {
    return { ok: null, motivo: 'classify.js unreadable', declarado: null, medido: null };
  }
  try {
    declared = parseCanonSha(String(readImpl(path.join(repoRoot, 'CLAUDE.md'), 'utf8')));
  } catch {
    return { ok: null, motivo: 'CLAUDE.md unreadable', declarado: null, medido: actual };
  }
  if (!declared) {
    return { ok: null, motivo: 'canon does not declare a sha', declarado: null, medido: actual };
  }
  return {
    ok: declared === actual,
    motivo: declared === actual ? null : 'code sha diverges from canon',
    declarado: declared,
    medido: actual,
  };
}

/**
 * Most recent write inside the vault. Bounded scan of the top two levels: the
 * point is "did the vault move today", not a full index.
 */
export function vaultLastWrite(vaultPath, { readdirImpl = fs.readdirSync, statImpl = fs.statSync } = {}) {
  const fonte = vaultPath ? 'VAULT_PATH' : 'convencao';
  const target = vaultPath || defaultVaultPath();
  if (!target) return { ts: null, ficheiro: null, fonte: 'n/d', motivo: 'no vault path' };
  let top;
  try {
    top = readdirImpl(target, { withFileTypes: true });
  } catch {
    return { ts: null, ficheiro: null, fonte, caminho: target, motivo: 'vault not mounted' };
  }
  let bestMs = 0;
  let bestFile = null;
  let seen = 0;
  let ilegiveis = 0;
  for (const entry of top) {
    if (entry.name.startsWith('.')) continue;
    const abs = path.join(target, entry.name);
    const children = entry.isDirectory() ? safeList(abs, readdirImpl) : [entry.name];
    // `null` = a pasta existe e nao se deixou ler. Daqui vinha `[]`, o que a
    // tornava indistinguivel de uma pasta vazia: a escrita mais recente do
    // vault podia estar exactamente la dentro e o cockpit datava o vault com
    // uma leitura mais velha, apresentada como se fosse a medida completa.
    if (children === null) { ilegiveis += 1; continue; }
    const base = entry.isDirectory() ? abs : target;
    for (const child of children) {
      if (seen >= VAULT_SCAN_LIMIT) break;
      seen += 1;
      try {
        const st = statImpl(path.join(base, child));
        if (st.isFile() && st.mtimeMs > bestMs) {
          bestMs = st.mtimeMs;
          bestFile = path.relative(target, path.join(base, child));
        }
      } catch {
        /* an unreadable entry is not a reason to lie about the rest */
      }
    }
  }
  if (!bestFile) {
    return {
      ts: null,
      ficheiro: null,
      fonte,
      caminho: target,
      // "nao ha ficheiros" e "nao consegui la chegar" nao sao a mesma frase.
      motivo: ilegiveis
        ? `vault partially unreadable (${ilegiveis} folder(s))`
        : 'vault has no readable files',
      pastas_ilegiveis: ilegiveis,
    };
  }
  return {
    ts: new Date(bestMs).toISOString(),
    ficheiro: bestFile,
    // Provenance travels with the value: a vault found by convention is not the
    // same claim as one the machine actually declared via VAULT_PATH.
    fonte,
    caminho: target,
    // > 0 quer dizer que este `ts` e o mais recente do que SE CONSEGUIU LER, e
    // nao necessariamente o mais recente do vault. Quem apresenta o valor tem
    // de poder ver a ressalva; antes nao existia nada que a carregasse.
    motivo: ilegiveis ? `partial scan: ${ilegiveis} folder(s) unreadable` : null,
    pastas_ilegiveis: ilegiveis,
  };
}

/** Project canon puts the vault at the home root on both OSes (AGENTS.md). */
function defaultVaultPath() {
  const home = process.env.HOME || process.env.USERPROFILE;
  return home ? path.join(home, 'paulo-vault') : null;
}

/** `null` = nao se deixou ler. Uma lista vazia seria uma pasta vazia — e isso
 *  e uma afirmacao sobre o conteudo que aqui nao se chegou a medir. */
function safeList(dir, readdirImpl) {
  try {
    return readdirImpl(dir);
  } catch {
    return null;
  }
}

/**
 * The whole alignment block.
 *
 * @returns {Promise<object>} every key measured or null-with-reason
 */
/**
 * O processo esta a correr o codigo que esta em disco?
 *
 * TRES VEZES EM TRES DIAS: o `main` recebe uma correccao, o processo em memoria
 * continua com o codigo velho, e ninguem nota. O `SYNC.md:468` ja documentava a
 * segunda ocorrencia — documentar nao corrigiu, porque o defeito nao era
 * esquecimento: era nao haver NADA que o tornasse visivel. O runner nao tem
 * supervisor que o recarregue (o watchdog agendado vigia uma app pm2, nao este
 * processo), e um `import` e estatico.
 *
 * Nao se resolve com um reinicio automatico — reiniciar sozinho um loop que
 * escreve no ledger e uma decisao que nao me pertence. Resolve-se dizendo-o, no
 * mesmo sitio onde a pausa e a reserva se dizem.
 *
 * `null` em `desactualizado` quer dizer "nao consegui comparar" — nunca `false`.
 * Uma comparacao que falhou nao e uma comparacao que passou.
 */
export function verDeriva(shaCarregado, shaEmDisco) {
  const a = shaCarregado ? String(shaCarregado) : null;
  const b = shaEmDisco ? String(shaEmDisco) : null;
  if (!a || !b) return { sha_carregado: a, sha_disco: b, desactualizado: null };
  return { sha_carregado: a, sha_disco: b, desactualizado: a !== b };
}

export async function buildAlignment({
  repoRoot,
  vaultPath = process.env.VAULT_PATH || null,
  // O sha que o processo tinha quando arrancou. Ausente = quem chama nao o
  // sabe, e entao a deriva fica `null` em vez de fingir que esta tudo bem.
  shaCarregado = null,
  shaEmDisco = null,
  gitImpl = git,
  readImpl = fs.readFileSync,
} = {}) {
  const [branch, porcelain, upstream] = await Promise.all([
    gitImpl(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']),
    gitImpl(repoRoot, ['status', '--porcelain']),
    gitImpl(repoRoot, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']),
  ]);

  const counts = upstream
    ? parseAheadBehind(await gitImpl(repoRoot, ['rev-list', '--left-right', '--count', `${upstream}...HEAD`]))
    : { ahead: null, behind: null };

  const dirty = porcelain === null ? null : porcelain.split('\n').filter((l) => l.trim());
  const tracked = dirty === null ? null : dirty.filter((l) => !l.startsWith('??'));

  return {
    repo_branch: branch,
    // Untracked scratch is separated from tracked edits: conflating them made
    // the repo look permanently dirty and trained the eye to ignore the field.
    repo_clean: tracked === null ? null : tracked.length === 0,
    repo_sujo_rastreado: tracked === null ? null : tracked.length,
    repo_untracked: dirty === null ? null : dirty.length - (tracked ? tracked.length : 0),
    upstream: upstream || null,
    ahead: counts.ahead,
    behind: counts.behind,
    // No fetch happens here, so the comparison is only as fresh as the last one.
    comparacao: upstream ? 'against local ref, no fetch' : 'no upstream configured',
    classify_sha: checkClassifySha(repoRoot, { readImpl }),
    vault: vaultLastWrite(vaultPath),
    // Viaja aqui porque este objecto ja vai no beacon e ja paga o custo do git:
    // um campo novo no ciclo quente seriam ~3400 `rev-parse` por dia para dizer
    // quase sempre a mesma coisa.
    codigo: verDeriva(shaCarregado, shaEmDisco),
  };
}
