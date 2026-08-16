/**
 * skill-moo-pilot.test.mjs — a skill não pode prometer o que o código não faz.
 *
 * Uma skill é documentação executável: o agente lê-a e age. Se ela nomear um
 * comando que não existe, um caminho que mudou, ou uma garantia que já não é
 * verdade, o agente propaga a mentira com a autoridade do repo — que é
 * exactamente o pilar P3 (coerência doc↔produto) a falhar dentro de casa.
 *
 * Este ficheiro extrai o que a skill AFIRMA e confronta cada afirmação com o
 * disco. Não valida prosa; valida factos verificáveis.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
// ATENÇÃO ao caminho: `/mooter-update` sincroniza `~/frugal/.claude/skills/` para
// `~/.claude/skills/`. Uma skill em `~/frugal/skills/` fica canónica no repo e
// NUNCA é instalada — canónica e morta. É aqui que ela tem de viver para ser
// invocável, e este teste é a guarda contra alguém a mover de volta.
const SKILL_DIR = path.join(REPO, '.claude', 'skills', 'moo-pilot');
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');
const SKILL = fs.readFileSync(SKILL_PATH, 'utf8');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const exists = (rel) => fs.existsSync(path.join(REPO, rel));

// ── a skill tem de estar onde o sync a vai buscar ────────────────────────────

test('a skill vive no directorio que o /mooter-update sincroniza', () => {
  assert.ok(fs.existsSync(SKILL_PATH), `a skill tem de estar em ${SKILL_DIR}`);
  assert.ok(
    !fs.existsSync(path.join(REPO, 'skills', 'moo-pilot', 'SKILL.md')),
    'duas cópias = duas verdades; `~/frugal/skills/` não é sincronizado',
  );
});

// ── frontmatter ──────────────────────────────────────────────────────────────

test('a skill tem frontmatter no formato da casa', () => {
  const fm = /^---\n([\s\S]*?)\n---/.exec(SKILL);
  assert.ok(fm, 'falta frontmatter');
  assert.match(fm[1], /^name: moo-pilot$/m);
  assert.match(fm[1], /^description: /m);
  const desc = /^description: (.+)$/m.exec(fm[1])[1];
  assert.ok(desc.length > 80, 'a description é o que faz a skill disparar — não pode ser vaga');
  assert.match(desc, /\/moo-pilot/, 'tem de declarar o gatilho');
});

// ── tudo o que a skill nomeia tem de existir ─────────────────────────────────

test('todo o caminho de ficheiro citado na skill existe no repo', () => {
  // Apanha o caminho onde quer que apareça — dentro de crase, atrás de `node`,
  // ou no meio de uma frase. Um caminho errado é errado em qualquer contexto.
  const citados = new Set(
    [...SKILL.matchAll(/\b((?:tools|skills|docs|landing|hub|packages)\/[A-Za-z0-9_./-]*)/g)]
      .map((m) => m[1].replace(/[.,;:)]+$/, '')),
  );
  assert.ok(citados.size >= 4, `a skill devia apontar para o código canónico (achei ${citados.size})`);
  for (const rel of citados) {
    assert.ok(exists(rel), `a skill cita ${rel}, que não existe`);
  }
});

test('todo o npm script citado existe no package.json', () => {
  const scripts = new Set(
    [...SKILL.matchAll(/npm run ([a-z0-9:-]+)/g)].map((m) => m[1]),
  );
  assert.ok(scripts.has('pilot'), 'o gesto principal tem de estar na skill');
  for (const s of scripts) {
    assert.ok(pkg.scripts[s], `a skill manda correr "npm run ${s}", que não existe`);
  }
});

test('todo o comando `node tools/...` citado aponta para um módulo real', () => {
  const cmds = [...SKILL.matchAll(/node (tools\/[A-Za-z0-9_./-]+\.mjs)/g)].map((m) => m[1]);
  assert.ok(cmds.length >= 2, 'a skill devia dar os comandos directos (snapshot, autostart)');
  for (const c of cmds) assert.ok(exists(c), `a skill manda correr ${c}, que não existe`);
});

// ── as garantias que a skill repete têm de continuar verdadeiras ─────────────

test('o endereço e a porta que a skill promete são os que o servidor usa', () => {
  const server = fs.readFileSync(path.join(REPO, 'tools/cockpit/runner/f10-server.mjs'), 'utf8');
  const porta = /export const PORT = (\d+)/.exec(server)[1];
  const host = /export const HOST = '([\d.]+)'/.exec(server)[1];
  assert.match(SKILL, new RegExp(`${host.replace(/\./g, '\\.')}:${porta}`),
               'a skill anuncia um endereço diferente do que o servidor abre');
});

test('a skill promete o cabeçalho de proveniência do painel, e ele existe', () => {
  assert.match(SKILL, /X-Moo-Panel-Source/);
  const server = fs.readFileSync(path.join(REPO, 'tools/cockpit/runner/f10-server.mjs'), 'utf8');
  assert.match(server, /X-Moo-Panel-Source/);
});

test('a skill promete que lançar nao levanta o STOP — e o lançador cumpre', () => {
  assert.match(SKILL, /NUNCA levanta o STOP/i);
  const launch = fs.readFileSync(path.join(REPO, 'tools/cockpit/runner/launch.mjs'), 'utf8');
  assert.ok(!/rmSync\(STOP|unlink.*STOP/.test(launch), 'a skill mente sobre o lançador');
});

test('a skill promete $0 duro — e o guardião do motor existe', () => {
  assert.match(SKILL, /127\.0\.0\.1:11434/);
  assert.match(SKILL, /redirect: 'error'/);
  const core = fs.readFileSync(path.join(REPO, 'tools/cockpit/runner/runner-core.mjs'), 'utf8');
  assert.match(core, /export function assertLocalEngine/);
  assert.match(core, /redirect: 'error'/, 'a skill promete um guardião de redirect que não existe');
});

test('o autostart que a skill manda instalar nao corre --play', () => {
  assert.match(SKILL, /autostart\.mjs --install/);
  const auto = fs.readFileSync(path.join(REPO, 'tools/cockpit/runner/autostart.mjs'), 'utf8');
  const plist = /export function buildPlist\(([\s\S]*?)\n}/.exec(auto)[0];
  assert.ok(!plist.includes('--play'), 'a skill promete que o arranque respeita o STOP');
});

// ── o vocabulário mostrado ao dono tem de ser o vocabulário do código ────────

test('cada veredicto que a skill explica é um veredicto que o código emite', () => {
  const verifier = fs.readFileSync(path.join(REPO, 'tools/cockpit/runner/evidence-verifier.mjs'), 'utf8');
  const noCodigo = new Set(
    [...verifier.matchAll(/^\s*[A-Z_]+: '([a-z-]+)',$/gm)].map((m) => m[1]),
  );
  assert.ok(noCodigo.size >= 4, 'não consegui ler os veredictos do verificador');
  // O código emite `sem-citacao`; o painel mostra `sem citação`. Comparar
  // literalmente obrigaria a skill a falar em identificadores em vez de falar
  // com o dono — normaliza-se acentos e separadores dos dois lados.
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_-]+/g, '');
  const skillNorm = norm(SKILL);
  for (const v of noCodigo) {
    assert.ok(skillNorm.includes(norm(v)),
              `o código emite "${v}" e a skill não o explica ao dono`);
  }
});

test('a skill nao suaviza o que "citação-ok" significa', () => {
  assert.match(SKILL, /\*\*Não\*\* que o achado esteja certo/);
});

test('a skill diz que a frescura cross-device vale o que o sync valer', () => {
  assert.match(SKILL, /vale o que o sync valer/);
  const beacon = fs.readFileSync(path.join(REPO, 'tools/cockpit/runner/fleet-beacon.mjs'), 'utf8');
  assert.match(beacon, /vale o que o sync do vault valer/, 'a skill e o painel têm de dizer o mesmo');
});

// ── a lição que custou caro fica escrita ─────────────────────────────────────

test('a skill avisa para nao entregar um instantâneo quando pediram o cockpit', () => {
  assert.match(SKILL, /snapshot/i);
  assert.match(SKILL, /não control|nao control/i);
  assert.match(SKILL, /sandbox/i, 'a razão concreta tem de estar lá, não só a proibição');
});

test('a skill aponta para os testes que a sustentam', () => {
  assert.match(SKILL, /npm run test:cockpit-runner/);
  assert.ok(pkg.scripts['test:cockpit-runner'].includes('skill-moo-pilot.test.mjs'),
            'este próprio ficheiro tem de correr na suite, senão a guarda não existe');
});
