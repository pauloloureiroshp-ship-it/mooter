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
import { execFileSync } from 'node:child_process';
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

/**
 * Modo DIFF — o degrau mais alto da escada.
 *
 * Uma analise estatica sobre um repo parado da um conjunto FINITO de achados:
 * depois de julgados, o poco seca e a GPU passa a moer ruido. Codigo que MUDA
 * gera trabalho novo para sempre. Por isso o runner olha primeiro para o diff.
 */
export const DIFF_SYSTEM_PROMPT = [
  'És um revisor de código do Mooter a correr localmente. Recebes linhas que',
  'MUDARAM agora, com o número real de cada linha à esquerda.',
  '',
  'A tua tarefa: encontrar defeitos INTRODUZIDOS por estas linhas.',
  '',
  'EXAMINA COM ATENÇÃO ESPECIAL, linha a linha:',
  '- condições booleanas: o && / || / ! está correcto? inverter uma condição de',
  '  permissão ou de guarda é o defeito mais caro que existe;',
  '- índices e limites: <= vs <, length vs length-1, o primeiro e o último passo',
  '  do ciclo — percorre-os mentalmente com um caso concreto;',
  '- caminhos de erro: algo rebenta ou é engolido onde é alcançável?',
  '- recursos: fica alguma coisa aberta, presa ou por libertar?',
  '- o contrato com quem chama: o retorno mudou de forma, tipo ou significado?',
  '',
  'Se encontrares um defeito, responde EXACTAMENTE assim, sem mais nada:',
  '',
  'ACHADO: <sintoma> QUANDO <condição que o dispara> ENTÃO <impacto concreto>',
  'PROVA: <caminho do ficheiro>:<número da linha>',
  '',
  'Se percorreste a lista acima e a mudança está correcta, responde apenas:',
  '',
  'SEM ACHADO',
  '',
  'Regras:',
  '- NÃO comentes estilo, nomes, formatação, nem "podia estar mais documentado".',
  '  Isso não é defeito e não conta.',
  '- Mas um defeito REAL nunca pode passar em silêncio: se a lógica está errada,',
  '  diz. Ficar calado perante um bug é pior do que um falso alarme.',
  '- Cita só linhas que vês. Nunca inventes ficheiros nem números.',
].join('\n');

/**
 * Deteccao de logica de NEGACAO — o ponto cego medido do tier local.
 *
 * O canario de 2026-08-17 mostrou-o e a producao confirmou-o no mesmo dia: o
 * qwen2.5-coder:14b le `!==` como `===`. Falhou uma condicao de permissao
 * invertida no canario e, horas depois, acusou de fail-open um `isStopped` que
 * e fail-closed — as duas vezes por ler a negacao ao contrario.
 *
 * Nao se conserta isto com prompt: e o tecto do modelo. O que se pode fazer e
 * SABER quando estamos nesse terreno, e nao vender a resposta como certa.
 */
const NEGACAO_RE = /!==|!=|!\s*\(|![A-Za-z_$]|\bnunca\b|\bnever\b/g;

/** Quantos operadores de negacao aparecem no texto dado. */
export function contarNegacoes(texto) {
  const m = String(texto || '').match(NEGACAO_RE);
  return m ? m.length : 0;
}

/**
 * Um excerto e "denso em negacao" a partir de dois operadores, ou de um so
 * quando esse um decide um caminho (if/return/ternario) — que e onde inverter
 * o sentido custa caro.
 */
export function negacaoDensa(texto) {
  const n = contarNegacoes(texto);
  if (n >= 2) return true;
  if (n === 1) return /\b(if|return|while|\?)\b/.test(String(texto || ''));
  return false;
}

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

/**
 * Lê as linhas que mudaram entre `baseRef` e HEAD. Devolve [] em qualquer falha
 * — um repo sem git, um ref inexistente ou um diff vazio nunca podem parar uma
 * ronda; o runner cai para o degrau seguinte da escada.
 */
export function readChangedLines(repoRoot, { baseRef = 'HEAD~1', runImpl = null, maxFiles = 40 } = {}) {
  const run = runImpl || ((args) =>
    execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }));
  let out;
  try {
    out = run(['diff', '--unified=0', '--no-color', `${baseRef}...HEAD`]);
  } catch {
    return [];
  }
  const hunks = [];
  let file = null;
  for (const line of String(out || '').split('\n')) {
    if (line.startsWith('+++ b/')) {
      const rel = line.slice(6).trim();
      const dot = rel.lastIndexOf('.');
      file = dot >= 0 && CODE_EXT.has(rel.slice(dot)) ? rel : null;
      continue;
    }
    if (!file || !line.startsWith('@@')) continue;
    // @@ -a,b +c,d @@ — só interessa o lado novo.
    const m = /\+(\d+)(?:,(\d+))?/.exec(line);
    if (!m) continue;
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (!Number.isInteger(start) || start < 1 || count < 1) continue;
    hunks.push({ file, start, count });
    if (hunks.length >= maxFiles * 8) break;
  }
  return hunks;
}

/**
 * Modo ANCORADO. O moo deixa de caçar achados (o que media 85% de nitpick) e passa
 * a julgar um achado que uma MÁQUINA já encontrou. Um LLM é bom a julgar contexto
 * e mau a ser detetor primário — por isso o detetor é o eslint e o juiz é o moo.
 */
export const ANCHORED_SYSTEM_PROMPT = [
  'És um revisor do Mooter a correr localmente. Uma ferramenta de análise estática',
  'apontou uma linha. O teu trabalho é JULGAR esse apontamento — não procurar outro.',
  '',
  'Responde EXACTAMENTE num destes dois formatos, sem mais nada:',
  '',
  'ACHADO: <sintoma> QUANDO <condição que o dispara> ENTÃO <impacto concreto>',
  'PROVA: <caminho do ficheiro>:<número da linha>',
  '',
  'ou, se o apontamento não for um defeito real neste contexto:',
  '',
  'FALSO POSITIVO: <porque é seguro aqui, numa frase>',
  'PROVA: <caminho do ficheiro>:<número da linha>',
  '',
  'Regras:',
  '- Cita a MESMA linha que a ferramenta apontou.',
  '- FALSO POSITIVO é uma resposta CERTA e valiosa — muitos avisos são intencionais',
  '  (um `null` honesto, um catch que é mesmo para engolir, um regex sobre input fixo).',
  '- Nunca inventes ficheiros nem números. Sem preâmbulo, sem markdown.',
].join('\n');

/** Regras que valem mais: defeito provável primeiro, estilo/ruído por último. */
const RULE_PRIORITY = {
  'require-atomic-updates': 0,
  'no-dupe-keys': 1,
  'no-unreachable': 1,
  'no-self-compare': 1,
  'no-fallthrough': 2,
  'no-empty': 3,
  'security/detect-child-process': 3,
  'security/detect-unsafe-regex': 5,
};

/**
 * Lê os achados da âncora estática. Devolve [] em qualquer falha — uma âncora
 * ausente nunca deve parar uma ronda, só faz o runner voltar ao modo de caça.
 */
export function readAnchor(anchorPath, { readImpl = fs.readFileSync } = {}) {
  if (!anchorPath) return [];
  let raw;
  try {
    raw = readImpl(anchorPath, 'utf8');
  } catch {
    return [];
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((x) => x && typeof x.file === 'string' && Number.isInteger(x.line) && x.line > 0)
    .sort((a, b) => {
      const pa = RULE_PRIORITY[a.rule] ?? 4;
      const pb = RULE_PRIORITY[b.rule] ?? 4;
      if (pa !== pb) return pa - pb;
      return String(a.file).localeCompare(String(b.file));
    });
}

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
export function buildContextPack({
  repoRoot,
  pillar,
  cursor = 0,
  maxLines = MAX_SLICE_LINES,
  anchorPath = null,
  diffBase = null,
}) {
  const spec = PILLARS[pillar];
  if (!spec) return { ok: false, reason: `pilar desconhecido: ${pillar}`, pillar };

  // ---- degrau 1: DIFF — rever o que mudou (trabalho infinito enquanto houver commits)
  if (diffBase) {
    const hunks = readChangedLines(repoRoot, { baseRef: diffBase });
    if (hunks.length > 0) {
      const h = hunks[Math.abs(cursor) % hunks.length];
      const lines = readLines(repoRoot, h.file);
      if (lines && lines.length > 0 && h.start <= lines.length) {
        const pad = 8; // contexto à volta da mudança, para o juiz perceber o que a rodeia
        const slice = renderSlice(lines, Math.max(1, h.start - pad), Math.min(maxLines, h.count + pad * 2));
        const fim = h.start + h.count - 1;
        const prompt = [
          `Pilar: ${pillar} — ${spec.label}`,
          `Ficheiro: ${h.file} (linhas ${slice.startLine}-${slice.endLine} de ${lines.length})`,
          '',
          `MUDARAM as linhas ${h.start}-${fim} (contra ${diffBase}). O resto é contexto.`,
          '',
          slice.text,
          '',
          `Esta mudança (linhas ${h.start}-${fim}) introduz algum defeito?`,
          ...(densa
            ? [
                '',
                'ATENÇÃO: estas linhas usam negação (!, !==, !=). Lê cada condição',
                'DUAS vezes e diz em palavras o que ela significa antes de decidir.',
                '`a !== b` é "a é DIFERENTE de b". `!x` é "x é falso".',
              ]
            : []),
        ].join('\n');
        const mudadas = slice.text
          .split('\n')
          .filter((ln) => {
            const n = Number(String(ln).slice(0, 6).trim());
            return Number.isInteger(n) && n >= h.start && n <= fim;
          })
          .join('\n');
        const densa = negacaoDensa(mudadas);
        return {
          ok: true,
          mode: 'diff',
          negacaoDensa: densa,
          anchored: false,
          diffBase,
          changedStart: h.start,
          changedCount: h.count,
          pillar,
          label: spec.label,
          file: h.file,
          startLine: slice.startLine,
          endLine: slice.endLine,
          lineCount: lines.length,
          question: `rever mudança em ${h.file}:${h.start}-${fim}`,
          system: DIFF_SYSTEM_PROMPT,
          prompt,
          allowedFiles: [h.file],
        };
      }
    }
  }

  // ---- modo ANCORADO: julgar um achado que a máquina já encontrou ----
  const anchors = readAnchor(anchorPath);
  if (anchors.length > 0) {
    const hit = anchors[Math.abs(cursor) % anchors.length];
    const hitLines = readLines(repoRoot, hit.file);
    if (hitLines && hitLines.length > 0 && hit.line <= hitLines.length) {
      // Janela centrada na linha apontada: o juiz precisa do que está em volta.
      const half = Math.floor(maxLines / 2);
      const slice = renderSlice(hitLines, Math.max(1, hit.line - half), maxLines);
      const prompt = [
        `Pilar: ${pillar} — ${spec.label}`,
        `Ficheiro: ${hit.file} (linhas ${slice.startLine}-${slice.endLine} de ${hitLines.length})`,
        '',
        `A ferramenta apontou a LINHA ${hit.line}, regra "${hit.rule}":`,
        `  ${String(hit.msg || '').slice(0, 200)}`,
        '',
        slice.text,
        '',
        `Julga o apontamento na linha ${hit.line}. É defeito real ou falso positivo?`,
      ].join('\n');
      return {
        ok: true,
        mode: 'ancorado',
        anchored: true,
        anchorRule: hit.rule,
        anchorLine: hit.line,
        pillar,
        label: spec.label,
        file: hit.file,
        startLine: slice.startLine,
        endLine: slice.endLine,
        lineCount: hitLines.length,
        question: `julgar ${hit.rule} em ${hit.file}:${hit.line}`,
        system: ANCHORED_SYSTEM_PROMPT,
        prompt,
        allowedFiles: [hit.file],
      };
    }
  }

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
    mode: 'caca',
    anchored: false,
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
