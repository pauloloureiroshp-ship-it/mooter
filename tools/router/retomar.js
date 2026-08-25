#!/usr/bin/env node
'use strict';

// Retomar, camada 1: transcript + Git produce facts; a fixed rule table produces
// suggestions. No prompt text is interpreted and no model or network is used.

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ND = 'n/d';
const WRITE_TOOLS = new Set(['edit', 'write', 'multiedit', 'notebookedit']);
const TEST_COMMAND_RE = /(?:^|[;&|]\s*|\s)(?:(?:npm|pnpm|yarn)\s+(?:run\s+)?test(?::[^\s;&|]+)?\b|node\s+--test\b|pytest\b|vitest\b|jest\b|go\s+test\b|cargo\s+test\b)/i;
const TERMINAL_CHIP_STATES = new Set(['done', 'feito', 'completed', 'concluido', 'concluído', 'closed', 'fechado', 'cancelled', 'canceled', 'cancelado']);
const PENDING_CHIP_STATES = new Set(['pending', 'pendente', 'todo', 'open', 'aberto', 'queued', 'fila']);

function measured(value, source) {
  return { status: 'measured', value, source: source || ND, because: null };
}

function unavailable(because, source) {
  return { status: ND, value: null, source: source || ND, because: because || 'fonte indisponível' };
}

function diagnostic(list, message) {
  if (Array.isArray(list)) list.push(String(message));
}

function compactError(error) {
  const text = (error && (error.code || error.message)) || String(error || 'erro desconhecido');
  return String(text).replace(/\s+/g, ' ').slice(0, 240);
}

function contentText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((part) => {
    if (typeof part === 'string') return part;
    if (part && typeof part.text === 'string') return part.text;
    if (part && typeof part.content === 'string') return part.content;
    return '';
  }).filter(Boolean).join('\n');
}

function messageBlocks(entry) {
  const content = entry && entry.message && entry.message.content;
  return Array.isArray(content) ? content : [];
}

function extractWritePaths(input) {
  if (!input || typeof input !== 'object') return [];
  const found = [];
  for (const key of ['file_path', 'path', 'notebook_path']) {
    if (typeof input[key] === 'string' && input[key].trim()) found.push(input[key].trim());
  }
  if (Array.isArray(input.files)) {
    for (const item of input.files) {
      if (typeof item === 'string' && item.trim()) found.push(item.trim());
      else if (item && typeof item.file_path === 'string' && item.file_path.trim()) found.push(item.file_path.trim());
    }
  }
  return found;
}

function resultExitCode(entry, block) {
  const structured = entry && entry.toolUseResult;
  for (const raw of [structured && structured.exitCode, structured && structured.exit_code, block && block.exitCode, block && block.exit_code]) {
    if (raw !== undefined && raw !== null && raw !== '') {
      const number = Number(raw);
      if (Number.isInteger(number)) return number;
    }
  }
  if (block && block.is_error === true) return 'nonzero';
  if (block && block.is_error === false) return 0;
  return null;
}

function parseTestCount(output) {
  const text = String(output || '');
  const patterns = [
    /(?:^|\n)\s*[#ℹ]\s*fail\s+(\d+)\b/gim,
    /\bTests:\s*(\d+)\s+failed\b/gim,
    /\bTests\s+(\d+)\s+failed\b/gim,
    /(?:^|\s)(\d+)\s+failed(?:,|\s|$)/gim,
  ];
  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)];
    if (matches.length) return Number(matches[matches.length - 1][1]);
  }
  return null;
}

function parseTestFile(output) {
  const text = String(output || '');
  const patterns = [
    /\bFAILED\s+([^\s:]+(?:::[^\s]+)?)/m,
    /(?:^|\n)\s*[✖×]\s+([^\r\n]*?\.(?:test|spec)\.[cm]?[jt]s)\b/im,
    /(?:\(|\s)([A-Za-z]:[\\/][^\r\n()]*?\.(?:test|spec)\.[cm]?[jt]s|[\w./\\-]+\.(?:test|spec)\.[cm]?[jt]s)(?::\d+)?/im,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) return match[1].trim();
  }
  return null;
}

function emptyTranscriptFacts(reason, source) {
  return {
    session_files_touched: unavailable(reason, source),
    session_failed_commands: unavailable(reason, source),
    session_red_tests: unavailable(reason, source),
    session_red_test_file: unavailable(reason, source),
    session_branch: unavailable(reason, source),
    session_cwd: unavailable(reason, source),
    session_worktree: unavailable(reason, source),
  };
}

function findWorktreeRoot(cwd, io = fs) {
  if (!cwd) return null;
  let cursor = path.resolve(cwd);
  while (true) {
    try {
      if (io.existsSync(path.join(cursor, '.git'))) return cursor;
    } catch { return null; }
    const parent = path.dirname(cursor);
    if (parent === cursor) return null;
    cursor = parent;
  }
}

function analyzeTranscript(transcriptPath, options = {}) {
  const io = options.fs || fs;
  const diagnostics = options.diagnostics || [];
  const source = transcriptPath ? path.resolve(transcriptPath) : ND;
  if (!transcriptPath) {
    return { facts: emptyTranscriptFacts('caminho do transcript ausente', source), meta: { transcript: null, session_id: null, tool_use_count: 0, malformed_lines: 0 } };
  }

  let raw;
  try { raw = io.readFileSync(source, 'utf8'); }
  catch (error) {
    const because = `transcript ilegível: ${compactError(error)}`;
    diagnostic(diagnostics, because);
    return { facts: emptyTranscriptFacts(because, source), meta: { transcript: source, session_id: null, tool_use_count: 0, malformed_lines: 0 } };
  }
  if (!raw.trim()) {
    return { facts: emptyTranscriptFacts('transcript vazio', source), meta: { transcript: source, session_id: null, tool_use_count: 0, malformed_lines: 0 } };
  }

  const toolUses = new Map();
  const toolResults = new Map();
  const filesTouched = new Set();
  let branch = null;
  let worktree = null;
  let sessionId = null;
  let malformed = 0;
  let order = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let entry;
    try { entry = JSON.parse(line); }
    catch { malformed += 1; continue; }
    // The first cwd is the session's launch worktree. Later entries may be a
    // package subdirectory after `cd`, which is not a different worktree.
    if (!worktree && typeof entry.cwd === 'string' && entry.cwd.trim()) worktree = entry.cwd.trim();
    if (typeof entry.gitBranch === 'string' && entry.gitBranch.trim()) branch = entry.gitBranch.trim();
    if (typeof entry.sessionId === 'string' && entry.sessionId.trim()) sessionId = entry.sessionId.trim();
    for (const block of messageBlocks(entry)) {
      if (block && block.type === 'tool_use' && block.id) {
        const use = { id: block.id, name: String(block.name || ''), input: block.input || {}, order: order++ };
        toolUses.set(block.id, use);
        if (WRITE_TOOLS.has(use.name.toLowerCase())) {
          for (const file of extractWritePaths(use.input)) filesTouched.add(file);
        }
      }
      if (block && block.type === 'tool_result' && block.tool_use_id) {
        toolResults.set(block.tool_use_id, { exit_code: resultExitCode(entry, block), output: contentText(block.content) });
      }
    }
  }

  if (malformed > 0) {
    const because = `${malformed} linha(s) JSONL ilegível(is); fatos parciais não são promovidos a medição`;
    diagnostic(diagnostics, `${source}: ${because}`);
    return { facts: emptyTranscriptFacts(because, source), meta: { transcript: source, session_id: sessionId, tool_use_count: toolUses.size, malformed_lines: malformed } };
  }

  const bashUses = [...toolUses.values()].filter((use) => use.name.toLowerCase() === 'bash').sort((a, b) => a.order - b.order);
  const missingResults = bashUses.filter((use) => {
    const result = toolResults.get(use.id);
    return !result || result.exit_code === null;
  });
  const failedCommands = missingResults.length
    ? unavailable(`${missingResults.length} comando(s) sem código de saída mensurável`, source)
    : measured(bashUses.filter((use) => toolResults.get(use.id).exit_code !== 0).map((use) => ({ command: String(use.input.command || ND), exit_code: toolResults.get(use.id).exit_code })), source);

  const testUses = bashUses.filter((use) => TEST_COMMAND_RE.test(String(use.input.command || '')));
  const lastTest = testUses.length ? testUses[testUses.length - 1] : null;
  let redTests;
  let redTestFile;
  if (!lastTest) {
    redTests = unavailable('nenhuma corrida de testes visível no transcript', source);
    redTestFile = unavailable('nenhuma corrida de testes visível no transcript', source);
  } else {
    const result = toolResults.get(lastTest.id);
    if (!result) {
      redTests = unavailable('a última corrida de testes não tem resultado visível', source);
      redTestFile = unavailable('a última corrida de testes não tem resultado visível', source);
    } else {
      const count = parseTestCount(result.output);
      if (count === null) {
        redTests = unavailable('a saída da última corrida não declara quantos testes falharam', source);
        redTestFile = unavailable('sem contagem de testes vermelhos verificável', source);
      } else {
        redTests = measured(count, source);
        if (count === 0) redTestFile = measured(null, source);
        else {
          const file = parseTestFile(result.output);
          redTestFile = file ? measured(file, source) : unavailable('a saída mede falhas, mas não identifica um arquivo', source);
        }
      }
    }
  }

  return {
    facts: {
      session_files_touched: measured([...filesTouched].sort(), source),
      session_failed_commands: failedCommands,
      session_red_tests: redTests,
      session_red_test_file: redTestFile,
      session_branch: branch ? measured(branch, source) : unavailable('branch ausente no transcript', source),
      session_cwd: worktree ? measured(worktree, source) : unavailable('cwd ausente no transcript', source),
      session_worktree: findWorktreeRoot(worktree, io)
        ? measured(findWorktreeRoot(worktree, io), source)
        : unavailable(worktree ? 'cwd conhecido, mas a raiz Git do worktree não é mensurável' : 'cwd ausente no transcript', source),
    },
    meta: { transcript: source, session_id: sessionId, tool_use_count: toolUses.size, malformed_lines: 0 },
  };
}

function runGit(cwd, args, options = {}) {
  const exec = options.execFileSync || childProcess.execFileSync;
  try {
    const stdout = exec('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: options.timeoutMs || 250,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, stdout: String(stdout || '').trim() };
  } catch (error) {
    return { ok: false, error: compactError(error) };
  }
}

function parsePorcelain(output) {
  return String(output || '').split(/\r?\n/).filter(Boolean).map((line) => ({
    status: line.slice(0, 2),
    path: line.slice(3),
  }));
}

function collectGitFacts(cwd, options = {}) {
  const diagnostics = options.diagnostics || [];
  const source = cwd ? `git -C ${cwd}` : 'git';
  if (!cwd) {
    const reason = 'cwd ausente no payload do hook';
    return {
      git_unpushed_commits: unavailable(reason, source),
      git_uncommitted_files: unavailable(reason, source),
      git_branch: unavailable(reason, source),
      git_worktree: unavailable(reason, source),
    };
  }

  const root = runGit(cwd, ['rev-parse', '--show-toplevel'], options);
  const branch = runGit(cwd, ['branch', '--show-current'], options);
  const unpushed = runGit(cwd, ['rev-list', '--count', '@{u}..HEAD'], options);
  const status = runGit(cwd, ['status', '--porcelain=v1', '--untracked-files=normal'], options);
  for (const [name, result] of Object.entries({ worktree: root, branch, unpushed, status })) {
    if (!result.ok) diagnostic(diagnostics, `git ${name} n/d: ${result.error}`);
  }

  const unpushedCount = unpushed.ok && /^\d+$/.test(unpushed.stdout) ? Number(unpushed.stdout) : null;
  return {
    git_unpushed_commits: unpushedCount === null
      ? unavailable(unpushed.ok ? 'git rev-list não devolveu uma contagem' : `upstream indisponível ou git falhou: ${unpushed.error}`, source)
      : measured(unpushedCount, source),
    git_uncommitted_files: status.ok
      ? measured(parsePorcelain(status.stdout), source)
      : unavailable(`git status falhou: ${status.error}`, source),
    git_branch: branch.ok && branch.stdout
      ? measured(branch.stdout, source)
      : unavailable(branch.ok ? 'HEAD destacado ou branch vazio' : `git branch falhou: ${branch.error}`, source),
    git_worktree: root.ok && root.stdout
      ? measured(path.resolve(root.stdout), source)
      : unavailable(root.ok ? 'git não devolveu a raiz do worktree' : `git rev-parse falhou: ${root.error}`, source),
  };
}

function chipTitle(chip) {
  if (typeof chip === 'string') return chip.trim() || null;
  if (!chip || typeof chip !== 'object') return null;
  for (const key of ['title', 'titulo', 'título', 'label', 'text']) {
    if (typeof chip[key] === 'string' && chip[key].trim()) return chip[key].trim();
  }
  return null;
}

function chipIsPending(chip) {
  if (typeof chip === 'string') return true;
  if (!chip || typeof chip !== 'object') return false;
  if (chip.pending === true) return true;
  const state = String(chip.state || chip.status || chip.estado || '').trim().toLowerCase();
  if (!state || TERMINAL_CHIP_STATES.has(state)) return false;
  return PENDING_CHIP_STATES.has(state);
}

function pendingChipCandidates(options = {}) {
  const cwd = options.cwd || null;
  const mooterHome = options.mooterHome || process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  return [
    options.stateFile,
    process.env.MOOTER_RETOMAR_CHIPS_FILE,
    cwd && path.join(cwd, '.mooter', 'retomar-chips.json'),
    path.join(mooterHome, 'retomar-chips.json'),
  ].filter(Boolean).map((item) => path.resolve(item));
}

function readPendingChips(options = {}) {
  const io = options.fs || fs;
  const diagnostics = options.diagnostics || [];
  const candidates = [...new Set(pendingChipCandidates(options))];
  const stateFile = candidates.find((file) => {
    try { return io.existsSync(file); } catch { return false; }
  });
  if (!stateFile) {
    return unavailable(`nenhum arquivo de estado reconhecido (${candidates.join(', ') || ND})`, 'retomar-chips.json');
  }

  let parsed;
  try { parsed = JSON.parse(io.readFileSync(stateFile, 'utf8')); }
  catch (error) {
    const because = `estado de chips ilegível: ${compactError(error)}`;
    diagnostic(diagnostics, `${stateFile}: ${because}`);
    return unavailable(because, stateFile);
  }
  const chips = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.chips) ? parsed.chips : null;
  if (!chips) return unavailable('schema sem array chips', stateFile);
  const titles = chips.filter(chipIsPending).map(chipTitle);
  if (titles.some((title) => !title)) return unavailable('chip pendente sem título mensurável', stateFile);
  return measured(titles, stateFile);
}

function samePath(left, right) {
  if (!left || !right) return false;
  const normalize = (value) => path.resolve(String(value)).replace(/[\\/]+$/, '').toLowerCase();
  return normalize(left) === normalize(right);
}

function factValue(fact, fallback = ND) {
  return fact && fact.status === 'measured' ? fact.value : fallback;
}

// Fixed rule table from MP_RETOMAR_2026-08-25.md, in its declared order.
function buildSuggestions(facts) {
  const suggestions = [];
  const currentBranch = factValue(facts.git_branch);
  const unpushed = factValue(facts.git_unpushed_commits, null);
  if (Number.isInteger(unpushed) && unpushed > 0) {
    suggestions.push({ rank: 10, rule: 'unpushed_commits', text: `abrir PR de \`${currentBranch}\` (${unpushed} commit${unpushed === 1 ? '' : 's'})` });
  }

  const red = factValue(facts.session_red_tests, null);
  if (Number.isInteger(red) && red > 0) {
    const file = factValue(facts.session_red_test_file);
    suggestions.push({ rank: 20, rule: 'red_tests', text: `ver \`${file}\` — ${red} teste${red === 1 ? '' : 's'} vermelho${red === 1 ? '' : 's'}` });
  }

  const changed = factValue(facts.git_uncommitted_files, null);
  if (Array.isArray(changed) && changed.length > 0) {
    suggestions.push({ rank: 30, rule: 'uncommitted_files', text: `${changed.length} arquivo${changed.length === 1 ? '' : 's'} por commitar em \`${currentBranch}\`` });
  }

  const chips = factValue(facts.pending_chips, null);
  if (Array.isArray(chips)) {
    chips.forEach((title, index) => suggestions.push({ rank: 40 + index / 1000, rule: 'pending_chip', text: `retomar: ${title}` }));
  }

  // A raiz git e melhor do que o `cwd` cru — diz o worktree, nao um subdirectorio
  // fundo. Mas ela so e mensuravel se o caminho ainda existir no disco: uma sessao
  // antiga num worktree ja apagado nao tem raiz para encontrar.
  //
  // Nesse caso NAO se perde o facto que se tem. Cair para o `cwd` mantem a
  // sugestao verdadeira e util ("estavas em X"), e o `n/d` da raiz continua
  // visivel nos factos. Perder a sugestao inteira porque a raiz nao se resolve
  // seria trocar um facto bom por silencio.
  const previousWorktree = factValue(facts.session_worktree, null) || factValue(facts.session_cwd, null);
  const currentWorktree = factValue(facts.git_worktree, null);
  if (previousWorktree && currentWorktree && !samePath(previousWorktree, currentWorktree)) {
    suggestions.push({ rank: 50, rule: 'different_worktree', text: `estavas em \`${previousWorktree}\`` });
  }
  return suggestions.sort((left, right) => left.rank - right.rank || left.text.localeCompare(right.text));
}

function countNdFacts(facts) {
  return Object.values(facts || {}).filter((fact) => !fact || fact.status === ND).length;
}

function renderFact(name, fact) {
  if (!fact || fact.status !== 'measured') {
    return `- ${name}: n/d (${(fact && fact.because) || 'sem medição'})`;
  }
  const value = fact.value;
  if (Array.isArray(value)) {
    if (!value.length) return `- ${name}: 0`;
    const rendered = value.slice(0, 5).map((item) => {
      if (typeof item === 'string') return item;
      if (item && item.command) return `${String(item.command).replace(/\s+/g, ' ').slice(0, 120)} [exit=${item.exit_code}]`;
      if (item && item.path) return `${item.status} ${item.path}`;
      return JSON.stringify(item);
    });
    return `- ${name}: ${value.length} (${rendered.join(' | ')}${value.length > rendered.length ? ' | …' : ''})`;
  }
  if (value === null) return `- ${name}: nenhum`;
  return `- ${name}: ${value}`;
}

function renderContext(report) {
  const lines = [
    '<retomar-camada1>',
    `sessao_origem: ${report.meta.session_id || ND}`,
    `transcript: ${report.meta.transcript || ND}`,
    'fatos:',
  ];
  for (const [name, fact] of Object.entries(report.facts)) lines.push(renderFact(name, fact));
  lines.push('sugestoes:');
  if (report.suggestions.length) {
    report.suggestions.forEach((suggestion, index) => lines.push(`${index + 1}. ${suggestion.text}`));
  } else {
    lines.push('- nenhuma regra disparou');
  }
  lines.push('</retomar-camada1>');
  return lines.join('\n');
}

function reportForTranscript(transcriptPath, options = {}) {
  const diagnostics = options.diagnostics || [];
  const transcript = analyzeTranscript(transcriptPath, { diagnostics, fs: options.fs });
  const gitFacts = options.gitFacts || collectGitFacts(options.cwd, {
    diagnostics,
    execFileSync: options.execFileSync,
    timeoutMs: options.gitTimeoutMs,
  });
  const pendingChips = options.pendingChips || readPendingChips({
    cwd: options.cwd,
    mooterHome: options.mooterHome,
    stateFile: options.chipsStateFile,
    diagnostics,
    fs: options.fs,
  });
  const facts = { ...transcript.facts, ...gitFacts, pending_chips: pendingChips };
  return { facts, suggestions: buildSuggestions(facts), meta: transcript.meta, diagnostics };
}

function selectTranscript(payload, options = {}) {
  const io = options.fs || fs;
  const current = payload && (payload.transcript_path || payload.transcriptPath);
  if (current) {
    try {
      // A resumed session already contains tool_use blocks. A substring probe
      // avoids fully parsing a large transcript twice before rendering it.
      const currentText = io.readFileSync(path.resolve(current), 'utf8');
      if (/"type"\s*:\s*"tool_use"/.test(currentText)) return path.resolve(current);
    } catch { /* select the previous transcript below */ }
    try {
      const dir = path.dirname(path.resolve(current));
      const excluded = path.resolve(current).toLowerCase();
      const candidates = io.readdirSync(dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
        .map((entry) => {
          const file = path.join(dir, entry.name);
          return { file, mtime: io.statSync(file).mtimeMs };
        })
        .filter((entry) => entry.file.toLowerCase() !== excluded)
        .sort((left, right) => right.mtime - left.mtime || left.file.localeCompare(right.file));
      if (candidates.length) return candidates[0].file;
    } catch { /* caller renders transcript facts as n/d */ }
  }
  return current ? path.resolve(current) : null;
}

function seenFile(options = {}) {
  const mooterHome = options.mooterHome || process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  return path.join(mooterHome, 'retomar-seen.json');
}

function readSeen(options = {}) {
  const io = options.fs || fs;
  const file = seenFile(options);
  try {
    const parsed = JSON.parse(io.readFileSync(file, 'utf8'));
    if (!parsed || !Array.isArray(parsed.sessions)) throw new Error('schema inválido');
    return { file, sessions: parsed.sessions.filter((item) => item && item.id) };
  } catch (error) {
    if (error && error.code === 'ENOENT') return { file, sessions: [] };
    throw new Error(`${file} ilegível: ${compactError(error)}`);
  }
}

function markSeen(sessionId, options = {}) {
  const io = options.fs || fs;
  const seen = readSeen(options);
  const sessions = seen.sessions.filter((item) => item.id !== sessionId);
  sessions.push({ id: sessionId, at: new Date().toISOString() });
  io.mkdirSync(path.dirname(seen.file), { recursive: true });
  const temporary = `${seen.file}.${process.pid}.tmp`;
  io.writeFileSync(temporary, JSON.stringify({ version: 1, sessions: sessions.slice(-100) }), 'utf8');
  io.renameSync(temporary, seen.file);
}

function hookContext(payload, options = {}) {
  const sessionId = payload && (payload.session_id || (payload.session && payload.session.id));
  const diagnostics = options.diagnostics || [];
  if (sessionId) {
    try {
      const seen = readSeen(options);
      if (seen.sessions.some((item) => item.id === sessionId)) return '';
    } catch (error) {
      diagnostic(diagnostics, compactError(error));
      // A broken marker must not suppress Resume. It may repeat, but never lies.
    }
  }

  const transcript = options.transcriptPath || selectTranscript(payload || {}, options);
  const report = reportForTranscript(transcript, {
    cwd: payload && payload.cwd,
    mooterHome: options.mooterHome,
    chipsStateFile: options.chipsStateFile,
    diagnostics,
    fs: options.fs,
    execFileSync: options.execFileSync,
    gitFacts: options.gitFacts,
    pendingChips: options.pendingChips,
    gitTimeoutMs: options.gitTimeoutMs,
  });
  if (sessionId) {
    try { markSeen(sessionId, options); }
    catch (error) { diagnostic(diagnostics, `marcador da sessão n/d: ${compactError(error)}`); }
  }
  return renderContext(report);
}

function sha256Name(name) {
  return crypto.createHash('sha256').update(String(name).replace(/\\/g, '/')).digest('hex');
}

function main() {
  const args = process.argv.slice(2);
  const hook = args.includes('--hook');
  const json = args.includes('--json');
  const valueAfter = (flag) => {
    const index = args.indexOf(flag);
    return index >= 0 ? args[index + 1] : null;
  };
  const diagnostics = [];
  if (hook) {
    let payload = {};
    try { payload = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); }
    catch (error) { process.stderr.write(`[retomar] payload n/d: ${compactError(error)}\n`); }
    const output = hookContext(payload, { diagnostics });
    for (const item of diagnostics) process.stderr.write(`[retomar] ${item}\n`);
    if (output) process.stdout.write(`${output}\n`);
    return;
  }

  const transcript = valueAfter('--transcript');
  if (!transcript) {
    process.stderr.write('uso: node retomar.js --transcript <sessao.jsonl> [--cwd <repo>] [--json]\n');
    process.exitCode = 2;
    return;
  }
  const report = reportForTranscript(transcript, {
    cwd: valueAfter('--cwd') || process.cwd(),
    diagnostics,
  });
  for (const item of diagnostics) process.stderr.write(`[retomar] ${item}\n`);
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : `${renderContext(report)}\n`);
}

module.exports = {
  ND,
  analyzeTranscript,
  buildSuggestions,
  collectGitFacts,
  countNdFacts,
  hookContext,
  measured,
  parseTestCount,
  parseTestFile,
  readPendingChips,
  renderContext,
  reportForTranscript,
  selectTranscript,
  sha256Name,
  unavailable,
};

if (require.main === module) main();
