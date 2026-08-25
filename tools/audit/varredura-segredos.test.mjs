/**
 * varredura-segredos.test.mjs — o guarda do guarda.
 *
 * O que estes testes protegem, por ordem de importancia:
 *
 *  1. que a allowlist de dummies NAO cresce para tapar um segredo real. Cada
 *     entrada da allowlist e uma renuncia a um alarme; o teste que interessa e
 *     o que prova que a renuncia e estreita.
 *  2. que a regra do PEM (`cabecalho sem corpo`) e mesmo uma REGRA — apanha o
 *     dia em que alguem colar o corpo a seguir ao cabecalho.
 *  3. que a severidade depende do corpus, porque um repo publico e um vault
 *     privado nao tem o mesmo raio de dano.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  acharPessoais, severidade, motivoDeDummy, pemSemCorpo, varrerCorpus, varrer,
} from './varredura-segredos.mjs';

/**
 * ── PORQUE E QUE ESTAS FIXTURES SE MONTAM EM RUNTIME ────────────────────────
 *
 * A primeira versao deste ficheiro tinha os valores escritos por extenso, e a
 * propria bateria acusou-o: 5 HIGH, todos aqui. Nao foi um falso positivo — era
 * o guarda a funcionar em codigo novo, que e exactamente para o que ele serve.
 *
 * Nao se resolve com allowlist: dois destes testes existem precisamente para
 * exigir que estes valores CONTINUEM HIGH. Resolve-se nao os escrevendo — o
 * analisador recebe a string inteira, montada aqui, e o ficheiro em disco nao
 * carrega nenhum literal com forma de credencial. E a mesma tecnica que o
 * `lp-secret-scan.js` ja usa para a sua propria fixture publica.
 */
const AKIA = (corpo) => 'AKIA' + corpo;
const PEM = (tipo) => '-----BEGIN ' + (tipo ? tipo + ' ' : '') + 'PRIVATE KEY' + '-----';
/** Base64 sem forma de chave nenhuma — 72 chars de alfabeto, montados. */
const CORPO_B64 = 'MIIEpAIBAAKCAQEA' + '3ZqLxK9vN2mWtQ7bYcRfHdJgP4sUvA1eT6nXoZi0KlMrBwCyDgEhFjIk';

const REPO = { nome: 'repo', dir: '/r', publico: true };
const VAULT = { nome: 'vault', dir: '/v', publico: false };

// ── severidade por corpus ───────────────────────────────────────────────────

test('um segredo critical e HIGH nos dois corpora — uma chave e uma chave', () => {
  const a = { type: 'aws-access-key', severity: 'critical' };
  assert.equal(severidade(a, REPO), 'HIGH');
  assert.equal(severidade(a, VAULT), 'HIGH');
});

test('uma heuristica vale LOW no repo publico e INFO no vault privado', () => {
  const a = { type: 'generic-secret-assignment', severity: 'warning' };
  assert.equal(severidade(a, REPO), 'LOW');
  assert.equal(severidade(a, VAULT), 'INFO');
});

test('um dummy DECLARADO nunca e HIGH, em corpus nenhum', () => {
  const a = { type: 'aws-access-key', severity: 'critical' };
  assert.equal(severidade(a, REPO, 'dummy oficial da AWS'), 'INFO');
  assert.equal(severidade(a, VAULT, 'dummy oficial da AWS'), 'INFO');
});

// ── a allowlist e ESTREITA ──────────────────────────────────────────────────

test('o dummy da AWS e reconhecido pelo valor EXACTO', () => {
  const c = 'usa ' + AKIA('IOSFODNN7EXAMPLE') + ' para o upload';
  assert.equal(motivoDeDummy({ type: 'aws-access-key', line: 1 }, c),
    'dummy oficial da documentacao da AWS');
});

test('UMA LETRA diferente do dummy da AWS ja NAO e dummy — a renuncia e estreita', () => {
  // Se a allowlist fosse por prefixo/regex, esta chave passaria. E o unico
  // teste desta lista que realmente protege alguma coisa.
  const c = 'usa ' + AKIA('IOSFODNN7EXAMPLF') + ' para o upload';
  assert.equal(motivoDeDummy({ type: 'aws-access-key', line: 1 }, c), null);
});

test('um AKIA de forma real e desconhecido continua HIGH', () => {
  const c = AKIA('3NPZQ7RTLM2VXKWD');
  const motivo = motivoDeDummy({ type: 'aws-access-key', line: 1 }, c);
  assert.equal(motivo, null);
  assert.equal(severidade({ type: 'aws-access-key', severity: 'critical' }, REPO, motivo), 'HIGH');
});

// ── a regra do PEM ──────────────────────────────────────────────────────────

test('cabecalho PEM sozinho e uma mencao, nao uma chave', () => {
  const c = `assert.match(sanitize('${PEM('RSA')}'), /<private_key>/);`;
  assert.equal(pemSemCorpo(c, 1), true);
  assert.equal(motivoDeDummy({ type: 'pem-private-key', line: 1 }, c),
    'cabecalho PEM sem corpo — uma mencao, nao uma chave');
});

test('cabecalho PEM COM corpo volta a ser HIGH — a regra nao e uma amnistia', () => {
  const c = [PEM('RSA'), CORPO_B64, '-----END RSA PRIVATE KEY-----'].join('\n');
  assert.equal(pemSemCorpo(c, 1), false);
  assert.equal(motivoDeDummy({ type: 'pem-private-key', line: 1 }, c), null);
});

test('corpo PEM na MESMA linha do cabecalho tambem conta', () => {
  const c = PEM('') + CORPO_B64;
  assert.equal(pemSemCorpo(c, 1), false);
});

// ── caminhos pessoais ───────────────────────────────────────────────────────

test('caminho pessoal e apanhado e o utilizador vem redigido', () => {
  const a = acharPessoais('docs/x.md', 'ver /Users/pauloloureiro_mac_mini/frugal');
  assert.equal(a.length, 1);
  assert.equal(a[0].type, 'caminho-pessoal-macos');
  assert.ok(!a[0].preview.includes('pauloloureiro_mac_mini'),
    'o relatorio pode acabar num log publico do CI — nao repete o nome todo');
  assert.match(a[0].preview, /^\/Users\/pau…$/);
});

test('utilizadores genericos do CI nao sao caminhos pessoais', () => {
  assert.deepEqual(acharPessoais('a.yml', '/home/runner/work e /Users/user/x e C:\\Users\\example'), []);
});

test('acharPessoais reporta a linha certa em ficheiros multilinha', () => {
  const a = acharPessoais('x.md', 'linha um\nlinha dois\nver C:\\Users\\Paulo\\frugal');
  assert.equal(a.length, 1);
  assert.equal(a[0].line, 3);
});

// ── o varredor sobre um corpus falso ────────────────────────────────────────

function corpusFalso(ficheiros) {
  return {
    detector: { scanSecrets: (entradas) => entradas.flatMap(({ path: p, content }) => (
      content.includes('AKIA')
        ? [{ path: p, line: content.split('\n').findIndex((l) => l.includes('AKIA')) + 1,
            type: 'aws-access-key', severity: 'critical', preview: 'AKIA…' }]
        : []
    )) },
    listaImpl: () => Object.keys(ficheiros),
    readImpl: (abs) => {
      const rel = Object.keys(ficheiros).find((k) => abs.endsWith(k));
      if (rel === undefined) throw new Error('ENOENT');
      return ficheiros[rel];
    },
    statImpl: (abs) => {
      const rel = Object.keys(ficheiros).find((k) => abs.endsWith(k));
      return { size: rel === undefined ? 0 : ficheiros[rel].length };
    },
  };
}

test('varrerCorpus so le o que o git segue, e conta o que saltou', () => {
  const f = { 'a.md': AKIA('3NPZQ7RTLM2VXKWD'), 'b.png': 'binario', 'c.md': 'limpo' };
  const r = varrerCorpus(REPO, corpusFalso(f));
  assert.equal(r.total, 3);
  assert.equal(r.lidos, 2, 'o .png nao se le');
  assert.equal(r.saltados.binarios, 1);
  assert.equal(r.achados.length, 1);
  assert.equal(r.achados[0].nivel, 'HIGH');
});

test('varrerCorpus nao lanca quando o git falha — devolve o erro declarado', () => {
  const r = varrerCorpus(REPO, {
    detector: { scanSecrets: () => [] },
    listaImpl: () => { throw new Error('nao e um repositorio'); },
  });
  assert.match(r.erro, /git ls-files falhou/);
  assert.deepEqual(r.achados, []);
});

test('o dummy da AWS num ficheiro real sai INFO, nao HIGH, e traz o motivo', () => {
  const f = { 'doc.md': 'o dummy ' + AKIA('IOSFODNN7EXAMPLE') + ' da documentacao' };
  const r = varrerCorpus(REPO, corpusFalso(f));
  assert.equal(r.achados.length, 1);
  assert.equal(r.achados[0].nivel, 'INFO');
  assert.equal(r.achados[0].dummy, 'dummy oficial da documentacao da AWS');
});

test('varrer decompoe o LOW em caminhos e segredos — pedem accoes diferentes', () => {
  const f = { 'a.md': 'ver /Users/pauloloureiro_mac_mini/x' };
  const detector = { scanSecrets: () => [] };
  const r = varrer({ repo: '/r', vault: null, detector });
  // Sem listaImpl injectavel no `varrer` de topo, este teste so afirma a FORMA
  // do resumo — a contagem esta coberta pelos testes de `varrerCorpus`.
  assert.ok('LOW_caminhos' in r.resumo && 'LOW_segredos' in r.resumo);
  assert.equal(r.resumo.LOW, r.resumo.LOW_caminhos + r.resumo.LOW_segredos);
  void f;
});

test('caminhos pessoais so se procuram no corpus PUBLICO', () => {
  const f = { 'a.md': 'ver /Users/pauloloureiro_mac_mini/x' };
  const noVault = varrerCorpus(VAULT, corpusFalso(f));
  assert.equal(noVault.achados.length, 0,
    'no vault privado um caminho real e o comportamento correcto, nao um achado');
  const noRepo = varrerCorpus(REPO, corpusFalso(f));
  assert.equal(noRepo.achados.length, 1);
});
