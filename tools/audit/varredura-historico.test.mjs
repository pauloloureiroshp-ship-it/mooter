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
  parseBatch, blobsAlcancaveis, lerDeclarados, varrerHistorico, lerLote, eShallow, declaracaoBate,
  CAMINHO_DESCONHECIDO,
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
const ENTRADA_OK = { motivo: MOTIVO_OK, tipos: ['fixture-key'], n: 1 };

test('lerDeclarados aceita uma entrada com sha valido e motivo escrito', () => {
  const { mapa, recusadas } = lerDeclarados('/x', {
    readImpl: () => JSON.stringify({ declarados: { [SHA_OK]: ENTRADA_OK } }),
  });
  assert.equal(mapa.get(SHA_OK).motivo, MOTIVO_OK);
  assert.deepEqual(mapa.get(SHA_OK).tipos, ['fixture-key']);
  assert.equal(recusadas.length, 0);
});

test('lerDeclarados RECUSA um motivo curto — allowlistar sem explicar e o comeco de esconder', () => {
  const { mapa, recusadas } = lerDeclarados('/x', {
    readImpl: () => JSON.stringify({ declarados: { [SHA_OK]: { ...ENTRADA_OK, motivo: 'ok' } } }),
  });
  assert.equal(mapa.size, 0);
  assert.equal(recusadas.length, 1);
  assert.match(recusadas[0].porque, /motivo/);
});

test('lerDeclarados RECUSA uma chave que nao e um sha de blob', () => {
  const { mapa, recusadas } = lerDeclarados('/x', {
    readImpl: () => JSON.stringify({ declarados: { 'packages/x/y.test.js': ENTRADA_OK } }),
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

test('lerDeclarados RECUSA uma entrada sem tipos ou sem n — declarar tem de dizer O QUE se declara', () => {
  const semTipos = lerDeclarados('/x', {
    readImpl: () => JSON.stringify({ declarados: { [SHA_OK]: { motivo: MOTIVO_OK, n: 1 } } }),
  });
  assert.equal(semTipos.mapa.size, 0);
  assert.match(semTipos.recusadas[0].porque, /tipos/);

  const semN = lerDeclarados('/x', {
    readImpl: () => JSON.stringify({ declarados: { [SHA_OK]: { motivo: MOTIVO_OK, tipos: ['x'] } } }),
  });
  assert.equal(semN.mapa.size, 0);
  assert.match(semN.recusadas[0].porque, /n /);

  const stringSolta = lerDeclarados('/x', {
    readImpl: () => JSON.stringify({ declarados: { [SHA_OK]: MOTIVO_OK } }),
  });
  assert.equal(stringSolta.mapa.size, 0, 'o formato antigo, so com o motivo, deixa de valer');
});

// ── declaracaoBate ──────────────────────────────────────────────────────────

test('declaracaoBate: a declaracao so vale se descrever exactamente o que esta no blob', () => {
  const achados = [{ type: 'aws-access-key' }, { type: 'pem-private-key' }, { type: 'aws-access-key' }];
  const certa = { motivo: MOTIVO_OK, tipos: ['aws-access-key', 'pem-private-key'], n: 3 };
  assert.equal(declaracaoBate(certa, achados).bate, true);

  const contaErrada = { ...certa, n: 2 };
  assert.equal(declaracaoBate(contaErrada, achados).bate, false);
  assert.match(declaracaoBate(contaErrada, achados).porque, /n=2/);

  // O caso que interessa: alguem esconde uma chave a mais dentro de um blob que
  // ja estava declarado por outra razao. A conta deixa de bater e a declaracao cai.
  const tipoAMais = [...achados, { type: 'anthropic-api-key' }];
  assert.equal(declaracaoBate(certa, tipoAMais).bate, false);
});

test('uma declaracao que NAO bate deixa o achado com o nivel que tinha, e a discrepancia sai', () => {
  const r = varrerHistorico(ambiente({
    blobs: { fx: blobDe('fx', 'const k = "SEGREDO";') },
    caminhosPorSha: { fx: ['t.test.js'] },
    declarados: new Map([['fx', { motivo: MOTIVO_OK, tipos: ['fixture-key'], n: 99 }]]),
  }));
  assert.equal(r.resumo.HIGH, 1, 'a declaracao nao se aplicou — o achado continua HIGH');
  assert.equal(r.achados[0].declarado, null);
  assert.equal(r.discrepancias.length, 1);
  assert.match(r.discrepancias[0].porque, /n=99/);
});

// ── varrerHistorico ─────────────────────────────────────────────────────────

function ambiente({ blobs, caminhosPorSha, declarados = new Map(), commits = () => [] }) {
  return {
    dir: '/repo',
    detector: detectorQueAcha('SEGREDO'),
    declarados,
    listaImpl: () => new Map(Object.entries(caminhosPorSha).map(([sha, cs]) => [sha, { sha, caminhos: new Set(cs) }])),
    loteImpl: (_d, shas) => {
      const objs = shas.map((s) => blobs[s]).filter(Boolean);
      return { objs, emFalta: shas.length - objs.length };
    },
    // Os testes desta funcao sao sobre blobs; as mensagens tem os seus.
    mensagensImpl: () => new Map(),
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
    loteImpl: (_d, shas) => { lidos += shas.length; return { objs: shas.map((s) => blobDe(s, 'SEGREDO aqui')), emFalta: 0 }; },
  });
  assert.equal(lidos, 1, 'ler o mesmo conteudo tres vezes seria tres vezes o custo pela mesma informacao');
  assert.equal(r.achados.length, 1);
  assert.deepEqual(r.achados[0].caminhos.sort(), ['a.js', 'b.js', 'c.js']);
});

test('um blob declarado desce a INFO mas guarda o nivel que TERIA', () => {
  const r = varrerHistorico(ambiente({
    blobs: { fx: blobDe('fx', 'const k = "SEGREDO";') },
    caminhosPorSha: { fx: ['t.test.js'] },
    declarados: new Map([['fx', { motivo: MOTIVO_OK, tipos: ['fixture-key'], n: 1 }]]),
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

test('lerLote CONTA os objectos que pediu e nao recebeu — a falha aberta que o adversario apanhou', () => {
  // Pedir 3, receber 1 (buffer truncado, objecto `missing`) devolvia antes
  // `erro: null`, `ilegiveis: 0`, `HIGH: 0`. Um objecto que nunca foi lido e
  // indistinguivel de um objecto limpo — a nao ser que alguem conte.
  const r = lerLote('/x', ['aaa', 'bbb', 'ccc'], {
    runImpl: () => Buffer.from('aaa blob 2\nok\n'),
  });
  assert.equal(r.objs.length, 1);
  assert.equal(r.emFalta, 2);
});

test('o que o git nao devolveu chega ao resumo como EM FALTA, nao como zero', () => {
  const r = varrerHistorico({
    ...ambiente({
      blobs: { a: blobDe('a', 'limpo') },
      caminhosPorSha: { a: ['a.js'], b: ['b.js'], c: ['c.js'] },
    }),
  });
  assert.equal(r.saltados.emFalta, 2, 'dois objectos pedidos e nunca devolvidos');
  assert.equal(r.lidos, 1);
});

test('as MENSAGENS de commit sao varridas — um token numa mensagem e tao publico como num ficheiro', () => {
  const r = varrerHistorico({
    dir: '/repo',
    detector: detectorQueAcha('SEGREDO'),
    listaImpl: () => new Map(),
    mensagensImpl: () => new Map([['c0', { sha: 'c0', tipo: 'commit', caminhos: new Set(['(mensagem de commit)']) }]]),
    loteImpl: () => ({ objs: [{ sha: 'c0', tipo: 'commit', tamanho: 10, conteudo: Buffer.from('usei SEGREDO') }], emFalta: 0 }),
    commitsImpl: () => [],
  });
  assert.equal(r.resumo.HIGH, 1);
  assert.equal(r.achados[0].tipo_objecto, 'commit');
});

test('refs=origin sem nada alcancavel e ERRO, nao "historico limpo"', () => {
  const r = varrerHistorico({
    dir: '/repo', refs: 'origin',
    detector: detectorQueAcha('SEGREDO'),
    listaImpl: () => new Map(),
    mensagensImpl: () => new Map(),
  });
  assert.match(r.erro, /nao havia historico para ler/);
  assert.equal(r.resumo, undefined);
});

test('parseBatch RECUSA um corpo truncado — a segunda falha aberta que o adversario apanhou', () => {
  // O cabecalho promete 20 bytes e o buffer so tem 5. `Buffer.slice` devolveria
  // os 5 sem se queixar, o objecto contaria como devolvido, e um segredo nos 15
  // que faltavam desaparecia com `erro: null`.
  const buf = Buffer.from('aaa blob 20\ncurto');
  assert.deepEqual(parseBatch(buf), []);

  // E o truncamento no MEIO de um stream nao engole o objecto anterior.
  const ok = Buffer.concat([Buffer.from('aaa blob 2\nok\n'), Buffer.from('bbb blob 99\nxx')]);
  const r = parseBatch(ok);
  assert.equal(r.length, 1);
  assert.equal(r[0].sha, 'aaa');
});

test('um corpo truncado chega ao resumo como EM FALTA', () => {
  const r = lerLote('/x', ['aaa', 'bbb'], { runImpl: () => Buffer.from('aaa blob 2\nok\nbbb blob 50\ncurto') });
  assert.equal(r.objs.length, 1);
  assert.equal(r.emFalta, 1);
});

test('refs=origin inclui as TAGS — uma tag e empurrada e publica como uma branch', () => {
  let vistos = null;
  blobsAlcancaveis('/x', { refs: 'origin', runImpl: (_c, args) => { vistos = args; return ''; } });
  assert.ok(vistos.includes('--remotes=origin'));
  assert.ok(vistos.includes('--tags'), 'sem --tags, conteudo alcancavel so por tag ficava fora do ambito publico');
});

test('um objecto SEM caminho e lido com caminho neutro e marcado, nunca com severidade inventada', () => {
  let caminhoVisto = null;
  const detector = {
    scanSecrets(fs_) { caminhoVisto = fs_[0].path; return [{ type: 'x', severity: 'warning', line: 1, redacted: '****' }]; },
  };
  const r = varrerHistorico({
    dir: '/repo',
    detector,
    listaImpl: () => new Map([['solto', { sha: 'solto', tipo: 'blob', caminhos: new Set() }]]),
    mensagensImpl: () => new Map(),
    loteImpl: () => ({ objs: [blobDe('solto', 'qualquer coisa')], emFalta: 0 }),
    commitsImpl: () => [],
  });
  assert.equal(caminhoVisto, CAMINHO_DESCONHECIDO);
  assert.ok(!/\.env$/.test(CAMINHO_DESCONHECIDO), 'o caminho neutro NAO pode bater isSensitivePath — elevaria a heuristica por ignorancia');
  assert.equal(r.achados[0].caminho_desconhecido, true);
  assert.equal(r.sem_caminho.achados, 1);
  assert.equal(r.sem_caminho.blobs, 1);
});

test('declaracaoBate compara tambem a GRAVIDADE quando ela e declarada', () => {
  const achados = [{ type: 'aws-access-key', nivel_bruto: 'HIGH' }];
  const semNiveis = { motivo: MOTIVO_OK, tipos: ['aws-access-key'], n: 1, niveis: null };
  assert.equal(declaracaoBate(semNiveis, achados).bate, true, 'sem niveis declarados, nao se verifica');

  const comNiveis = { ...semNiveis, niveis: ['LOW'] };
  assert.equal(declaracaoBate(comNiveis, achados).bate, false, 'declarou LOW e encontrou HIGH: a declaracao cai');
});

test('lerLote sem shas nao invoca o git', () => {
  let invocado = false;
  const r = lerLote('/x', [], { runImpl: () => { invocado = true; return Buffer.alloc(0); } });
  assert.deepEqual(r, { objs: [], emFalta: 0 });
  assert.equal(invocado, false);
});
