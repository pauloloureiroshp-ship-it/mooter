#!/usr/bin/env node
/**
 * skills-doctor.mjs — onde é que esta máquina vai buscar cada skill, e qual ganha.
 *
 * Existe porque o repo tem DUAS moradas para skills e a máquina tem TRÊS, e nada
 * avisava quando o mesmo nome aparecia em mais do que uma:
 *
 *   <repo>/.claude/skills/     → sincronizado por /mooter-update  (canónico)
 *   <repo>/skills/             → NÃO é sincronizado               (fica no repo)
 *   ~/.claude/skills/          → o que o Claude Code lê
 *   bundle da app (conta)      → skills da conta, cache local descartável
 *
 * Uma skill em `<repo>/skills/` é canónica e morta: versionada, revista, e
 * nunca instalada. Uma skill duplicada entre o bundle da conta e `~/.claude/`
 * dá dois `/nome` com comportamentos diferentes e nenhum aviso.
 *
 * Não apaga nada. Skills da conta são dados do dono e só ele as remove — e
 * apagar a cache local seria teatro, porque volta no sync seguinte.
 *
 *   node tools/cockpit/runner/skills-doctor.mjs
 *   node tools/cockpit/runner/skills-doctor.mjs --strict   (sai 1 se houver colisão)
 */

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import os from 'node:os';
import path from 'node:path';

const HOME = os.homedir();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** As moradas conhecidas, por ordem de autoridade decrescente. */
export function skillHomes({ home = HOME, repo = REPO } = {}) {
  return [
    { id: 'repo-sync', dir: path.join(repo, '.claude', 'skills'),
      nota: 'canónico — /mooter-update instala daqui' },
    { id: 'repo-orfao', dir: path.join(repo, 'skills'),
      nota: 'NÃO sincronizado — uma skill aqui nunca é instalada' },
    { id: 'instalado', dir: path.join(home, '.claude', 'skills'),
      nota: 'o que o Claude Code lê nesta máquina' },
  ];
}

/**
 * Lista os nomes de skill de uma morada. Uma morada ausente é [], não erro — não
 * existir é uma medição: não há lá skills nenhumas.
 *
 * Ilegível é outra coisa. Permissões, I/O, um caminho que não é pasta: aí não se
 * sabe o que lá está, e devolver [] fazia-a passar por morada limpa — as órfãs e
 * as colisões que ela contivesse desapareciam num `ok: true` que ninguém mediu.
 * Devolve null, e o `diagnose` trata-o como n/d.
 */
export function listSkills(dir, { readdirImpl = fs.readdirSync, existsImpl = fs.existsSync } = {}) {
  let entries;
  try {
    entries = readdirImpl(dir, { withFileTypes: true });
  } catch (erro) {
    if (erro && erro.code === 'ENOENT') return [];
    process.stderr.write(`  skills-doctor: ${dir} ilegivel (${(erro && erro.code) || erro}) — fica n/d\n`);
    return null;
  }
  return entries
    .filter((e) => e.isDirectory() && existsImpl(path.join(dir, e.name, 'SKILL.md')))
    .map((e) => e.name)
    .sort();
}

/** As skills da conta, lidas do manifesto do bundle da app (nunca escritas). */
export function accountSkills({ home = HOME, globImpl = null } = {}) {
  const base = path.join(home, 'Library', 'Application Support', 'Claude',
                         'local-agent-mode-sessions', 'skills-plugin');
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'manifest.json') found.push(path.join(dir, e.name));
      else if (e.isDirectory()) walk(path.join(dir, e.name), depth + 1);
    }
  };
  if (globImpl) return globImpl();
  walk(base, 0);
  for (const m of found) {
    try {
      const d = JSON.parse(fs.readFileSync(m, 'utf8'));
      return {
        ok: true,
        manifesto: m,
        skills: (d.skills || []).map((s) => ({
          name: s.name, id: s.skillId, dono: s.creatorType, activa: s.enabled,
        })),
      };
    } catch {
      /* próximo manifesto */
    }
  }
  return { ok: false, manifesto: null, skills: [] };
}

/**
 * Cruza tudo e devolve os problemas. Duas categorias, porque pedem acções
 * diferentes: uma órfã corrige-se com um `git mv`; uma colisão com a conta só o
 * dono a resolve, na interface do Claude.
 */
export function diagnose({ home = HOME, repo = REPO } = {}) {
  const homes = skillHomes({ home, repo }).map((h) => ({ ...h, skills: listSkills(h.dir) }));
  const porId = Object.fromEntries(homes.map((h) => [h.id, h]));
  const conta = accountSkills({ home });

  // Uma morada ilegível não é uma morada vazia. Sem ler `repo-sync` toda a skill
  // de `repo-orfao` pareceria órfã (falso positivo); sem ler `repo-orfao` nenhuma
  // pareceria (falso negativo). Nos dois casos o campo é n/d — `null`, nunca `[]` —
  // e o `ok` cai, porque um verde por ignorância é pior do que um vermelho.
  const ilegiveis = homes.filter((h) => h.skills == null).map((h) => h.id);
  const legivel = (id) => porId[id].skills != null;

  const orfas = (legivel('repo-orfao') && legivel('repo-sync'))
    ? porId['repo-orfao'].skills.filter((n) => !porId['repo-sync'].skills.includes(n))
    : null;
  const contaNomes = new Set(conta.skills.filter((s) => s.activa !== false).map((s) => s.name));

  let colisoes = null;
  if (legivel('repo-sync') && legivel('instalado')) {
    colisoes = [];
    for (const nome of new Set([...porId['repo-sync'].skills, ...porId['instalado'].skills])) {
      if (contaNomes.has(nome)) {
        const s = conta.skills.find((x) => x.name === nome);
        colisoes.push({
          nome,
          instalado: porId['instalado'].skills.includes(nome),
          canonico: porId['repo-sync'].skills.includes(nome),
          conta_id: s && s.id,
          conta_dono: s && s.dono,
        });
      }
    }
  }

  return {
    homes,
    conta,
    orfas,
    colisoes,
    ilegiveis,
    ok: ilegiveis.length === 0 && orfas.length === 0 && colisoes.length === 0,
  };
}

function main() {
  const strict = process.argv.includes('--strict');
  const d = diagnose();

  process.stdout.write('\n  Skills — onde vivem e qual ganha\n\n');
  for (const h of d.homes) {
    const quantas = h.skills == null ? 'n/d' : String(h.skills.length);
    process.stdout.write(`  ${h.id.padEnd(11)} ${quantas.padStart(3)} skills · ${h.nota}\n`);
    process.stdout.write(`  ${' '.repeat(11)} ${h.dir}\n`);
  }
  process.stdout.write(`  conta       ${String(d.conta.skills.length).padStart(3)} skills · cache da tua conta Claude`
    + `${d.conta.ok ? '' : ' (manifesto nao lido)'}\n\n`);

  if (d.ilegiveis.length) {
    process.stdout.write('  N/D — moradas que nao se conseguiram ler (motivo em stderr):\n');
    for (const id of d.ilegiveis) process.stdout.write(`    - ${id}\n`);
    process.stdout.write('    Sem as ler, orfas e colisoes NAO foram medidas — n/d, nao zero.\n\n');
  }

  if (d.orfas && d.orfas.length) {
    process.stdout.write('  ORFAS — no repo mas nunca instaladas (canonicas e mortas):\n');
    for (const n of d.orfas) process.stdout.write(`    - ${n}\n`);
    process.stdout.write('    correccao: git mv skills/<nome> .claude/skills/<nome>\n\n');
  }

  if (d.colisoes && d.colisoes.length) {
    process.stdout.write('  COLISOES — o mesmo /nome vem de dois sitios:\n');
    for (const c of d.colisoes) {
      process.stdout.write(`    - /${c.nome}  repo:${c.canonico ? 'sim' : 'nao'}`
        + ` instalado:${c.instalado ? 'sim' : 'nao'}  conta:${c.conta_id}\n`);
    }
    process.stdout.write('    A copia da conta NAO se resolve daqui: e dado teu, vive na tua conta,\n');
    process.stdout.write('    e apagar a cache local seria teatro (volta no sync seguinte).\n');
    process.stdout.write('    Remove-a na interface do Claude (Definicoes > Capacidades > Skills).\n\n');
  }

  if (d.ok) process.stdout.write('  Sem orfas, sem colisoes.\n\n');
  if (strict && !d.ok) process.exit(1);
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
