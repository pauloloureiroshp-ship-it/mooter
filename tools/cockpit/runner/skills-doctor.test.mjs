import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { skillHomes, listSkills, diagnose } from './skills-doctor.mjs';

function fakeRepo({ sync = [], orfaos = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'moo-skills-'));
  for (const [sub, nomes] of [[path.join('.claude', 'skills'), sync], ['skills', orfaos]]) {
    for (const n of nomes) {
      fs.mkdirSync(path.join(root, sub, n), { recursive: true });
      fs.writeFileSync(path.join(root, sub, n, 'SKILL.md'), `---\nname: ${n}\n---\n`);
    }
    fs.mkdirSync(path.join(root, sub), { recursive: true });
  }
  return root;
}

test('as tres moradas sao declaradas, e a orfa e rotulada como tal', () => {
  const homes = skillHomes({ home: '/h', repo: '/r' });
  const orfa = homes.find((x) => x.id === 'repo-orfao');
  assert.match(orfa.dir, /\/r\/skills$/);
  assert.match(orfa.nota, /NÃO sincronizado/);
  assert.match(homes.find((x) => x.id === 'repo-sync').dir, /\.claude\/skills$/);
});

test('so conta como skill uma pasta com SKILL.md', () => {
  const root = fakeRepo({ sync: ['boa'] });
  fs.mkdirSync(path.join(root, '.claude', 'skills', 'vazia'), { recursive: true });
  assert.deepEqual(listSkills(path.join(root, '.claude', 'skills')), ['boa']);
});

test('morada inexistente da lista vazia, nunca erro', () => {
  assert.deepEqual(listSkills('/caminho/que/nao/existe'), []);
});

test('uma skill so em skills/ e denunciada como orfa', () => {
  const root = fakeRepo({ sync: ['viva'], orfaos: ['morta'] });
  const d = diagnose({ home: '/sem/conta', repo: root });
  assert.deepEqual(d.orfas, ['morta']);
  assert.equal(d.ok, false);
});

test('a mesma skill nas duas moradas do repo nao conta como orfa', () => {
  // Duplicar e mau, mas nao e o problema que este campo mede: instalada, esta.
  const root = fakeRepo({ sync: ['ambas'], orfaos: ['ambas'] });
  const d = diagnose({ home: '/sem/conta', repo: root });
  assert.deepEqual(d.orfas, []);
});

test('repo limpo e sem conta legivel da ok', () => {
  const root = fakeRepo({ sync: ['a', 'b'] });
  const d = diagnose({ home: '/sem/conta', repo: root });
  assert.equal(d.ok, true);
  assert.deepEqual(d.colisoes, []);
  assert.equal(d.conta.ok, false, 'sem manifesto legivel diz que nao leu, nao inventa vazio');
});

test('o doctor nunca apaga nem escreve nada', () => {
  const src = fs.readFileSync(new URL('skills-doctor.mjs', import.meta.url).pathname, 'utf8');
  const code = src.replace(/^\s*(\/\/|\*|\/\*).*$/gm, '');
  for (const perigo of ['rmSync', 'unlinkSync', 'writeFileSync', 'renameSync', 'rmdirSync']) {
    assert.ok(!code.includes(perigo), `o doctor nao pode ${perigo} — skills da conta sao do dono`);
  }
});
