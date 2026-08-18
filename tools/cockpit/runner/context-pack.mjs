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
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * A escada de bases do diff. O poco de UMA base e FINITO: medido a 2026-08-18,
 * `HEAD~12` dava 20 hunks e o runner consome 2950 rondas por dia (29s cada) —
 * o poco secava em menos de 10 minutos e a GPU passava a remoer os mesmos 20
 * excertos ~147 vezes por dia. Foi assim que 113 rondas deram 0 achados uteis:
 * nao por o motor ser mau, mas por lhe darmos o mesmo trabalho outra vez.
 *
 * Quando a base actual nao tem nada por rever, abre-se a seguinte.
 */
export const DIFF_LADDER = ['HEAD~12', 'HEAD~25', 'HEAD~50', 'HEAD~100'];

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

/** Onde um projecto declara os seus proprios pilares. */
export const PILLARS_FILE = '.mooter/pilares.json';

/**
 * Valida uma declaracao de pilares vinda de um projecto.
 *
 * As listas continuam a ser EXPLICITAS — sem globs, sem walk. Essa
 * reprodutibilidade e deliberada e esta comentada acima: um pilar tem de dar a
 * mesma ronda hoje e daqui a um mes. O que muda com o B3 e QUEM declara a
 * lista: deixa de ser este ficheiro e passa a ser o projecto.
 *
 * @returns {{ok: boolean, pillars: object|null, erros: string[]}}
 */
export function validarPilares(bruto) {
  const erros = [];
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { ok: false, pillars: null, erros: ['a raiz tem de ser um objecto { P1: {...}, ... }'] };
  }
  const ids = Object.keys(bruto);
  if (ids.length === 0) erros.push('nenhum pilar declarado');
  const limpos = {};
  for (const id of ids) {
    const p = bruto[id];
    const onde = `pilar ${id}`;
    if (!p || typeof p !== 'object') { erros.push(`${onde}: nao e um objecto`); continue; }
    if (typeof p.label !== 'string' || !p.label.trim()) erros.push(`${onde}: falta \`label\``);
    if (typeof p.ask !== 'string' || !p.ask.trim()) erros.push(`${onde}: falta \`ask\` (a pergunta da ronda)`);
    if (!Array.isArray(p.files) || p.files.length === 0) {
      erros.push(`${onde}: \`files\` tem de ser uma lista nao vazia de caminhos relativos`);
      continue;
    }
    const maus = p.files.filter((f) => typeof f !== 'string' || !f.trim() || f.startsWith('/') || f.split('/').includes('..'));
    // Um caminho que sai do repo nao e um pilar mal configurado: e leitura de
    // ficheiros fora do projecto a partir de um ficheiro do projecto.
    if (maus.length) erros.push(`${onde}: caminhos fora do repo ou invalidos: ${JSON.stringify(maus.slice(0, 3))}`);
    if (typeof p.label === 'string' && typeof p.ask === 'string' && !maus.length) {
      limpos[id] = { label: p.label.trim(), files: p.files.map(String), ask: p.ask.trim() };
    }
  }
  if (erros.length) return { ok: false, pillars: null, erros };
  return { ok: true, pillars: limpos, erros: [] };
}

/**
 * Carrega os pilares do projecto, com os embutidos como DEFAULT.
 *
 * Nunca lanca e nunca para uma ronda — mas tambem nunca cala: um
 * `pilares.json` presente e invalido devolve os defaults COM um `erro` que
 * quem chama tem de registar. Um catch que devolve vazio em silencio foi
 * exactamente como o modo diff ficou morto um dia inteiro sem ninguem saber.
 *
 * @returns {{pillars: object, ids: string[], fonte: 'projeto'|'default', ficheiro: string, erro: string|null}}
 */
export function loadPillars(repoRoot, { readImpl = fs.readFileSync } = {}) {
  const ficheiro = path.join(String(repoRoot || ''), PILLARS_FILE);
  const embutidos = { pillars: PILLARS, ids: PILLAR_IDS, fonte: 'default', ficheiro, erro: null };
  let raw;
  try {
    raw = readImpl(ficheiro, 'utf8');
  } catch (err) {
    // Ausente e o caso normal: o projecto nao declarou nada, usam-se os nossos.
    return err && err.code === 'ENOENT'
      ? embutidos
      : { ...embutidos, erro: `${PILLARS_FILE} ilegivel: ${String((err && err.message) || err).slice(0, 120)}` };
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { ...embutidos, erro: `${PILLARS_FILE} nao e JSON valido: ${String((err && err.message) || err).slice(0, 120)}` };
  }
  const v = validarPilares(parsed && parsed.pilares ? parsed.pilares : parsed);
  if (!v.ok) return { ...embutidos, erro: `${PILLARS_FILE} recusado: ${v.erros.slice(0, 4).join('; ')}` };
  return { pillars: v.pillars, ids: Object.keys(v.pillars), fonte: 'projeto', ficheiro, erro: null };
}

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

/**
 * A identidade de um excerto revisto. Inclui o CONTEUDO, nao so a posicao: se
 * as linhas mudarem, e trabalho novo e volta a fila; se nao mudarem, ja foi
 * julgado e nao ha nada a ganhar em julga-lo outra vez.
 */
export function hunkKey(file, startLine, endLine, texto) {
  const sha = crypto.createHash('sha256').update(String(texto || '')).digest('hex').slice(0, 12);
  return `${file}:${startLine}-${endLine}:${sha}`;
}

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

/**
 * O que conta como trabalho novo para rever.
 *
 * Medido a 2026-08-18 (`git diff --name-only HEAD~12...HEAD` sobre extensoes de
 * codigo): 53 ficheiros, dos quais 10 em `_handoff/**` — copias arquivadas de
 * codigo que ja nao corre — e 24 `*.test.*`. A GPU moia arquivo e chamava-lhe
 * revisao.
 *
 * A primeira versao deste comentario dizia "10 dos 20", porque o denominador foi
 * lido de uma listagem truncada a 20 linhas: 19% publicado como 50%. Fica escrito
 * porque foi apanhado por uma auditoria adversarial e porque este e, de todos os
 * ficheiros do repo, aquele cuja razao de existir e caçar metricas que mentem.
 * As
 * exclusoes sao pathspec do git (`:(exclude)`), avaliadas pelo proprio git, para
 * que o custo do diff caia na origem em vez de se filtrar depois.
 */
export const DIFF_PATHSPEC = [
  '*.js', '*.mjs', '*.cjs', '*.ts', '*.tsx', '*.jsx',
  ':(exclude)_handoff/**',
  ':(exclude)docs/archive/**',
  ':(exclude)*.test.*',
];

/**
 * Lê as linhas que mudaram entre `baseRef` e HEAD. Devolve [] em qualquer falha
 * — um repo sem git, um ref inexistente ou um diff vazio nunca podem parar uma
 * ronda; o runner cai para o degrau seguinte da escada.
 */
export function readChangedLines(repoRoot, { baseRef = 'HEAD~6', runImpl = null, maxFiles = 40, onError = null } = {}) {
  // maxBuffer explicito: um diff de 12 commits neste repo da 52k linhas e o
  // default de 1 MB do execFileSync rebenta com ENOBUFS. O catch mudo que estava
  // aqui engolia isso e devolvia [] — o modo diff nunca disparava e ninguem
  // sabia porque. E exactamente a classe de defeito que este runner procura,
  // encontrada no proprio runner. Agora o buffer chega, o diff e limitado a
  // ficheiros de codigo pelo pathspec, e a falha e REPORTADA em vez de calada.
  const run = runImpl || ((args) =>
    execFileSync('git', args, {
      cwd: repoRoot,
      encoding: 'utf8',
      timeout: 10000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    }));
  let out;
  try {
    out = run(['diff', '--unified=0', '--no-color', `${baseRef}...HEAD`, '--', ...DIFF_PATHSPEC]);
  } catch (err) {
    // Nunca parar a ronda por causa disto — mas tambem nunca fingir que o diff
    // estava vazio quando na verdade rebentou.
    if (onError) onError(String((err && err.message) || err).slice(0, 160));
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
export function resolveCandidates(repoRoot, pillarId, pillars = PILLARS) {
  const pillar = pillars[pillarId];
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
  diffRunImpl = null,
  // O que ja foi julgado. Um Set de chaves de `hunkKey`; vazio = tudo por rever.
  revistos = null,
  // Os pilares do PROJECTO, quando ele os declara. O default embutido continua
  // a ser o de sempre, para que um repo sem `.mooter/pilares.json` corra igual.
  pillars = PILLARS,
}) {
  const spec = pillars[pillar];
  if (!spec) return { ok: false, reason: `pilar desconhecido: ${pillar}`, pillar };

  // Escada de bases: quando a base actual nao tem nada por rever, abre-se a
  // seguinte em vez de remoer. Uma base so e um poco finito — 20 hunks contra
  // 2950 rondas por dia. Esgotadas todas, cai para os degraus de baixo
  // (ancorado, caca), que e a degradacao que ja existia.
  if (Array.isArray(diffBase)) {
    const resto = { repoRoot, pillar, cursor, maxLines, anchorPath, diffRunImpl, pillars, revistos };
    for (const base of diffBase) {
      const r = buildContextPack({ ...resto, diffBase: base });
      if (r.ok) return { ...r, escadaBase: base };
      // Esgotada e o unico motivo para alargar; qualquer outra falha e falha.
      if (!r.esgotado) break;
    }
    return buildContextPack({ ...resto, diffBase: null });
  }

  // O degrau do diff so ve codigo (ver DIFF_PATHSPEC). Um pilar cujos ficheiros
  // sao TODOS documentos — o P3, cujo trabalho SAO os documentos — nunca podia
  // ter interseccao com o diff, e ficava preso em `escopo: 'geral'` para
  // sempre, a rever codigo de outros em vez do canon que lhe compete. Para
  // esse, o diff nao e um degrau: e um desvio.
  const temCodigo = spec.files.some((f) => {
    const d = String(f).lastIndexOf('.');
    return d >= 0 && CODE_EXT.has(String(f).slice(d));
  });

  // ---- degrau 1: DIFF — rever o que mudou (trabalho infinito enquanto houver commits)
  let diffErro = null;
  if (diffBase && temCodigo) {
    const todos = readChangedLines(repoRoot, { baseRef: diffBase, runImpl: diffRunImpl, onError: (e) => { diffErro = e; } });
    // Os hunks que caem nos ficheiros DESTE pilar. Sem interseccao, o pilar nao
    // tem nada de seu no diff: revemos o resto na mesma — trabalho novo vale
    // mais do que arrumacao — mas dizemo-lo, e `escopo: 'geral'` e um rotulo
    // que nao mente. O rotulo do pilar deixa de ser colado a um ficheiro que
    // nada tem a ver com ele.
    const meus = todos.filter((h) => spec.files.includes(h.file));
    // O que NENHUM pilar reclama. Deixar o `geral` percorrer `todos` punha-o a
    // cair no mesmo hunk que um pilar dono ja estava a rever — 8 colisoes em
    // 201 cursores, a primeira no cursor 2, porque o passo aritmetico nao ajuda
    // quando as duas caminhadas sao sobre conjuntos diferentes. Os orfaos sao
    // tambem a definicao honesta de "diff geral": a parte do trabalho novo que
    // nao tem dono.
    const donos = new Set(Object.values(pillars).flatMap((p) => p.files));
    const orfaos = todos.filter((h) => !donos.has(h.file));
    const escopo = meus.length > 0 ? 'pilar' : 'geral';
    const hunks = meus.length > 0 ? meus : (orfaos.length > 0 ? orfaos : todos);
    if (hunks.length > 0) {
      // Fora do ambito do pilar, o cursor sozinho dava a TODOS os pilares o
      // MESMO hunk na mesma ronda: medido a 2026-08-18, os packs de P1 e P5
      // diferiam em 1 linha de 25 — so o cabecalho — e a pergunta era
      // identica. Seis pilares a moer o mesmo ficheiro sao um pilar, com seis
      // vezes o custo. O ordinal do pilar desfaz a correlacao sem perder o
      // determinismo: mesma ronda, mesmo repo, mesmo resultado.
      // `indexOf` devolve -1 para um pilar fora do conjunto; `Math.max(0, ...)`
      // impede que um id desconhecido desloque a rotacao para tras.
      const ids = Object.keys(pillars);
      // `indexOf` devolve -1 para um pilar fora do conjunto; `Math.max(0, ...)`
      // impede que um id desconhecido desloque a rotacao para tras.
      // O desvio vale para os DOIS escopos. So o aplicar a `geral` deixava
      // dois pilares que partilham um ficheiro (P2 e P6 partilham
      // build-snapshot.js) a cair no mesmo hunk, com `desvio = 0` ambos, em
      // 100% das rondas — e um `geral` a colidir com um `pilar`. Medido:
      // 10 colisoes em 201 cursores, a primeira no cursor 10.
      const desvio = Math.max(0, ids.indexOf(pillar));
      // O passo tem de ser o NUMERO DE PILARES, nao 1. Com `cursor + desvio`, o
      // pilar k da rotacao r caia no mesmo hunk que o pilar k-1 da rotacao r+1
      // — medido no ledger vivo a 2026-08-18: P2 e P1, rondas seguidas, a mesma
      // janela 277-295. Multiplicar pelo numero de pilares torna cada par
      // (rotacao, pilar) um lugar unico na caminhada.
      const passo = cursor * ids.length + desvio;
      // Varre a partir do lugar deterministico ate encontrar um excerto que
      // ainda nao foi julgado. Sem isto, o cursor voltava sempre ao mesmo
      // hunk assim que o poco dava a volta.
      let h = null;
      let chave = null;
      for (let k = 0; k < hunks.length; k += 1) {
        const cand = hunks[Math.abs(passo + k) % hunks.length];
        const ls = readLines(repoRoot, cand.file);
        if (!ls || ls.length === 0 || cand.start > ls.length) continue;
        const fimC = Math.min(ls.length, cand.start + cand.count - 1);
        const kc = hunkKey(cand.file, cand.start, fimC, ls.slice(cand.start - 1, fimC).join('\n'));
        if (revistos && revistos.has(kc)) continue;
        h = cand;
        chave = kc;
        break;
      }
      // Poco seco nesta base: cai para o degrau seguinte da escada em vez de
      // remoer. Quem chama e que decide abrir uma base mais larga.
      if (!h) return { ok: false, esgotado: true, reason: `nada por rever em ${diffBase}`, pillar, diffErro };
      const lines = readLines(repoRoot, h.file);
      if (lines && lines.length > 0 && h.start <= lines.length) {
        const pad = 8; // contexto à volta da mudança, para o juiz perceber o que a rodeia
        const slice = renderSlice(lines, Math.max(1, h.start - pad), Math.min(maxLines, h.count + pad * 2));
        const fim = h.start + h.count - 1;
        // `mudadas` e `densa` TÊM de vir antes do prompt: o prompt usa `densa`.
        // Tê-los depois deu "Cannot access 'densa' before initialization" e
        // rebentou todas as rondas — apanhado só porque o runner regista a
        // excepção no recibo em vez de morrer calado.
        const mudadas = slice.text
          .split('\n')
          .filter((ln) => {
            const n = Number(String(ln).slice(0, 6).trim());
            return Number.isInteger(n) && n >= h.start && n <= fim;
          })
          .join('\n');
        const densa = negacaoDensa(mudadas);
        const rotulo = escopo === 'pilar'
          ? `${spec.label} (pilar ${pillar})`
          : `Diff geral — fora dos ficheiros do pilar ${pillar}`;
        const prompt = [
          `Revisao: ${rotulo}`,
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
        return {
          ok: true,
          mode: 'diff',
          escopo,
          chave,
          negacaoDensa: densa,
          diffErro,
          anchored: false,
          diffBase,
          changedStart: h.start,
          changedCount: h.count,
          pillar,
          label: rotulo,
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
  // Se o `git diff` rebentou, a ronda continua pelo degrau seguinte — mas o
  // erro TEM de viajar ate ao recibo. Foi um catch mudo aqui que deixou o modo
  // diff morto um dia inteiro sem ninguem saber (ENOBUFS num diff de 52k
  // linhas). Capturar o erro e nao o mostrar e o mesmo catch mudo com mais
  // passos.
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
        diffErro,
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

  const candidates = resolveCandidates(repoRoot, pillar, pillars);
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
    diffErro,
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
