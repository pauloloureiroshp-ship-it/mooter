/**
 * Testes da varredura do historico.
 *
 * O teste que importa e o `encontra um segredo que SO existe no historico`: e a
 * unica coisa que esta ferramenta faz e a `varredura-segredos.mjs` nao faz. Se
 * esse teste passar a verde com a ferramenta partida, o resto e decoracao.
 *
 * O `parseBatch` leva quatro testes porque e a unica peca do ficheiro onde um
 * erro nao da erro: parte-se o offset por um byte e a varredura passa a ler
 * conteudo desalinhado — encontra segredos que nao existem, ou pior, deixa de
 * encontrar os que existem, e em qualquer dos casos continua a imprimir um
 * relatorio de aspecto normal.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseBatch, blobsAlcancaveis, lerDeclarados, varrerHistorico, lerLote, eShallow,
} from './varredura-historico.mjs';

/** Um detector falso: acha o que lhe mandarem achar, sem regex nenhuma. */
function detectorQueAcha(marcador, severity = 'critical', type = 'fixture-key') {
  return {
    scanSecrets(ficheiros) {
      const out = [];
      for (const f of ficheiros) {
        const linhas = String(f.content).split('\n');
        linhas.forEach((l, i) => {
          if (l.includes(marcador)) out.push({ type, severity, line: i + 1, redacted: '****' });
        });
      }
      return out;
    },
  };
}

function blobDe(sha, texto) {
  return { sha, tipo: 'blob', tamanho: Buffer.byteLength(texto), conteudo: Buffer.from(texto, 'utf8') };
}

// ── parseBatch ──────────────────────────────────────────────────────────────

test('parseBatch le dois blobs seguidos', () => {
  const buf = Buffer.concat([
    Buffer.from('aaa blob 5\nolaol\n'),
    Buffer.from('bbb blob 3\nxyz\n'),
  ]);
  const r = parseBatch(buf);
  assert.equal(r.length, 2);
  assert.equal(r[0].sha, 'aaa');
  assert.equal(r[0].conteudo.toString(), 'olaol');
  assert.equal(r[1].conteudo.toString(), 'xyz');
});

test('parseBatch usa o tamanho, nao as linhas: um blob com \\n la dentro nao parte o stream', () => {
  const corpo = 'linha1\nlinha2\nlinha3';
  const buf = Buffer.concat([
    Buffer.from(`aaa blob ${corpo.length}\n${corpo}\n`),
    Buffer.from('bbb blob 2\nok\n'),
  ]);
  const r = parseBatch(buf);
  assert.equal(r.length, 2);
  assert.equal(r[0].conteudo.toString(), corpo);
  assert.equal(r[1].conteudo.toString(), 'ok');
});

test('parseBatch nao se deixa enganar por uma linha que PARECE um cabecalho dentro do conteudo', () => {
  // Este e o caso que um parser por linhas erra sempre.
  const corpo = 'antes\nccc blob 99\ndepois';
  const buf = Buffer.concat([
    Buffer.from(`aaa blob ${corpo.length}\n${corpo}\n`),
    Buffer.from('bbb blob 2\nok\n'),
  ]);
  const r = parseBatch(buf);
  assert.equal(r.length, 2, 'o cabecalho falso nao pode virar um terceiro objecto');
  assert.equal(r[0].conteudo.toString(), corpo);
});

test('parseBatch salta um "<sha> missing" sem rebentar', () => {
  const buf = Buffer.concat([
    Buffer.from('deadbeef missing\n'),
    Buffer.from('bbb blob 2\nok\n'),
  ]);
  const r = parseBatch(buf);
  assert.equal(r.length, 1);
  assert.equal(r[0].sha, 'bbb');
});

// ── blobsAlcancaveis ────────────────────────────────────────────────────────

test('blobsAlcancaveis agrupa o mesmo blob sob todos os caminhos onde viveu', () => {
  const saida = [
    'c0mm1t',                       // commit: sem caminho
    'aaa src/a.js',
    'aaa src/renomeado.js',
    'bbb src/b.js',
  ].join('\n');
  const m = blobsAlcancaveis('/x', { runImpl: () => saida });
  assert.equal(m.size, 2, 'o commit sem caminho nao entra');
  assert.deepEqual([...m.get('aaa').caminhos].sort(), ['src/a.js', 'src/renomeado.js']);
});

test('blobsAlcancaveis usa --remotes=origin quando refs=origin', () => {
  let vistos = null;
  blobsAlcancaveis('/x', { refs: 'origin', runImpl: (_c, args) => { vistos = args; return ''; } });
  assert.ok(vistos.includes('--remotes=origin'));
  assert.ok(!vistos.includes('--all'));
});

// ── lerDeclarados ───────────────────────────────────────────────────────────

const SHA_OK = 'a'.repeat(40);
const MOTIVO_OK = 'fixture do proprio detector, verificado a olho';

test('lerDeclarados aceita uma entrada com sha valido e motivo escrito', () => {
  const { mapa, recusadas } = lerDeclarados('/x', {
    readImpl: () => JSON.stringify({ declarados: { [SHA_OK]: MOTIVO_OK } }),
  });
  assert.equal(mapa.get(SHA_OK), MOTIVO_OK);
  assert.equal(recusadas.length, 0);
});

test('lerDeclarados RECUSA um motivo curto — allowlistar sem explicar e o comeco de esconder', () => {
  const { mapa, recusadas } = lerDeclarados('/x', {
    readImpl: () => JSON.stringify({ declarados: { [SHA_OK]: 'ok' } }),
  });
  assert.equal(mapa.size, 0);
  assert.equal(recusadas.length, 1);
  assert.match(recusadas[0].porque, /motivo/);
});

test('lerDeclarados RECUSA uma chave que nao e um sha de blob', () => {
  const { mapa, recusadas } = lerDeclarados('/x', {
    readImpl: () => JSON.stringify({ declarados: { 'packages/x/y.test.js': MOTIVO_OK } }),
  });
  assert.equal(mapa.size, 0, 'um caminho nunca pode ser declarado — valeria para o que la for escrito amanha');
  assert.equal(recusadas.length, 1);
});

test('lerDeclarados: ficheiro ausente da allowlist vazia SEM recusa; ficheiro partido da recusa', () => {
  const ausente = lerDeclarados('/x', { readImpl: () => { throw new Error('ENOENT'); } });
  assert.equal(ausente.mapa.size, 0);
  assert.equal(ausente.recusadas.length, 0, 'nao ter allowlist e um estado legitimo');

  const partido = lerDeclarados('/x', { readImpl: () => '{ isto nao e json' });
  assert.equal(partido.mapa.size, 0);
  assert.equal(partido.recusadas.length, 1, 'uma allowlist partida tem de ser VISTA, nao tratada como vazia');
});

// ── varrerHistorico ─────────────────────────────────────────────────────────

function ambiente({ blobs, caminhosPorSha, declarados = new Map(), commits = () => [] }) {
  return {
    dir: '/repo',
    detector: detectorQueAcha('SEGREDO'),
    declarados,
    listaImpl: () => new Map(Object.entries(caminhosPorSha).map(([sha, cs]) => [sha, { sha, caminhos: new Set(cs) }])),
    loteImpl: (_d, shas) => shas.map((s) => blobs[s]).filter(Boolean),
    commitsImpl: commits,
  };
}

test('encontra um segredo que SO existe no historico — a razao de esta ferramenta existir', () => {
  // `apagado` ja nao esta em nenhuma arvore de HEAD; o `git ls-files` da
  // varredura da arvore nunca o veria. Aqui e alcancavel e e lido.
  const r = varrerHistorico(ambiente({
    blobs: { vivo: blobDe('vivo', 'codigo limpo'), apagado: blobDe('apagado', 'const k = "SEGREDO";') },
    caminhosPorSha: { vivo: ['src/a.js'], apagado: ['src/antigo.js'] },
  }));
  assert.equal(r.resumo.HIGH, 1);
  assert.equal(r.achados[0].blob, 'apagado');
  assert.equal(r.achados[0].caminhos[0], 'src/antigo.js');
});

test('um blob que viveu em tres caminhos e lido UMA vez e reporta os tres', () => {
  let lidos = 0;
  const r = varrerHistorico({
    ...ambiente({
      blobs: { x: blobDe('x', 'SEGREDO aqui') },
      caminhosPorSha: { x: ['a.js', 'b.js', 'c.js'] },
    }),
    loteImpl: (_d, shas) => { lidos += shas.length; return shas.map((s) => blobDe(s, 'SEGREDO aqui')); },
  });
  assert.equal(lidos, 1, 'ler o mesmo conteudo tres vezes seria tres vezes o custo pela mesma informacao');
  assert.equal(r.achados.length, 1);
  assert.deepEqual(r.achados[0].caminhos.sort(), ['a.js', 'b.js', 'c.js']);
});

test('um blob declarado desce a INFO mas guarda o nivel que TERIA', () => {
  const r = varrerHistorico(ambiente({
    blobs: { fx: blobDe('fx', 'const k = "SEGREDO";') },
    caminhosPorSha: { fx: ['t.test.js'] },
    declarados: new Map([['fx', MOTIVO_OK]]),
  }));
  assert.equal(r.resumo.HIGH, 0);
  assert.equal(r.resumo.INFO, 1);
  assert.equal(r.achados[0].nivel_bruto, 'HIGH', 'sem isto o relatorio nao consegue dizer o que foi declarado');
  assert.equal(r.achados[0].declarado, MOTIVO_OK);
  assert.equal(r.declarados, 1);
});

test('binario por NUL e blob grande demais sao SALTADOS e CONTADOS, nunca calados', () => {
  const grande = 'x'.repeat(3 * 1024 * 1024);
  const r = varrerHistorico(ambiente({
    blobs: {
      bin: { sha: 'bin', tipo: 'blob', tamanho: 4, conteudo: Buffer.from([0x53, 0x00, 0x45, 0x47]) },
      big: blobDe('big', grande),
      ok: blobDe('ok', 'limpo'),
    },
    caminhosPorSha: { bin: ['a.js'], big: ['b.js'], ok: ['c.js'] },
  }));
  assert.equal(r.saltados.binarios, 1);
  assert.equal(r.saltados.grandes, 1);
  assert.equal(r.lidos, 1);
});

test('a proveniencia so se pede para HIGH — e o resto e contado como omitido', () => {
  let chamadas = 0;
  const r = varrerHistorico({
    ...ambiente({
      blobs: { h: blobDe('h', 'SEGREDO'), l: blobDe('l', 'nada') },
      caminhosPorSha: { h: ['a.js'], l: ['b.js'] },
      commits: () => { chamadas += 1; return [{ commit: 'c'.repeat(40), data: '2026-01-01T00:00:00Z', autor: 'x' }]; },
    }),
    detector: detectorQueAcha('SEGREDO'),
  });
  assert.equal(chamadas, 1, 'um git log --find-object por achado LOW poe a corrida em minutos por informacao que ninguem le');
  assert.equal(r.achados[0].commits.length, 1);
});

test('rev-list a falhar devolve erro declarado, nao uma varredura vazia com ar de limpa', () => {
  const r = varrerHistorico({
    dir: '/repo',
    detector: detectorQueAcha('SEGREDO'),
    listaImpl: () => { throw new Error('fatal: bad revision'); },
  });
  assert.match(r.erro, /rev-list/);
  assert.equal(r.achados.length, 0);
  assert.equal(r.resumo, undefined, 'sem resumo: um zero aqui seria lido como "nao ha segredos"');
});

test('um lote que rebenta conta os blobs como ilegiveis e a corrida continua', () => {
  const r = varrerHistorico({
    ...ambiente({
      blobs: { a: blobDe('a', 'x'), b: blobDe('b', 'y') },
      caminhosPorSha: { a: ['a.js'], b: ['b.js'] },
    }),
    lote: 2,
    loteImpl: () => { throw new Error('cat-file morreu'); },
  });
  assert.equal(r.saltados.ilegiveis, 2);
  assert.equal(r.erro, null);
});

test('um clone SHALLOW e recusado — um "HIGH 0" sobre a ponta seria uma mentira calma', () => {
  let listou = false;
  const r = varrerHistorico({
    dir: '/repo',
    detector: detectorQueAcha('SEGREDO'),
    shallowImpl: () => true,
    listaImpl: () => { listou = true; return new Map(); },
  });
  assert.match(r.erro, /SHALLOW/);
  assert.equal(listou, false, 'nem sequer chega a listar: falha antes de parecer que varreu');
  assert.equal(r.resumo, undefined, 'sem resumo — um HIGH 0 aqui seria lido como "historico limpo"');
});

test('eShallow devolve false quando o git falha — nao se recusa a varrer por causa de um git estranho', () => {
  assert.equal(eShallow('/x', { runImpl: () => { throw new Error('nao e um repo'); } }), false);
  assert.equal(eShallow('/x', { runImpl: () => 'true\n' }), true);
  assert.equal(eShallow('/x', { runImpl: () => 'false\n' }), false);
});

test('lerLote sem shas nao invoca o git', () => {
  let invocado = false;
  const r = lerLote('/x', [], { runImpl: () => { invocado = true; return Buffer.alloc(0); } });
  assert.deepEqual(r, []);
  assert.equal(invocado, false);
});
