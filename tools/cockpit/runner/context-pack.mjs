/**
 * context-pack.mjs — builds a REAL, bounded context pack for one local round.
 *
 * Why this file exists: the host-side prototype asked the local model generic
 * questions with zero bytes of the project attached, so 174 receipts came back
 * hallucinating about routers and invoices that do not exist in this repo.
 * A receipt is only worth something if the model saw real lines and can cite
 * them back as `file:line` — which `evidence-verifier.mjs` then checks for free.
 *
 * Deterministic, zero-LLM, zero-network. Reads the repo and nothing else.
 */

import fs from 'node:fs';
import path from 'node:path';

export const MAX_SLICE_LINES = 70;
export const MAX_SLICE_BYTES = 16 * 1024;

/**
 * Candidate files per pillar. Explicit lists (not globs) so a round is
 * reproducible and cheap: no walk, no surprise, and a missing file degrades to
 * `n/d` instead of silently shifting the cursor onto something unrelated.
 */
export const PILLARS = {
  P1: {
    label: 'Routing & Custo',
    files: [
      'tools/router/classify.js',
      'tools/router/inject_context.js',
      'tools/router/statusline.js',
      'packages/router/src/decide-agent.ts',
      'packages/router/src/task-categories.ts',
    ],
    ask:
      'Qual destas linhas é a mais provável de causar um routing errado, um tier ' +
      'a mais, ou um custo inesperado? Escolhe uma e diz porquê.',
  },
  P2: {
    label: 'Qualidade & Verificação',
    files: [
      'tools/cockpit/build-snapshot.js',
      'tools/docs-hygiene.js',
      'tools/handoff-preflight.js',
    ],
    ask:
      'Qual destas linhas pode falhar em silêncio, engolir um erro, ou devolver ' +
      'verde sem prova? Escolhe uma e diz porquê.',
  },
  P3: {
    label: 'Coerência Doc↔Produto',
    files: ['CLAUDE.md', 'AGENTS.md', 'SYNC.md', 'INFRA.md', 'docs/strategy/STRATEGY.md'],
    ask:
      'Qual destas linhas afirma um valor mecânico (sha, comando, caminho, ' +
      'limite, número) que pode já não bater com o código? Escolhe uma e diz porquê.',
  },
  P4: {
    label: 'Segurança & Higiene',
    files: [
      'tools/cockpit/runner/moo-runner.mjs',
      'tools/cockpit/runner/f10-server.mjs',
      '.github/workflows/docs-hygiene.yml',
    ],
    ask:
      'Qual destas linhas deixa o processo continuar quando devia parar, ou expõe ' +
      'algo que devia ficar fechado? Escolhe uma e diz porquê.',
  },
  P5: {
    label: 'Motor Local & GPU',
    files: [
      'tools/cockpit/runner/gpu-sampler.mjs',
      'tools/cockpit/runner/runner-core.mjs',
      'packages/mooter-bench/README.md',
    ],
    ask:
      'Qual destas linhas produz uma métrica que é apresentada como medida mas ' +
      'pode vir nula, estimada ou stale? Escolhe uma e diz porquê.',
  },
  P6: {
    label: 'Produto & Experiência',
    files: [
      'tools/cockpit/runner/evidence-verifier.mjs',
      'tools/cockpit/build-snapshot.js',
      'README.md',
    ],
    ask:
      'Qual destas linhas pode mostrar ao utilizador um campo a zero, vazio ou ' +
      'enganador sem ele perceber porquê? Escolhe uma e diz porquê.',
  },
};

export const PILLAR_IDS = Object.keys(PILLARS);

/**
 * The output contract is deliberately narrow. A first live pass with a softer
 * prompt made qwen2.5-coder:14b answer `SEM ACHADO` on every round: given a wall
 * of numbered lines and an abstract question, bailing was the cheapest path. So
 * the task is now "pick one line from what you see and say why", the answer
 * shape is fixed to two labelled lines, and the empty verdict is moved to the
 * bottom with an explicit bar to clear.
 */
const SYSTEM_PROMPT = [
  'És um revisor do Mooter a correr localmente. Recebes um excerto REAL do',
  'repositório, com o número da linha à esquerda de cada linha.',
  '',
  'A tua tarefa é encontrar um DEFEITO REAL. Não é encontrar algo a dizer.',
  '',
  'Se houver um defeito real, responde EXACTAMENTE assim, sem mais nada:',
  '',
  'ACHADO: <sintoma> QUANDO <condição que o dispara> ENTÃO <impacto concreto>',
  'PROVA: <caminho do ficheiro>:<número da linha>',
  '',
  'O que conta como defeito real (só isto):',
  '- erro que rebenta ou é engolido em silêncio num caminho alcançável;',
  '- risco de segurança concreto (input não validado, permissão larga, segredo exposto);',
  '- a linha contradiz o que o código/doc afirma noutro sítio;',
  '- recurso não libertado, corrida, off-by-one, condição invertida.',
  '',
  'NUNCA cites, em nenhuma circunstância:',
  '- uma linha de comentário (// /* * #), uma linha em branco, uma cerca de código (```);',
  '- markdown, títulos, tabelas ou prosa — cita só linhas EXECUTÁVEIS;',
  '- um `null`/`n/d` que é claramente intencional e honesto (é feature, não bug).',
  '',
  'Frases proibidas (se a tua única queixa for isto, NÃO é achado):',
  '"pode confundir o utilizador", "pode não ser intuitivo", "pode ser null",',
  '"poderia ser melhor documentado", "falta contexto adicional".',
  '',
  'REGRA MAIS IMPORTANTE: se não vires um defeito real neste excerto, responde',
  'apenas SEM ACHADO. Isso é uma resposta CERTA e valiosa — a maioria dos excertos',
  'de código bom não tem defeito. Inventar um achado fraco é o pior erro possível.',
  '',
  'Regras de forma:',
  '- O caminho é o que está no cabeçalho "Ficheiro:".',
  '- O número tem de ser um número que vês à esquerda no excerto.',
  '- Nunca inventes ficheiros nem números.',
  '- Sem preâmbulo, sem explicação extra, sem markdown.',
].join('\n');

/** Reads a file and returns its lines, or null when it does not exist. */
function readLines(repoRoot, relPath) {
  const abs = path.join(repoRoot, relPath);
  let stat;
  try {
    stat = fs.statSync(abs);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  let raw;
  try {
    raw = fs.readFileSync(abs, 'utf8');
  } catch {
    return null;
  }
  return raw.split('\n');
}

/**
 * Picks the candidate file for this round. The cursor rotates over the files
 * that actually exist, so a deleted file shifts the rotation instead of
 * producing an empty round.
 */
export function resolveCandidates(repoRoot, pillarId) {
  const pillar = PILLARS[pillarId];
  if (!pillar) return [];
  return pillar.files.filter((rel) => readLines(repoRoot, rel) !== null);
}

/** Renders a slice with real 1-based line numbers so citations are checkable. */
export function renderSlice(lines, startLine, maxLines = MAX_SLICE_LINES) {
  const start = Math.max(1, startLine);
  const end = Math.min(lines.length, start + maxLines - 1);
  const out = [];
  let bytes = 0;
  let last = start - 1;
  for (let n = start; n <= end; n += 1) {
    const rendered = `${String(n).padStart(5, ' ')}| ${lines[n - 1]}`;
    bytes += Buffer.byteLength(rendered, 'utf8') + 1;
    if (bytes > MAX_SLICE_BYTES) break;
    out.push(rendered);
    last = n;
  }
  return { text: out.join('\n'), startLine: start, endLine: last, count: out.length };
}

/**
 * Builds the pack for one round.
 *
 * @returns {{ok: true, pillar, label, file, startLine, endLine, lineCount,
 *            question, system, prompt, allowedFiles: string[]}}
 *        | {ok: false, reason: string, pillar: string}
 */
export function buildContextPack({ repoRoot, pillar, cursor = 0, maxLines = MAX_SLICE_LINES }) {
  const spec = PILLARS[pillar];
  if (!spec) return { ok: false, reason: `pilar desconhecido: ${pillar}`, pillar };

  const candidates = resolveCandidates(repoRoot, pillar);
  if (candidates.length === 0) {
    return { ok: false, reason: 'nenhum ficheiro-âncora existe no repo', pillar };
  }

  const file = candidates[Math.abs(cursor) % candidates.length];
  const lines = readLines(repoRoot, file);
  if (!lines || lines.length === 0) {
    return { ok: false, reason: `ficheiro vazio: ${file}`, pillar };
  }

  // Second axis of the cursor walks down long files across rounds, so a 900-line
  // file is not forever represented by its first 120 lines.
  const windows = Math.max(1, Math.ceil(lines.length / maxLines));
  const windowIdx = Math.floor(Math.abs(cursor) / candidates.length) % windows;
  const slice = renderSlice(lines, windowIdx * maxLines + 1, maxLines);

  const prompt = [
    `Pilar: ${pillar} — ${spec.label}`,
    `Ficheiro: ${file} (linhas ${slice.startLine}-${slice.endLine} de ${lines.length})`,
    '',
    slice.text,
    '',
    spec.ask,
  ].join('\n');

  return {
    ok: true,
    pillar,
    label: spec.label,
    file,
    startLine: slice.startLine,
    endLine: slice.endLine,
    lineCount: lines.length,
    question: spec.ask,
    system: SYSTEM_PROMPT,
    prompt,
    allowedFiles: [file],
  };
}
