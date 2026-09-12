/**
 * ambito-ab.test.mjs
 *
 * A reprodutibilidade E o requisito do §2.2, nao um detalhe de implementacao:
 * "os tres bracos recebem a MESMA lista (...) braco que veja outra lista e um
 * braco invalido". Uma lista que muda entre duas corridas torna essa frase
 * impossivel de verificar — e a experiencia inteira assenta nela.
 *
 * Os testes correm sobre arvores SINTETICAS. Os sujeitos do A/B vivem em
 * `C:/Users/Paulo Loureiro/...` e nao existem em CI nem na maquina de mais
 * ninguem; um teste ancorado neles estaria verde num sitio so, que e o mesmo que
 * nao estar verde em lado nenhum. O teste que toca nos sujeitos reais existe, mas
 * declara-se `n/d` em voz alta quando eles nao estao la (fim do ficheiro).
 */

import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  recolher, corpoDaLista, sha256, contarLinhas, calcularSujeito, principal,
  ficheiroExcluidoPeloNome, extensaoIncluida, SUJEITOS, DIRS_EXCLUIDOS,
  construirManifesto, headDaRaiz, NOME_MANIFESTO,
} from './ambito-ab.mjs';

// ─────────────────────────────────────────────────── utilitarios do teste

/** Cria uma arvore real em disco a partir de um mapa caminho -> conteudo. */
function arvore(mapa, { comSymlink = null } = {}) {
  const raiz = mkdtempSync(path.join(tmpdir(), 'ambito-ab-'));
  for (const [rel, conteudo] of Object.entries(mapa)) {
    const abs = path.join(raiz, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, conteudo, 'utf8');
  }
  if (comSymlink) {
    try {
      symlinkSync(path.join(raiz, comSymlink.alvo), path.join(raiz, comSymlink.link), comSymlink.tipo || 'file');
      return { raiz, symlinkCriado: true };
    } catch {
      // Windows sem Developer Mode recusa symlinks a utilizadores sem privilegio.
      // Nao ha teste que valha inventar um symlink que o SO nao deixou criar.
      return { raiz, symlinkCriado: false };
    }
  }
  return { raiz, symlinkCriado: false };
}

/**
 * Um `readdir` falso que devolve as entradas por uma ordem escolhida por nos.
 *
 * A chave e o caminho RELATIVO exacto ('' = raiz, '/sub'). A primeira versao
 * deste helper procurava por `endsWith`, e como toda a string termina em '',
 * qualquer subdirectorio recebia o conteudo da raiz — travessia infinita, e o
 * `node --test` a pendurar sem uma unica linha de saida. Fica escrito porque o
 * sintoma (silencio) nao aponta para a causa (a chave vazia).
 */
function readdirOrdenado(mapaDirs, ordem, raiz = '/r') {
  return (dir) => {
    const chave = String(dir).replace(/\\/g, '/').replace(raiz, '');
    if (!Object.prototype.hasOwnProperty.call(mapaDirs, chave)) {
      const e = new Error('ENOENT'); e.code = 'ENOENT'; throw e;
    }
    return ordem(mapaDirs[chave].slice()).map((n) => ({ name: n }));
  };
}

// ─────────────────────────────────────────────────── §2.2, regra a regra

test('§2.2: so entram as seis extensoes nomeadas', () => {
  for (const ok of ['a.js', 'a.mjs', 'a.cjs', 'a.ts', 'a.tsx', 'a.jsx', 'A.JS']) {
    assert.equal(extensaoIncluida(ok), true, ok + ' devia entrar');
  }
  for (const nao of ['a.json', 'a.md', 'a.yaml', 'a.mts', 'a.cts', 'a', 'a.js.map']) {
    assert.equal(extensaoIncluida(nao), false, nao + ' nao devia entrar');
  }
});

test('§2.2: ficheiros de teste e gerados ficam de fora, e nada mais', () => {
  for (const fora of ['x.test.js', 'x.spec.ts', 'a.b.test.tsx', 'jquery.min.js', 'tipos.d.ts']) {
    assert.equal(ficheiroExcluidoPeloNome(fora), true, fora + ' devia ficar de fora');
  }
  // O contra-exemplo importa tanto como o exemplo: um filtro que apanha demais
  // encolhe o ambito em silencio, e um ambito que encolheu e "outra lista".
  for (const dentro of ['testes.js', 'protest.ts', 'specimen.js', 'minify.js', 'd.ts.js', 'a.tests.js']) {
    assert.equal(ficheiroExcluidoPeloNome(dentro), false, dentro + ' NAO devia ficar de fora');
  }
});

test('§2.2: os oito directorios excluidos, a qualquer profundidade', () => {
  const mapa = { 'src/a.js': 'a' };
  for (const d of DIRS_EXCLUIDOS) mapa['src/' + d + '/dentro.js'] = 'x';
  mapa['fundo/mais/fundo/node_modules/pacote/i.js'] = 'x';
  const { raiz } = arvore(mapa);
  assert.deepEqual(recolher(raiz), ['src/a.js']);
});

test('§2.2, nota de fidelidade: .github/ e .claude/ FICAM no ambito', () => {
  // O §2.2 nomeia so `.git/` entre os directorios-ponto. Excluir os outros seria
  // alargar o ambito depois de escrito. Este teste existe para que a decisao seja
  // deliberada: quem a mudar tem de vir aqui apaga-la, e nao pode faze-lo por
  // distraccao.
  const { raiz } = arvore({
    '.github/workflows/x.js': 'a',
    '.claude/skills/y.mjs': 'b',
    '.git/hooks/z.js': 'c',
  });
  assert.deepEqual(recolher(raiz), ['.claude/skills/y.mjs', '.github/workflows/x.js']);
});

// ─────────────────────────────────────────────────── reprodutibilidade

test('as tres listas nao mudam entre duas corridas — o requisito do §2.2', () => {
  // Uma arvore com os nomes que costumam separar as maquinas: maiusculas,
  // acentos, digitos, e profundidade.
  const mapa = {
    'Zebra.js': '1', 'alpha.ts': '2', 'Beta.tsx': '3', 'acao.mjs': '4', 'acucar.js': '5',
    '10-dez.js': '6', '2-dois.js': '7', 'sub/Nested.jsx': '8', 'sub/nested.cjs': '9',
    'sub/mais/fundo/x.js': '10', 'README.md': 'ignorado', 'sub/y.test.js': 'ignorado',
  };
  const { raiz } = arvore(mapa);

  const corridas = [1, 2, 3].map(() => {
    const r = calcularSujeito(raiz);
    return { corpo: r.corpo, sha: r.sha256_lista, n: r.ficheiros };
  });

  assert.equal(corridas[0].corpo, corridas[1].corpo, 'corrida 1 vs 2: os bytes da lista mudaram');
  assert.equal(corridas[1].corpo, corridas[2].corpo, 'corrida 2 vs 3: os bytes da lista mudaram');
  assert.equal(corridas[0].sha, corridas[2].sha);
  assert.equal(corridas[0].n, 10);

  // Anti-vacuidade: se a arvore estivesse vazia, as tres corridas tambem seriam
  // iguais e o teste estaria verde por nao ter medido nada.
  assert.ok(corridas[0].corpo.length > 0, 'a arvore de teste esta vazia — o teste nao provou nada');
});

test('o determinismo e do PROGRAMA, nao da sorte do readdir', () => {
  // O teste anterior corre duas vezes sobre o mesmo disco, que tende a devolver a
  // mesma ordem — passaria mesmo com a ordenacao removida. Este alimenta duas
  // ordens deliberadamente opostas e exige a mesma saida.
  const dirs = { '': ['b.js', 'a.js', 'sub'], '/sub': ['z.ts', 'm.ts', 'c.ts'] };
  const lstat = () => ({ isSymbolicLink: () => false, isDirectory: () => false, isFile: () => true });
  const lstatDir = (p) => ({
    isSymbolicLink: () => false,
    isDirectory: () => String(p).replace(/\\/g, '/').endsWith('/sub'),
    isFile: () => !String(p).replace(/\\/g, '/').endsWith('/sub'),
  });

  const crescente = recolher('/r', { readdirImpl: readdirOrdenado(dirs, (a) => a.sort()), lstatImpl: lstatDir });
  const decrescente = recolher('/r', { readdirImpl: readdirOrdenado(dirs, (a) => a.sort().reverse()), lstatImpl: lstatDir });

  assert.deepEqual(crescente, decrescente, 'a ordem do readdir passou para a lista — a lista nao e determinista');
  assert.deepEqual(crescente, ['a.js', 'b.js', 'sub/c.ts', 'sub/m.ts', 'sub/z.ts']);
  void lstat;
});

test('MORDIDA: sem ordenacao final, o teste de cima teria falhado', () => {
  // Um guarda que nunca falhou e indistinguivel de um partido. Aqui reproduzo a
  // travessia SEM a ordenacao e mostro que as duas ordens de readdir divergem —
  // ou seja, o teste anterior nao esta verde por acaso.
  const dirs = { '': ['b.js', 'a.js'] };
  const semOrdenar = (ordem) => {
    const rd = readdirOrdenado(dirs, ordem);
    return rd('/r').map((e) => e.name); // sem sort: a ordem e a que veio
  };
  assert.notDeepEqual(
    semOrdenar((a) => a.sort()),
    semOrdenar((a) => a.sort().reverse()),
    'as duas ordens de readdir sao iguais — a mordida nao morde e o teste acima e vacuo',
  );
});

test('symlinks nao sao seguidos (quando o SO deixa cria-los)', (t) => {
  const { raiz, symlinkCriado } = arvore(
    { 'real/a.js': 'x' },
    { alvo: 'real', link: 'atalho', tipo: 'dir' },
  );
  if (!symlinkCriado) {
    t.skip('n/d — este SO/utilizador nao deixou criar o symlink; nada foi afirmado');
    return;
  }
  assert.deepEqual(recolher(raiz), ['real/a.js'], 'o symlink foi seguido e duplicou a lista');
});

test('directorio ilegivel AVISA — nao encolhe a lista em silencio', () => {
  const avisos = [];
  const dirs = { '': ['ok.js', 'mau'] };
  const readdirImpl = (dir) => {
    const c = String(dir).replace(/\\/g, '/');
    if (c.endsWith('/mau')) { const e = new Error('EACCES'); e.code = 'EACCES'; throw e; }
    return readdirOrdenado(dirs, (a) => a.sort())(dir);
  };
  const lstatImpl = (p) => ({
    isSymbolicLink: () => false,
    isDirectory: () => String(p).replace(/\\/g, '/').endsWith('/mau'),
    isFile: () => !String(p).replace(/\\/g, '/').endsWith('/mau'),
  });
  const lista = recolher('/r', { readdirImpl, lstatImpl, avisar: (m) => avisos.push(m) });
  assert.deepEqual(lista, ['ok.js']);
  assert.equal(avisos.length, 1, 'o directorio ilegivel passou sem uma palavra');
  assert.match(avisos[0], /EACCES/);
});

// ─────────────────────────────────────────────────── formato e metricas

test('o corpo hasheado e exactamente uma linha por caminho, com terminador final', () => {
  assert.equal(corpoDaLista(['a.js', 'b.js']), 'a.js\nb.js\n');
  assert.equal(corpoDaLista([]), '', 'lista vazia nao inventa uma linha em branco');
  assert.equal(sha256('a.js\nb.js\n'), sha256(corpoDaLista(['a.js', 'b.js'])));
});

test('contarLinhas tem a semantica do `wc -l`: bytes 0x0a, nem mais nem menos', () => {
  assert.equal(contarLinhas(Buffer.from('a\nb\n')), 2);
  assert.equal(contarLinhas(Buffer.from('a\nb')), 1, 'ultima linha sem \\n nao conta — como o wc -l');
  assert.equal(contarLinhas(Buffer.from('')), 0);
  assert.equal(contarLinhas(Buffer.from('a\r\nb\r\n')), 2, 'CRLF conta uma vez, nao duas');
});

// ─────────────────────────────────────────────────── o modo --verificar

test('MORDIDA: --verificar FALHA quando a lista no disco difere da que a raiz produz', () => {
  const { raiz } = arvore({ 'a.js': '1', 'b.js': '2' });
  const saida = [];
  const erro = [];
  const io = {
    out: { write: (m) => saida.push(m) },
    err: { write: (m) => erro.push(m) },
    existsImpl: () => true,
    // O disco diz que o ambito e so `a.js`; a raiz tem `a.js` e `b.js`.
    readImpl: () => 'a.js\n',
    calcular: () => calcularSujeito(raiz),
  };
  const codigo = principal(['--verificar', '--raiz-S1', raiz, '--raiz-S2', raiz, '--raiz-S3', raiz], io);
  assert.equal(codigo, 1, 'a divergencia passou como se estivesse tudo bem');
  assert.equal(saida.length, 0, 'nao ha nada para dizer OK sobre');
  assert.match(erro.join(''), /FALHA/);
  assert.match(erro.join(''), /difere da que a raiz produz/);
});

test('--verificar diz OK quando batem, e conta os tres sujeitos', () => {
  const { raiz } = arvore({ 'a.js': '1', 'b.js': '2' });
  const r = calcularSujeito(raiz);
  const saida = [];
  const codigo = principal(['--verificar', '--raiz-S1', raiz, '--raiz-S2', raiz, '--raiz-S3', raiz], {
    out: { write: (m) => saida.push(m) },
    err: { write: () => {} },
    existsImpl: () => true,
    readImpl: () => r.corpo,
    calcular: () => r,
  });
  assert.equal(codigo, 0);
  assert.equal(saida.filter((l) => l.startsWith('OK')).length, 3);
});

test('raiz ausente e `n/d`, nao um verde e nao um erro', () => {
  // Um sujeito que nao esta na maquina nao torna a verificacao falsa; torna-a
  // muda sobre ele. Chamar-lhe erro ensinaria toda a gente a ignorar o vermelho;
  // chamar-lhe OK seria mentira.
  const erro = [];
  const codigo = principal(['--verificar'], {
    out: { write: () => {} },
    err: { write: (m) => erro.push(m) },
    existsImpl: () => false,
  });
  assert.equal(codigo, 0);
  assert.equal((erro.join('').match(/n\/d/g) || []).length, 4, '3 sujeitos + o resumo');
});

// ─────────────────────────────────────────────────── o modo --manifesto

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const sujeito = (id, extra = {}) => ({
  id, nome: id.toLowerCase(), raiz: '/r/' + id, sha_preregisto: SHA_A, head: SHA_A,
  ficheiros: 2, bytes_lista: 9, sha256_lista: 'f'.repeat(64), ...extra,
});

test('--manifesto: no_sha_preregistado e MEDIDO do HEAD da raiz, nao copiado do pre-registo', () => {
  const m = construirManifesto({
    agora: '2026-09-11T00:00:00Z',
    anterior: null,
    sujeitos: [sujeito('S1', { head: SHA_B }), sujeito('S2'), sujeito('S3', { head: null })],
  });
  assert.equal(m.sujeitos[0].no_sha_preregistado, false, 'HEAD != sha pre-registado passou por verdadeiro');
  assert.equal(m.sujeitos[0].head_da_raiz_ao_versionar, SHA_B);
  assert.equal(m.sujeitos[1].no_sha_preregistado, true);
  assert.equal(m.sujeitos[2].no_sha_preregistado, null, 'git sem resposta virou um booleano');
  assert.match(m.sujeitos[2].porque_n_d, /n\/d/);
  assert.equal(m.totais.ficheiros_no_ambito, 6);
  assert.deepEqual(m.substituidos, []);
});

test('MORDIDA --manifesto: a entrada substituida fica registada com o porque DERIVADO (§10.2)', () => {
  const anterior = {
    sujeitos: [{ id: 'S1', raiz: '/velha', sha_preregisto: SHA_A, head_da_raiz_ao_versionar: SHA_B,
      no_sha_preregistado: false, ficheiros_no_ambito: 974, sha256: '0'.repeat(64), gerado_em: '2026-08-26T15:27:32Z' }],
    substituidos: [{ id: 'S9', porque: 'historia antiga' }],
  };
  const m = construirManifesto({
    agora: '2026-09-11T00:00:00Z',
    anterior,
    sujeitos: [sujeito('S1'), sujeito('S2'), sujeito('S3')],
    nomesNoDirOut: ['braco-a-S1.INVALIDO-bbbbbbbb.json', 'braco-a-S1.INVALIDO-bbbbbbbb.meta.json', 'braco-a-S1.json', 'braco-a-S2.INVALIDO-bbbbbbbb.json'],
  });
  assert.equal(m.substituidos.length, 2, 'ou perdeu a historia antiga, ou nao registou a substituicao');
  assert.equal(m.substituidos[0].id, 'S9', 'substituidos[] tem de ser append-only');
  const v = m.substituidos[1];
  assert.equal(v.id, 'S1');
  assert.equal(v.head_da_raiz_ao_versionar, SHA_B);
  assert.equal(v.no_sha_preregistado, false);
  assert.equal(v.ficheiros_no_ambito, 974);
  assert.equal(v.substituido_por_sha256, 'f'.repeat(64));
  assert.match(v.porque, /§10\.2/);
  assert.match(v.porque, /bbbbbbb/);
  assert.deepEqual(v.artefactos_da_corrida_invalidada,
    ['braco-a-S1.INVALIDO-bbbbbbbb.json', 'braco-a-S1.INVALIDO-bbbbbbbb.meta.json'],
    'apanhou artefactos de outro sujeito, ou deixou escapar os de S1');
});

test('--manifesto: lista que muda SEM o sha ter saido do pre-registado e um sinal, nao uma rotina', () => {
  const anterior = { sujeitos: [{ id: 'S1', sha_preregisto: SHA_A, head_da_raiz_ao_versionar: SHA_A,
    no_sha_preregistado: true, sha256: '0'.repeat(64), ficheiros_no_ambito: 1 }] };
  const m = construirManifesto({ agora: 'T', anterior, sujeitos: [sujeito('S1')] });
  assert.equal(m.substituidos.length, 1);
  assert.match(m.substituidos[0].porque, /investigar/);
});

test('--manifesto: mesma lista (mesmo sha256) nao gera substituicao', () => {
  const anterior = { sujeitos: [{ id: 'S1', sha256: 'f'.repeat(64), no_sha_preregistado: false }] };
  const m = construirManifesto({ agora: 'T', anterior, sujeitos: [sujeito('S1')] });
  assert.deepEqual(m.substituidos, []);
});

test('MORDIDA --manifesto: sem os tres sujeitos presentes o manifesto NAO se escreve', () => {
  const { raiz } = arvore({ 'a.js': '1' });
  const escritos = [];
  const erro = [];
  const codigo = principal(['--manifesto', '--out', '/out', '--raiz-S1', raiz, '--raiz-S2', raiz, '--raiz-S3', '/nao-existe'], {
    out: { write: () => {} },
    err: { write: (m) => erro.push(m) },
    existsImpl: (p) => p !== '/nao-existe',
    writeImpl: (p) => escritos.push(String(p)),
    mkdirImpl: () => {},
    readdirImpl: () => [],
    calcular: () => calcularSujeito(raiz),
    headImpl: () => SHA_A,
  });
  assert.equal(codigo, 1);
  assert.equal(escritos.some((p) => p.endsWith(NOME_MANIFESTO)), false, 'escreveu um manifesto com um sujeito a menos');
  assert.match(erro.join(''), /Manifesto NAO escrito/);
});

test('--manifesto escreve as listas E o manifesto, e --verificar nunca escreve nada', () => {
  const { raiz } = arvore({ 'a.js': '1', 'b.js': '2' });
  const r = calcularSujeito(raiz);
  const escritos = new Map();
  const io = {
    out: { write: () => {} },
    err: { write: () => {} },
    existsImpl: () => true,
    readImpl: () => r.corpo,
    writeImpl: (p, c) => escritos.set(String(p).replace(/\\/g, '/'), c),
    mkdirImpl: () => {},
    readdirImpl: () => [],
    calcular: () => r,
    headImpl: () => SHA_A,
    agora: () => '2026-09-11T00:00:00Z',
  };
  assert.equal(principal(['--manifesto', '--out', '/out', '--raiz-S1', raiz, '--raiz-S2', raiz, '--raiz-S3', raiz], io), 0);
  const chaves = [...escritos.keys()].sort();
  assert.deepEqual(chaves, ['/out/' + NOME_MANIFESTO, '/out/ambito-S1.txt', '/out/ambito-S2.txt', '/out/ambito-S3.txt']);
  const m = JSON.parse(escritos.get('/out/' + NOME_MANIFESTO));
  assert.equal(m.produtor, 'tools/cockpit/runner/ambito-ab.mjs --manifesto');
  assert.deepEqual(m.sujeitos.map((s) => s.sha256), [r.sha256_lista, r.sha256_lista, r.sha256_lista]);
  assert.equal(m.sujeitos[0].head_da_raiz_ao_versionar, SHA_A);

  escritos.clear();
  // `readImpl` devolve o corpo; `existsImpl` diz que o manifesto existe — mesmo assim nada se escreve.
  assert.equal(principal(['--verificar', '--out', '/out', '--raiz-S1', raiz, '--raiz-S2', raiz, '--raiz-S3', raiz], io), 0);
  assert.equal(escritos.size, 0, '--verificar escreveu no disco');
});

test('headDaRaiz: 40 hex do git, senao null — nunca o sha pre-registado no lugar do medido', () => {
  assert.equal(headDaRaiz('/r', { execImpl: () => SHA_B + '\n' }), SHA_B);
  assert.equal(headDaRaiz('/r', { execImpl: () => 'fatal: not a git repository' }), null);
  assert.equal(headDaRaiz('/r', { execImpl: () => { throw new Error('ENOENT'); } }), null);
});

// ─────────────────────────────────────────────────── os sujeitos reais

test('as listas versionadas reproduzem-se das raizes reais (so onde elas existem)', (t) => {
  const presentes = SUJEITOS.filter((s) => existsSync(s.raizPorOmissao));
  if (presentes.length === 0) {
    t.skip('n/d — nenhum dos tres sujeitos existe nesta maquina ('
      + SUJEITOS.map((s) => s.raizPorOmissao).join(', ')
      + '). Nada foi afirmado sobre as raizes; o determinismo do produtor esta provado nos testes sinteticos acima.');
    return;
  }
  const raizRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const dirOut = path.join(raizRepo, '_handoff', 'ab-audit');
  const erro = [];
  const codigo = principal(['--verificar', '--out', dirOut], {
    out: { write: () => {} },
    err: { write: (m) => erro.push(m) },
  });
  assert.equal(codigo, 0, 'a lista versionada ja nao e a que a raiz produz:\n' + erro.join(''));
});
