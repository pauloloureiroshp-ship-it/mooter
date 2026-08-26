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
 *
 * E, alem dos casos sinteticos, dois casos sobre os ARTEFACTOS REAIS que estao
 * versionados neste commit: um a exigir verde, outro a corromper uma letra do
 * manifesto real e a exigir vermelho. Sem o segundo, o primeiro so provava que o
 * verificador sabe dizer "OK".
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  verificarEntradas, verificarManifesto, verificarTudo, relatorio,
  entradasDoManifesto, sha256Buf, ehRegraYaml,
  MANIFESTO_REGRAS, MANIFESTO_AMBITO,
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

// ───────────────────────────────────────────── os artefactos REAIS deste commit

test('os artefactos vendorizados neste repo batem byte a byte', () => {
  const resultados = verificarTudo(RAIZ_REPO);
  const rel = relatorio(resultados);
  assert.equal(rel.falhas, 0, rel.texto);
  // Anti-vacuidade: quatro conjuntos de regras (§2.1) + tres listas (§2.2).
  assert.equal(resultados[0].verificados, 4, 'os quatro conjuntos do §2.1 nao foram todos verificados');
  assert.equal(resultados[1].verificados, 3, 'as tres listas do §2.2 nao foram todas verificadas');
});

test('MORDIDA sobre o manifesto REAL: uma letra trocada e a verificacao FALHA', () => {
  // O teste acima so prova que o verificador sabe dizer OK. Este pega no manifesto
  // real, troca UM caracter de UM sha256, e exige vermelho — sem tocar em disco.
  const absManifesto = path.join(RAIZ_REPO, MANIFESTO_REGRAS);
  assert.equal(existsSync(absManifesto), true, MANIFESTO_REGRAS + ' nao existe');
  const original = JSON.parse(readFileSync(absManifesto, 'utf8'));
  const alvo = original.conjuntos[0];
  const shaBom = alvo.sha256;
  const shaMau = (shaBom[0] === 'a' ? 'b' : 'a') + shaBom.slice(1);
  assert.notEqual(shaBom, shaMau);

  const adulterado = JSON.parse(JSON.stringify(original));
  adulterado.conjuntos[0].sha256 = shaMau;

  const readImpl = (p, enc) => {
    if (path.resolve(String(p)) === path.resolve(absManifesto)) return JSON.stringify(adulterado);
    return readFileSync(p, enc);
  };
  const r = verificarManifesto({
    raiz: RAIZ_REPO, manifestoRel: MANIFESTO_REGRAS, titulo: 'real adulterado',
    extrasEm: '.', extrasFiltro: ehRegraYaml, readImpl,
  });
  assert.equal(r.ok, false, 'o sha real foi adulterado e o guarda continuou verde');
  const falha = r.falhas.find((f) => f.tipo === 'sha256');
  assert.ok(falha, 'a falha nao foi classificada como sha256: ' + JSON.stringify(r.falhas));
  assert.equal(falha.ficheiro, alvo.ficheiro);
  assert.equal(falha.esperado, shaMau);
  assert.equal(falha.obtido, shaBom, 'o ficheiro no disco ja nao e o que o manifesto original descrevia');
});

test('o manifesto real declara o que o §2.1 e o §2.2 exigem', () => {
  const regras = JSON.parse(readFileSync(path.join(RAIZ_REPO, MANIFESTO_REGRAS), 'utf8'));
  const ambito = JSON.parse(readFileSync(path.join(RAIZ_REPO, MANIFESTO_AMBITO), 'utf8'));

  // §2.1: os quatro conjuntos fixados, "a lista nao cresce nem encolhe".
  assert.deepEqual(
    regras.conjuntos.map((c) => c.nome),
    ['p/javascript', 'p/typescript', 'p/security-audit', 'p/nodejs'],
  );
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
  // A divergencia de S1 face a ancora do §1 esta DECLARADA, nao apagada.
  assert.ok(ambito.ressalva_S1 && ambito.ressalva_S1.medicao, 'a ressalva de S1 desapareceu do manifesto');
  assert.equal(ambito.sujeitos[0].no_sha_preregistado, false);
});
