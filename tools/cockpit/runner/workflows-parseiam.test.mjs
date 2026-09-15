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
import fs from 'node:fs';
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

/**
 * Extrai uma lista YAML plana de strings entre aspas simples. Line-based de
 * propósito — o repo tem viés de zero dependências, e a forma aqui é sempre a
 * mesma: `chave:` seguida de linhas `- 'padrão'`, com comentários pelo meio.
 */
function listaYaml(src, chave, aPartirDe = 0) {
  const L = src.replace(/\r/g, '').split('\n');
  const i = L.findIndex((l, k) => k >= aPartirDe && new RegExp(`^\\s*${chave}:\\s*$`).test(l));
  if (i < 0) return null;
  const itens = [];
  for (let k = i + 1; k < L.length; k++) {
    const m = L[k].match(/^\s*-\s*'([^']+)'\s*$/);
    if (m) { itens.push(m[1]); continue; }
    if (/^\s*#/.test(L[k]) || !L[k].trim()) continue;
    break;
  }
  return itens;
}

test('o `test-skip.yml` é o espelho EXACTO do `paths:` do `test.yml`', () => {
  // O par existe porque a protecção de ramo exige checks com nomes fixos, e o
  // `test.yml` tem filtro de caminhos: quando ele não corre, alguém tem de
  // reportar esses nomes. Mas o `paths-ignore` só salta a workflow quando TODOS
  // os ficheiros alterados casam — logo, se o espelho tiver menos padrões do que
  // a referência, um PR que toque num dos que faltam faz correr os DOIS. Ficam
  // dois check runs com o mesmo nome obrigatório, **um deles verde sem ter
  // corrido nada**.
  //
  // Medido a 2026-09-01: a referência tinha 13 padrões e o espelho 7. Sete em
  // falta, incluindo `tools/ab/**` — os testes do harness que produz os números
  // públicos. A deriva é silenciosa por construção: cada padrão novo no
  // `test.yml` nasce em falta aqui, e nada gritava.
  const ty = fs.readFileSync(path.join(DIR, 'test.yml'), 'utf8');
  const ts = fs.readFileSync(path.join(DIR, 'test-skip.yml'), 'utf8');

  const iPr = ty.replace(/\r/g, '').split('\n').findIndex((l) => /^\s*pull_request:\s*$/.test(l));
  assert.ok(iPr > 0, 'o test.yml perdeu o bloco pull_request');

  const ref = listaYaml(ty, 'paths', iPr);
  const espelho = listaYaml(ts, 'paths-ignore');

  // Anti-vacuidade: duas listas vazias são «iguais» e não mediram nada.
  assert.ok(ref && ref.length >= 10, `paths de referência com ${ref ? ref.length : 0} itens — não li nada`);
  assert.ok(espelho && espelho.length >= 10, `paths-ignore com ${espelho ? espelho.length : 0} itens — não li nada`);

  const faltam = ref.filter((p) => !espelho.includes(p));
  const aMais = espelho.filter((p) => !ref.includes(p));
  assert.deepEqual(faltam, [],
    `o test-skip.yml não ignora ${faltam.length} caminho(s) que o test.yml cobre — ` +
    'um PR que lhes toque dispara os dois, e um check obrigatório fica verde sem correr nada');
  assert.deepEqual(aMais, [],
    `o test-skip.yml ignora ${aMais.length} caminho(s) que o test.yml NÃO cobre — ` +
    'esses ficam sem job nenhum a correr, e sem ninguém a reportar o check');
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

/**
 * As workflows de VERIFICAÇÃO não podem filtrar por base de PR.
 *
 * MEDIDO A 2026-09-11. Onze dos doze workflows com `pull_request:` traziam
 * `branches: [main]`. Num `pull_request`, esse filtro é sobre a **base** do PR —
 * não sobre o branch de trabalho. Resultado: quatro PRs empilhados uns sobre os
 * outros (#492, #493, #496, #497, com base `feat/onboarding-v2-w*`) **nunca
 * dispararam** nenhuma das suites. Apareciam com 9 checks verdes — `ratchet`,
 * `segredos`, Vercel — e nem um deles era um teste. O #491, com base `main`,
 * teve 15.
 *
 * E não foi só perder cobertura: o espelho do `test-skip.yml` foi partido pelas
 * W2/W3 (dois `paths:` novos no `test.yml` sem o par cá), o teste que o apanha
 * estava **vermelho localmente**, e não reprovou PR nenhum — porque a workflow
 * que o corre não chegava a arrancar. Um defeito a esconder o outro.
 *
 * Trabalho empilhado é um padrão normal. Uma CI que só vê PRs para `main` é
 * cega exactamente quando há mais código por rever de uma vez.
 *
 * As caras ficam de fora da lista de propósito: `benchmark` e `latency` gastam
 * minutos a sério, e `claude-review` gasta modelo.
 */
const VERIFICACAO = [
  'test.yml', 'test-skip.yml', 'landing-test.yml', 'design-gate.yml',
  'security.yml', 'docs-hygiene.yml', 'wave-gate.yml', 'lp-trust.yml',
];

/** O `branches:` que está DENTRO do bloco `pull_request:`, se existir. */
function branchesDoPullRequest(src) {
  const linhas = String(src).replace(/\r/g, '').split('\n');
  for (let i = 0; i < linhas.length; i++) {
    if (linhas[i].trim() !== 'pull_request:') continue;
    for (let j = i + 1; j < linhas.length; j++) {
      if (/^\s{0,2}\S/.test(linhas[j])) break;          // saiu do bloco
      if (/^\s{4}branches:/.test(linhas[j])) return linhas[j].trim();
      if (/^\s{4}[a-z-]+:/.test(linhas[j]) && !/^\s{4}branches:/.test(linhas[j])) continue;
    }
    return null;
  }
  return null;
}

test('as workflows de verificação correm em QUALQUER base de PR', () => {
  const comFiltro = [];
  for (const nome of VERIFICACAO) {
    const caminho = `${DIR}/${nome}`;
    if (!fs.existsSync(caminho)) continue;
    const b = branchesDoPullRequest(fs.readFileSync(caminho, 'utf8'));
    if (b) comFiltro.push(`${nome} → ${b}`);
  }
  assert.deepEqual(comFiltro, [],
    'estas workflows voltaram a filtrar a base do PR — PRs empilhados deixam de ' +
    `correr testes e aparecem verdes na mesma:\n  ${comFiltro.join('\n  ')}`);
});

test('o `test.yml` e o `test-skip.yml` continuam a concordar no gatilho', () => {
  // Se um correr numa base e o outro não, os checks obrigatórios ou ficam por
  // reportar (PR bloqueado para sempre) ou são reportados a verde sem nada ter
  // corrido. A segunda é pior, e é a que este par de ficheiros existe para
  // evitar — ver o cabeçalho do `test-skip.yml`.
  const a = branchesDoPullRequest(fs.readFileSync(`${DIR}/test.yml`, 'utf8'));
  const b = branchesDoPullRequest(fs.readFileSync(`${DIR}/test-skip.yml`, 'utf8'));
  assert.equal(a, b, `test.yml (${a}) e test-skip.yml (${b}) divergiram no \`branches:\` do pull_request`);
});
