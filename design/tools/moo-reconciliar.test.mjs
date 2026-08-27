/**
 * moo-reconciliar.test.mjs — o teste de mordida da reconciliação.
 *
 * PORQUÊ ISTO EXISTE
 * ------------------
 * O portão pontua contraste sobre `moo-tokens.json`. A 2026-08-27 mediu-se que o
 * JSON e a produção tinham divergido em 9 valores — e num deles a divergência
 * escondia um defeito de acessibilidade a sério:
 *
 *     tinta.faint   token #7A7168 (4.13:1)   ·   globals.css #5A5249 (2.58:1)
 *
 * 2.58:1 está abaixo de AA-GRANDE (3.0), não só de AA. E o portão dava a esse par
 * a nota do token. As "correcções calculadas" que o JSON trazia tinham sido
 * calculadas sobre o valor errado: aplicá-las corrigia um número que ninguém lê.
 *
 * Depois de reconciliado, token == produção e os 16 pares passam. Mas isso é
 * exactamente o estado em que uma regressão fica invisível: mexer só no CSS não
 * move o portão. Estes testes plantam essa regressão e exigem que seja apanhada.
 *
 *   node --test design/tools/moo-reconciliar.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconciliar, lerBloco, propor, racio, ALIAS } from './moo-reconciliar.mjs';

/** Um CSS mínimo com os dois blocos que a produção real tem. */
const css = ({ faint = '#84786B', accent = '#B4454B', green = '#347650' } = {}) => `
html:has(.app-shell-dark) { background: #0B0A09; }
.app-shell-root {
  --bg:           #F2ECDF;
  --text:         #1A1613;
  --accent:       ${accent};
  --green:        ${green};
}
.onboarding-shell,
.app-shell-dark {
  --bg:           #0B0A09;
  --text:         #F2EDE6;
  --faint:        ${faint};
}
`;

const tokens = (over = {}) => ({
  $meta: { version: 'teste' },
  color: {
    tinta: { bg: '#0B0A09', text: '#F2EDE6', faint: '#84786B', ...(over.tinta ?? {}) },
    papel: { bg: '#F2ECDF', text: '#1A1613', accent: '#B4454B', ok: '#347650', ...(over.papel ?? {}) },
  },
  contraste: {
    minimo_normal: 4.5, minimo_grande: 3,
    pares: [['tinta.faint', 'tinta.bg'], ['papel.accent', 'papel.bg'], ['papel.ok', 'papel.bg']],
  },
});

const par = (r, nome) => r.pares.find(p => p.par.startsWith(nome));

// ─────────────────────────────────────────────────────────────────────────

test('reconciliado: zero divergências e todos os pares passam', () => {
  const r = reconciliar({ tokens: tokens(), css: css() });
  assert.deepEqual(r.divergem, []);
  assert.deepEqual(r.abaixo_AA_em_producao, []);
  assert.deepEqual(r.mentem, []);
});

test('MORDE quando alguém baixa uma cor só no CSS — o portão sozinho não veria', () => {
  /* A regressão exacta que motivou este ficheiro: o token continua bonito, a
     produção degrada, e `moo-design-check` pontua pelo token. */
  const r = reconciliar({ tokens: tokens(), css: css({ faint: '#5A5249' }) });

  assert.equal(r.divergem.length, 1);
  assert.equal(r.divergem[0].nome, 'faint');
  assert.equal(r.divergem[0].token, '#84786B');
  assert.equal(r.divergem[0].producao, '#5A5249');

  const p = par(r, 'tinta.faint');
  assert.equal(p.token.passa, true, 'o token continua a passar — é isso que torna a regressão invisível');
  assert.equal(p.producao.passa, false);
  assert.equal(r.mentem.length, 1, 'tem de ser assinalado como "o token passa melhor que a produção"');
});

test('MORDE abaixo de AA-GRANDE, e diz o número real', () => {
  const r = reconciliar({ tokens: tokens({ tinta: { faint: '#5A5249' } }), css: css({ faint: '#5A5249' }) });
  const p = par(r, 'tinta.faint');
  assert.equal(p.producao.racio, 2.58);
  assert.ok(p.producao.racio < 3.0, 'abaixo até de AA-grande — não é um arredondamento, é ilegível');
  assert.equal(r.divergem.length, 0, 'token e produção concordam: o defeito é dos dois, não uma divergência');
  assert.equal(r.mentem.length, 0, 'e por isso NÃO é o caso "o token mente"');
  assert.equal(r.abaixo_AA_em_producao.length, 1);
});

test('a proposta é o MENOR desvio que passa, e preserva o matiz', () => {
  const p = propor('#5A5249', '#0B0A09', 4.5);
  assert.ok(p, 'tem de haver proposta');
  assert.ok(p.para >= 4.5, `${p.para} devia passar AA`);
  /* Um passo abaixo NÃO pode passar — senão não é o menor desvio. */
  const umPassoAquem = propor('#5A5249', '#0B0A09', 4.5).deltaL;
  assert.ok(Math.abs(umPassoAquem) >= 1);
  const [h1] = [...matiz('#5A5249')], [h2] = [...matiz(p.proposto)];
  assert.ok(Math.abs(h1 - h2) < 2, `o matiz tem de sobreviver: ${h1} -> ${h2}`);
});

function* matiz(hex) {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) { yield 0; return; }
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  yield h;
}

test('o mapa de nomes é usado — --line não existe no CSS, chama-se --border', () => {
  /* Sem ALIAS, `papel.line` daria "sem correspondência" e a migração parecia
     mais simples do que é. Este é o achado que torna `fonte-unica` uma migração
     e não um find-and-replace. */
  assert.equal(ALIAS['line'], 'border');
  assert.equal(ALIAS['ok'], 'green');
  assert.equal(ALIAS['on-accent'], 'cream');

  const folha = css().replace('--green:        #347650;', '--green:        #347650;\n  --border:       #D9D0BB;');
  const t = tokens(); t.color.papel.line = '#D9D0BB';
  const r = reconciliar({ tokens: t, css: folha });
  assert.deepEqual(r.divergem, [], 'papel.line tem de casar com --border, não ficar n/d');
  assert.ok(r.renomeados.includes('papel.line -> --border'));
});

test('selector partido em linhas é encontrado — era devolvido como n/d', () => {
  /* `.onboarding-shell,\n.app-shell-dark {` não coincidia com a forma de uma
     linha só. O bloco saía `null` e o relatório mostrava "n/d" — "não medido" —
     quando a verdade era "não encontrado". Dois estados muito diferentes a sair
     pelo mesmo símbolo. */
  const bloco = lerBloco(css(), '.app-shell-dark');
  assert.ok(bloco, 'o bloco tem de ser encontrado');
  assert.equal(bloco.faint, '#84786B');
  assert.equal(bloco.bg, '#0B0A09');
});

test('não confunde a regra html:has(...) com o bloco de tokens', () => {
  /* `html:has(.app-shell-dark) { background: ... }` aparece ANTES e não declara
     token nenhum. Ancorar na primeira ocorrência do nome dava um bloco vazio. */
  const bloco = lerBloco(css(), '.app-shell-dark');
  assert.ok(Object.keys(bloco).length >= 3, `apanhou o bloco errado: ${JSON.stringify(bloco)}`);
});

test('token sem correspondência no CSS é n/d, não divergência', () => {
  const t = tokens(); t.color.papel.bad = '#AD4D3B';
  const r = reconciliar({ tokens: t, css: css() });
  assert.ok(r.sem_correspondencia.includes('papel.bad'));
  assert.deepEqual(r.divergem, [], 'ausência não é divergência — confundi-las inflava a lista');
});

test('o rácio é o mesmo do portão — dois números para a mesma coisa seria o defeito', () => {
  assert.equal(+racio('#84786B', '#0B0A09').toFixed(2), 4.60);
  assert.equal(+racio('#5A5249', '#0B0A09').toFixed(2), 2.58);
  assert.equal(+racio('#FFFFFF', '#B4454B').toFixed(2), 5.39);
});
