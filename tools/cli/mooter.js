#!/usr/bin/env node
// mooter — intelligent model routing CLI for Claude Code.
//
// Default: launches Claude Code with MOOTER_MODE=1 so the statusline renders
// the routing feed. Subcommands below expose install + diagnostic helpers.
//
// Subcommands:
//   mooter doctor          health check
//   mooter init            first-run wizard (subscription + Ollama)
//   mooter dashboard       live routing dashboard
//   mooter update          re-run the installer
//   mooter uninstall       clean removal
//   mooter --version       print version
//   mooter --help          help text

const { readVersion } = require('./lib/paths');

const args = process.argv.slice(2);
const first = args[0];

if (first === '--version' || first === '-v' || first === 'version') {
  const v = readVersion();
  console.log(`mooter v${v.version} (${v.channel || 'stable'})`);
  process.exit(0);
}

if (first === '--help' || first === '-h' || first === 'help') {
  require('./commands/help').run();
  process.exit(0);
}

const commands = {
  doctor: () => require('./commands/doctor').run(),
  init: () => require('./commands/init').run(),
  dashboard: () => require('./commands/dashboard').run(),
  recibo: () => require('./commands/recibo').run(args.slice(1)),
  update: () => require('./commands/update').run(),
  uninstall: () => require('./commands/uninstall').run(args.slice(1)),
};

if (first && commands[first]) {
  const result = commands[first]();
  if (result && typeof result.then === 'function') {
    result.catch((e) => {
      console.error(`\n  mooter ${first} failed: ${e.message}\n`);
      process.exit(1);
    });
  }
} else if (first && first.startsWith('--')) {
  console.error(`mooter: unknown flag '${first}'. Try: mooter --help`);
  process.exit(2);
} else if (first && !commands[first]) {
  console.error(`mooter: unknown subcommand '${first}'. Try: mooter --help`);
  process.exit(2);
} else {
  require('./commands/default').run(args);
}
