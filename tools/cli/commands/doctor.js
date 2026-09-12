const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { color, say, ok, warn, fail, info } = require('../lib/ui');
const { paths, which, readVersion, isLaunchableCommand } = require('../lib/paths');
const { generateMooterSkills } = require('../lib/generate-mooter-skills');
const { discoverAllModels, flattenModels } = require('../lib/discover-models');

const results = [];

function check(name, fn, { fix } = {}) {
  try {
    const result = fn();
    if (result === true || (result && result.ok !== false)) {
      ok(`${name}${result && result.detail ? ` ${color.dim('(' + result.detail + ')')}` : ''}`);
      results.push({ name, status: 'pass' });
    } else if (result && result.ok === false) {
      if (result.warn) {
        warn(`${name}${result.detail ? ` — ${result.detail}` : ''}`);
        if (result.fix) info(`fix: ${result.fix}`);
        results.push({ name, status: 'warn' });
      } else {
        fail(`${name}${result.detail ? ` — ${result.detail}` : ''}`);
        if (result.fix) info(`fix: ${result.fix}`);
        results.push({ name, status: 'fail' });
      }
    } else {
      fail(name);
      if (fix) info(`fix: ${fix}`);
      results.push({ name, status: 'fail' });
    }
  } catch (e) {
    fail(`${name} — ${e.message}`);
    if (fix) info(`fix: ${fix}`);
    results.push({ name, status: 'fail' });
  }
}

// Wave 33.6 (P4) — compose the v1 bundle's spawn/runtime health (classify.js
// doctrine sha · spawn sandbox backend · Ollama · multiplexer) as an advisory
// sub-section, instead of rerouting `doctor` to v1 (which would drop the 10
// install-integrity checks above). Non-fatal: absent/erroring v1 bundle → skip
// silently, and v1 results never change this command's exit code.
function appendV1Health() {
  try {
    const v1 = path.join(paths.mooter, 'cli-v1', 'mooter.js');
    if (!fs.existsSync(v1)) return;
    let raw;
    try {
      raw = execSync(`node ${JSON.stringify(v1)} doctor --json`, { stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).toString();
    } catch (e) {
      // v1 doctor exits 1 when it has a fail-level check; its JSON is still on stdout.
      raw = e && e.stdout ? e.stdout.toString() : '';
    }
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.checks) || parsed.checks.length === 0) return;
    console.log('');
    console.log('  ' + color.dim('spawn & runtime health (Wave 33.5+)'));
    for (const c of parsed.checks) {
      const label = `${c.name}${c.detail ? ` ${color.dim('(' + c.detail + ')')}` : ''}`;
      if (c.level === 'ok') ok(label);
      else if (c.level === 'warn') warn(label);
      else fail(label); // advisory: shown, but not counted into results/exit code
    }
  } catch {
    /* any failure (v1 missing, bad JSON, timeout) → skip; legacy doctor never regresses */
  }
}

function versionGte(v, min) {
  const a = v.replace(/^v/, '').split('.').map(Number);
  const b = min.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

function run() {
  const v = readVersion();
  console.log('');
  console.log(`  ${color.magenta('mooter doctor')} ${color.dim('v' + v.version)}`);
  console.log('  ' + color.dim('-'.repeat(60)));

  check('mooter binary in PATH', () => {
    const bin = which('mooter');
    return bin ? { ok: true, detail: bin } : { ok: false, fix: 'Re-run the installer or add ~/.local/bin to PATH' };
  });

  check('Node.js 22+', () => {
    const nodeBin = which('node');
    if (!nodeBin) return { ok: false, fix: 'Install Node: https://nodejs.org or: brew install node / winget install OpenJS.NodeJS.LTS' };
    const ver = execSync('node --version').toString().trim();
    if (!versionGte(ver, '22.0.0')) return { ok: false, detail: `found ${ver}, need 22+`, fix: 'Upgrade Node: https://nodejs.org' };
    return { ok: true, detail: ver };
  });

  check('Claude Code CLI', () => {
    const bin = which('claude');
    if (!bin) {
      return { ok: false, fix: 'Install Claude Code: curl -fsSL https://claude.ai/install.sh | bash (Mac/Linux) or irm https://claude.ai/install.ps1 | iex (Windows)' };
    }
    if (!isLaunchableCommand(bin)) {
      return { ok: false, detail: `${bin} is not spawnable`, fix: 'Repair the Claude Code PATH entry so it resolves to an executable (.cmd/.exe/.bat on Windows)' };
    }
    return { ok: true, detail: bin };
  });

  check('~/.claude exists and writable', () => {
    if (!fs.existsSync(paths.claude)) return { ok: false, fix: 'Open Claude Code once, then re-run mooter doctor' };
    try {
      fs.accessSync(paths.claude, fs.constants.W_OK);
      return true;
    } catch {
      return { ok: false, detail: 'not writable', fix: 'Check permissions on ~/.claude' };
    }
  });

  check('Router scripts installed', () => {
    const classify = path.join(paths.router, 'classify.js');
    const inject = path.join(paths.router, 'inject_context.js');
    if (!fs.existsSync(classify)) return { ok: false, detail: 'classify.js missing', fix: 'Re-run: mooter update (or curl mooter.ai/install.sh | sh)' };
    if (!fs.existsSync(inject)) return { ok: false, detail: 'inject_context.js missing', fix: 'Re-run the installer' };
    return { ok: true, detail: `~/.claude/tools/router/ (${fs.readdirSync(paths.router).filter((f) => f.endsWith('.js')).length} scripts)` };
  });

  check('UserPromptSubmit hook registered', () => {
    if (!fs.existsSync(paths.settings)) return { ok: false, warn: true, detail: 'settings.json missing', fix: 'Open Claude Code once to generate it' };
    const s = JSON.parse(fs.readFileSync(paths.settings, 'utf8'));
    const hooks = (s.hooks && s.hooks.UserPromptSubmit) || [];
    const registered = JSON.stringify(hooks).includes('inject_context.js');
    return registered
      ? { ok: true, detail: 'routing active every prompt' }
      : { ok: false, fix: 'Re-run the installer to register the hook' };
  });

  check('Ollama running', () => {
    const bin = which('ollama');
    if (!bin) return { ok: false, warn: true, detail: 'not installed — T0 tier disabled', fix: 'Install: https://ollama.com/download (or run mooter init)' };
    try {
      const list = execSync('ollama list', { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
      const hasTerse = /qwen2\.5:3b/.test(list);
      if (!hasTerse) return { ok: false, warn: true, detail: 'qwen2.5:3b missing', fix: 'ollama pull qwen2.5:3b' };
      return { ok: true, detail: 'qwen2.5:3b ready' };
    } catch {
      return { ok: false, warn: true, detail: 'daemon not responding', fix: 'Start Ollama app (Mac/Win) or: ollama serve' };
    }
  });

  check('ANTHROPIC_API_KEY', () => {
    if (process.env.ANTHROPIC_API_KEY) return { ok: true, detail: 'T1 direct Haiku enabled' };
    return { ok: false, warn: true, detail: 'not set — T1 will fall back to subagent', fix: 'export ANTHROPIC_API_KEY=sk-ant-... (optional)' };
  });

  check('Telemetry log', () => {
    if (!fs.existsSync(paths.decisions)) return { ok: false, warn: true, detail: 'no decisions yet', fix: 'Send one prompt through Claude Code to initialize' };
    const lines = fs.readFileSync(paths.decisions, 'utf8').split('\n').filter(Boolean).length;
    return { ok: true, detail: `${lines} decisions logged` };
  });

  check('Device ID', () => {
    if (!fs.existsSync(paths.deviceId)) return { ok: false, warn: true, detail: 'missing — heartbeat telemetry off', fix: 'Run: mooter init' };
    const id = fs.readFileSync(paths.deviceId, 'utf8').trim();
    return { ok: true, detail: id.slice(0, 8) + '...' };
  });

  check('mooter pin skills', () => {
    const all = discoverAllModels();
    const flat = flattenModels(all);
    const { written, removed, skipped } = generateMooterSkills({ dryRun: false, models: flat });
    const total = written.length + skipped.length;
    if (total === 0 && removed.length === 0) {
      return { ok: false, warn: true, detail: 'none — no providers detected', fix: 'Run: mooter init' };
    }
    const anthropicCount = all.anthropic.filter((m) => m.available).length;
    const nonAnthropicCount = flat.filter((m) => m.available && m.provider !== 'anthropic').length;
    return {
      ok: true,
      detail: `${anthropicCount} Anthropic + ${nonAnthropicCount} non-Anthropic = ${total} total, ${removed.length} removed`,
    };
  });

  appendV1Health();

  console.log('  ' + color.dim('-'.repeat(60)));
  const pass = results.filter((r) => r.status === 'pass').length;
  const warns = results.filter((r) => r.status === 'warn').length;
  const fails = results.filter((r) => r.status === 'fail').length;

  console.log('');
  if (fails === 0 && warns === 0) {
    console.log(`  ${color.green('All systems go.')} ${pass}/${results.length} checks passed.`);
    console.log(`  ${color.dim('Next: just type')} ${color.bold('mooter')} ${color.dim('in any project.')}`);
  } else if (fails === 0) {
    console.log(`  ${color.yellow('Healthy with ' + warns + ' warning' + (warns === 1 ? '' : 's') + '.')} mooter will work — warnings above are opt-in features.`);
  } else {
    console.log(`  ${color.red(fails + ' check' + (fails === 1 ? '' : 's') + ' failed.')} Follow the fix lines above.`);
  }
  console.log('');
  process.exit(fails === 0 ? 0 : 1);
}

module.exports = { run };
