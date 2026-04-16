// Mooter — placeholder for the upcoming public release.
// Visit https://mooter.ai for waitlist and updates.
//
// This v0.0.1 reserves the package name on npm. The real router will land in v0.1.x.

'use strict';

module.exports = {
  name: 'mooter',
  version: require('./package.json').version,
  status: 'reserved',
  homepage: 'https://mooter.ai',
  message: 'Mooter is not released yet. Sign up at https://mooter.ai for the waitlist.',
};

if (require.main === module) {
  console.log('🐮 Mooter — coming soon at https://mooter.ai');
}
