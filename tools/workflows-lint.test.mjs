/**
 * workflows-lint.test.mjs — o caso real, congelado como fixture.
 *
 * O `version-sync.yml` falhou 60 de 60 corridas a 0s desde 2026-08-29T23:02Z.
 * Nenhum teste deste repo o podia ter apanhado: nao ha log de um workflow que
 * nao parseia. O que se fixa aqui e a REGRA, com o texto que a quebrou.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { fugasDeBloco, verificar, workflows, REPO } = await import('./workflows-lint.mjs');

/** O bloco exacto que matou o gate, reduzido ao osso. */
const O_CASO_REAL = `name: Version Sync
jobs:
  sync:
    steps:
      - name: Commit back
        run: |
          gh pr create \\
            --title "sync" \\
            --body "Aberto automaticamente pelo workflow.

Alinha os cinco ficheiros de versao com a tag publicada:
tools/router/version.json." \\
            || echo "PR ja existe."
        env:
          GH_TOKEN: x
`;

test('O CASO REAL: prosa na coluna 0 dentro de um `run: |` e apanhada', () => {
  const f = fugasDeBloco(O_CASO_REAL);
  assert.equal(f.length, 1);
  assert.match(f[0].texto, /^Alinha os cinco ficheiros/);
  assert.match(f[0].porque, /coluna 0/);
});

test('a mesma coisa, indentada, passa — a correccao tem de ser aceite', () => {
  const bom = `name: Version Sync
jobs:
  sync:
    steps:
      - name: Commit back
        run: |
          BODY=$(printf '%s\\n' \\
            "Aberto automaticamente pelo workflow." \\
            "" \\
            "Alinha os cinco ficheiros de versao com a tag publicada:")
          gh pr create --body "$BODY"
        env:
          GH_TOKEN: x
`;
  assert.deepEqual(fugasDeBloco(bom), []);
});

test('uma linha vazia dentro do bloco nao o fecha', () => {
  assert.deepEqual(fugasDeBloco('a:\n  run: |\n    um\n\n    dois\n  outra: 1\n'), []);
});

test('a chave seguinte fecha o bloco sem queixa', () => {
  assert.deepEqual(fugasDeBloco('steps:\n  - run: |\n      echo oi\n    env:\n      X: 1\n'), []);
});

test('um comentario ao nivel da chave fecha o bloco sem queixa', () => {
  assert.deepEqual(fugasDeBloco('a:\n  run: |\n    echo oi\n  # nota\n  b: 1\n'), []);
});

test('um item de lista seguinte fecha o bloco sem queixa', () => {
  assert.deepEqual(fugasDeBloco('steps:\n  - run: |\n      echo um\n  - run: |\n      echo dois\n'), []);
});

test('`>` (folded) conta tanto como `|`, e os modificadores tambem', () => {
  for (const abre of ['|', '>', '|-', '>-', '|+', '|2']) {
    const f = fugasDeBloco(`a:\n  run: ${abre}\n    dentro\nfora e prosa\n`);
    assert.equal(f.length, 1, `${abre} nao foi reconhecido como bloco`);
  }
});

test('YAML de raiz sem bloco nenhum nao inventa problemas', () => {
  assert.deepEqual(fugasDeBloco('name: x\non:\n  push:\n    tags: ["v*"]\n'), []);
});

test('so se reporta UMA fuga por bloco — nao se inunda com a mesma', () => {
  const f = fugasDeBloco('a:\n  run: |\n    dentro\nprosa um\nprosa dois\nprosa tres\n');
  assert.equal(f.length, 1);
});

// ── o repo, agora ───────────────────────────────────────────────────────────

test('ha workflows para verificar — senao isto aprova por vacuidade', () => {
  assert.ok(workflows(REPO).length >= 10);
});

test('nenhum workflow deste repo tem fuga de bloco', () => {
  const p = verificar(REPO);
  assert.deepEqual(p, [],
    p.map((x) => `${x.ficheiro}:${x.linha} ${x.porque}`).join('\n'));
});

test('o version-sync REALMENTE ganhou o ensaio manual — senao so se prova em producao', () => {
  const y = fs.readFileSync(path.join(REPO, '.github', 'workflows', 'version-sync.yml'), 'utf8');
  assert.match(y, /workflow_dispatch:/, 'sem dispatch, a unica forma de o provar e publicar uma tag');
  assert.match(y, /aplicar:/, 'o ensaio tem de poder correr sem escrever nada');
  assert.match(y, /inputs\.aplicar == true/,
    'o passo que commita e abre PR tem de exigir o gesto explicito');
});
