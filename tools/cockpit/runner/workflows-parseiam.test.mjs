/**
 * workflows-parseiam.test.mjs
 *
 * A ÚNICA verificação deste repositório que aponta o `ci-coerencia.mjs` aos
 * workflows a sério. Existe porque descobri, a 2026-09-01, que não havia
 * nenhuma: o módulo tem seis exports de análise de CI e **ninguém o invoca
 * fora dos seus próprios testes sintéticos**. Seis guardas escritas com
 * cuidado, zero mordidas possíveis. Presença em vez de cobertura, outra vez —
 * a mesma classe que fez o portão de design nascer cego para os `.svg`, e que
 * fez a guarda de movimento reduzido cobrir 2 de 6 animações.
 *
 * Porque é que ESTA verificação pode olhar para os ficheiros reais quando o
 * `ci-coerencia.test.mjs` proíbe isso a si próprio: a proibição de lá existe
 * para não ancorar testes em DECISÕES de configuração (que versão de Node,
 * que pilares estão ligados) — essas mudam, e um teste ancorado nelas parte na
 * próxima decisão. Isto não é uma decisão. Que um ficheiro de workflow seja
 * sintacticamente um workflow é um invariante: nunca há um dia em que a
 * resposta certa passe a ser «não».
 *
 * O que custou não ter isto: o `version-sync.yml` esteve partido de 2026-08-29
 * a 2026-09-01 — 12 corridas em falha seguidas, **e nunca correu numa tag**,
 * que era a única coisa para que existia. O GitHub anuncia o sintoma de forma
 * fácil de ignorar (mostra o caminho do ficheiro onde devia mostrar o `name:`),
 * e o commit que o partiu chamava-se «fix(ci): o Version Sync deixa de falhar
 * em todas as tags».
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { lerWorkflows, blocoPartido } from './ci-coerencia.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(RAIZ, '.github', 'workflows');

test('nenhum workflow do repo tem conteúdo fugido para a coluna 0', () => {
  const ws = lerWorkflows(DIR);

  // Um `null` (pasta ilegível) e um `[]` (pasta vazia) davam ambos verde numa
  // asserção ingénua sobre `fugas.length`. Um teste que passa por não ter
  // conseguido ler nada é pior do que não existir: afirma cobertura que não teve.
  assert.notEqual(ws, null, 'a pasta de workflows tem de ser legível — n/d não é verde');
  assert.ok(ws.length > 0, 'sem workflows lidos, este teste não mediu nada');

  const fugas = blocoPartido(ws);
  const relato = fugas.map((f) => `  ${f.ficheiro}:${f.linha} → ${f.texto}`).join('\n');
  assert.deepEqual(fugas, [],
    `${fugas.length} linha(s) de conteúdo à coluna 0 — o ficheiro deixa de ser YAML:\n${relato}\n` +
    'Um corpo de texto multilinha dentro de um `run:` tem de ir por --body-file, ' +
    'ou indentado dentro do bloco.');
});

test('todo o workflow declara um `name:` — é ele que o GitHub mostra', () => {
  const ws = lerWorkflows(DIR);
  assert.notEqual(ws, null);

  // Quando falta o `name:`, o GitHub identifica a corrida pelo CAMINHO do
  // ficheiro. Foi assim que o `version-sync.yml` partido apareceu na lista
  // durante três dias sem ninguém reparar: parecia um workflow chamado
  // `.github/workflows/version-sync.yml`, que é ruído plausível de mais.
  const semNome = ws
    .filter((w) => !/^name:\s*\S/m.test(String(w.src).replace(/\r/g, '')))
    .map((w) => w.ficheiro);
  assert.deepEqual(semNome, [],
    `sem \`name:\`, a corrida aparece com o caminho do ficheiro: ${semNome.join(', ')}`);
});
