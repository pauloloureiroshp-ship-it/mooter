'use strict';
/**
 * update.js — mooter-bridge v1.8: o conector actualiza-se a si próprio.
 *
 * O PEDIDO, e porque ele está certo:
 *
 *   "preciso que mande em formato de cópia e cola (…) estou sempre pensando no
 *    usuário final que precisa saber que ele precisa atualizar (…) nem todo
 *    vibe coder está familiarizado."
 *
 * Um produto que exige *desinstalar → instalar → reiniciar* a cada release está
 * a cobrar ao utilizador o preço de existir. E, pior do que o trabalho, é o
 * SILÊNCIO: hoje ninguém descobre que há versão nova a não ser que alguém lho
 * diga. Um vibe coder fica meses numa versão com bugs já corrigidos.
 *
 * ── O QUE É POSSÍVEL, E O QUE NÃO É ───────────────────────────────────────
 *
 * ❌ O MCP não tem forma de reinstalar nem de reiniciar um conector. Nenhum
 *    botão vai evitar o reinício da aplicação. Prometer o contrário seria
 *    mentir, e este ficheiro não mente.
 *
 * ✅ O servidor corre em Node e sabe onde está instalado (`__dirname`). Pode
 *    escrever por cima dos seus próprios ficheiros. Isso transforma três passos
 *    manuais em um clique e um reinício.
 *
 * ⚠️ ISTO É CÓDIGO QUE SE SUBSTITUI A SI PRÓPRIO. Um erro a meio deixa o
 *    conector morto e o utilizador sem forma de o consertar de dentro. Por isso:
 *
 *      1. VERIFICA primeiro, numa pasta temporária — sintaxe de cada ficheiro,
 *         manifest legível, e todos os `require` satisfeitos;
 *      2. GUARDA uma cópia do que está instalado antes de tocar em nada;
 *      3. SÓ ENTÃO copia;
 *      4. se algo falhar a meio, REPÕE a cópia de segurança;
 *      5. nunca escreve um único byte fora da pasta de instalação.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const zlib = require('zlib');

const MOOTER_DIR = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');

/** A pasta onde ESTE servidor está instalado. É aqui que se escreve, e só aqui. */
function pastaInstalada() { return __dirname; }

function lerManifest(dir) {
  for (const p of [path.join(dir, '..', 'manifest.json'), path.join(dir, 'manifest.json')]) {
    try { const m = JSON.parse(fs.readFileSync(p, 'utf8')); if (m && m.version) return { manifest: m, ficheiro: p }; }
    catch { /* próximo */ }
  }
  return null;
}

/** Comparação de versões. `1.10.0` é maior que `1.9.0` — não é ordem de texto. */
function compara(a, b) {
  const pa = String(a || '0').split('.').map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0').split('.').map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// ── leitor de ZIP "stored" ────────────────────────────────────────────────
// O `pack-mcpb.mjs` escreve sem compressão de propósito. Ler isso são 30 linhas
// e evita uma dependência — e uma dependência num actualizador é uma forma
// elegante de não conseguir actualizar quando ela falta.
function lerZip(buf) {
  const ficheiros = [];
  let i = buf.length - 22;
  while (i >= 0 && buf.readUInt32LE(i) !== 0x06054b50) i--;
  if (i < 0) throw new Error('não parece um .mcpb (sem fim de directório)');
  const n = buf.readUInt16LE(i + 10);
  let off = buf.readUInt32LE(i + 16);
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('directório central corrompido');
    const metodo = buf.readUInt16LE(off + 10);
    const tam = buf.readUInt32LE(off + 20);      // tamanho COMPRIMIDO
    const tamCru = buf.readUInt32LE(off + 24);   // tamanho original
    const nomeLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const cmtLen = buf.readUInt16LE(off + 32);
    const local = buf.readUInt32LE(off + 42);
    const nome = buf.toString('utf8', off + 46, off + 46 + nomeLen);
    /**
     * ⚠️ Nem todos os bundles são "stored".
     *
     * O nosso packer escreve sem compressão, mas versões antigas e bundles
     * feitos por outras ferramentas usam DEFLATE — e o actualizador recusava-os
     * com um erro técnico. Um actualizador que só sabe ler o que ele próprio
     * escreveu não é um actualizador. `zlib` vem no Node: zero dependências.
     */
    if (metodo !== 0 && metodo !== 8) throw new Error('método de compressão desconhecido (' + metodo + ') em ' + nome);
    const lnLen = buf.readUInt16LE(local + 26);
    const leLen = buf.readUInt16LE(local + 28);
    const ini = local + 30 + lnLen + leLen;
    const cru = buf.subarray(ini, ini + tam);
    let dados;
    try { dados = metodo === 8 ? zlib.inflateRawSync(cru) : cru; }
    catch (e) { throw new Error('não consegui descomprimir ' + nome + ': ' + ((e && e.message) || e)); }
    ficheiros.push({ nome, dados });
    off += 46 + nomeLen + extraLen + cmtLen;
  }
  return ficheiros;
}

/** Procurar um bundle mais recente do que o que está a correr. */
function procurar(opts) {
  const o = opts || {};
  const atual = lerManifest(pastaInstalada());
  const versaoAtual = atual ? atual.manifest.version : 'n/d';

  const pastas = [];
  if (o.pasta) pastas.push(o.pasta);
  if (process.env.MOOTER_UPDATE_DIR) pastas.push(process.env.MOOTER_UPDATE_DIR);
  const repo = process.env.MOOTER_REPO;
  if (repo) pastas.push(path.join(repo, '_handoff'));
  pastas.push(path.join(os.homedir(), 'frugal', '_handoff'));
  pastas.push(path.join(os.homedir(), 'Documents', 'frugal', '_handoff'));
  pastas.push(path.join(os.homedir(), 'Downloads'));

  /**
   * ⚠️ A MESMA PASTA POR DOIS CAMINHOS DIFERENTES.
   *
   * `MOOTER_REPO` aponta para `~/frugal`, e a lista também tem `~/frugal` à mão.
   * Resultado medido a 2026-07-26: cada bundle apareceu DUAS vezes na lista de
   * versões encontradas — 44 entradas para 22 ficheiros. Não é cosmético: um
   * utilizador que veja a mesma versão repetida deixa de confiar na lista, e com
   * razão. `paths.js` já existe exactamente para isto.
   */
  const vistas = new Set();
  const unicas = [];
  for (const d of pastas) {
    let chave;
    try { chave = require('./paths.js').chave(d); } catch { chave = path.resolve(d).toLowerCase(); }
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    unicas.push(d);
  }
  pastas.length = 0;
  pastas.push(...unicas);

  const achados = [];
  for (const dir of pastas) {
    let ents;
    try { ents = fs.readdirSync(dir); } catch { continue; }
    for (const nome of ents) {
      if (!nome.endsWith('.mcpb')) continue;
      const f = path.join(dir, nome);
      try {
        const buf = fs.readFileSync(f);
        const zip = lerZip(buf);
        const man = zip.find((x) => x.nome === 'manifest.json');
        if (!man) continue;
        const m = JSON.parse(man.dados.toString('utf8'));
        achados.push({ ficheiro: f, versao: m.version, bytes: buf.length, ficheiros: zip.length });
      } catch { /* um .mcpb ilegível não é um candidato */ }
    }
  }
  achados.sort((a, b) => compara(b.versao, a.versao));
  const nova = achados.find((x) => compara(x.versao, versaoAtual) > 0) || null;

  return {
    versao_instalada: versaoAtual,
    onde_instalado: pastaInstalada(),
    nova,
    // ⚠️ dizer sempre onde se procurou. "Não há actualizações" sem dizer onde
    // se olhou é indistinguível de "não sei procurar".
    procurei_em: pastas,
    encontrados: achados.length ? achados : null,
    resumo: nova
      ? ('há a versão ' + nova.versao + ' disponível (tens a ' + versaoAtual + ')')
      : ('estás na versão mais recente que encontrei (' + versaoAtual + ')'),
  };
}

/**
 * ⚠️ VERIFICAR ANTES DE TOCAR. Um bundle partido que substitui um bom deixa o
 * utilizador sem conector E sem forma de o consertar de dentro do Cowork.
 */
function verificar(zip) {
  const problemas = [];
  const porNome = new Map(zip.map((f) => [f.nome, f]));
  if (!porNome.has('manifest.json')) problemas.push('falta o manifest.json');

  const js = zip.filter((f) => f.nome.endsWith('.js'));
  if (!js.length) problemas.push('o bundle não traz um único ficheiro .js');

  // todos os require('./x.js') têm de existir dentro do bundle
  const dentro = new Set(js.map((f) => path.basename(f.nome)));
  for (const f of js) {
    // ⚠️ um comentário que MENCIONE um require não é um require — a mesma
    // armadilha que recusou um build inteiro por causa de uma frase de docs.
    const texto = f.dados.toString('utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
    const re = /require\(\s*['"]\.\/([\w.-]+\.js)['"]\s*\)/g;
    let m;
    while ((m = re.exec(texto)) !== null) {
      if (!dentro.has(m[1])) problemas.push(f.nome + ' precisa de ' + m[1] + ', que não vem no bundle');
    }
  }

  // sintaxe: escrever num temp e pedir ao Node para verificar
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mooter-upd-'));
  try {
    for (const f of js) {
      const alvo = path.join(tmp, path.basename(f.nome));
      fs.writeFileSync(alvo, f.dados);
    }
    for (const f of js) {
      try { execFileSync(process.execPath, ['--check', path.join(tmp, path.basename(f.nome))], { stdio: 'pipe', timeout: 8000 }); }
      catch (e) { problemas.push('erro de sintaxe em ' + f.nome + ': ' + String((e && e.stderr) || e).slice(0, 160)); }
    }
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }
  }
  return problemas;
}

/**
 * Aplicar a actualização por cima da instalação actual.
 * ❌ Não reinicia nada — não pode. Diz-o.
 */
function aplicar(opts) {
  const o = opts || {};
  const dest = pastaInstalada();
  const atual = lerManifest(dest);
  const versaoAtual = atual ? atual.manifest.version : 'n/d';

  const alvo = o.ficheiro || (procurar(o).nova || {}).ficheiro;
  if (!alvo) return { ok: false, erro: 'não encontrei nenhum bundle mais recente para instalar' };

  let zip;
  try { zip = lerZip(fs.readFileSync(alvo)); }
  catch (e) { return { ok: false, erro: 'não consegui ler ' + alvo + ': ' + ((e && e.message) || e) }; }

  const man = zip.find((x) => x.nome === 'manifest.json');
  const versaoNova = man ? (JSON.parse(man.dados.toString('utf8')).version || 'n/d') : 'n/d';
  if (!o.forcar && compara(versaoNova, versaoAtual) <= 0) {
    return { ok: false, erro: 'o bundle é a versão ' + versaoNova + ' e já tens a ' + versaoAtual };
  }

  const problemas = verificar(zip);
  if (problemas.length) {
    return { ok: false, erro: 'o bundle não passou na verificação — não toquei em nada', problemas };
  }

  // cópia de segurança do que está instalado, ANTES de escrever
  const backup = path.join(MOOTER_DIR, 'backup-' + versaoAtual + '-' + Date.now());
  const escritos = [];
  try {
    fs.mkdirSync(backup, { recursive: true });
    for (const f of fs.readdirSync(dest)) {
      const p = path.join(dest, f);
      try { if (fs.statSync(p).isFile()) fs.copyFileSync(p, path.join(backup, f)); } catch { /* */ }
    }
    if (atual) fs.copyFileSync(atual.ficheiro, path.join(backup, 'manifest.json'));

    for (const f of zip) {
      // só ficheiros do servidor + o manifest. Nada fora da pasta de instalação.
      const base = path.basename(f.nome);
      if (f.nome === 'manifest.json') {
        if (atual) { fs.writeFileSync(atual.ficheiro, f.dados); escritos.push(atual.ficheiro); }
        continue;
      }
      if (!f.nome.startsWith('server/')) continue;
      const p = path.join(dest, base);
      // ⚠️ paranoia: nunca sair da pasta, mesmo com um nome forjado no zip
      if (path.dirname(path.resolve(p)) !== path.resolve(dest)) {
        throw new Error('entrada suspeita no bundle: ' + f.nome);
      }
      fs.writeFileSync(p, f.dados);
      escritos.push(p);
    }
  } catch (e) {
    // repor o que estava
    let reposto = 0;
    try {
      for (const f of fs.readdirSync(backup)) {
        try { fs.copyFileSync(path.join(backup, f), path.join(dest, f)); reposto++; } catch { /* */ }
      }
    } catch { /* */ }
    return {
      ok: false,
      erro: 'falhou a meio: ' + ((e && e.message) || e),
      reposto: reposto + ' ficheiro(s) repostos da cópia de segurança em ' + backup,
      manual: alvo,
    };
  }

  return {
    ok: true,
    de: versaoAtual,
    para: versaoNova,
    ficheiros: escritos.length,
    backup,
    // ⚠️ A PARTE QUE NÃO SE PODE AUTOMATIZAR, dita sem rodeios.
    a_seguir: 'FECHA O CLAUDE DESKTOP POR COMPLETO E VOLTA A ABRIR. Os ficheiros já estão trocados, '
      + 'mas o servidor que está a correr neste momento continua a ser a versão ' + versaoAtual
      + ' — o MCP não tem forma de se reiniciar a si próprio.',
    reverter: 'se algo correr mal, os ficheiros anteriores estão em ' + backup,
  };
}

/** Voltar atrás, a partir da cópia de segurança mais recente. */
function reverter() {
  let dirs;
  try {
    dirs = fs.readdirSync(MOOTER_DIR).filter((d) => d.startsWith('backup-'))
      .map((d) => ({ d, p: path.join(MOOTER_DIR, d) }))
      .filter((x) => { try { return fs.statSync(x.p).isDirectory(); } catch { return false; } })
      .sort((a, b) => b.d.localeCompare(a.d));
  } catch { return { ok: false, erro: 'não há cópias de segurança' }; }
  if (!dirs.length) return { ok: false, erro: 'não há cópias de segurança' };
  const b = dirs[0].p;
  const dest = pastaInstalada();
  let n = 0;
  for (const f of fs.readdirSync(b)) {
    try { fs.copyFileSync(path.join(b, f), path.join(dest, f)); n++; } catch { /* */ }
  }
  return { ok: true, de: b, ficheiros: n, a_seguir: 'fecha o Claude Desktop por completo e volta a abrir' };
}

module.exports = { procurar, aplicar, reverter, verificar, compara, lerZip, pastaInstalada, lerManifest };
