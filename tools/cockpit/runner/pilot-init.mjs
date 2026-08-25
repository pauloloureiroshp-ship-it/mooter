#!/usr/bin/env node
/**
 * pilot-init.mjs — propoe os pilares de um projecto. Nunca os decide.
 *
 * Ate 2026-08-18 os pilares eram UMA definicao literal em `context-pack.mjs`:
 * seis listas de ficheiros deste repo, cravadas no motor. Um segundo projecto
 * herdava perguntas sobre `tools/router/classify.js`, que la nao existe.
 *
 * As listas continuam EXPLICITAS — sem globs, sem walk — porque a
 * reprodutibilidade e deliberada: um pilar tem de dar a mesma ronda hoje e
 * daqui a um mes. O que muda e QUEM as declara. Este comando le o projecto e
 * escreve uma PROPOSTA em `.mooter/pilares.propostos.json`; so o dono e que a
 * promove a `.mooter/pilares.json`. Escrever o ficheiro a valer seria o motor
 * a escolher o que se revê a si proprio.
 *
 * Determinístico, zero-LLM, zero-rede. So propoe ficheiros que EXISTEM.
 *
 *   node tools/cockpit/runner/pilot-init.mjs [--repo <path>] [--print]
 */

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { resolveRepoRoot } from './project.mjs';
import { PILLARS_FILE } from './context-pack.mjs';

export const PROPOSTA_FILE = '.mooter/pilares.propostos.json';

/** Quantos ficheiros, no maximo, por pilar proposto. Um pilar gordo nao roda. */
export const MAX_POR_PILAR = 5;

const CODE_EXT = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.go', '.rs']);

const existe = (repoRoot, rel) => {
  try {
    return fs.statSync(path.join(repoRoot, rel)).isFile();
  } catch {
    return false;
  }
};

/**
 * Os ficheiros de codigo que MAIS mudaram nos ultimos commits. E o melhor sinal
 * barato que ha para "onde e que os defeitos aterram" — e nao precisa de LLM
 * nenhum. Sem git, devolve `null` (nao sei) — nunca [].
 */
export function ficheirosComMaisChurn(repoRoot, { limite = 200, runImpl = null } = {}) {
  const run = runImpl || ((args) => execFileSync('git', args, {
    cwd: repoRoot, encoding: 'utf8', timeout: 10_000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true,
  }));
  let out;
  try {
    out = run(['log', '--format=', '--name-only', '-n', String(limite)]);
  } catch {
    // O [] daqui era indistinguivel de "o git correu e nenhum ficheiro de
    // codigo mudou": em ambos os casos P1 caia na lista dos rejeitados por
    // "nao terem ficheiros reais". O dono lia "nao ha codigo quente" quando o
    // que havia era um repo sem git, ou um git que rebentou. `null` = nao sei.
    return null;
  }
  const contagem = new Map();
  for (const linha of String(out || '').split('\n')) {
    const rel = linha.trim();
    if (!rel) continue;
    const dot = rel.lastIndexOf('.');
    if (dot < 0 || !CODE_EXT.has(rel.slice(dot))) continue;
    if (rel.includes('.test.') || rel.startsWith('_handoff/') || rel.startsWith('docs/archive/')) continue;
    if (!existe(repoRoot, rel)) continue; // um ficheiro apagado nao e um alvo
    contagem.set(rel, (contagem.get(rel) || 0) + 1);
  }
  return [...contagem.entries()]
    .sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]))
    .map(([rel, n]) => ({ file: rel, mudancas: n }));
}

/** Pontos de entrada declarados pelo proprio projecto, no package.json. */
export function entradasDeclaradas(repoRoot) {
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  } catch (erro) {
    // Package ausente pode significar legitimamente "sem entradas". Presente
    // mas ilegível é uma fonte n/d, não um P2 vazio medido.
    return erro && erro.code === 'ENOENT' ? [] : null;
  }
  const brutos = new Set();
  if (typeof pkg.main === 'string') brutos.add(pkg.main);
  if (typeof pkg.bin === 'string') brutos.add(pkg.bin);
  else if (pkg.bin && typeof pkg.bin === 'object') for (const v of Object.values(pkg.bin)) brutos.add(String(v));
  // `npm run x` -> `node caminho.js`: o caminho e o que o projecto considera
  // digno de um comando, e por isso um bom candidato a pilar.
  for (const cmd of Object.values(pkg.scripts || {})) {
    for (const tok of String(cmd).split(/\s+/)) {
      const dot = tok.lastIndexOf('.');
      if (dot > 0 && CODE_EXT.has(tok.slice(dot))) brutos.add(tok.replace(/^\.\//, ''));
    }
  }
  // Um ficheiro de teste nao e um ponto de entrada. A primeira versao apanhou
  // cinco `.test.mjs` do script `test:*` e propunha rever a suite em vez do
  // produto — um pilar que se revê a si proprio nao encontra nada de novo.
  return [...brutos]
    .filter((rel) => !/\.(test|spec)\./.test(rel))
    .filter((rel) => existe(repoRoot, rel))
    .sort();
}

/** Documentos que afirmam valores mecanicos (shas, comandos, limites) e podem apodrecer. */
export function canonDoProjecto(repoRoot) {
  return ['CLAUDE.md', 'AGENTS.md', 'README.md', 'SYNC.md', 'INFRA.md', 'CONTRIBUTING.md']
    .filter((rel) => existe(repoRoot, rel));
}

/**
 * A automacao que decide o que entra: se ela mente, o verde nao vale nada.
 * So ENOENT prova que nao ha CI; qualquer outro erro devolve `null` (nao sei).
 */
export function automacao(repoRoot) {
  const dir = path.join(repoRoot, '.github', 'workflows');
  let nomes;
  try {
    nomes = fs.readdirSync(dir);
  } catch (err) {
    // O [] apanhava os dois casos: "este projecto nao tem workflows" e "nao
    // consegui ler a pasta" (permissoes, caminho ilegivel). Um repo com guardas
    // que nao se conseguem ler aparecia ao dono como um repo sem guardas — que
    // e exactamente o pilar que existe para nao se acreditar em verdes cegos.
    if (err && err.code === 'ENOENT') return [];
    return null;
  }
  return nomes
    .filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))
    .sort()
    .slice(0, MAX_POR_PILAR)
    .map((n) => `.github/workflows/${n}`);
}

/**
 * Monta a proposta. Um pilar sem ficheiros reais NAO e proposto — um pilar que
 * aponta ao vazio produz rondas `n/d` e ensina o dono a ignorar o painel.
 */
export function proporPilares(repoRoot, { churnImpl = null } = {}) {
  const churn = (churnImpl || ficheirosComMaisChurn)(repoRoot);
  const entradasLidas = entradasDeclaradas(repoRoot);
  const entradas = entradasLidas === null ? null : entradasLidas.slice(0, MAX_POR_PILAR);
  const canon = canonDoProjecto(repoRoot).slice(0, MAX_POR_PILAR);
  const ci = automacao(repoRoot);
  const quentes = churn === null ? null : churn.slice(0, MAX_POR_PILAR).map((c) => c.file);

  // Uma fonte que devolve `null` nao disse "nao ha" — disse "nao consegui ler".
  // Os dois casos caiam na mesma linha de rejeicao, e um pilar por ler passava
  // por um pilar vazio.
  const indeterminados = [];
  if (churn === null) indeterminados.push('P1');
  if (entradas === null) indeterminados.push('P2');
  if (ci === null) indeterminados.push('P4');

  const candidatos = {
    P1: Boolean(quentes && quentes.length) && {
      label: 'Codigo quente',
      files: quentes,
      ask: 'Qual destas linhas pode rebentar, engolir um erro em silencio, ou inverter uma condicao? Escolhe uma e diz porque.',
      porque: `os ${quentes.length} ficheiros de codigo que mais mudaram nos ultimos 200 commits`,
    },
    P2: Boolean(entradas && entradas.length) && {
      label: 'Pontos de entrada',
      files: entradas,
      ask: 'Qual destas linhas trata mal um input, uma flag ou um caminho de erro que o utilizador consegue alcancar? Escolhe uma e diz porque.',
      porque: 'main/bin/scripts declarados no package.json que existem mesmo',
    },
    P3: canon.length && {
      label: 'Coerencia Doc↔Produto',
      files: canon,
      ask: 'Qual destas linhas afirma um valor mecanico (sha, comando, caminho, limite, numero) que pode ja nao bater com o codigo? Escolhe uma e diz porque.',
      porque: 'os documentos que o projecto trata como canon',
    },
    P4: Boolean(ci && ci.length) && {
      label: 'Automacao & Guardas',
      files: ci,
      ask: 'Qual destas linhas deixa passar verde sem prova, ou nao corre quando devia correr? Escolhe uma e diz porque.',
      porque: 'os workflows que decidem o que entra no projecto',
    },
  };

  const pilares = {};
  const rejeitados = [];
  for (const [id, p] of Object.entries(candidatos)) {
    if (p) pilares[id] = { label: p.label, files: p.files, ask: p.ask };
    else if (!indeterminados.includes(id)) rejeitados.push(id);
  }
  return {
    pilares,
    porque: Object.fromEntries(Object.entries(candidatos).filter(([, p]) => p).map(([id, p]) => [id, p.porque])),
    rejeitados,
    indeterminados,
    churn: churn === null ? null : churn.slice(0, 10),
  };
}

/** Escreve a PROPOSTA (nunca o ficheiro a valer) e devolve onde ficou. */
export function escreverProposta(repoRoot, proposta) {
  const destino = path.join(repoRoot, PROPOSTA_FILE);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const corpo = {
    _leia_me: [
      'PROPOSTA. O runner NAO le este ficheiro.',
      'ATENCAO: adoptar SUBSTITUI os pilares embutidos, nao os funde. Os que nao',
      'estiverem aqui deixam de existir para este projecto — e deliberado (um',
      'projecto tem de poder REMOVER um pilar), mas nao pode ser uma surpresa.',
      `Para o adoptar, revê as listas e renomeia para ${path.basename(PILLARS_FILE)}:`,
      `  mv ${PROPOSTA_FILE} ${PILLARS_FILE}`,
      'Os caminhos sao relativos a raiz do repo e tem de existir. Sem globs, de proposito:',
      'um pilar tem de dar a mesma ronda hoje e daqui a um mes.',
    ],
    _porque: proposta.porque,
    pilares: proposta.pilares,
  };
  fs.writeFileSync(destino, `${JSON.stringify(corpo, null, 2)}\n`);
  return destino;
}

export function main(argv = process.argv.slice(2), escrever = process.stdout.write.bind(process.stdout)) {
  const { root, fonte } = resolveRepoRoot({
    argv,
    scriptRoot: path.resolve(fileURLToPath(new URL('../../..', import.meta.url))),
  });
  const proposta = proporPilares(root);
  const ids = Object.keys(proposta.pilares);

  escrever(`repo ${root} (via ${fonte})\n`);
  if (proposta.indeterminados.length) {
    // n/d, nao "nao ha": a fonte destes pilares nao se conseguiu ler. Anuncia-se
    // antes do resto para nao se confundir com a lista dos rejeitados por vazio.
    escrever(`\nn/d — nao consegui ler a fonte de: ${proposta.indeterminados.join(', ')}`
      + ' (P1 le a historia do git; P4 le .github/workflows). Nao e o mesmo que nao existirem.\n');
  }
  if (ids.length === 0) {
    // So se afirma ausencia do que se conseguiu mesmo ler; o resto ficou em n/d
    // acima. Dizer "nao encontrei historia git" quando o git nem correu era a
    // mesma mentira, um andar acima.
    escrever(proposta.indeterminados.length
      ? `nao consegui propor um unico pilar: nada nas fontes que li, e ${proposta.indeterminados.join(', ')} ficaram por ler.\n`
      : 'nao consegui propor um unico pilar: nao encontrei package.json, canon, workflows nem historia git.\n');
    escrever(`escreve tu ${PILLARS_FILE} a mao — cada pilar precisa de { label, files[], ask }.\n`);
    return { root, proposta, destino: null };
  }

  for (const id of ids) {
    const p = proposta.pilares[id];
    escrever(`\n${id} · ${p.label}  (${proposta.porque[id]})\n`);
    for (const f of p.files) escrever(`   ${f}\n`);
  }
  if (proposta.rejeitados.length) {
    // Sem tectos silenciosos: o que ficou de fora diz-se.
    escrever(`\nnao propostos por nao terem ficheiros reais: ${proposta.rejeitados.join(', ')}\n`);
  }

  if (argv.includes('--print')) {
    escrever('\n--print: nada foi escrito.\n');
    return { root, proposta, destino: null };
  }
  const destino = escreverProposta(root, proposta);
  escrever(`\nproposta em ${path.relative(root, destino)} — o runner NAO a le.\n`);
  escrever(`adoptar SUBSTITUI os ${ids.length === 0 ? 6 : 6} pilares embutidos pelos ${ids.length} acima.\n`);
  escrever(`revê e, se concordares:  mv ${PROPOSTA_FILE} ${PILLARS_FILE}\n`);
  return { root, proposta, destino };
}

export const invocadoComoPrograma = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invocadoComoPrograma) main();
