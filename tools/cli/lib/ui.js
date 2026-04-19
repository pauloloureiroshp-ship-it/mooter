const isTTY = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code) => (s) => isTTY ? `\x1b[${code}m${s}\x1b[0m` : s;

const color = {
  cyan: c('1;36'),
  green: c('1;32'),
  yellow: c('1;33'),
  red: c('1;31'),
  dim: c('2'),
  bold: c('1'),
  magenta: c('1;35'),
};

const say = (msg) => console.log(`  ${color.cyan('>')} ${msg}`);
const ok = (msg) => console.log(`  ${color.green('[OK]')} ${msg}`);
const warn = (msg) => console.log(`  ${color.yellow('[!!]')} ${msg}`);
const fail = (msg) => console.log(`  ${color.red('[XX]')} ${msg}`);
const info = (msg) => console.log(`  ${color.dim(msg)}`);
const banner = (v) => {
  console.log('');
  console.log(`  ${color.magenta('mooter')} ${color.dim('v' + v)}`);
  console.log(`  ${color.dim('Stop paying for a brain surgeon when you need a band-aid.')}`);
  console.log('');
};

module.exports = { color, say, ok, warn, fail, info, banner };
