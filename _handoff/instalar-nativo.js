'use strict';
/**
 * instalar-nativo.js — quebra o nó: o `aplicar` estoura o timeout, e o fix do
 * `aplicar` está DENTRO da versão que não se consegue instalar.
 *
 * ⚠️ ERRO JÁ COMETIDO NESTA CASA, não repetir: um script anterior carregou o
 * `update.js` do REPO e reportou "instalada: 1.20.0" — estava a medir a pasta do
 * repo, não a da extensão. Aqui a pasta de instalação é DESCOBERTA no disco e
 * impressa antes de se tocar em nada. Se não a encontrar, pára.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// ── 1. encontrar a pasta da extensão instalada (nunca o repo) ─────────────
const REPO = path.resolve(__dirname, '..');
const candidatas = [];
function varrer(dir, limite, prof) {
  prof = prof || 0;
  if (prof > (limite || 5)) return;
  let ents;
  try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/node_modules|\.git$/i.test(e.name)) continue;
      varrer(p, limite, prof + 1);
    } else if (e.name === 'seamless.js' && !p.startsWith(REPO)) {
      candidatas.push(path.dirname(p));
    }
  }
}
/**
 * ⚠️ A extensão NÃO está onde parece. Medido a 2026-07-27: o Claude Desktop
 * instala-a dentro do sandbox de app empacotada do Windows —
 *   AppData\Local\Packages\Claude_<hash>\LocalCache\Roaming\Claude\Claude Extensions\
 * Procurar em `AppData\Roaming\Claude` devolve ZERO. Por isso a raiz é a pasta
 * Packages, e o caminho exacto é impresso antes de se escrever seja o que for.
 */
for (const raiz of [
  path.join(os.homedir(), 'AppData', 'Local', 'Packages'),
  path.join(os.homedir(), 'AppData', 'Roaming', 'Claude'),
  path.join(os.homedir(), 'AppData', 'Local', 'AnthropicClaude'),
]) varrer(raiz, 9);
// ⚠️ os backups vivem em ~/.mooter e NÃO são a instalação. Escrever num backup
// seria o mesmo erro de medir o repo em vez da pasta real — já aconteceu hoje.
const reais = candidatas.filter((c) => !/[\\/]\.mooter[\\/]backup-/i.test(c)
  && !/[\\/]Temp[\\/]/i.test(c)                    // sobras de testes anteriores
  && /Claude Extensions/i.test(c));                // só a extensão instalada a sério
candidatas.length = 0;
for (const c of reais) candidatas.push(c);

console.log('pastas candidatas (fora do repo): ' + (candidatas.length || 0));
for (const c of candidatas) {
  let v = 'n/d';
  for (const m of [path.join(c, '..', 'manifest.json'), path.join(c, 'manifest.json')]) {
    try { v = JSON.parse(fs.readFileSync(m, 'utf8')).version || 'n/d'; break; } catch { /* */ }
  }
  console.log('  ' + c + '   manifest=' + v);
}
if (!candidatas.length) { console.log('PARADO: nao encontrei a pasta da extensao instalada'); process.exit(1); }
const dest = candidatas[0];

// ── 2. ler o bundle mais recente ──────────────────────────────────────────
const handoff = path.join(REPO, '_handoff');
const bundles = fs.readdirSync(handoff).filter((f) => /^mooter-v\d+\.mcpb$/.test(f))
  .map((f) => ({ f, p: path.join(handoff, f), mtime: fs.statSync(path.join(handoff, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);
if (!bundles.length) { console.log('PARADO: nenhum bundle em _handoff'); process.exit(1); }
const bundle = bundles[0];
console.log('\nbundle: ' + bundle.f);

const update = require(path.join(REPO, 'packages', 'mooter-bridge', 'update.js'));
const zip = update.lerZip(fs.readFileSync(bundle.p));
const man = zip.find((x) => x.nome === 'manifest.json');
const versaoNova = man ? JSON.parse(man.dados.toString('utf8')).version : 'n/d';
console.log('versao no bundle: ' + versaoNova);

const problemas = update.verificar(zip);
if (problemas.length) { console.log('PARADO: bundle nao passou na verificacao:'); for (const p of problemas) console.log('  ' + p); process.exit(1); }
console.log('verificacao do bundle: OK');

// ── 3. backup + escrita, com contagem ─────────────────────────────────────
const backup = path.join(os.homedir(), '.mooter', 'backup-nativo-' + Date.now());
fs.mkdirSync(backup, { recursive: true });
let copiados = 0;
for (const f of fs.readdirSync(dest)) {
  const p = path.join(dest, f);
  try { if (fs.statSync(p).isFile()) { fs.copyFileSync(p, path.join(backup, f)); copiados++; } } catch { /* */ }
}
console.log('backup: ' + copiados + ' ficheiro(s) em ' + backup);

let escritos = 0;
for (const f of zip) {
  const base = path.basename(f.nome);
  if (f.nome === 'manifest.json') {
    for (const m of [path.join(dest, '..', 'manifest.json'), path.join(dest, 'manifest.json')]) {
      try { if (fs.existsSync(m)) { fs.writeFileSync(m, f.dados); escritos++; break; } } catch { /* */ }
    }
    continue;
  }
  if (!f.nome.startsWith('server/')) continue;
  fs.writeFileSync(path.join(dest, base), f.dados);
  escritos++;
}
console.log('escritos: ' + escritos + ' ficheiro(s) em ' + dest);

// ── 4. verificar o que ficou no disco ─────────────────────────────────────
let vFinal = 'n/d';
for (const m of [path.join(dest, '..', 'manifest.json'), path.join(dest, 'manifest.json')]) {
  try { vFinal = JSON.parse(fs.readFileSync(m, 'utf8')).version; break; } catch { /* */ }
}
console.log('\nmanifest na pasta de instalacao agora: ' + vFinal);
console.log(vFinal === versaoNova
  ? 'OK INSTALADO - reinicia o Claude Desktop para o processo carregar o codigo novo'
  : 'ATENCAO: o manifest nao ficou na versao esperada');
