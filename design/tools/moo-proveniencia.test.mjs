/**
 * moo-proveniencia.test.mjs — o teste que decide se o 10,00 é honesto.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PORQUE ESTE FICHEIRO EXISTE, E PORQUE É ELE QUE MANDA
 *
 * A 2026-08-27 este projecto chegou a 10,00 e **recusou-o**. A razão ficou
 * escrita no portão: ao separar «publicar» de «mostrar a quem entrou», a
 * verificação 3 saltou para a nota cheia *no mesmo minuto em que a régua mudou*,
 * e a decisão de 27/08 proíbe exactamente isso — «os limiares sobem quando as
 * verificações passarem a medir, nunca por conveniência de uma onda». A nota
 * ficou presa em metade.
 *
 * A 2026-08-29 a régua voltou a mexer-se: a verificação passou de contar
 * «cifras de poupança na shell» para contar «cifras SEM proveniência
 * declarada». E o índice foi a 10,00.
 *
 * **A régua é load-bearing.** Sem esta mudança, o mesmo trabalho continuaria a
 * valer 1,0/2,0. Um céptico tem todo o direito de dizer: «definiste o teste de
 * maneira a que o teu trabalho passasse».
 *
 * A única coisa que separa isso de uma medição legítima é a regra MORDER. Se
 * uma cifra sem proveniência passa despercebida, então a nova régua não mede
 * nada e o 10,00 é o de 27/08 outra vez, com outra roupa. Se ela é apanhada,
 * então a verificação passou mesmo a medir uma coisa — a que a decisão de
 * 2026-08-24 sempre visou — e o trabalho que a fez passar foi real:
 *
 *   · 13 cifras a declarar a proveniência, de uma única fonte (`_modelado.tsx`)
 *     — treze, e não as catorze que o portão chegou a imprimir: ele somava
 *     COINCIDÊNCIAS de padrão, e uma linha casa mais do que uma. Corrigido no
 *     mesmo commit, porque um ficheiro cuja tese é «os números dizem o que
 *     parecem dizer» não pode inflacionar o seu próprio.
 *   · 3 números fabricados corrigidos no caminho: «40× cheaper than Opus» era
 *     5,0×, «5× cheaper» era 2,5×, e «90% of the capability» não tinha fonte
 *     nenhuma além de um masterprompt arquivado de Abril
 *   · a defesa «real token counts require API access mooter doesn't have»,
 *     que tinha deixado de ser verdade, corrigida
 *
 * Este ficheiro é o que torna essa afirmação falsificável. Se algum dia falhar,
 * o 10,00 deixa de valer.
 *
 *   node --test design/tools/moo-proveniencia.test.mjs
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, cpSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESIGN_REAL = resolve(AQUI, '..');

function bancada() {
  const raiz = mkdtempSync(join(tmpdir(), 'moo-prov-'));
  cpSync(DESIGN_REAL, join(raiz, 'design'), {
    recursive: true,
    filter: (src) => !src.endsWith('.design-check.json'),
  });
  const repo = join(raiz, 'repo');
  mkdirSync(repo, { recursive: true });
  return { raiz, repo, portao: join(raiz, 'design', 'tools', 'moo-design-check.mjs') };
}

function escreve(repo, rel, texto) {
  const abs = join(repo, rel);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, texto);
}

/** Superfície mínima, para a guarda anti-cegueira do portão não disparar. */
function base(repo) {
  escreve(repo, 'landing/app/globals.css', ':root { color: #fff; }\n');
  escreve(repo, 'README.md', '# repo de teste\n');
}

function corre(b) {
  try {
    const out = execFileSync(process.execPath, [b.portao, '--json'], {
      env: { ...process.env, MOO_REPO: b.repo },
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out);
  } catch (e) {
    return e.stdout ? JSON.parse(e.stdout) : null;
  }
}

const num = (rel) => rel.verificacoes.find((x) => x.id === 'numero-honesto');

// ─────────────────────────────────────────────────────────────────────────

test('MORDIDA · uma cifra de poupança SEM proveniência na shell custa metade da nota', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  base(b.repo);
  escreve(b.repo, 'landing/app/(app)/x/page.tsx',
    'export default () => <p>you saved $42.10 this month</p>;\n');

  const v = num(corre(b));
  assert.equal(v.pontos, 1.0, 'uma cifra sem proveniência passou pelo portão — a régua nova não mede nada');
  assert.equal(v.no_produto_autenticado, 1);
});

test('MORDIDA · a MESMA cifra, com a proveniência colada, vale a nota cheia', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  base(b.repo);
  escreve(b.repo, 'landing/app/(app)/x/page.tsx',
    'export default () => <p>you saved $42.10 this month<Modelado /></p>;\n');

  const v = num(corre(b));
  assert.equal(v.pontos, 2.0, 'a proveniência declarada não foi reconhecida');
  assert.equal(v.no_produto_autenticado, 0);
  assert.equal(v.no_produto_marcadas, 1, 'a cifra marcada tem de continuar CONTADA, não desaparecida');
});

test('a marca tem de estar na MESMA linha — noutra linha não conta', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  base(b.repo);
  // A proveniência a três linhas de distância é a que se perde na próxima
  // refactorização. Não pode valer.
  escreve(b.repo, 'landing/app/(app)/x/page.tsx',
    'export default () => (<div>\n  <p>you saved $42.10 this month</p>\n  <Modelado />\n</div>);\n');

  assert.equal(num(corre(b)).pontos, 1.0, 'uma marca longe do número foi aceite');
});

test('MORDIDA · o público continua a valer ZERO, marca ou não marca', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  base(b.repo);
  // Fora de `(app)/` não há proveniência que salve: a decisão de 2026-08-24
  // proíbe PUBLICAR poupança, e rotulá-la não a torna publicável.
  escreve(b.repo, 'landing/app/(marketing)/y/page.tsx',
    'export default () => <p>you saved $42.10<Modelado /></p>;\n');

  const v = num(corre(b));
  assert.equal(v.pontos, 0, 'um claim PÚBLICO passou por levar uma marca — a marca não é um passe');
  assert.ok(v.total >= 1);
});

test('o marcador é reconhecido nas duas grafias, e em mais nenhuma', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));

  for (const marca of ['<Modelado />', '(modelled)']) {
    base(b.repo);
    escreve(b.repo, 'landing/app/(app)/x/page.tsx',
      `export default () => <p>you saved $42.10 ${marca}</p>;\n`);
    assert.equal(num(corre(b)).pontos, 2.0, `a grafia ${marca} não foi reconhecida`);
  }

  // E uma palavra qualquer NÃO serve de marca.
  escreve(b.repo, 'landing/app/(app)/x/page.tsx',
    'export default () => <p>you saved $42.10 (approximately)</p>;\n');
  assert.equal(num(corre(b)).pontos, 1.0, '«approximately» foi aceite como proveniência');
});

test('MORDIDA · um COMENTÁRIO não é um rótulo — ele não chega ao ecrã', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  base(b.repo);
  // Isto aconteceu de verdade, a 2026-08-29, escrito por mim, no commit que
  // introduziu a marca: `admin/page.tsx:726` levava um comentário JSX em vez do
  // componente. Satisfazia a regex e renderizava exactamente nada — o leitor
  // via o número nu e o portão dizia que estava tudo rotulado. Três cifras
  // estavam assim quando esta guarda foi ligada.
  escreve(b.repo, 'landing/app/(app)/x/page.tsx',
    'export default () => <p>you saved $42.10{/* Modelado */}</p>;\n');

  const v = num(corre(b));
  assert.equal(v.pontos, 1.0, 'um comentário passou por rótulo — o portão voltou a aceitar documentação em vez de correcção');
  assert.equal(v.no_produto_marcadas, 0);
});

test('mas o comentário ao LADO da marca real não a invalida', (t) => {
  const b = bancada();
  t.after(() => rmSync(b.raiz, { recursive: true, force: true }));
  base(b.repo);
  // O inverso da mordida acima: apagar comentários para os deixar de contar não
  // pode apagar a marca verdadeira que esteja na mesma linha.
  escreve(b.repo, 'landing/app/(app)/x/page.tsx',
    'export default () => <p>you saved $42.10<Modelado />{/* porquê: ver _modelado.tsx */}</p>;\n');

  assert.equal(num(corre(b)).pontos, 2.0, 'a marca real foi apagada junto com o comentário');
});
