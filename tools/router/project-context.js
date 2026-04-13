#!/usr/bin/env node
/**
 * project-context.js — detect project type and stack from cwd
 *
 * Usage:
 *   node project-context.js           # detect from cwd
 *   node project-context.js /path     # detect from specific path
 *   node project-context.js --json    # machine-readable output
 *
 * Output: { type, stack, maturity, routing_hints }
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// ---------------------------------------------------------------------------
// Routing hints per project type
// ---------------------------------------------------------------------------

const ROUTING_HINTS = {
  'frontend-react': {
    trivial_always_t0: ['css', 'className', 'style', 'color', 'margin', 'padding', 'font'],
    debug_min_tier: 'T1',
    architecture_min_tier: 'T2',
  },
  'frontend-vue': {
    trivial_always_t0: ['css', 'class', 'style', 'color', 'margin', 'padding', 'font'],
    debug_min_tier: 'T1',
    architecture_min_tier: 'T2',
  },
  'backend-node': {
    trivial_always_t0: ['rename', 'typo', 'import'],
    debug_min_tier: 'T2',
    architecture_min_tier: 'T3',
  },
  'python': {
    trivial_always_t0: ['rename', 'import', 'typo'],
    debug_min_tier: 'T2',
    architecture_min_tier: 'T2',
  },
  'rust': {
    trivial_always_t0: ['rename', 'typo'],
    debug_min_tier: 'T2',
    architecture_min_tier: 'T3',
  },
  'go': {
    trivial_always_t0: ['rename', 'typo', 'import'],
    debug_min_tier: 'T2',
    architecture_min_tier: 'T2',
  },
  'data-science': {
    trivial_always_t0: ['rename', 'typo', 'import'],
    debug_min_tier: 'T2',
    architecture_min_tier: 'T2',
  },
  'unknown': {
    trivial_always_t0: ['rename', 'typo'],
    debug_min_tier: 'T2',
    architecture_min_tier: 'T3',
  },
};

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------

const CACHE_DIR = path.join(os.homedir(), '.frugal');
const CACHE_FILE = path.join(CACHE_DIR, 'project-context-cache.json');
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return {};
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  } catch {
    // cache write failure is non-fatal
  }
}

function getCached(dir) {
  const cache = readCache();
  const entry = cache[dir];
  if (!entry) return null;
  if (Date.now() - new Date(entry.detected_at).getTime() > CACHE_TTL_MS) return null;
  return entry;
}

function setCache(dir, result) {
  const cache = readCache();
  cache[dir] = result;
  writeCache(cache);
}

// ---------------------------------------------------------------------------
// Stack detection helpers
// ---------------------------------------------------------------------------

function parsePackageJsonDeps(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return null;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = Object.keys(pkg.dependencies || {});
    const devDeps = Object.keys(pkg.devDependencies || {});
    return { deps, devDeps, all: [...deps, ...devDeps] };
  } catch {
    return null;
  }
}

function parsePythonDeps(dir) {
  const stack = [];
  const pyprojectPath = path.join(dir, 'pyproject.toml');
  const requirementsPath = path.join(dir, 'requirements.txt');

  const PYTHON_MARKERS = ['django', 'flask', 'fastapi', 'numpy', 'pandas', 'torch', 'scikit-learn', 'tensorflow'];

  if (fs.existsSync(pyprojectPath)) {
    const content = fs.readFileSync(pyprojectPath, 'utf8').toLowerCase();
    for (const m of PYTHON_MARKERS) if (content.includes(m)) stack.push(m);
  }
  if (fs.existsSync(requirementsPath)) {
    const content = fs.readFileSync(requirementsPath, 'utf8').toLowerCase();
    for (const m of PYTHON_MARKERS) {
      if (content.includes(m) && !stack.includes(m)) stack.push(m);
    }
  }
  return stack;
}

function parseCargoToml(dir) {
  const cargoPath = path.join(dir, 'Cargo.toml');
  if (!fs.existsSync(cargoPath)) return [];
  const content = fs.readFileSync(cargoPath, 'utf8').toLowerCase();
  const RUST_MARKERS = ['tokio', 'actix', 'serde', 'axum', 'rocket', 'warp'];
  return RUST_MARKERS.filter(m => content.includes(m));
}

function parseGoMod(dir) {
  const gomodPath = path.join(dir, 'go.mod');
  if (!fs.existsSync(gomodPath)) return [];
  const content = fs.readFileSync(gomodPath, 'utf8').toLowerCase();
  const GO_MARKERS = ['gin', 'echo', 'fiber', 'chi', 'gorilla'];
  return GO_MARKERS.filter(m => content.includes(m));
}

function hasIpynbFiles(dir) {
  try {
    return fs.readdirSync(dir).some(f => f.endsWith('.ipynb'));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Type + stack detection (first match wins)
// ---------------------------------------------------------------------------

function detectTypeAndStack(dir) {
  // 1. data-science: .ipynb files present (check before package.json react)
  if (hasIpynbFiles(dir)) {
    const pyStack = parsePythonDeps(dir);
    const base = ['jupyter'];
    const DS_MARKERS = ['pandas', 'numpy', 'torch', 'scikit-learn', 'tensorflow', 'matplotlib'];
    for (const m of DS_MARKERS) if (pyStack.includes(m) && !base.includes(m)) base.push(m);
    return { type: 'data-science', stack: base };
  }

  // 2. package.json-based detection
  const pkgData = parsePackageJsonDeps(dir);
  if (pkgData) {
    const { all } = pkgData;
    const hasNext = all.includes('next');
    const hasReact = all.includes('react');
    const hasVue = all.includes('vue');
    const hasExpress = all.includes('express');
    const hasFastify = all.includes('fastify');
    const hasHono = all.includes('hono');

    if (hasNext || hasReact) {
      const REACT_MARKERS = ['next', 'react', 'tailwindcss', 'tailwind', 'typescript', 'vite', 'gatsby', 'remix', 'styled-components', 'framer-motion', 'zustand', 'redux', '@tanstack/react-query'];
      const stack = REACT_MARKERS.filter(m => all.some(d => d === m || d.startsWith(m)));
      if (!stack.includes('react') && hasReact) stack.unshift('react');
      if (!stack.includes('next') && hasNext) stack.unshift('next');
      // normalise tailwindcss → tailwind
      const normalised = stack.map(s => s === 'tailwindcss' ? 'tailwind' : s);
      return { type: 'frontend-react', stack: [...new Set(normalised)] };
    }

    if (hasVue) {
      const VUE_MARKERS = ['vue', 'vuetify', 'nuxt', 'pinia', 'vite'];
      const stack = VUE_MARKERS.filter(m => all.includes(m));
      return { type: 'frontend-vue', stack };
    }

    if (hasExpress || hasFastify || hasHono) {
      const NODE_MARKERS = ['express', 'fastify', 'hono', 'prisma', 'drizzle-orm', 'typeorm', 'sequelize', 'mongoose', 'koa', 'cors'];
      const stack = NODE_MARKERS.filter(m => all.some(d => d === m || d.startsWith(m)));
      return { type: 'backend-node', stack };
    }
  }

  // 3. Python
  if (fs.existsSync(path.join(dir, 'pyproject.toml')) || fs.existsSync(path.join(dir, 'requirements.txt'))) {
    const stack = parsePythonDeps(dir);
    return { type: 'python', stack };
  }

  // 4. Rust
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) {
    const stack = parseCargoToml(dir);
    return { type: 'rust', stack };
  }

  // 5. Go
  if (fs.existsSync(path.join(dir, 'go.mod'))) {
    const stack = parseGoMod(dir);
    return { type: 'go', stack };
  }

  // 6. Check .claude/CLAUDE.md for Router Context section
  const claudeMdPath = path.join(dir, '.claude', 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf8');
    const match = content.match(/##\s*Router Context\s*\n([\s\S]*?)(?=\n##|$)/);
    if (match) {
      // best-effort parse: look for type: and stack: lines
      const block = match[1];
      const typeMatch = block.match(/type:\s*(\S+)/i);
      const stackMatch = block.match(/stack:\s*(.+)/i);
      const type = typeMatch ? typeMatch[1] : 'unknown';
      const stack = stackMatch ? stackMatch[1].split(',').map(s => s.trim()) : [];
      return { type, stack };
    }
  }

  return { type: 'unknown', stack: [] };
}

// ---------------------------------------------------------------------------
// Maturity detection
// ---------------------------------------------------------------------------

function detectMaturity(dir) {
  const exists = (...parts) => fs.existsSync(path.join(dir, ...parts));
  const globMatch = (subdir, pattern) => {
    try {
      const base = path.join(dir, subdir);
      if (!fs.existsSync(base)) return false;
      return fs.readdirSync(base).some(f => pattern.test(f));
    } catch { return false; }
  };

  // Tests
  const hasTests = exists('__tests__') || exists('test') || exists('tests') ||
    (() => {
      try {
        return fs.readdirSync(dir).some(f => /\.(test|spec)\.[jt]sx?$/.test(f));
      } catch { return false; }
    })() ||
    globMatch('src', /\.(test|spec)\.[jt]sx?$/);

  // CI
  const hasCI = exists('.github', 'workflows') || exists('.gitlab-ci.yml') || exists('Jenkinsfile');

  // Linter
  const hasLinter = exists('.eslintrc.js') || exists('.eslintrc.json') || exists('.eslintrc.yaml') ||
    exists('.eslintrc.yml') || exists('.eslintrc') || exists('eslint.config.js') ||
    exists('eslint.config.mjs') || exists('.prettierrc') || exists('.prettierrc.json') ||
    exists('.prettierrc.js') || exists('rustfmt.toml') || exists('.rustfmt.toml') ||
    (() => {
      const pp = path.join(dir, 'pyproject.toml');
      if (!fs.existsSync(pp)) return false;
      return fs.readFileSync(pp, 'utf8').includes('[tool.ruff]');
    })();

  // PR template
  const hasPRTemplate = exists('.github', 'pull_request_template.md') ||
    exists('.github', 'PULL_REQUEST_TEMPLATE.md');

  const score = [hasTests, hasCI, hasLinter].filter(Boolean).length;

  let maturity;
  if (score === 0) maturity = 'beginner';
  else if (score < 3) maturity = 'intermediate';
  else if (score === 3 && hasPRTemplate) maturity = 'advanced';
  else maturity = 'intermediate'; // has all 3 but no PR template → still intermediate

  return { maturity, hasTests, hasCI, hasLinter, hasPRTemplate };
}

// ---------------------------------------------------------------------------
// Main detection function (exported)
// ---------------------------------------------------------------------------

function detectProjectContext(dir) {
  if (!dir) dir = process.cwd();
  dir = path.resolve(dir);

  // Cache check
  const cached = getCached(dir);
  if (cached) return cached;

  const { type, stack } = detectTypeAndStack(dir);
  const { maturity, hasTests, hasCI, hasLinter } = detectMaturity(dir);

  const hints = ROUTING_HINTS[type] || ROUTING_HINTS['unknown'];

  const result = {
    type,
    stack,
    maturity,
    routing_hints: hints,
    _meta: { hasTests, hasCI, hasLinter },
    detected_at: new Date().toISOString(),
  };

  setCache(dir, result);
  return result;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

if (require.main === module) {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const dirArg = args.find(a => !a.startsWith('--'));
  const dir = dirArg ? path.resolve(dirArg) : process.cwd();

  const ctx = detectProjectContext(dir);

  if (jsonMode) {
    process.stdout.write(JSON.stringify(ctx, null, 2) + '\n');
  } else {
    const { type, stack, maturity, routing_hints, _meta } = ctx;
    const stackStr = stack.length ? stack.join(', ') : '(none detected)';

    const testsIcon = _meta.hasTests ? '✓' : '✗';
    const ciIcon = _meta.hasCI ? '✓' : '✗';
    const linterIcon = _meta.hasLinter ? '✓' : '✗';

    const t0List = routing_hints.trivial_always_t0.join(', ');

    console.log(`Project: ${type}`);
    console.log(`Stack: ${stackStr}`);
    console.log(`Maturity: ${maturity} (tests ${testsIcon} CI ${ciIcon} linter ${linterIcon})`);
    console.log(`Routing: ${t0List} → always T0 | debug → min ${routing_hints.debug_min_tier} | architecture → min ${routing_hints.architecture_min_tier}`);
  }
}

module.exports = { detectProjectContext };
