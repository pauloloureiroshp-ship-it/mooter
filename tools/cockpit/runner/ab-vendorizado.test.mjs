/**
 * ab-vendorizado.test.mjs
 *
 * TESTES DE MORDIDA. Um guarda que nunca falhou e indistinguivel de um guarda
 * partido — nesta sessao isso ja aconteceu tres vezes, e a licao esta escrita no
 * repo ("documentar nao corrige; so tornar visivel corrige", e "um teste pode
 * passar verde tendo corrido ZERO testes").
 *
 * Portanto cada uma das tres maneiras de a vendorizacao se estragar tem aqui um
 * caso que a PROVOCA e exige vermelho:
 *
 *   1. um sha256 do manifesto que nao bate com o ficheiro   -> FALHA
 *   2. um ficheiro declarado que desapareceu                -> FALHA
 *   3. um ficheiro de regras a mais, nao manifestado        -> FALHA
 *   4. (2026-09-12) um yaml dentro do repo quando o manifesto diz
 *      `distribuivel: false`, ou um yaml que declara `license:` sem o
 *      manifesto ter decidido                              -> FALHA
 *
 * E, alem dos casos sinteticos, casos sobre os ARTEFACTOS REAIS: o que esta
 * versionado (manifesto + listas de ambito; as regras ja nao — licenca) tem de
 * dar N/D declarado e 0 falhas, e, quando AB_REGRAS_SEMGREP aponta para a copia
 * externa, os 4 ficheiros reais tem de bater byte a byte E uma letra trocada no
 * manifesto real tem de dar vermelho. Sem o segundo, o primeiro so provava que o
 * verificador sabe dizer "OK".
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  verificarEntradas, verificarManifesto, verificarRegras, verificarTudo, relatorio,
  entradasDoManifesto, sha256Buf, ehRegraYaml, licencasNoFicheiro,
  MANIFESTO_REGRAS, MANIFESTO_AMBITO, DIR_AB, ENV_REGRAS,
} from './ab-vendorizado.mjs';

const RAIZ_REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/** Um disco falso: mapa caminho-relativo -> conteudo (string ou Buffer). */
function disco(mapa) {
  const norm = (p) => String(p).replace(/\\/g, '/');
  const achar = (p) => {
    const c = norm(p);
    for (const k of Object.keys(mapa)) if (c.endsWith(k)) return mapa[k];
    return undefined;
  };
  return {
    readImpl: (p, enc) => {
      const v = achar(p);
      if (v === undefined) { const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e; }
      return enc ? String(v) : Buffer.from(v);
    },
    existsImpl: (p) => achar(p) !== undefined,
    readdirImpl: () => Object.keys(mapa).map((k) => path.posix.basename(k)),
  };
}

const entrada = (ficheiro, conteudo) => ({
  ficheiro,
  sha256: sha256Buf(Buffer.from(conteudo)),
  bytes: Buffer.byteLength(conteudo),
});

// ───────────────────────────────────────────── 1. o sha que nao bate

test('MORDIDA: sha256 do manifesto != ficheiro no disco -> a verificacao FALHA', () => {
  const io = disco({ 'regras/p-javascript.yaml': 'rules: [depois]' });
  const entradas = [entrada('regras/p-javascript.yaml', 'rules: [antes]')]; // sha do conteudo ANTIGO
  const r = verificarEntradas({ base: '/x', entradas, ...io });

  assert.equal(r.ok, false, 'o ficheiro mudou e o guarda ficou verde');
  assert.equal(r.verificados, 0);
  assert.equal(r.falhas.length, 1);
  assert.equal(r.falhas[0].tipo, 'sha256');
  assert.equal(r.falhas[0].ficheiro, 'regras/p-javascript.yaml');
  assert.equal(r.falhas[0].esperado, sha256Buf(Buffer.from('rules: [antes]')));
  assert.equal(r.falhas[0].obtido, sha256Buf(Buffer.from('rules: [depois]')));
  assert.match(r.falhas[0].porque, /deixou de ser comparavel/);

  // e o relatorio tem de DIZER os dois hashes — um "FALHA" sem numeros nao se
  // consegue investigar, e um guarda que nao se consegue investigar acaba mudo.
  const rel = relatorio([{ titulo: 't', ...r }]);
  assert.equal(rel.falhas, 1);
  assert.match(rel.texto, /esperado:/);
  assert.match(rel.texto, /obtido:/);
});

test('o mesmo ficheiro, byte a byte igual -> passa, e conta que passou', () => {
  const io = disco({ 'regras/p-javascript.yaml': 'rules: [igual]' });
  const r = verificarEntradas({ base: '/x', entradas: [entrada('regras/p-javascript.yaml', 'rules: [igual]')], ...io });
  assert.equal(r.ok, true);
  assert.equal(r.verificados, 1, 'passou sem ter verificado nada e ninguem daria por isso');
});

// ───────────────────────────────────────────── 2. a lista que encolhe

test('MORDIDA: ficheiro declarado no manifesto que desapareceu -> FALHA', () => {
  const io = disco({ 'regras/p-javascript.yaml': 'x' });
  const entradas = [entrada('regras/p-javascript.yaml', 'x'), entrada('regras/p-nodejs.yaml', 'y')];
  const r = verificarEntradas({ base: '/x', entradas, ...io });
  assert.equal(r.ok, false);
  assert.equal(r.falhas[0].tipo, 'ausente');
  assert.equal(r.falhas[0].ficheiro, 'regras/p-nodejs.yaml');
});

// ───────────────────────────────────────────── 3. a lista que cresce

test('MORDIDA: um quinto conjunto de regras largado no directorio -> FALHA', () => {
  // O caso menos obvio e o mais perigoso: acrescentar um ficheiro nao muda sha
  // nenhum dos existentes, passa em qualquer verificacao ingenua, e muda os
  // achados de A e de B. O §2.1 diz "nao cresce NEM encolhe".
  const io = disco({ 'p-javascript.yaml': 'x', 'p-contrabando.yaml': 'surpresa' });
  const r = verificarEntradas({
    base: '/x',
    entradas: [entrada('p-javascript.yaml', 'x')],
    extrasEm: '.',
    extrasFiltro: ehRegraYaml,
    ...io,
  });
  assert.equal(r.ok, false, 'entrou um conjunto de regras a mais e o guarda calou-se');
  assert.equal(r.falhas.length, 1);
  assert.equal(r.falhas[0].tipo, 'extra');
  assert.match(r.falhas[0].ficheiro, /p-contrabando\.yaml$/);
  assert.match(r.falhas[0].porque, /nao cresce nem encolhe/);
});

test('ficheiros que nao sao regras (o proprio MANIFESTO.json) nao contam como extra', () => {
  const io = disco({ 'p-javascript.yaml': 'x', 'MANIFESTO.json': '{}', 'LEIA-ME.md': '#' });
  const r = verificarEntradas({
    base: '/x', entradas: [entrada('p-javascript.yaml', 'x')],
    extrasEm: '.', extrasFiltro: ehRegraYaml, ...io,
  });
  assert.equal(r.ok, true);
});

// ───────────────────────────────────────────── o manifesto ele proprio

test('MORDIDA: manifesto vazio nao e "tudo bem" — e um guarda que nao verifica nada', () => {
  assert.match(entradasDoManifesto({ conjuntos: [] }).erro, /lista vazia/);
  assert.match(entradasDoManifesto({}).erro, /sem `conjuntos\[\]` nem `sujeitos\[\]`/);
  assert.match(entradasDoManifesto({ conjuntos: [{ ficheiro: 'a' }] }).erro, /sem `sha256`/);
});

test('MORDIDA: manifesto ausente ou JSON partido -> FALHA, nao silencio', () => {
  const ausente = verificarManifesto({ raiz: '/r', manifestoRel: 'nada.json', titulo: 't', existsImpl: () => false });
  assert.equal(ausente.ok, false);
  assert.match(ausente.falhas[0].porque, /ausente/);

  const partido = verificarManifesto({
    raiz: '/r', manifestoRel: 'm.json', titulo: 't',
    existsImpl: () => true, readImpl: () => '{ isto nao e json',
  });
  assert.equal(partido.ok, false);
  assert.match(partido.falhas[0].porque, /JSON invalido/);
});

test('o verificador nao sabe escrever — e isso e a garantia, nao uma limitacao', () => {
  // Um verificador com modo `--update` valida a propria corrupcao: o ficheiro
  // muda, o manifesto e "actualizado" para concordar, e a corrida continua verde
  // sobre outro conjunto de regras. Este teste fixa a ausencia da capacidade.
  //
  // Verificado no IMPORT, nao por procura de palavras no ficheiro: a primeira
  // versao deste teste fazia grep a fonte inteira e acusava a propria prosa do
  // cabecalho, que explica porque e que o modo `--update` nao existe. Um guarda
  // que grita com o comentario que o justifica ensina toda a gente a ignora-lo.
  const fonte = readFileSync(path.join(RAIZ_REPO, 'tools/cockpit/runner/ab-vendorizado.mjs'), 'utf8');
  const linhaImport = (fonte.match(/^import \{[^}]*\} from 'node:fs';$/m) || [''])[0];
  assert.notEqual(linhaImport, '', 'nao encontrei o import de node:fs — o teste deixou de medir o que dizia medir');
  for (const escrita of ['writeFileSync', 'appendFileSync', 'mkdirSync', 'rmSync', 'unlinkSync', 'renameSync', 'copyFileSync']) {
    assert.equal(linhaImport.includes(escrita), false,
      'ab-vendorizado.mjs importou `' + escrita + '` — o guarda passa a poder validar a propria falha');
  }
});

// ───────────────────────────────────────────── 4. a licenca (2026-09-12)

test('licencasNoFicheiro conta os valores de `license:` sem parsear YAML', () => {
  const yaml = [
    'rules:',
    '- id: a',
    '  metadata:',
    '    license: Semgrep Rules License v1.0. For more details, visit semgrep.dev/legal/rules-license',
    '- id: b',
    '  metadata:',
    '    license: "Semgrep Rules License v1.0. For more details, visit semgrep.dev/legal/rules-license"',
    '- id: c',
    '  metadata:',
    "    license: 'MIT'",
    '    licensed_by: ninguem  # nao e a chave `license:`',
  ].join(String.fromCharCode(10));
  assert.deepEqual(licencasNoFicheiro(yaml), {
    'Semgrep Rules License v1.0. For more details, visit semgrep.dev/legal/rules-license': 2,
    MIT: 1,
  });
  assert.deepEqual(licencasNoFicheiro('rules: []'), {});
});

const manifestoRegras = (extra, conteudos) => JSON.stringify({
  ...extra,
  conjuntos: Object.keys(conteudos).map((f) => ({ nome: f, ...entrada(f, conteudos[f]) })),
});

test('MORDIDA de licenca: `distribuivel: false` e um yaml dentro do repo -> FALHA [licenca], mesmo com o sha a bater', () => {
  const regra = 'rules: [x]';
  const io = disco({
    '_handoff/ab-audit/regras-semgrep/MANIFESTO.json': manifestoRegras({ distribuivel: false, licenca: 'L v1' }, { 'p-javascript.yaml': regra }),
    '_handoff/ab-audit/regras-semgrep/p-javascript.yaml': regra,
  });
  const r = verificarRegras({ raiz: '/r', ...io });
  assert.equal(r.ok, false, 'o ficheiro nao pode estar no repo e o guarda ficou verde');
  assert.equal(r.nd, true, 'sem directorio externo o resultado e n/d, e continua a ser falha');
  assert.equal(r.falhas.length, 1);
  assert.equal(r.falhas[0].tipo, 'licenca');
  assert.match(r.falhas[0].ficheiro, /regras-semgrep\/p-javascript\.yaml$/);
  assert.match(r.falhas[0].porque, /distribuivel: false/);
  assert.match(r.falhas[0].porque, /L v1/);
  assert.equal(relatorio([r]).falhas, 1);
});

test('MORDIDA de licenca (o caso de 2026-08-26): yaml no repo que DECLARA `license:` e manifesto sem decisao -> FALHA [licenca]', () => {
  // Foi exactamente isto que esteve verde 17 dias: sha256 a bater, licenca por ler.
  const regra = ['rules:', '- id: a', '  metadata:', '    license: Semgrep Rules License v1.0'].join(String.fromCharCode(10));
  const io = disco({
    '_handoff/ab-audit/regras-semgrep/MANIFESTO.json': manifestoRegras({}, { 'p-javascript.yaml': regra }),
    '_handoff/ab-audit/regras-semgrep/p-javascript.yaml': regra,
  });
  const r = verificarRegras({ raiz: '/r', ...io });
  assert.equal(r.verificados, 1, 'o sha bate — o que falha e outra coisa');
  assert.equal(r.ok, false, 'sha a bater e licenca por ler: o guarda de ate 12/09 dizia OK');
  assert.equal(r.falhas.length, 1);
  assert.equal(r.falhas[0].tipo, 'licenca');
  assert.match(r.falhas[0].porque, /Semgrep Rules License v1\.0/);
  assert.match(r.falhas[0].porque, /distribuivel: true/);
  assert.deepEqual(r.licencas, { 'Semgrep Rules License v1.0': 1 });

  // A decisao escrita no manifesto e o que muda o veredicto — e a licenca lida
  // continua no relatorio, para quem ler ver o que foi aceite.
  const ioSim = disco({
    '_handoff/ab-audit/regras-semgrep/MANIFESTO.json': manifestoRegras({ distribuivel: true }, { 'p-javascript.yaml': regra }),
    '_handoff/ab-audit/regras-semgrep/p-javascript.yaml': regra,
  });
  const rSim = verificarRegras({ raiz: '/r', ...ioSim });
  assert.equal(rSim.ok, true);
  assert.equal(rSim.verificados, 1);
  assert.match(relatorio([rSim]).texto, /licenca\(s\) lida\(s\) nos ficheiros: Semgrep Rules License v1\.0 ×1/);
});

test('`distribuivel: false` sem directorio externo -> N/D no relatorio (nao OK), 0 falhas, exit 0', () => {
  const io = disco({
    '_handoff/ab-audit/regras-semgrep/MANIFESTO.json': manifestoRegras({ distribuivel: false, licenca: 'L v1' }, { 'p-javascript.yaml': 'x', 'p-nodejs.yaml': 'y' }),
  });
  const r = verificarRegras({ raiz: '/r', ...io });
  assert.equal(r.ok, true);
  assert.equal(r.nd, true);
  assert.equal(r.verificados, 0);
  assert.match(r.porque, /2 ficheiro\(s\) fora do repo por licenca \(L v1\)/);
  assert.match(r.porque, /AB_REGRAS_SEMGREP=<dir> ou --regras <dir>/);
  const rel = relatorio([r]);
  assert.equal(rel.falhas, 0);
  assert.match(rel.texto, /^N\/D {4}regras do semgrep/m);
  assert.doesNotMatch(rel.texto, /^OK/m, 'n/d impresso como OK e verde por nao ter verificado nada');
});

test('`distribuivel: false` com directorio externo -> os tres testes de sempre, la: OK 2, e uma letra trocada FALHA sha256', () => {
  const conteudos = { 'p-javascript.yaml': 'rules: [a]', 'p-nodejs.yaml': 'rules: [b]' };
  const bom = JSON.parse(manifestoRegras({ distribuivel: false, licenca: 'L v1' }, conteudos));
  const io = disco({
    '_handoff/ab-audit/regras-semgrep/MANIFESTO.json': JSON.stringify(bom),
    'fora/p-javascript.yaml': conteudos['p-javascript.yaml'],
    'fora/p-nodejs.yaml': conteudos['p-nodejs.yaml'],
  });
  const listar = (d) => (String(d).split(String.fromCharCode(92)).join('/').endsWith('/fora') ? ['p-javascript.yaml', 'p-nodejs.yaml'] : ['MANIFESTO.json']);
  const r = verificarRegras({ raiz: '/r', dirExterno: '/fora', ...io, readdirImpl: listar });
  assert.equal(r.ok, true, relatorio([r]).texto);
  assert.equal(r.verificados, 2);
  assert.match(r.titulo, /fora do repo, em \/fora/);

  const mau = JSON.parse(JSON.stringify(bom));
  mau.conjuntos[0].sha256 = (mau.conjuntos[0].sha256[0] === 'a' ? 'b' : 'a') + mau.conjuntos[0].sha256.slice(1);
  const ioMau = disco({ ...{
    '_handoff/ab-audit/regras-semgrep/MANIFESTO.json': JSON.stringify(mau),
    'fora/p-javascript.yaml': conteudos['p-javascript.yaml'],
    'fora/p-nodejs.yaml': conteudos['p-nodejs.yaml'],
  } });
  const rMau = verificarRegras({ raiz: '/r', dirExterno: '/fora', ...ioMau, readdirImpl: listar });
  assert.equal(rMau.ok, false, 'o sha foi adulterado e o guarda continuou verde');
  assert.equal(rMau.falhas[0].tipo, 'sha256');
  assert.equal(rMau.falhas[0].ficheiro, 'p-javascript.yaml');
});

// ───────────────────────────────────────────── os artefactos REAIS deste commit

test('os artefactos versionados neste repo: regras N/D por licenca (fora do repo, 0 yaml aqui), listas de ambito batem byte a byte', () => {
  const resultados = verificarTudo(RAIZ_REPO, {}, { dirRegrasExterno: null });
  const rel = relatorio(resultados);
  assert.equal(rel.falhas, 0, rel.texto);
  assert.equal(resultados[0].nd, true, 'as regras nao estao no repo e o verificador nao o disse');
  assert.equal(resultados[0].verificados, 0);
  assert.match(resultados[0].porque, /4 ficheiro\(s\) fora do repo por licenca \(Semgrep Rules License v1\.0\)/);
  assert.match(rel.texto, /^N\/D {4}regras do semgrep/m);
  // Anti-vacuidade: tres listas (§2.2) verificadas de facto.
  assert.equal(resultados[1].verificados, 3, 'as tres listas do §2.2 nao foram todas verificadas');
  // E o directorio do repo nao tem yaml nenhum — a mordida acima e o que o garante.
  const yamlNoRepo = readdirSync(path.join(RAIZ_REPO, DIR_AB, 'regras-semgrep')).filter(ehRegraYaml);
  assert.deepEqual(yamlNoRepo, [], 'ha regras dentro do repo: ' + yamlNoRepo.join(', '));
});

test('CLI: a raiz passada por argumento e respeitada mesmo sem --regras (corre de OUTRO cwd)', () => {
  // Mordida do defeito de 12/09: sem --regras o filtro de argumentos deitava fora
  // o primeiro argumento e o CLI verificava o cwd — daqui, o scratch — em vez da raiz.
  const cli = path.join(RAIZ_REPO, 'tools/cockpit/runner/ab-vendorizado.mjs');
  // O filho nao pode herdar AB_REGRAS_SEMGREP: o teste e sobre o caminho SEM directorio externo.
  const semEnv = { ...process.env, [ENV_REGRAS]: '' };
  const r = spawnSync(process.execPath, [cli, RAIZ_REPO], { cwd: tmpdir(), encoding: 'utf8', env: semEnv });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^N\/D {4}regras do semgrep/m, r.stdout);
  assert.match(r.stdout, /^OK {5}listas de ambito \(§2\.2\) — 3 ficheiro\(s\)/m, r.stdout);
  // e com --regras a apontar para um directorio que nao existe: FALHA [ausente] x4, exit 1
  const rMau = spawnSync(process.execPath, [cli, RAIZ_REPO, '--regras', path.join(tmpdir(), 'nao-existe-' + process.pid)], { cwd: tmpdir(), encoding: 'utf8', env: semEnv });
  assert.equal(rMau.status, 1, rMau.stdout + rMau.stderr);
  assert.equal((rMau.stdout.match(/\[ausente\]/g) || []).length, 4, rMau.stdout);
});

test('os 4 ficheiros REAIS, fora do repo: batem byte a byte e declaram a licenca 409 vezes (corre so com AB_REGRAS_SEMGREP)', (t) => {
  const dir = process.env[ENV_REGRAS];
  if (!dir || !existsSync(dir)) return t.skip(ENV_REGRAS + ' nao aponta para um directorio — as regras nao estao no repo por licenca');
  const [r] = verificarTudo(RAIZ_REPO, {}, { dirRegrasExterno: dir });
  assert.equal(r.ok, true, relatorio([r]).texto);
  assert.equal(r.verificados, 4, 'os quatro conjuntos do §2.1 nao foram todos verificados');
  const valores = Object.keys(r.licencas);
  assert.equal(valores.length, 1, 'mais do que uma licenca nos ficheiros: ' + valores.join(' | '));
  assert.match(valores[0], /^Semgrep Rules License v1\.0/);
  assert.equal(r.licencas[valores[0]], 409, 'o manifesto diz 409 regras; a licenca devia aparecer uma vez por regra');

  // MORDIDA sobre o manifesto REAL: uma letra trocada num sha e a verificacao FALHA.
  const absManifesto = path.join(RAIZ_REPO, MANIFESTO_REGRAS);
  const original = JSON.parse(readFileSync(absManifesto, 'utf8'));
  const adulterado = JSON.parse(JSON.stringify(original));
  const shaBom = adulterado.conjuntos[0].sha256;
  adulterado.conjuntos[0].sha256 = (shaBom[0] === 'a' ? 'b' : 'a') + shaBom.slice(1);
  const readImpl = (p, enc) => {
    if (path.resolve(String(p)) === path.resolve(absManifesto)) return JSON.stringify(adulterado);
    return readFileSync(p, enc);
  };
  const rMau = verificarRegras({ raiz: RAIZ_REPO, dirExterno: dir, readImpl });
  assert.equal(rMau.ok, false, 'o sha real foi adulterado e o guarda continuou verde');
  const falha = rMau.falhas.find((f) => f.tipo === 'sha256');
  assert.ok(falha, 'a falha nao foi classificada como sha256: ' + JSON.stringify(rMau.falhas));
  assert.equal(falha.obtido, shaBom);
});

test('o manifesto real declara o que o §2.1 e o §2.2 exigem', () => {
  const regras = JSON.parse(readFileSync(path.join(RAIZ_REPO, MANIFESTO_REGRAS), 'utf8'));
  const ambito = JSON.parse(readFileSync(path.join(RAIZ_REPO, MANIFESTO_AMBITO), 'utf8'));

  // §2.1: os quatro conjuntos fixados, "a lista nao cresce nem encolhe".
  assert.deepEqual(
    regras.conjuntos.map((c) => c.nome),
    ['p/javascript', 'p/typescript', 'p/security-audit', 'p/nodejs'],
  );
  // 2026-09-12: a decisao de licenca esta escrita no manifesto, nao na cabeca de ninguem.
  assert.equal(regras.distribuivel, false, 'o manifesto nao diz que as regras nao sao distribuiveis');
  assert.match(regras.licenca, /^Semgrep Rules License v1\.0$/);
  assert.match(regras.licenca_lida_em, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(regras.licenca_fonte, /does not allow you to distribute the rules/);
  assert.match(regras.onde_estao, /AB_REGRAS_SEMGREP/);
  for (const c of regras.conjuntos) {
    for (const campo of ['nome', 'ficheiro', 'regras', 'bytes', 'sha256', 'descarregado_em']) {
      assert.ok(c[campo] !== undefined && c[campo] !== null, c.nome + ' sem `' + campo + '`');
    }
    assert.match(c.sha256, /^[0-9a-f]{64}$/, c.nome + ': sha256 malformado');
    assert.ok(Number.isInteger(c.regras) && c.regras > 0, c.nome + ': contagem de regras invalida');
    assert.match(c.descarregado_em, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, c.nome + ': data nao e UTC ISO-8601');
  }
  assert.equal(
    regras.totais.regras_soma_bruta,
    regras.conjuntos.reduce((a, c) => a + c.regras, 0),
    'o total declarado nao e a soma das parcelas',
  );

  // §2.2: os tres sujeitos.
  assert.deepEqual(ambito.sujeitos.map((s) => s.id), ['S1', 'S2', 'S3']);
  for (const s of ambito.sujeitos) {
    assert.match(s.sha256, /^[0-9a-f]{64}$/, s.id + ': sha256 malformado');
    assert.ok(s.ficheiros_no_ambito > 0, s.id + ': ambito vazio');
  }
  // §1 + §10.2: os TRES sujeitos varridos no sha pre-registado, medido por git e
  // nao declarado. Ate 2026-09-11 S1 estava em 2d5fd762 e o manifesto dizia-o
  // (`no_sha_preregistado: false`); o adversario do PR #505 bloqueou por isso.
  for (const s of ambito.sujeitos) {
    assert.match(s.sha_preregisto, /^[0-9a-f]{40}$/, s.id + ': sha pre-registado malformado');
    assert.equal(s.head_da_raiz_ao_versionar, s.sha_preregisto, s.id + ': a lista nao foi gerada no sha pre-registado');
    assert.equal(s.no_sha_preregistado, true, s.id + ': fora do sha pre-registado (§10.2)');
  }
  // A corrida invalidada de S1 esta REGISTADA, nao apagada: entrada substituida
  // com o head medido, o porque derivado, e os artefactos postos de lado no disco.
  assert.ok(Array.isArray(ambito.substituidos), 'o manifesto perdeu o historico de substituicoes');
  const s1Velha = ambito.substituidos.find((x) => x.id === 'S1' && x.no_sha_preregistado === false);
  assert.ok(s1Velha, 'a entrada de S1 gerada fora do sha pre-registado desapareceu do manifesto');
  assert.match(s1Velha.head_da_raiz_ao_versionar, /^2d5fd762/);
  assert.equal(s1Velha.ficheiros_no_ambito, 974);
  assert.match(s1Velha.porque, /§10\.2/);
  assert.ok(s1Velha.artefactos_da_corrida_invalidada.length >= 3,
    'os artefactos da corrida invalidada nao estao no disco com o prefixo INVALIDO-2d5fd76');
  for (const n of s1Velha.artefactos_da_corrida_invalidada) {
    assert.equal(existsSync(path.join(RAIZ_REPO, DIR_AB, n)), true, n + ' declarado e ausente');
  }
});
