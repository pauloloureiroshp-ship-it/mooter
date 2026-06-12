const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { color, say, ok, warn, fail, info } = require('../lib/ui');
const { paths } = require('../lib/paths');

function prompt(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase());
    });
  });
}

async function run(args) {
  const force = args.includes('--yes') || args.includes('-y');

  console.log('');
  console.log(`  ${color.magenta('mooter uninstall')}`);
  console.log('');
  console.log('  Will remove:');
  console.log('    - ~/.claude/tools/router/                (routing scripts)');
  console.log('    - ~/.claude/hooks/ mooter-specific hooks (keeps Claude Code hooks)');
  console.log('    - ~/.mooter/                             (binary + data)');
  console.log('    - ~/.mooter/                             (device.id + config)');
  console.log('    - ~/.local/bin/mooter                    (shim)');
  console.log('');
  console.log('  Will keep:');
  console.log('    - ~/.claude/settings.json    (hooks de-registered, not deleted)');
  console.log('    - ~/.claude/CLAUDE.md        (your doctrine file)');
  console.log('    - Ollama + models            (not ours to remove)');
  console.log('');

  if (!force) {
    const ans = await prompt('  Proceed? [y/N]: ');
    if (!['y', 'yes'].includes(ans)) {
      console.log('  Cancelled.');
      return;
    }
  }

  say('De-registering hooks from settings.json...');
  try {
    if (fs.existsSync(paths.settings)) {
      const s = JSON.parse(fs.readFileSync(paths.settings, 'utf8'));
      const stripped = { ...s };
      if (stripped.hooks) {
        for (const key of Object.keys(stripped.hooks)) {
          stripped.hooks[key] = (stripped.hooks[key] || []).filter((h) => {
            const json = JSON.stringify(h);
            return !['inject_context.js', 'mooter-turn-header.js', 'frugal-turn-header.js', 'gsd-turn-end.js', 'gsd-statusline.js', 'exec-logger.js', 'mooter'].some((needle) =>
              json.includes(needle),
            );
          });
          if (stripped.hooks[key].length === 0) delete stripped.hooks[key];
        }
      }
      fs.writeFileSync(paths.settings, JSON.stringify(stripped, null, 2));
      ok('Hooks de-registered');
    }
  } catch (e) {
    warn('Could not parse settings.json: ' + e.message);
  }

  const toRemove = [paths.router, paths.mooter, paths.legacyFrugal];
  for (const p of toRemove) {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
      ok(`Removed ${p.replace(paths.home, '~')}`);
    }
  }

  const mooterHooks = ['mooter-turn-header.js', 'frugal-turn-header.js', 'gsd-turn-end.js', 'exec-logger.js', 'gsd-statusline.js', 'PostToolUse.js'];
  for (const h of mooterHooks) {
    const p = path.join(paths.hooks, h);
    if (fs.existsSync(p)) fs.rmSync(p, { force: true });
  }

  const shimPaths = paths.isWindows
    ? [path.join(paths.localBin, 'mooter.cmd'), path.join(paths.localBin, 'mooter.ps1')]
    : [path.join(paths.localBin, 'mooter')];
  for (const p of shimPaths) {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true });
      ok(`Removed shim ${p}`);
    }
  }

  console.log('');
  ok('mooter uninstalled.');
  info('Your Claude Code install is untouched.');
  console.log('');
}

module.exports = { run };
