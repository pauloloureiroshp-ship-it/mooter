#!/usr/bin/env node
// @mooter/cli — npm placeholder for mooter (https://mooter.ai).
//
// mooter is currently in private friends-beta. The real CLI is a shell
// install, not an npm package. This stub exists because the package name
// was reserved early. Running `npx @mooter/cli` prints the same message
// the real installer shows when invoked from a pipe — tells the user how
// to get access and where the project is going.

'use strict';

const msg = [
  '',
  '  mooter is currently in private friends-beta.',
  '',
  '  To install:',
  '    1. Request access: https://mooter.ai (or email paulo@mooter.ai)',
  '    2. Once invited, run the real installer:',
  '',
  '       macOS / Linux:  curl -fsSL https://mooter.ai/install.sh | bash',
  '       Windows:        irm https://mooter.ai/install.ps1 | iex',
  '',
  '  This npm package is a name reservation. The real CLI is a shell',
  '  install — no npm needed. See https://mooter.ai for updates.',
  '',
].join('\n');

module.exports = {
  name: 'mooter',
  version: require('./package.json').version,
  status: 'private-friends-beta',
  homepage: 'https://mooter.ai',
  message: msg,
};

if (require.main === module) {
  process.stdout.write(msg);
}
