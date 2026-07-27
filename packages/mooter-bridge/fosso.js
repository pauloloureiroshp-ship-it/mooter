'use strict';

/**
 * Contexto persistente e verificação factual local↔nuvem.
 * Todo o I/O potencialmente caro é assíncrono.
 */
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { PassThrough } = require('stream');
const moo = require('./moo.js');

const execFileAsync = promisify(execFile);
const CACHE_TTL_MS = 10 * 60 * 1000;
const SUMMARY_MAX_CHARS = 1200;
const CACHE_RELATIVE_PATH = path.join('.mooter', 'PROJECT_CONTEXT.json');
const IGNORED_DIRS = new Set(['node_modules', '.git', '.mooter', 'dist']);
const MANIFESTS = new Map([
  ['package.json', 'node'],
  ['pyproject.toml', 'python'],
  ['Cargo.toml', 'rust'],
  ['go.mod', 'go'],
]);
const INSTRUCTION_FILES = new Set(['CLAUDE.md', 'AGENTS.md']);
const CROSS_FILE_LIMIT = 256 * 1024;
const CROSS_PATH_LIMIT = 20;

function known(value, reason) {
  if (value == null || (Array.isArray(value) && value.length === 0)) {
    return { value: 'n/d', reason };
  }
  return { value, reason: null };
}

function cachePath(worktree) {
  return path.join(path.resolve(worktree), CACHE_RELATIVE_PATH);
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function gitHeadInfo(worktree) {
  const dotGit = path.join(worktree, '.git');
  let headPath = path.join(dotGit, 'HEAD');
  try {
    const stat = await fs.promises.stat(dotGit);
    if (stat.isFile()) {
      const pointer = await fs.promises.readFile(dotGit, 'utf8');
      const match = pointer.match(/^gitdir:\s*(.+)\s*$/i);
      if (!match) return { mtime_ms: null, reason: '.git sem gitdir válido' };
      const gitDir = path.isAbsolute(match[1])
        ? match[1]
        : path.resolve(worktree, match[1]);
      headPath = path.join(gitDir, 'HEAD');
    }
    const headStat = await fs.promises.stat(headPath);
    return { mtime_ms: headStat.mtimeMs, reason: null };
  } catch (error) {
    return {
      mtime_ms: null,
      reason: 'não foi possível ler .git/HEAD: '
        + ((error && error.code) || 'erro desconhecido'),
    };
  }
}

/** Caminho barato: um JSON e o mtime do HEAD; nunca percorre a árvore. */
async function lerMapaCacheValido(worktree, options) {
  const opts = options || {};
  const now = typeof opts.now === 'function' ? opts.now() : Date.now();
  const ttlMs = Number.isFinite(opts.ttl_ms) ? Number(opts.ttl_ms) : CACHE_TTL_MS;
  const root = path.resolve(worktree);
  const cached = await readJson(cachePath(root));
  if (!cached || !cached.cache || !cached.cache.generated_at) {
    return { mapa: null, porque: 'cache ausente ou ilegível' };
  }
  const generatedAt = Date.parse(cached.cache.generated_at);
  if (!Number.isFinite(generatedAt) || now - generatedAt >= ttlMs) {
    return { mapa: null, porque: 'cache expirado (TTL ' + ttlMs + ' ms)' };
  }
  const head = await gitHeadInfo(root);
  const before = cached.cache.head_mtime_ms == null
    ? null : Number(cached.cache.head_mtime_ms);
  const current = head.mtime_ms == null ? null : Number(head.mtime_ms);
  if (before !== current) {
    return { mapa: null, porque: 'cache invalidado: .git/HEAD mudou' };
  }
  cached.cache.status = 'hit';
  return { mapa: cached, porque: 'cache válido' };
}

async function scanTopTwoLevels(worktree) {
  const structure = [];
  const manifests = [];
  const instructions = [];
  const list = async (dir) => {
    try { return await fs.promises.readdir(dir, { withFileTypes: true }); }
    catch { return null; }
  };
  const top = await list(worktree);
  if (!top) {
    return { structure: known(null, 'não foi possível listar a worktree'), manifests, instructions };
  }
  for (const entry of top.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    const absolute = path.join(worktree, entry.name);
    if (!entry.isDirectory()) {
      structure.push({ path: entry.name, type: entry.isFile() ? 'file' : 'other' });
      if (entry.isFile() && MANIFESTS.has(entry.name)) manifests.push(entry.name);
      if (entry.isFile() && INSTRUCTION_FILES.has(entry.name)) {
        const stat = await fs.promises.stat(absolute).catch(() => null);
        if (stat) instructions.push({ path: entry.name, size_bytes: stat.size });
      }
      continue;
    }
    const children = [];
    const second = await list(absolute);
    for (const child of (second || []).sort((a, b) => a.name.localeCompare(b.name))) {
      if (child.isDirectory() && IGNORED_DIRS.has(child.name)) continue;
      const rel = path.join(entry.name, child.name);
      children.push({ path: rel, type: child.isDirectory() ? 'directory' : (child.isFile() ? 'file' : 'other') });
      if (child.isFile() && MANIFESTS.has(child.name)) manifests.push(rel);
      if (child.isFile() && INSTRUCTION_FILES.has(child.name)) {
        const stat = await fs.promises.stat(path.join(worktree, rel)).catch(() => null);
        if (stat) instructions.push({ path: rel, size_bytes: stat.size });
      }
    }
    structure.push({ path: entry.name, type: 'directory', children });
  }
  return {
    structure: known(structure, 'a raiz da worktree está vazia'),
    manifests: [...new Set(manifests)], instructions,
  };
}

async function detectTestCommands(worktree, manifests) {
  const commands = [];
  const reasons = [];
  for (const rel of manifests) {
    if (path.basename(rel) !== 'package.json') continue;
    const pkg = await readJson(path.join(worktree, rel));
    if (!pkg) reasons.push(rel + ' não contém JSON válido');
    else if (pkg.scripts && typeof pkg.scripts.test === 'string' && pkg.scripts.test.trim()) {
      commands.push({ command: pkg.scripts.test.trim(), invocation: 'npm test', source: rel + '#scripts.test' });
    } else reasons.push(rel + ' não declara scripts.test');
  }
  return known(commands, reasons.length ? reasons.join('; ') : 'nenhum manifesto suportado declara um teste verificável');
}

async function runGit(worktree, args, runner) {
  try {
    const result = await runner('git', args, {
      cwd: worktree, windowsHide: true, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024,
    });
    return { ok: true, stdout: String(result.stdout || '') };
  } catch (error) {
    return { ok: false, reason: 'Git indisponível ou pasta sem repositório: '
      + ((error && (error.code || error.message)) || 'erro desconhecido') };
  }
}

async function recentGitChanges(worktree, runner) {
  const commitsRun = await runGit(worktree, ['log', '--oneline', '-10'], runner);
  const touchedRun = await runGit(worktree, ['log', '--name-only', '--pretty=format:', '-20', '--', '.'], runner);
  const commits = commitsRun.ok
    ? commitsRun.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    : null;
  let touched = null;
  if (touchedRun.ok) {
    const counts = new Map();
    for (const line of touchedRun.stdout.split(/\r?\n/)) {
      const file = line.trim();
      if (file) counts.set(file, (counts.get(file) || 0) + 1);
    }
    touched = [...counts.entries()].map(([file, touches]) => ({ path: file, touches }))
      .sort((a, b) => b.touches - a.touches || a.path.localeCompare(b.path)).slice(0, 20);
  }
  return {
    git_log: known(commits, commitsRun.reason || 'git log não devolveu commits'),
    most_touched: known(touched, touchedRun.reason || 'os últimos 20 commits não contêm ficheiros'),
  };
}

async function ensureCacheIgnored(worktree) {
  const dir = path.join(worktree, '.mooter');
  await fs.promises.mkdir(dir, { recursive: true });
  const ignore = path.join(dir, '.gitignore');
  let current = '';
  try { current = await fs.promises.readFile(ignore, 'utf8'); }
  catch { /* Ainda não existe. */ }
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (!lines.includes('PROJECT_CONTEXT.json')) {
    const prefix = current && !current.endsWith('\n') ? current + '\n' : current;
    await fs.promises.writeFile(ignore, prefix + 'PROJECT_CONTEXT.json\n', 'utf8');
  }
}

async function writeCacheAtomic(worktree, mapa) {
  await ensureCacheIgnored(worktree);
  const target = cachePath(worktree);
  const temporary = target + '.tmp-' + process.pid + '-' + Math.random().toString(16).slice(2);
  await fs.promises.writeFile(temporary, JSON.stringify(mapa, null, 2) + '\n', 'utf8');
  await fs.promises.rename(temporary, target);
}

async function mapaDoProjecto(worktree, options) {
  const opts = options || {};
  const root = path.resolve(worktree);
  const now = typeof opts.now === 'function' ? opts.now() : Date.now();
  const ttlMs = Number.isFinite(opts.ttl_ms) ? Number(opts.ttl_ms) : CACHE_TTL_MS;
  if (!opts.force) {
    const hit = await lerMapaCacheValido(root, opts);
    if (hit.mapa) return hit.mapa;
  }
  const scanned = await scanTopTwoLevels(root);
  const stack = scanned.manifests.map((rel) => ({
    name: MANIFESTS.get(path.basename(rel)), manifest: rel,
  }));
  const head = await gitHeadInfo(root);
  const runner = typeof opts.exec_file === 'function' ? opts.exec_file : execFileAsync;
  const recent = await recentGitChanges(root, runner);
  const mapa = {
    schema_version: 1, worktree: root, generated_at: new Date(now).toISOString(),
    stack: known(stack, 'nenhum manifesto suportado foi encontrado nos dois primeiros níveis'),
    test_commands: await detectTestCommands(root, scanned.manifests),
    instruction_files: known(scanned.instructions, 'nenhum CLAUDE.md ou AGENTS.md nos dois primeiros níveis'),
    top_structure: scanned.structure, recent_changes: recent,
    cache: {
      generated_at: new Date(now).toISOString(), ttl_ms: ttlMs,
      head_mtime_ms: head.mtime_ms, head_reason: head.reason, status: 'refreshed',
    },
  };
  await writeCacheAtomic(root, mapa);
  return mapa;
}

function resumoMapa(mapa, maxChars) {
  const limit = Number.isFinite(maxChars) ? Math.max(1, Number(maxChars)) : SUMMARY_MAX_CHARS;
  const value = (field) => field && field.value !== undefined ? field.value : 'n/d';
  const reason = (field) => field && field.reason ? ' (' + field.reason + ')' : '';
  const stack = value(mapa && mapa.stack);
  const tests = value(mapa && mapa.test_commands);
  const instructions = value(mapa && mapa.instruction_files);
  const structure = value(mapa && mapa.top_structure);
  const recent = mapa && mapa.recent_changes ? mapa.recent_changes : {};
  const lines = [
    'stack=' + (stack === 'n/d' ? 'n/d' + reason(mapa.stack) : stack.map((item) => item.name + ':' + item.manifest).join(', ')),
    'tests=' + (tests === 'n/d' ? 'n/d' + reason(mapa.test_commands) : tests.map((item) => item.invocation + ' → ' + item.command + ' [' + item.source + ']').join(', ')),
    'instructions=' + (instructions === 'n/d' ? 'n/d' + reason(mapa.instruction_files) : instructions.map((item) => item.path + ' (' + item.size_bytes + ' B)').join(', ')),
    'top=' + (structure === 'n/d' ? 'n/d' + reason(mapa.top_structure) : structure.map((item) => item.path).join(', ')),
    'git10=' + (value(recent.git_log) === 'n/d' ? 'n/d' + reason(recent.git_log) : value(recent.git_log).join(' | ')),
    'touched20=' + (value(recent.most_touched) === 'n/d' ? 'n/d' + reason(recent.most_touched) : value(recent.most_touched).map((item) => item.path + ':' + item.touches).join(', ')),
  ];
  const text = lines.join('\n');
  if (text.length <= limit) return text;
  if (limit === 1) return '…';
  return text.slice(0, limit - 1) + '…';
}

async function mapaParaDispatch(worktree, options) {
  const opts = options || {};
  const result = opts.escrita
    ? { mapa: await mapaDoProjecto(worktree, opts), porque: 'job de escrita: cache criado ou refrescado assincronamente' }
    : await lerMapaCacheValido(worktree, opts);
  if (!result.mapa) {
    return { injetado: false, porque: result.porque + '; job de leitura não percorre a árvore para o criar', resumo: null, mapa: null };
  }
  return { injetado: true, porque: result.porque, resumo: resumoMapa(result.mapa, SUMMARY_MAX_CHARS), mapa: result.mapa };
}

function citedPaths(text) {
  const found = new Set();
  const source = String(text || '');
  const ext = '(?:js|mjs|cjs|ts|tsx|jsx|json|md|toml|yaml|yml|py|rs|go|java|rb|php|cs|cpp|c|h|html|css|sql|sh|ps1)';
  const nested = new RegExp('(?:[A-Za-z]:[\\\\/])?(?:[\\w@.-]+[\\\\/])+[\\w@.-]+\\.' + ext, 'gi');
  const rootFile = new RegExp('`([\\w@.-]+\\.' + ext + ')`', 'gi');
  let match;
  while ((match = nested.exec(source))) found.add(match[0].replace(/[),.;:]+$/, ''));
  while ((match = rootFile.exec(source))) found.add(match[1]);
  return [...found].slice(0, CROSS_PATH_LIMIT);
}

function withinRoot(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

async function evidenceForPaths(worktree, paths) {
  const root = path.resolve(worktree);
  const evidence = [];
  for (const cited of paths) {
    const absolute = path.resolve(root, cited);
    const relative = path.relative(root, absolute) || path.basename(absolute);
    if (!withinRoot(root, absolute)) {
      evidence.push({ path: cited, status: 'n/d', reason: 'caminho fora da worktree; não foi lido' });
      continue;
    }
    let stat;
    try { stat = await fs.promises.stat(absolute); }
    catch (error) {
      evidence.push({ path: cited, normalized_path: relative, status: 'missing', reason: (error && error.code) || 'não existe' });
      continue;
    }
    if (!stat.isFile()) {
      evidence.push({ path: cited, normalized_path: relative, status: 'n/d', reason: 'existe, mas não é ficheiro' });
      continue;
    }
    const complete = stat.size <= CROSS_FILE_LIMIT;
    let content = '';
    try {
      if (complete) content = await fs.promises.readFile(absolute, 'utf8');
      else {
        const handle = await fs.promises.open(absolute, 'r');
        try {
          const buffer = Buffer.alloc(CROSS_FILE_LIMIT);
          const read = await handle.read(buffer, 0, buffer.length, 0);
          content = buffer.subarray(0, read.bytesRead).toString('utf8');
        } finally { await handle.close(); }
      }
      evidence.push({ path: cited, normalized_path: relative, status: 'exists', size_bytes: stat.size, complete, content });
    } catch (error) {
      evidence.push({ path: cited, normalized_path: relative, status: 'n/d', reason: 'não foi possível ler: ' + ((error && error.code) || 'erro') });
    }
  }
  return evidence;
}

function crossCheckPrompt(resultado, evidence) {
  const files = evidence.map((item) => {
    if (item.status !== 'exists') return JSON.stringify({ path: item.path, status: item.status, reason: item.reason });
    return [
      'FILE ' + JSON.stringify({ path: item.path, status: item.status, size_bytes: item.size_bytes, complete: item.complete }),
      item.content, 'END FILE',
    ].join('\n');
  }).join('\n\n');
  return [
    'És um verificador factual local. Não avalies qualidade nem reescrevas.',
    'Extrai apenas caminhos, símbolos ligados a ficheiros e números.',
    'Responde só JSON: {"claims":[{"type":"path|symbol|number","path":"...","symbol":"...","number":"...","source_path":"..."}]}.',
    'Sem dados suficientes, omite o campo; o chamador marcará n/d.', '',
    'RESULTADO PAGO:', String(resultado || '').slice(0, 60000), '',
    'EVIDÊNCIA REAL:', files || 'n/d — não foram reconhecidos caminhos citados',
  ].join('\n');
}

function parseClaims(text) {
  const raw = String(text || '').replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return Array.isArray(parsed.claims) ? parsed.claims : [];
  } catch { return []; }
}

function resultTextFromNdjson(buffer) {
  let text = null;
  for (const line of String(buffer || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line);
      if (event && event.type === 'result' && event.result != null) text = String(event.result);
    } catch { /* Linha parcial ou não-JSON. */ }
  }
  return text;
}

async function defaultLocalRunner({ prompt, host, timeout_ms }) {
  const selection = await moo.pickModelExplained(null, host, null, {
    goal: 'verificação factual de caminhos, símbolos e números',
  }).catch(() => ({ model: null, porque: 'não foi possível consultar o Ollama' }));
  if (!selection.model) {
    return { available: false, reason: selection.porque || 'nenhum modelo local generativo disponível' };
  }
  const out = new PassThrough();
  const err = new PassThrough();
  let stdout = '';
  let stderr = '';
  out.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
  err.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const child = moo.runLocal({
      hostStr: host, model: selection.model, prompt, outStream: out, errStream: err,
      options: { temperature: 0 },
    });
    timer = setTimeout(() => {
      try { child.kill(); } catch { /* já terminou */ }
      finish({ available: false, reason: 'o modelo local excedeu o timeout da verificação' });
    }, timeout_ms);
    child.once('close', (code) => {
      const text = resultTextFromNdjson(stdout);
      if (code !== 0 || text == null) {
        finish({ available: false, reason: 'o modelo local não devolveu resultado verificável'
          + (stderr.trim() ? ': ' + stderr.trim().slice(-300) : '') });
      } else finish({ available: true, text, model: selection.model });
    });
    child.once('error', (error) => finish({
      available: false, reason: 'falha do modelo local: ' + ((error && error.message) || 'erro desconhecido'),
    }));
  });
}

function normalizeClaim(claim) {
  if (!claim || typeof claim !== 'object') return null;
  const type = String(claim.type || claim.tipo || '').toLowerCase();
  if (!['path', 'symbol', 'number'].includes(type)) return null;
  return {
    type, path: claim.path ? String(claim.path) : null,
    symbol: claim.symbol ? String(claim.symbol) : null,
    number: claim.number != null ? String(claim.number) : null,
    source_path: claim.source_path ? String(claim.source_path) : (claim.fonte ? String(claim.fonte) : null),
  };
}

function evaluateClaims(seedPaths, modelClaims, evidence) {
  const byPath = new Map();
  for (const item of evidence) {
    byPath.set(String(item.path), item);
    if (item.normalized_path) byPath.set(String(item.normalized_path), item);
  }
  const claims = seedPaths.map((item) => ({ type: 'path', path: item }))
    .concat(modelClaims.map(normalizeClaim).filter(Boolean));
  const seen = new Set();
  const divergencias = [];
  let verificado = 0;
  let nd = 0;
  for (const claim of claims) {
    const key = [claim.type, claim.path, claim.symbol, claim.number, claim.source_path].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    const sourcePath = claim.path || claim.source_path;
    const file = sourcePath ? byPath.get(sourcePath) : null;
    if (claim.type === 'path') {
      if (!file || file.status === 'n/d') nd++;
      else if (file.status === 'missing') divergencias.push({ type: 'path', path: claim.path, reason: 'o caminho citado não existe na worktree' });
      else verificado++;
      continue;
    }
    if (claim.type === 'symbol') {
      if (!claim.symbol || !file || file.status !== 'exists') nd++;
      else if (file.content.includes(claim.symbol)) verificado++;
      else if (file.complete) divergencias.push({ type: 'symbol', path: sourcePath, symbol: claim.symbol, reason: 'o símbolo não aparece no ficheiro completo' });
      else nd++;
      continue;
    }
    if (!claim.number) nd++;
    else if (!sourcePath) divergencias.push({ type: 'number', number: claim.number, reason: 'o número foi apresentado sem fonte verificável' });
    else if (!file || file.status !== 'exists') nd++;
    else if (file.content.includes(claim.number)) verificado++;
    else if (file.complete) divergencias.push({ type: 'number', number: claim.number, path: sourcePath, reason: 'o número não aparece na fonte citada' });
    else nd++;
  }
  return { divergencias, verificado, nd };
}

async function verificacaoCruzada(input, options) {
  const args = input || {};
  const opts = options || {};
  const jobId = args.job_id ? String(args.job_id) : null;
  const resultado = String(args.resultado || '');
  const worktree = path.resolve(String(args.worktree || '.'));
  const paths = citedPaths(resultado);
  const evidence = await evidenceForPaths(worktree, paths);
  const runner = typeof opts.runner === 'function' ? opts.runner : defaultLocalRunner;
  const host = opts.host || process.env.OLLAMA_HOST || '127.0.0.1:11434';
  const timeoutMs = Number.isFinite(opts.timeout_ms)
    ? Number(opts.timeout_ms)
    : Math.max(1000, Number(process.env.MOOTER_CROSS_CHECK_TIMEOUT_MS) || 60000);
  const local = await runner({
    prompt: crossCheckPrompt(resultado, evidence), evidence, host,
    timeout_ms: timeoutMs, job_id: jobId,
  });
  if (!local || local.available === false) {
    return {
      job_id: jobId, disponivel: false,
      porque: (local && local.reason) || 'nenhum modelo local disponível',
      divergencias: [], verificado: 0, custo_usd: 0,
      nota: 'sem veredicto: a verificação factual local não correu',
    };
  }
  const checked = evaluateClaims(paths, parseClaims(local.text), evidence);
  return {
    job_id: jobId, disponivel: true, modelo: local.model || null,
    divergencias: checked.divergencias, verificado: checked.verificado, custo_usd: 0,
    nota: checked.verificado + ' afirmação(ões) verificadas; '
      + checked.divergencias.length + ' divergência(s); ' + checked.nd
      + ' n/d. Verificação factual apenas; não avaliou qualidade nem reescreveu.',
  };
}

module.exports = {
  CACHE_TTL_MS, SUMMARY_MAX_CHARS, mapaDoProjecto, lerMapaCacheValido,
  mapaParaDispatch, resumoMapa, verificacaoCruzada,
  _internals: { citedPaths, evidenceForPaths, parseClaims, evaluateClaims, gitHeadInfo, scanTopTwoLevels },
};
