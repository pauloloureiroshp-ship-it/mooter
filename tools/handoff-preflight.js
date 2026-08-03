#!/usr/bin/env node
// @ts-check
'use strict';
/**
 * handoff-preflight.js — zero-LLM scaffold for the Perfect Handoff.
 *
 * WHY THIS EXISTS (2026-07-16, learned the expensive way)
 * ------------------------------------------------------
 * In the Mooter 2.0 cycle a handoff was written three times before it was
 * right. The failure was never intelligence — it was the absence of a
 * checklist. `docs/strategy/PERFECT_HANDOFF_SPEC.md` defines the exact
 * fields the Cowork needs, and nothing in the flow forced anyone to read it.
 * An agent that does not know a field exists cannot fill it, and a missing
 * field reads as "there was nothing to say".
 *
 * THE INSIGHT: the Perfect Handoff is ~90% MECHANICAL.
 * WORKTREE, WORK, GATE, UNPUSHED, BOARD, TIME and STATE all fall out of git
 * and the filesystem. They need no model at all. The spec itself already
 * demotes the only genuinely generative field to "~narrativa (qwen,
 * best-effort) — claramente opcional, nunca load-bearing".
 *
 * So this tool is deterministic, free, and cannot hallucinate:
 *   1. It PARSES the spec for the required field list (anti-drift: if the
 *      spec grows a field, this tool fails instead of silently omitting it).
 *   2. It fills every mechanical field from git/fs — measured, never guessed.
 *   3. It leaves judgement fields as loud <<TODO>> markers, so an omission
 *      is impossible to mistake for an empty truth.
 *   4. Anything it cannot verify becomes `n/d`, per the spec's golden rule:
 *      "Nunca dizer 'limpo/0 unpushed/✅' sem ser verdade. Quando incerto →
 *      'n/d', nunca palpite." (PERFECT_HANDOFF_SPEC.md:95)
 *
 * The local moo (Ollama) fills only the narrative garnish, in parallel, for
 * free. The cloud model fills only judgement. Cost of the 90%: $0.
 *
 * Usage:
 *   node tools/handoff-preflight.js                 # render skeleton to stdout
 *   node tools/handoff-preflight.js --json          # machine-readable facts
 *   node tools/handoff-preflight.js --check         # spec + typed artifacts
 *   node tools/handoff-preflight.js --check-templates
 *   node tools/handoff-preflight.js --fixture FILE --type BRIEF
 *   node tools/handoff-preflight.js --out FILE      # write skeleton to FILE
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO = path.resolve(__dirname, '..');
const SPEC = path.join(REPO, 'docs', 'strategy', 'PERFECT_HANDOFF_SPEC.md');
const PROTOCOL = path.join(REPO, 'docs', 'agent-context', 'AGENT_CONTEXT_PROTOCOL.md');
const AGENTS = path.join(REPO, 'AGENTS.md');
const TEMPLATE_ROOT = path.join(REPO, '_handoff', 'templates');
const FIXTURE_ROOT = path.join(TEMPLATE_ROOT, 'fixtures');
const FIXTURE_ID = 'cd89b89c606a7a20';
const FIXTURE_SOURCE = path.join(FIXTURE_ROOT, `${FIXTURE_ID}.source.md`);
const FIXTURE_SOURCE_SHA256 = 'c397823bef7db788e87c676298f7006a9d59cd719f9cf5c361b25bc7dd7eba6c';

const TYPE_FILES = Object.freeze({
  MASTERPROMPT: 'MASTERPROMPT.template.md',
  HANDOFF: 'HANDOFF.template.md',
  'DECISION CONTRACT': 'DECISION_CONTRACT.template.md',
  BRIEF: 'BRIEF.template.md',
});

const REQUIRED_PLACEHOLDERS = Object.freeze({
  MASTERPROMPT: ['FROM', 'TO', 'GOAL', 'WHERE', 'WHEN', 'ACTIONS', 'GUARDS', 'GATES', 'REUSE_INTERNAL', 'REUSE_PUBLIC', 'REUSE_PREVIOUS', 'STOPS', 'NEXT', 'BACK', 'COUNCIL_SCORE', 'COUNCIL_OBJECTION', 'COUNCIL_RESOLUTION'],
  HANDOFF: ['FROM', 'TO', 'STATUS', 'FM_STATE', 'STATE', 'WORKTREE', 'UNPUSHED', 'GATES', 'WORK', 'DECISIONS', 'PENDING', 'UNCOMMITTED', 'UNCOMMITTED_COUNT', 'TESTS', 'DECISIONS_PENDING', 'INTENT', 'TIME', 'DELTA', 'RESUME', 'CONF', 'STOP', 'CCA_SCORE'],
  'DECISION CONTRACT': ['FROM', 'TO', 'DECISION_ROWS', 'GUARDS', 'NEXT_GATE', 'STOPS', 'COUNCIL_SCORE', 'COUNCIL_OBJECTION', 'COUNCIL_RESOLUTION'],
  BRIEF: ['FROM', 'TO', 'STATUS', 'FM_STATE', 'STATE', 'WORKTREE', 'BRANCH', 'SHA', 'GIT_REF', 'UNCOMMITTED', 'UNCOMMITTED_COUNT', 'UNPUSHED', 'TESTS', 'DECISIONS_PENDING', 'TASK', 'EVIDENCE_POINTER', 'STOP'],
});

const PROJECTION_FRONTMATTER_FIELDS = Object.freeze([
  'type', 'id', 'from', 'to', 'status', 'state', 'worktree', 'branch', 'sha',
  'uncommitted', 'tests', 'decisions_pending',
]);

/** The fields this tool knows how to emit. Checked against the spec at runtime. */
const KNOWN_FIELDS = [
  'STATE', 'WORKTREE', 'GATE', 'WORK', 'DECISIONS', 'PENDING', 'NEXT',
  'BOARD', 'RISK', 'UNPUSHED', 'NEXT FOR COWORK', 'ATENÇÃO',
];

/** Fields no tool can derive — they need a human or a judgement call. */
const JUDGEMENT_FIELDS = {
  GOAL: 'o objectivo macro que liga as fases',
  INTENT: 'o objectivo original do masterprompt (path + 1 linha)',
  'A ÚNICA COISA': 'a acção de maior alavanca agora — corta o overwhelm numa linha',
  DECISIONS: 'Q verbatim + escolha + porquê (o journal só guarda hashes — ver nota)',
  PENDING: 'Q INTEIRA + TODAS as opções (nunca truncar — buraco nº2 do spec)',
  RISK: 'só divergência REAL, não artefacto de tree partilhado',
  'NEXT FOR COWORK': 'só se genuinamente limpo',
};

function sh(cmd, args, cwd = REPO, { raw = false } = {}) {
  try {
    // Do NOT trim command output here when raw=true. Some machine-readable
    // formats use leading spaces as structural data (`git status --porcelain`
    // is the important example: " M path" means an unstaged modification).
    const out = execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return raw ? out : out.trim();
  } catch {
    return null; // caller turns null into n/d — never into a guess
  }
}

/**
 * Parse the spec's code fences for FIELD: lines. This is the anti-drift gate:
 * the spec is the source of truth for what a handoff must carry, so if it
 * grows a field this tool does not know, we fail loudly rather than ship a
 * handoff with a silent hole — which is exactly the bug this file exists for.
 */
function specFields() {
  if (!fs.existsSync(SPEC)) return { ok: false, fields: [], err: `spec ausente: ${SPEC}` };
  const text = fs.readFileSync(SPEC, 'utf8');
  const fields = new Set();
  for (const m of text.matchAll(/^([A-ZÇÃÕÉ][A-ZÇÃÕÉ ]{2,}):/gm)) {
    fields.add(m[1].trim());
  }
  return { ok: true, fields: [...fields].sort(), err: null };
}

function checkSpecDrift() {
  const { ok, fields, err } = specFields();
  if (!ok) return { drifted: true, unknown: [], err };
  const unknown = fields.filter((f) => !KNOWN_FIELDS.includes(f));
  return { drifted: unknown.length > 0, unknown, err: null };
}

function normalizeEol(text) {
  return String(text).replace(/\r\n?/g, '\n');
}

function canonicalSource(text) {
  return normalizeEol(text).replace(/\n*$/, '') + '\n';
}

function normalizeMessageType(input) {
  const key = String(input || '').trim().toUpperCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
  return Object.prototype.hasOwnProperty.call(TYPE_FILES, key) ? key : null;
}

/** Parse message types and budgets from the Lingua Franca constitution. */
function parseMessageContracts(protocolText) {
  let text = protocolText;
  try {
    if (text === undefined) text = fs.readFileSync(PROTOCOL, 'utf8');
  } catch (err) {
    return { ok: false, contracts: [], err: `protocol ausente: ${err.message}` };
  }
  const contracts = [];
  for (const line of normalizeEol(text).split('\n')) {
    const m = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*≤\s*(\d+)k tokens\s*\|$/);
    if (!m) continue;
    const rawType = m[1].trim().toUpperCase().replace(/[-_]+/g, ' ').replace(/\s+/g, ' ');
    const type = normalizeMessageType(rawType) || rawType;
    contracts.push({
      type,
      cliType: type.replace(/ /g, '_'),
      direction: m[2].trim(),
      purpose: m[3].trim(),
      budgetTokens: Number(m[4]) * 1000,
      templateFile: TYPE_FILES[type],
    });
  }
  return {
    ok: contracts.length > 0,
    contracts,
    err: contracts.length ? null : 'nenhum contrato tipado encontrado no protocolo',
  };
}

/** Read the eight council keys from the repo canon without copying them here. */
function parseCouncilQuestions(agentsText) {
  let text = agentsText;
  try {
    if (text === undefined) text = fs.readFileSync(AGENTS, 'utf8');
  } catch (err) {
    return { ok: false, questions: [], antiSycophancy: false, err: `AGENTS ausente: ${err.message}` };
  }
  const lines = normalizeEol(text).split('\n');
  const headings = lines.map((line, index) => /^##\s+Pre-Dispatch Red-Team Gate\s*$/.test(line) ? index : -1).filter((index) => index !== -1);
  if (headings.length !== 1) {
    return { ok: false, questions: [], antiSycophancy: false, err: `esperada 1 seção Pre-Dispatch Red-Team Gate, encontradas ${headings.length}` };
  }
  const start = headings[0];
  const endOffset = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line));
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
  const section = lines.slice(start + 1, end);
  const entries = section
    .map((line) => line.match(/^(\d+)\.\s+\*\*([^*]+)\*\*\s*$/))
    .filter(Boolean)
    .map((match) => ({ number: Number(match[1]), key: match[2].trim() }));
  const questions = entries.map((entry) => entry.key);
  const ordered = entries.every((entry, index) => entry.number === index + 1);
  const unique = new Set(questions).size === questions.length;
  const flat = section.join(' ').replace(/\s+/g, ' ');
  const antiSycophancy = flat.includes('o gate DEVE produzir ≥1 objeção real ou declarar o que tentou refutar; gate que só aprova = não rodou.');
  const faults = [];
  if (questions.length !== 8) faults.push(`esperadas 8 perguntas, encontradas ${questions.length}`);
  if (!ordered) faults.push('numeração das perguntas não é 1..8');
  if (!unique) faults.push('perguntas duplicadas');
  if (!antiSycophancy) faults.push('regra anti-sycophancy ausente');
  return { ok: faults.length === 0, questions, antiSycophancy, err: faults.join('; ') || null };
}

/** Parse the five CCA-F rows mechanically; finding rows never awards a score. */
function parseCcaCriteria(protocolText) {
  let text = protocolText;
  try {
    if (text === undefined) text = fs.readFileSync(PROTOCOL, 'utf8');
  } catch (err) {
    return { ok: false, criteria: [], totalWeight: 0, err: `protocol ausente: ${err.message}` };
  }
  const lines = normalizeEol(text).split('\n');
  const headings = lines.map((line, index) => /^####\s+CCA-F standards gate\s*$/.test(line) ? index : -1).filter((index) => index !== -1);
  if (headings.length !== 1) return { ok: false, criteria: [], totalWeight: 0, err: `esperada 1 tabela CCA-F, encontradas ${headings.length}` };
  const start = headings[0];
  const endOffset = lines.slice(start + 1).findIndex((line) => /^#{1,4}\s+/.test(line));
  const end = endOffset === -1 ? lines.length : start + 1 + endOffset;
  const criteria = [];
  for (const line of lines.slice(start + 1, end)) {
    const row = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/);
    if (!row || /^---/.test(row[1])) continue;
    const weighted = row[1].match(/^(.*?)\s*\((\d+)%\)$/);
    if (!weighted) continue;
    criteria.push({ domain: weighted[1].trim(), weight: Number(weighted[2]), check: row[2].trim(), failure: row[3].trim() });
  }
  const totalWeight = criteria.reduce((sum, criterion) => sum + criterion.weight, 0);
  const unique = new Set(criteria.map((criterion) => criterion.domain)).size === criteria.length;
  const complete = criteria.every((criterion) => criterion.domain && criterion.check && criterion.failure);
  const faults = [];
  if (criteria.length !== 5) faults.push(`esperados 5 critérios CCA-F, encontrados ${criteria.length}`);
  if (!unique) faults.push('critérios CCA-F duplicados');
  if (!complete) faults.push('critério CCA-F incompleto');
  if (totalWeight !== 100) faults.push(`pesos CCA-F somam ${totalWeight}, não 100`);
  return { ok: faults.length === 0, criteria, totalWeight, err: faults.join('; ') || null };
}

function footerPositionIsFinal(lines, index) {
  const tail = lines.slice(index + 1).filter((line) => line.trim());
  return tail.length === 0 || (tail.length === 1 && tail[0] === '⇄ END');
}

/** Validate one rendered CCA footer. Partial/unknown is a flag, not a block. */
function validateCcaFooter(text, denominator = 5) {
  const lines = normalizeEol(text).split('\n');
  const indexes = lines.map((line, index) => line.startsWith('CCA:') ? index : -1).filter((index) => index !== -1);
  const errors = [];
  const warnings = [];
  if (indexes.length !== 1) {
    errors.push(`esperado 1 rodapé CCA, encontrados ${indexes.length}`);
    return { ok: false, errors, warnings, score: null };
  }
  const index = indexes[0];
  const match = lines[index].match(/^CCA: (n\/d|\d+)\/(\d+)$/);
  if (!match) errors.push('rodapé CCA inválido; esperado CCA: n/5');
  if (!footerPositionIsFinal(lines, index)) errors.push('rodapé CCA não está no fim do artefacto');
  if (!match) return { ok: false, errors, warnings, score: null };
  const actualDenominator = Number(match[2]);
  if (actualDenominator !== denominator) errors.push(`denominador CCA ${actualDenominator}, esperado ${denominator}`);
  const score = match[1] === 'n/d' ? null : Number(match[1]);
  if (score !== null && (score < 0 || score > denominator)) errors.push(`score CCA fora do intervalo: ${score}/${denominator}`);
  if (score === null || score < denominator) warnings.push(`CCA abaixo de ${denominator}/${denominator}: ${match[1]}/${actualDenominator}`);
  return { ok: errors.length === 0, errors, warnings, score };
}

/** Validate one rendered council footer without deciding that the council ran. */
function validateCouncilFooter(text) {
  const lines = normalizeEol(text).split('\n');
  const indexes = lines.map((line, index) => line.startsWith('🔍 council') ? index : -1).filter((index) => index !== -1);
  const errors = [];
  const warnings = [];
  if (indexes.length !== 1) {
    errors.push(`esperado 1 rodapé council, encontrados ${indexes.length}`);
    return { ok: false, errors, warnings, score: null };
  }
  const index = indexes[0];
  const match = lines[index].match(/^🔍 council (8\/8|n\/d) · objeção mais forte: (.+) · resolvida: (.+)$/);
  if (!match) errors.push('rodapé council inválido');
  if (!footerPositionIsFinal(lines, index)) errors.push('rodapé council não está no fim do artefacto');
  if (!match) return { ok: false, errors, warnings, score: null };
  const [, score, objection, resolution] = match;
  if (score === 'n/d') {
    if (!objection.startsWith('n/d') || !resolution.startsWith('n/d')) {
      errors.push('council n/d exige objeção e resolução n/d');
    }
    warnings.push('council n/d — execução não comprovada');
  } else {
    const emptyObjection = /^(?:n\/d|none|nenhuma|sem objeção)$/i.test(objection.trim());
    const emptyResolution = /^(?:n\/d|none|nenhuma|sem resolução)$/i.test(resolution.trim());
    if (emptyObjection || emptyResolution || /<[^>]+>/.test(`${objection} ${resolution}`)) {
      errors.push('council 8/8 exige objeção e resolução reais');
    }
  }
  return { ok: errors.length === 0, errors, warnings, score };
}

function parseBrief(sourceText) {
  const text = normalizeEol(sourceText);
  const lines = text.split('\n');
  const meta = {};
  const sections = {};
  let current = null;
  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].trim().toLowerCase();
      sections[current] = [];
      continue;
    }
    if (current) sections[current].push(line);
    else {
      const field = line.match(/^([a-z_]+):\s*(.*)$/i);
      if (field) meta[field[1].toLowerCase()] = field[2].trim();
    }
  }
  const textOf = (name) => (sections[name] || []).join('\n').trim();
  const listOf = (name) => (sections[name] || [])
    .map((line) => line.match(/^\s*-\s+(.+)$/))
    .filter(Boolean).map((m) => m[1].trim());
  return {
    title: (lines[0].match(/^#\s+(.+)$/) || [null, 'n/d'])[1],
    meta,
    sections: {
      task: textOf('task'),
      context: textOf('context'),
      expectedDeliverable: textOf('expected deliverable'),
      files: listOf('files'),
      guardrails: listOf('guardrails'),
      acceptance: listOf('acceptance'),
      sharedState: textOf('shared state'),
      responseContract: listOf('response contract'),
    },
  };
}

const bullets = (items, fallback = 'n/d') => (items && items.length
  ? items.map((item) => `- ${item}`).join('\n')
  : `- ${fallback}`);
const checks = (items, fallback = 'n/d') => (items && items.length
  ? items.map((item) => `- [ ] ${item}`).join('\n')
  : `- [ ] ${fallback}`);

/** Project one historical brief without consulting Git, HOME, clocks or connectors. */
function projectBrief(brief, inputType, sourceRef = `_handoff/templates/fixtures/${FIXTURE_ID}.source.md:1-55`) {
  const type = normalizeMessageType(inputType);
  if (!type) throw new Error(`tipo desconhecido: ${inputType}`);
  const { meta, sections } = brief;
  const id = meta.event_id || 'n/d';
  if (id !== FIXTURE_ID) throw new Error(`fixture não suportada: esperado event_id ${FIXTURE_ID}, recebido ${id}`);
  const from = meta.from || 'n/d';
  const to = meta.to || 'n/d';
  const status = meta.status || 'n/d';
  const confidence = !meta.confidence || meta.confidence === 'unknown' ? 'n/d' : meta.confidence;
  const title = 'F1–F3 REMEDIATION DECISIONS';
  const sourceContext = sections.context || 'n/d';
  const expected = sections.expectedDeliverable || 'n/d';
  const guardrails = sections.guardrails.length ? sections.guardrails : ['n/d'];
  const acceptance = sections.acceptance.length ? sections.acceptance : ['n/d'];
  const decisionRequests = acceptance.filter((item) => /^Decisão F\d/i.test(item));
  const decisionIds = decisionRequests.map((item) => {
    const match = item.match(/^Decisão\s+(F\d+)/i);
    return match ? match[1].toUpperCase() : 'n/d';
  });
  const decisionsPending = JSON.stringify(decisionIds.length ? decisionIds : ['n/d']);
  const decisionRows = decisionRequests.map((item) => {
    const key = item.replace(/^Decisão\s+/i, '').replace(/\s+sobre\s+/i, ' — ');
    return `| ${key} | n/d | Solicitada na fonte; nenhum verdict presente. |`;
  });
  const namedMainUntracked = sections.files.slice(0, 3);
  const redAlerts = [
    'F3: n/d — a fonte afirma 7 paths uncommitted, mas não enumera nenhum full path (RED ALERT)',
    `Main: a fonte nomeia ${namedMainUntracked.join(', ')} como untracked; root absoluto n/d (RED ALERT)`,
  ];
  const redAlert = redAlerts.join(' · ');
  const stop = 'A fonte omite os verdicts F1/F2/F3, os full paths da F3 e o root absoluto dos três paths untracked da main.';

  const common = { ID: id, TITLE: title, SOURCE_REF: sourceRef };
  const unknownCouncil = {
    COUNCIL_SCORE: 'n/d',
    COUNCIL_OBJECTION: 'n/d — ausente na fonte',
    COUNCIL_RESOLUTION: 'n/d — sem objeção verificável',
  };
  if (type === 'MASTERPROMPT') return { ...common,
    FROM: 'n/d', TO: to.toUpperCase(),
    GOAL: sections.task || 'n/d',
    WHERE: 'Worktree n/d · branch n/d · a fonte identifica somente origin/main@71340b25.',
    WHEN: 'n/d — ordem e dependências estão ausentes na fonte.',
    ACTIONS: `1. ${sections.task || 'n/d'}\n2. ${expected}`,
    GUARDS: bullets(guardrails), GATES: checks(acceptance),
    REUSE_INTERNAL: 'n/d — ausente na fonte',
    REUSE_PUBLIC: 'n/d — ausente na fonte',
    REUSE_PREVIOUS: 'n/d — ausente na fonte',
    STOPS: bullets([
      'A direção da fonte é executor → ledger → consumer, não brain → executor.',
      'REUSE e worktree/branch/HEAD estão n/d; esta projeção não é executável.',
      stop,
    ]),
    NEXT: `COWORK devolve um DECISION CONTRACT para o evento ${id}.`,
    BACK: expected, ...unknownCouncil,
  };

  if (type === 'HANDOFF') return { ...common,
    FROM: from.toUpperCase(), TO: to.toUpperCase(), STATUS: status, OWNER: 'n/d',
    CREATED_AT: 'n/d', UPDATED_AT: 'n/d', WORKTREE_PATH: 'n/d', BRANCH: 'n/d',
    BASE: 'n/d', HEAD: 'n/d', LEDGER_REF: id, SUPERSEDES: 'n/d',
    FM_STATE: 'n/d', UNCOMMITTED_COUNT: 'n/d', TESTS: 'n/d', DECISIONS_PENDING: decisionsPending,
    TLDR: 'STATE n/d · três decisões pendentes · RED ALERT F3 incompleto',
    INTENT: `${sections.task || 'n/d'} · evidência ${sourceRef}`,
    STATE: 'n/d — estado de execução ausente na fonte',
    WORKTREE: 'n/d · origin/main@71340b25 é alegação de base, nunca HEAD',
    UNPUSHED: 'n/d',
    TIME: 'n/d', DELTA: 'n/d',
    GATES: '- n/d — nenhuma evidência mecânica ou outcome de gate consta na fonte.',
    WORK: 'Fonte reporta F1/F2 limpas no STOP e F3 com 7 paths; diff stat e commits n/d.',
    DECISIONS: '- n/d — a fonte solicita F1/F2/F3, mas não contém respostas.',
    PENDING: bullets(decisionRequests.map((item) => `${item}: APPROVE ou CHANGES; opções completas n/d.`)),
    UNCOMMITTED: bullets(redAlerts),
    RISK: 'Mirror Notion alegado como 2026-06-20; connector live ausente na fonte.',
    GUARDS: bullets(guardrails),
    NEXT: `COWORK devolve DECISION CONTRACT para ${id}.`,
    RESUME: `Devolver DECISION CONTRACT para o evento ${id}.`,
    NARRATIVE: 'n/d', CONF: 'fonte verificada · git n/d · gate n/d · narrativa n/d',
    EVIDENCE: bullets([sourceRef, `ledger event ${id}`]),
    STOP: stop, HUMAN_GATE: 'Paulo autoriza push, merge ou delete.', BACK: expected,
    CCA_SCORE: 'n/d',
  };

  if (type === 'DECISION CONTRACT') return { ...common,
    FROM: to.toUpperCase(), TO: from.toUpperCase(), CONTEXT: `Alegação da fonte: ${sourceContext}`,
    DECISION_ROWS: decisionRows.length ? decisionRows.join('\n') : '| n/d | n/d | decisão ausente |',
    GUARDS: bullets(guardrails),
    NEXT_GATE: 'COWORK fornece APPROVE ou CHANGES nas três linhas com evidência exata.',
    STOPS: bullets([`${stop} CODEX não executa remediação nem ação irreversível.`]),
    ...unknownCouncil,
  };

  return { ...common,
    FROM: from.toUpperCase(), TO: to.toUpperCase(), STATUS: status,
    SCOPE: meta.scope || 'n/d', CONFIDENCE: confidence,
    EVIDENCE_TAGS: meta.evidence || 'n/d', FM_STATE: 'n/d',
    STATE: 'n/d — estado de execução ausente na fonte',
    WORKTREE: 'n/d', BRANCH: 'n/d', SHA: 'n/d',
    GIT_REF: 'n/d@n/d · origin/main@71340b25 é apenas base alegada pela fonte',
    UNCOMMITTED_COUNT: 'n/d', TESTS: 'n/d', DECISIONS_PENDING: decisionsPending,
    UNCOMMITTED: redAlert, UNPUSHED: 'n/d', TASK: sections.task || 'n/d',
    CONTEXT: `Alegação da fonte: ${sourceContext}`,
    DELIVERABLE: expected, FILES: bullets(sections.files), GUARDS: bullets(guardrails),
    ACCEPTANCE: bullets(acceptance),
    NEXT_EVENT: `COWORK regista um DECISION CONTRACT para ${id}.`, STOP: stop,
    EVIDENCE_POINTER: sourceRef,
  };
}

function renderTemplate(inputType, values, templateDir = TEMPLATE_ROOT) {
  const type = normalizeMessageType(inputType);
  if (!type) throw new Error(`tipo desconhecido: ${inputType}`);
  const file = path.join(templateDir, TYPE_FILES[type]);
  const template = normalizeEol(fs.readFileSync(file, 'utf8'));
  const rendered = template.replace(/<([A-Z][A-Z0-9_]*)>/g, (_match, key) => {
    const value = values[key];
    return value === undefined || value === null || value === '' ? 'n/d' : String(value);
  });
  const unresolved = [...rendered.matchAll(/<([A-Za-z][A-Za-z0-9_ -]*)>/g)].map((m) => m[1]);
  if (unresolved.length) throw new Error(`placeholders não resolvidos em ${type}: ${unresolved.join(', ')}`);
  return normalizeEol(rendered).replace(/\n*$/, '') + '\n';
}

/** Parse the deliberately small YAML subset used by projectable messages. */
function parseProjectionFrontmatter(text) {
  const normalized = normalizeEol(text);
  const errors = [];
  const data = {};
  if (!normalized.startsWith('---\n')) {
    return { ok: false, data, errors: ['frontmatter YAML ausente'] };
  }
  const end = normalized.indexOf('\n---\n', 4);
  if (end === -1) return { ok: false, data, errors: ['frontmatter YAML sem fecho'] };
  const lines = normalized.slice(4, end).split('\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const match = line.match(/^([a-z][a-z0-9_]*):(?:\s*(.*))?$/);
    if (!match) {
      errors.push(`linha YAML não suportada: ${line}`);
      continue;
    }
    const key = match[1];
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      errors.push(`campo YAML duplicado: ${key}`);
      continue;
    }
    const raw = String(match[2] || '').replace(/\s+#\s+.*$/, '').trim();
    if (key === 'decisions_pending') {
      try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string' || !item.trim())) {
          errors.push('decisions_pending deve ser array de strings não vazias');
        } else data[key] = parsed;
      } catch {
        errors.push('decisions_pending deve usar array YAML/JSON inline');
      }
    } else data[key] = raw;
  }
  return { ok: errors.length === 0, data, errors };
}

function validateProjectionFrontmatter(text, expectedType) {
  const parsed = parseProjectionFrontmatter(text);
  const errors = [...parsed.errors];
  for (const field of PROJECTION_FRONTMATTER_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(parsed.data, field)) errors.push(`frontmatter omite ${field}`);
    else if (field !== 'decisions_pending' && !String(parsed.data[field]).trim()) errors.push(`frontmatter esvazia ${field}`);
  }
  if (parsed.data.type && parsed.data.type !== expectedType) {
    errors.push(`frontmatter type esperado ${expectedType}, recebido ${parsed.data.type}`);
  }
  if (parsed.data.status && !['draft', 'ready', 'claimed', 'blocked', 'verified', 'shipped', 'archived', 'n/d'].includes(parsed.data.status)) {
    errors.push(`frontmatter status inválido: ${parsed.data.status}`);
  }
  if (parsed.data.state && !['parked', 'awaiting-you', 'landed', 'in-progress', 'n/d'].includes(parsed.data.state)) {
    errors.push(`frontmatter state inválido: ${parsed.data.state}`);
  }
  if (parsed.data.sha && !/^(?:n\/d|[0-9a-f]{7,64})$/i.test(parsed.data.sha)) {
    errors.push(`frontmatter sha inválido: ${parsed.data.sha}`);
  }
  if (parsed.data.uncommitted && !/^(?:n\/d|\d+)$/.test(parsed.data.uncommitted)) {
    errors.push(`frontmatter uncommitted inválido: ${parsed.data.uncommitted}`);
  }
  if (Array.isArray(parsed.data.decisions_pending) && parsed.data.decisions_pending.includes('n/d') &&
      (parsed.data.decisions_pending.length !== 1 || parsed.data.decisions_pending[0] !== 'n/d')) {
    errors.push('decisions_pending desconhecido deve ser somente ["n/d"]');
  }
  return { ok: errors.length === 0, data: parsed.data, errors };
}

function renderTypedFixture(inputType, sourceText, options = {}) {
  const sourceSha = require('node:crypto').createHash('sha256').update(canonicalSource(sourceText)).digest('hex');
  if (sourceSha !== FIXTURE_SOURCE_SHA256) {
    throw new Error(`fixture source não corresponde à cd89 pinada: ${sourceSha}`);
  }
  const brief = parseBrief(sourceText);
  const values = projectBrief(brief, inputType, options.sourceRef);
  return renderTemplate(inputType, values, options.templateDir);
}

function fixturePath(type) {
  return path.join(FIXTURE_ROOT, `${FIXTURE_ID}.${TYPE_FILES[type].replace('.template', '')}`);
}

function lineCount(text) {
  const normalized = normalizeEol(text).replace(/\n+$/, '');
  return normalized ? normalized.split('\n').length : 0;
}

function estimateTokens(text) {
  const bytes = Buffer.byteLength(text, 'utf8');
  const lexical = (text.match(/[\p{L}\p{N}_]+|[^\s]/gu) || []).length;
  return Math.max(lexical, Math.ceil(bytes / 3));
}

function validateTypedArtifacts(options = {}) {
  const templateDir = options.templateDir || TEMPLATE_ROOT;
  const sourceFile = options.sourceFile || FIXTURE_SOURCE;
  const errors = [];
  const warnings = [];
  const results = {};
  const renderedByType = {};
  const parsed = parseMessageContracts(options.protocolText);
  if (!parsed.ok) errors.push(parsed.err);
  const ccaCanon = parseCcaCriteria(options.protocolText);
  if (!ccaCanon.ok) errors.push(`canon CCA-F inválido: ${ccaCanon.err}`);
  const councilCanon = parseCouncilQuestions(options.agentsText);
  if (!councilCanon.ok) errors.push(`canon council inválido: ${councilCanon.err}`);
  const contracts = new Map(parsed.contracts.map((contract) => [contract.type, contract]));
  const expectedTypes = Object.keys(TYPE_FILES);
  const actualTypes = [...contracts.keys()];
  const duplicates = parsed.contracts
    .map((contract) => contract.type)
    .filter((type, index, all) => all.indexOf(type) !== index);
  const unknown = actualTypes.filter((type) => !expectedTypes.includes(type));
  if (duplicates.length) errors.push(`protocol duplica tipos: ${[...new Set(duplicates)].join(', ')}`);
  if (unknown.length) errors.push(`protocol contém tipos desconhecidos: ${unknown.join(', ')}`);
  if (parsed.contracts.length !== expectedTypes.length || actualTypes.length !== expectedTypes.length || expectedTypes.some((type) => !contracts.has(type))) {
    errors.push(`protocol deve definir exatamente: ${expectedTypes.join(', ')}`);
  }
  let source = null;
  try { source = fs.readFileSync(sourceFile, 'utf8'); } catch { errors.push(`fixture source ausente: ${sourceFile}`); }
  if (source !== null) {
    const sha = require('node:crypto').createHash('sha256').update(canonicalSource(source)).digest('hex');
    if (sha !== FIXTURE_SOURCE_SHA256) errors.push(`fixture source sha diverge: ${sha}`);
  }

  for (const type of expectedTypes) {
    const contract = contracts.get(type);
    const file = path.join(templateDir, TYPE_FILES[type]);
    let template;
    try { template = fs.readFileSync(file, 'utf8'); } catch { errors.push(`template ausente: ${file}`); continue; }
    const lines = lineCount(template);
    if (lines > 60) errors.push(`${TYPE_FILES[type]} tem ${lines} linhas (>60)`);
    if (contract && !template.includes(`Budget: ≤ ${contract.budgetTokens / 1000}k tokens`)) {
      errors.push(`${TYPE_FILES[type]} não declara o budget canônico`);
    }
    const placeholders = new Set([...template.matchAll(/<([A-Z][A-Z0-9_]*)>/g)].map((m) => m[1]));
    for (const required of REQUIRED_PLACEHOLDERS[type]) {
      if (!placeholders.has(required)) errors.push(`${TYPE_FILES[type]} omite <${required}>`);
    }
    if (type === 'HANDOFF' || type === 'BRIEF') {
      if (!normalizeEol(template).startsWith('---\n')) errors.push(`${TYPE_FILES[type]} omite frontmatter YAML`);
      for (const field of PROJECTION_FRONTMATTER_FIELDS) {
        if (!new RegExp(`^${field}:`, 'm').test(template)) errors.push(`${TYPE_FILES[type]} omite frontmatter ${field}`);
      }
      if (!/^status: .*# lifecycle$/m.test(template) || !/^state: .*# execution$/m.test(template)) {
        errors.push(`${TYPE_FILES[type]} mistura status lifecycle com state execution`);
      }
    }
    if (type === 'HANDOFF') {
      const footers = normalizeEol(template).split('\n').filter((line) => line.startsWith('CCA:'));
      if (footers.length !== 1 || footers[0] !== 'CCA: <CCA_SCORE>/5') {
        errors.push('HANDOFF.template.md deve conter exatamente CCA: <CCA_SCORE>/5');
      }
    }
    if (type === 'MASTERPROMPT' || type === 'DECISION CONTRACT') {
      const footers = normalizeEol(template).split('\n').filter((line) => line.startsWith('🔍 council'));
      const expected = '🔍 council <COUNCIL_SCORE> · objeção mais forte: <COUNCIL_OBJECTION> · resolvida: <COUNCIL_RESOLUTION>';
      if (footers.length !== 1 || footers[0] !== expected) {
        errors.push(`${TYPE_FILES[type]} deve conter exatamente um rodapé council`);
      }
    }
    if (source === null || !contract) continue;
    let rendered;
    try { rendered = renderTypedFixture(type, source, { templateDir }); }
    catch (err) { errors.push(`${type} render falhou: ${err.message}`); continue; }
    renderedByType[type] = rendered;
    const goldenFile = options.fixtureRoot
      ? path.join(options.fixtureRoot, path.basename(fixturePath(type)))
      : fixturePath(type);
    let golden;
    try { golden = fs.readFileSync(goldenFile, 'utf8'); }
    catch { errors.push(`golden ausente: ${goldenFile}`); continue; }
    if (normalizeEol(golden).replace(/\n*$/, '\n') !== rendered) errors.push(`${path.basename(goldenFile)} diverge do renderer`);
    if (/<[A-Za-z][A-Za-z0-9_ -]*>/.test(rendered)) errors.push(`${type} fixture contém placeholder`);
    const estimatedTokens = estimateTokens(rendered);
    if (estimatedTokens > contract.budgetTokens) errors.push(`${type} excede budget: ~${estimatedTokens}/${contract.budgetTokens}`);
    let frontmatter = null;
    if (type === 'HANDOFF' || type === 'BRIEF') {
      frontmatter = validateProjectionFrontmatter(rendered, type);
      for (const error of frontmatter.errors) errors.push(`${type} ${error}`);
    }
    results[type] = {
      lines: lineCount(rendered), bytes: Buffer.byteLength(rendered), estimatedTokens,
      ...(frontmatter ? { frontmatter: frontmatter.ok } : {}),
    };
    if (/pushed ✓|STATE:\s*landed|0 uncommitted|tests?\s+\d+\/\d+\s+✓/i.test(rendered)) {
      errors.push(`${type} fixture contém falso verde load-bearing`);
    }
    if (type === 'HANDOFF') {
      const footer = validateCcaFooter(rendered, 5);
      footer.errors.forEach((error) => errors.push(`${type} ${error}`));
      footer.warnings.forEach((warning) => warnings.push(`${type} ${warning}`));
      if (/^CCA: 5\/5$/m.test(rendered)) errors.push('HANDOFF fixture fabrica CCA 5/5 sem evidência');
    }
    if (type === 'MASTERPROMPT' || type === 'DECISION CONTRACT') {
      const footer = validateCouncilFooter(rendered);
      footer.errors.forEach((error) => errors.push(`${type} ${error}`));
      footer.warnings.forEach((warning) => warnings.push(`${type} ${warning}`));
      if (/^🔍 council 8\/8/m.test(rendered)) errors.push(`${type} fixture fabrica council 8/8 sem evidência`);
    }
  }

  if (expectedTypes.every((type) => renderedByType[type])) {
    const master = renderedByType.MASTERPROMPT;
    const handoff = renderedByType.HANDOFF;
    const decision = renderedByType['DECISION CONTRACT'];
    const brief = renderedByType.BRIEF;
    if (!/♻️ REUSE[\s\S]*n\/d[\s\S]*⛔ STOP/.test(master)) errors.push('MASTERPROMPT não degrada REUSE ausente para n/d + STOP');
    if (!/STATE: n\/d[\s\S]*UNPUSHED: n\/d[\s\S]*RED ALERT[\s\S]*POST_MERGE_REMEDIATION_MASTERPROMPT\.md[\s\S]*⛔ STOP/.test(handoff)) {
      errors.push('HANDOFF não expõe STATE/UNPUSHED n/d + RED ALERT completo + STOP');
    }
    if (/\|\s*(APPROVE|CHANGES)\s*\|/.test(decision) || !/\| n\/d \|/.test(decision)) errors.push('DECISION CONTRACT inventa ou omite verdict n/d');
    if (!/CODEX → LEDGER → COWORK/.test(brief) || !/uncommitted:[^\n]*POST_MERGE_REMEDIATION_MASTERPROMPT\.md/.test(brief) || !/⛔ STOP:/.test(brief)) {
      errors.push('BRIEF não preserva ledger → consumer + RED ALERT completo + STOP');
    }
    for (const [type, artifact] of [['HANDOFF', handoff], ['BRIEF', brief]]) {
      const frontmatter = validateProjectionFrontmatter(artifact, type);
      if (frontmatter.data.status !== 'ready' || frontmatter.data.state !== 'n/d') {
        errors.push(`${type} não preserva status lifecycle distinto de state execution`);
      }
      if (frontmatter.data.tests !== 'n/d' || frontmatter.data.uncommitted !== 'n/d') {
        errors.push(`${type} fabrica tests/uncommitted no frontmatter`);
      }
      if (JSON.stringify(frontmatter.data.decisions_pending) !== JSON.stringify(['F1', 'F2', 'F3'])) {
        errors.push(`${type} decisions_pending não projeta F1/F2/F3`);
      }
    }
  }
  return { ok: errors.length === 0, errors, warnings, results };
}

/** Parse NUL-delimited porcelain without losing spaces or rename source paths. */
function parseStatus(raw, root = REPO) {
  if (raw === null) return { known: false, entries: [], paths: null };
  const parts = raw.split('\0');
  const entries = [];
  const paths = [];
  for (let i = 0; i < parts.length; i++) {
    const record = parts[i];
    if (!record) continue;
    const code = record.slice(0, 2);
    const target = record.slice(3);
    const names = [target];
    if (/[RC]/.test(code) && parts[i + 1]) names.push(parts[++i]);
    const absolute = names.filter(Boolean).map((name) => path.resolve(root, name));
    entries.push({ code, paths: absolute });
    paths.push(...absolute);
  }
  return { known: true, entries, paths: [...new Set(paths)] };
}

/** Mechanical git truth. Every value is measured; failures become null → n/d. */
function gitFacts(run = sh) {
  const branch = run('git', ['branch', '--show-current']);
  const head = run('git', ['rev-parse', '--short', 'HEAD']);
  const upstream = run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  const counts = upstream ? run('git', ['rev-list', '--left-right', '--count', `${upstream}...HEAD`]) : null;
  const [behind, ahead] = counts ? counts.split(/\s+/).map(Number) : [null, null];
  // cwd stays `undefined` like every other call here: pinning only this one to REPO
  // would let branch/HEAD/upstream come from an injected runner's repo while the
  // status came from another — a handoff describing two repositories at once.
  const status = parseStatus(run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], undefined, { raw: true }));
  const dirty = status.known ? status.entries.filter((e) => e.code !== '??').length : null;
  const untracked = status.known ? status.entries.filter((e) => e.code === '??').length : null;
  const uncommitted = status.known ? status.entries.length : null;
  const stat = upstream ? run('git', ['diff', '--shortstat', `${upstream}..HEAD`]) : null;
  const log = upstream ? run('git', ['log', '--format=%h %s', `${upstream}..HEAD`]) : null;
  const commits = log === null ? null : log.split('\n').filter(Boolean);
  const lastTs = run('git', ['log', '-1', '--format=%aI']);

  // STATE is DERIVED, never asserted: the spec's most important field.
  let state = 'n/d';
  if (uncommitted > 0) state = 'in-progress (dirty)';
  else if (uncommitted === 0 && ahead > 0) state = 'parked (precisa push)';
  else if (uncommitted === 0 && ahead === 0) state = 'landed';

  return {
    branch, head, upstream, ahead, behind, dirty, untracked, uncommitted,
    uncommittedPaths: status.paths, stat, commits, lastTs, state,
  };
}

/** Every worktree, so UNPUSHED is the sum across all of them and not a lie. */
function worktrees() {
  const raw = sh('git', ['worktree', 'list', '--porcelain']);
  if (raw === null) return null;
  if (!raw) return [];
  const out = [];
  let cur = {};
  for (const line of raw.split('\n')) {
    if (line.startsWith('worktree ')) cur = { path: line.slice(9) };
    else if (line.startsWith('HEAD ')) cur.head = line.slice(5, 12);
    else if (line.startsWith('branch ')) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (line === '') { if (cur.path) out.push(cur); cur = {}; }
  }
  if (cur.path) out.push(cur);
  return out;
}

/** Measure unpushed work against each worktree's own upstream, never origin/main. */
function unpushedInventory(wts, run = sh) {
  if (!Array.isArray(wts)) return { complete: false, text: '  n/d — inventário de worktrees indisponível' };
  let complete = true;
  const rows = wts.map((w) => {
    const upstream = run('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], w.path);
    const counts = upstream ? run('git', ['rev-list', '--left-right', '--count', `${upstream}...HEAD`], w.path) : null;
    const status = parseStatus(run('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], w.path, { raw: true }), w.path);
    if (!upstream || !counts || !status.known) {
      complete = false;
      return `  ${w.branch || w.head}  n/d`;
    }
    const values = counts.split(/\s+/).map(Number);
    if (values.length !== 2 || values.some((value) => !Number.isFinite(value))) {
      complete = false;
      return `  ${w.branch || w.head}  n/d`;
    }
    const ahead = values[1];
    const changed = status.entries.length;
    if (ahead === 0 && changed === 0) return null;
    return `  ${(w.branch || w.head).padEnd(42)} ${String(ahead).padStart(3)} unpushed · ${changed} uncommitted`;
  }).filter(Boolean);
  return {
    complete,
    text: rows.length
      ? rows.join('\n')
      : (complete ? '  (nada unpushed ou uncommitted em nenhum worktree verificado)' : '  n/d'),
  };
}

/** The GATE must be mechanical. Anything not actually run stays n/d. */
function gateFacts() {
  const shaFile = path.join(REPO, 'tools', 'router', 'classify.js.sha256');
  const target = path.join(REPO, 'tools', 'router', 'classify.js');
  let classifySha = 'n/d';
  if (fs.existsSync(shaFile) && fs.existsSync(target)) {
    const expected = fs.readFileSync(shaFile, 'utf8').trim();
    const actual = require('node:crypto')
      .createHash('sha256').update(fs.readFileSync(target)).digest('hex');
    classifySha = expected === actual ? '✓ intacto' : `✗ DIVERGE (${actual.slice(0, 8)}…)`;
  }
  return {
    classifySha,
    // Never claimed green from a file listing — only an actual run may fill this.
    tests: 'n/d (não executado neste preflight)',
  };
}

/**
 * Vault + Notion freshness. This does NOT read the vault's meaning — it only
 * answers "is the thing I need to sign a footer actually reachable?". If it
 * is not, the footer must say n/d instead of inventing a score, which is the
 * precise failure this cycle hit with `council 8/8`.
 */
function canonChecks() {
  const home = os.homedir();
  const vault = [path.join(home, 'paulo-vault'), path.join(home, 'Documents', 'paulo-vault')]
    .find((p) => fs.existsSync(p)) || null;
  const councilCanon = parseCouncilQuestions();
  const ccaCanon = parseCcaCriteria();

  const mirror = vault ? path.join(vault, '80-notion-mirror') : null;
  let notion = 'n/d';
  if (mirror && fs.existsSync(mirror)) {
    const newest = fs.readdirSync(mirror, { recursive: true })
      .map((f) => path.join(mirror, String(f)))
      .filter((f) => { try { return fs.statSync(f).isFile(); } catch { return false; } })
      .reduce((a, f) => Math.max(a, fs.statSync(f).mtimeMs), 0);
    const days = newest ? Math.floor((Date.now() - newest) / 86400000) : null;
    notion = days === null ? 'n/d' : `${days}d${days > 3 ? ' ⚠️ stale (>3d)' : ' ✓'}`;
  }

  return {
    vault: vault || 'n/d',
    council: councilCanon.ok ? '✓ 8 perguntas resolvíveis no AGENTS.md' : `n/d — ${councilCanon.err}`,
    cca: ccaCanon.ok ? '✓ 5 critérios CCA-F resolvíveis no protocolo' : `n/d — ${ccaCanon.err}`,
    notion,
  };
}

/**
 * Extract the session's Q&A VERBATIM from the Claude Code transcript.
 *
 * This is the field that hurt most. The spec's hole nº2 is "PENDING truncado —
 * preciso da pergunta COMPLETA + TODAS as opções, não 300c", and the Live
 * Context Accumulator cannot help: it emits kind:decision carrying only
 * output_hash/idem_key — a sha256, never the question. So the 2026-07-16 cycle
 * hand-transcribed nine questions through a cloud model.
 *
 * It never needed a model at all. The transcript holds every AskUserQuestion
 * tool_use (question + every option + descriptions) and the tool_result with
 * the chosen answers. Recovering them is JSON.parse — deterministic, free, and
 * verbatim by construction, which is exactly what the spec demands.
 */
function extractQA(sid) {
  if (!sid) return { ok: false, err: '--sid obrigatório; seleção global de transcript é proibida', rounds: [] };
  const projects = path.join(os.homedir(), '.claude', 'projects');
  if (!fs.existsSync(projects)) return { ok: false, err: 'sem ~/.claude/projects', rounds: [] };

  /** @type {string[]} */
  const candidates = [];
  for (const dir of fs.readdirSync(projects)) {
    const full = path.join(projects, dir);
    let entries;
    try { entries = fs.readdirSync(full); } catch { continue; }
    for (const f of entries) {
      if (!f.endsWith('.jsonl')) continue;
      if (sid && !f.startsWith(sid)) continue;
      candidates.push(path.join(full, f));
    }
  }
  if (!candidates.length) return { ok: false, err: sid ? `sem transcript para sid ${sid}` : 'sem transcripts', rounds: [] };

  // A pinned sid may still have multiple rotated files; newest for that exact
  // identity wins. Global newest is forbidden because it can cross worktrees.
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  const file = candidates[0];

  const lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  /** @type {{id:string,questions:any[]}[]} */
  const asks = [];
  /** @type {Map<string,string>} */
  const answers = new Map();

  for (const line of lines) {
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    const content = e && e.message && e.message.content;
    if (!Array.isArray(content)) continue;
    for (const b of content) {
      if (b.type === 'tool_use' && b.name === 'AskUserQuestion' && b.input && Array.isArray(b.input.questions)) {
        asks.push({ id: b.id, questions: b.input.questions });
      }
      if (b.type === 'tool_result' && b.tool_use_id && typeof b.content === 'string') {
        answers.set(b.tool_use_id, b.content);
      }
    }
  }

  const rounds = asks.map((a, i) => ({
    round: i + 1,
    questions: a.questions.map((q) => {
      const raw = answers.get(a.id) || '';
      // The harness echoes: "<question>"="<chosen>" — pair them by question text.
      const esc = q.question.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = raw.match(new RegExp(`"${esc}"="([^"]*)"`));
      return {
        question: q.question,
        header: q.header,
        options: q.options.map((o) => ({ label: o.label, description: o.description })),
        chosen: m ? m[1] : 'n/d (sem resposta registada no transcript)',
      };
    }),
  }));

  return { ok: true, err: null, file, rounds };
}

/** Render the recovered Q&A in the spec's DECISIONS shape — full text, never truncated. */
function renderQA(qa) {
  if (!qa.ok) return `  n/d — ${qa.err}`;
  const out = [`  (extraído verbatim de ${path.basename(qa.file)} — zero LLM)`];
  let n = 0;
  for (const r of qa.rounds) {
    for (const q of r.questions) {
      n += 1;
      out.push('');
      out.push(`  Q${n}. "${q.question}"`);
      q.options.forEach((o, i) => out.push(`     ${i + 1}) ${o.label} — ${o.description}`));
      out.push(`     → escolheu: "${q.chosen}"`);
    }
  }
  out.push('');
  out.push(`  total: ${n} perguntas · ${qa.rounds.length} rondas`);
  return out.join('\n');
}

function todo(name) {
  return `<<TODO: ${JUDGEMENT_FIELDS[name] || name}>>`;
}

function render(f) {
  const { git, wts, gate, canon, drift } = f;
  const nd = (v) => (v === null || v === undefined || v === '' ? 'n/d' : v);
  const pushed = git.ahead === null ? 'n/d' : (git.ahead > 0 ? `UNPUSHED ⚠ (${git.ahead})` : 'pushed ✓');
  const redAlert = git.uncommittedPaths === null
    ? '  n/d — git status indisponível'
    : (git.uncommittedPaths.length
      ? git.uncommittedPaths.map((p) => `  - ${p}`).join('\n')
      : '  nenhum (git status verificado)');

  const inventory = unpushedInventory(wts);
  const unpushedBlock = inventory.text;

  return `⇄ MOO HANDOFF · ${todo('INTENT')} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}
TL;DR:    ${git.state} · ${git.ahead ?? 'n/d'} commits por push · ${git.uncommitted ?? 'n/d'} uncommitted
GOAL:     ${todo('GOAL')}
INTENT:   ${todo('INTENT')}

🎯 A ÚNICA COISA: ${todo('A ÚNICA COISA')}

STATE:    ${git.state}
WORKTREE: ${REPO} · ${nd(git.branch)} @${nd(git.head)} · ${git.ahead ?? 'n/d'} ahead of ${nd(git.upstream)} · ${pushed}
GATE:     classify.js sha ${gate.classifySha} · testes ${gate.tests}
WORK:     ${nd(git.stat)}
          commits: ${git.commits === null ? 'n/d' : (git.commits.length ? '\n            ' + git.commits.join('\n            ') : 'nenhum')}
DECISIONS:
${renderQA(f.qa)}
  Nota: NÃO vem do Ledger. O Live Context Accumulator emite kind:decision só com
  output_hash/idem_key — hashes, sem Q, opções ou escolha. Isto foi recuperado do
  transcript do Claude Code, que guarda o AskUserQuestion inteiro. Zero LLM.
PENDING:
  ${todo('PENDING')}
RED ALERT — uncommitted:
${redAlert}
RISK:
  ${todo('RISK')}

UNPUSHED (todos os worktrees):
${unpushedBlock}

BOARD:
  ${todo('BOARD')}

NEXT:     ${todo('NEXT')}
NEXT FOR COWORK:
  ${todo('NEXT FOR COWORK')}

~narrativa (qwen, best-effort · nunca load-bearing): <<local moo preenche>>

conf:     git ${git.branch && git.head && git.ahead !== null && git.uncommitted !== null && inventory.complete ? '✓ (medido)' : 'n/d'} · gate ${gate.classifySha.startsWith('✓') ? '✓' : 'n/d'} · narrativa ~
canon:    vault ${canon.vault === 'n/d' ? 'n/d' : '✓'} · council ${canon.council} · notion ${canon.notion}

Rodapés
CCA: ${canon.cca.startsWith('✓') ? '<<preencher n>>/5' : 'n/d/5'} — ${canon.cca}
${drift.drifted ? `\n⚠️ SPEC DRIFT: o spec tem campos que este preflight não conhece: ${drift.unknown.join(', ')}\n   Actualiza KNOWN_FIELDS em tools/handoff-preflight.js antes de confiar neste esqueleto.` : ''}
⇄ END`;
}

function main() {
  const argv = process.argv.slice(2);
  const drift = checkSpecDrift();

  if (argv.includes('--check') || argv.includes('--check-templates')) {
    let failed = false;
    if (argv.includes('--check')) {
      if (drift.err) { console.error(`handoff-preflight: ${drift.err}`); failed = true; }
      else if (drift.drifted) {
        console.error(`handoff-preflight: SPEC DRIFT — campos desconhecidos: ${drift.unknown.join(', ')}`);
        failed = true;
      } else {
        console.log('handoff-preflight: OK — sem drift nos campos parseáveis do spec; bullets load-bearing pinados nos testes');
      }
    }
    const typed = validateTypedArtifacts();
    typed.warnings.forEach((warning) => console.warn(`handoff-preflight: ⚠️ ${warning}`));
    if (!typed.ok) {
      typed.errors.forEach((err) => console.error(`handoff-preflight: ${err}`));
      failed = true;
    } else {
      console.log('handoff-preflight: OK — 4 templates + 4 fixtures honestas');
    }
    if (failed) process.exitCode = 1;
    return;
  }

  const fixtureIdx = argv.indexOf('--fixture');
  const typeIdx = argv.indexOf('--type');
  if (fixtureIdx !== -1 || typeIdx !== -1) {
    if (fixtureIdx === -1 || typeIdx === -1 || !argv[fixtureIdx + 1] || !argv[typeIdx + 1]) {
      console.error('handoff-preflight: --fixture FILE e --type TYPE são obrigatórios em conjunto');
      process.exitCode = 2;
      return;
    }
    const type = normalizeMessageType(argv[typeIdx + 1]);
    if (!type) {
      console.error(`handoff-preflight: tipo desconhecido: ${argv[typeIdx + 1]}`);
      process.exitCode = 2;
      return;
    }
    const sourceFile = path.resolve(REPO, argv[fixtureIdx + 1]);
    let source;
    let sourceBytes;
    try { sourceBytes = fs.readFileSync(sourceFile); source = sourceBytes.toString('utf8'); }
    catch (err) {
      console.error(`handoff-preflight: fixture ilegível: ${err.message}`);
      process.exitCode = 2;
      return;
    }
    const sourceSha = require('node:crypto').createHash('sha256').update(canonicalSource(source)).digest('hex');
    if (sourceSha !== FIXTURE_SOURCE_SHA256) {
      console.error(`handoff-preflight: --fixture aceita somente a source cd89 pinada (${FIXTURE_SOURCE_SHA256})`);
      process.exitCode = 2;
      return;
    }
    const sourceRef = `${path.relative(REPO, sourceFile).split(path.sep).join('/')}:1-55`;
    const out = renderTypedFixture(type, source, { sourceRef });
    const outIdx = argv.indexOf('--out');
    if (outIdx !== -1 && argv[outIdx + 1]) {
      fs.writeFileSync(argv[outIdx + 1], out);
      console.log(`handoff-preflight: escrito → ${argv[outIdx + 1]}`);
    } else {
      process.stdout.write(out);
    }
    return;
  }

  const sidIdx = argv.indexOf('--sid');
  const sid = sidIdx !== -1 ? argv[sidIdx + 1] : (process.env.CLAUDE_SESSION_ID || null);
  const qa = extractQA(sid);

  if (argv.includes('--qa')) {
    console.log(renderQA(qa));
    return;
  }

  const facts = { git: gitFacts(), wts: worktrees(), gate: gateFacts(), canon: canonChecks(), drift, qa };

  if (argv.includes('--json')) {
    console.log(JSON.stringify(facts, null, 2));
    return;
  }

  const out = render(facts);
  const i = argv.indexOf('--out');
  if (i !== -1 && argv[i + 1]) {
    fs.writeFileSync(argv[i + 1], out + '\n');
    console.log(`handoff-preflight: escrito → ${argv[i + 1]}`);
    return;
  }
  console.log(out);
}

if (require.main === module) main();

module.exports = {
  sh, specFields, checkSpecDrift, gitFacts, worktrees, gateFacts, canonChecks,
  extractQA, renderQA, render, KNOWN_FIELDS, parseStatus, parseMessageContracts,
  normalizeMessageType, parseBrief, projectBrief, renderTemplate,
  renderTypedFixture, validateTypedArtifacts, parseProjectionFrontmatter,
  validateProjectionFrontmatter, estimateTokens, unpushedInventory, TYPE_FILES,
  PROJECTION_FRONTMATTER_FIELDS, parseCouncilQuestions, parseCcaCriteria,
  validateCcaFooter, validateCouncilFooter,
};
