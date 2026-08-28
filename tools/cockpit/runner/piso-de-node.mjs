/**
 * piso-de-node.mjs — o piso de Node e UM numero, e ele vive num sitio so.
 *
 * PORQUE ISTO EXISTE.
 *
 * A 2026-08-22, ao alinhar os workflows do CI, apareceram quatro numeros a dizer
 * coisas diferentes sobre a mesma pergunta ("qual a versao minima de Node?"):
 *
 *     install.sh:132          "mooter needs Node 18+"     <- promessa ao utilizador
 *     packages/cli/build.mjs  --target=node20             <- o que se lhe entrega
 *     CONTRIBUTING.md         "Node 20+"                  <- o que se pede a quem contribui
 *     tests/README.md         "Node 18+"                  <- outra vez 18
 *
 * Consequencia real: quem instalasse em Node 18 ou 19 PASSAVA a verificacao do
 * instalador e recebia um bundle compilado para 20+. Falhava depois, em runtime,
 * sem a mensagem clara que o instalador existia para dar.
 *
 * O arquivo mostra que isto ja tinha sido "resolvido" uma vez — o
 * `SYNC_ARCHIVE_2026.md` regista `G5 — Node 20+ vs script 18+ | GAP UX | → 18+
 * alinhado`. Alinhar a mao nao aguenta: meses depois havia quatro numeros outra
 * vez. E a mesma licao do #328 ("uma regra em dezanove copias nao e uma regra"),
 * noutra roupagem.
 *
 * O DESENHO.
 *
 * Canonico: `engines.node` do `packages/cli/package.json` — o package que produz
 * o binario que o utilizador executa. Quem PODE derivar, deriva (o `build.mjs` le
 * o engines e monta o `--target`, portanto essa copia deixou de existir). Quem
 * NAO pode — os instaladores correm por `curl | sh` antes de haver repo na
 * maquina, e o markdown nao executa — copia, e a copia e verificada aqui.
 *
 * Os padroes sao deliberadamente estreitos: apontam a LINHA QUE DECIDE, nunca a
 * prosa a volta. Um verificador que grita com um comentario historico ensina
 * toda a gente a ignora-lo — e ja se pagou esse preco esta semana com o
 * `packages/cli/mooter.js` no ci-coerencia.
 *
 * SEM EXCLUSOES. Houve uma, durante umas horas a 2026-08-22: o
 * `packages/router/package.json` compilava o `pack-hint` com `--target=node18` e
 * ficou de fora por ser codigo congelado. O dono allowlistou-o no mesmo dia
 * (ver `CLAUDE.md`), e ele entrou. Ainda bem: aquele bundle nao e config morta —
 * o `install.sh:196` compila-o NA MAQUINA DO UTILIZADOR e instala-o como hook do
 * Claude Code. Era o unico sitio onde o numero errado ainda chegava a producao.
 *
 * Se algum dia voltar a haver um sitio intocavel, escreve-se aqui em vez de se
 * deixar o "todos os sitios" a mentir por omissao — mas nao se poe em SITIOS,
 * porque um verificador cronicamente vermelho e um verificador que se ignora.
 *
 * Uso: node tools/cockpit/runner/piso-de-node.mjs [raiz-do-repo]
 */

import fs from 'node:fs';
import path from 'node:path';

/** Onde vive o numero verdadeiro. */
export const CANONICO = 'packages/cli/package.json';

/**
 * Os documentos afirmam o piso de duas maneiras: em prosa ("Node 22+") e dentro
 * de um bloco de comandos ("node --version  # Expected: v22.x"). A segunda
 * escapava ao primeiro padrao e deixava os dois runbooks a dizer v20.x com tudo
 * o resto ja em 22. O segundo padrao esta ancorado ao comando de proposito, para
 * nao apanhar tags de versao do produto como `Expected: v0.1.0-pastor-wave1`.
 */
const PADROES_DOC = [/\bNode (\d+)\+/g, /node --version[^\n]*?v(\d+)\.x/g];

/**
 * Cada sitio que repete o piso, e o padrao que aponta a linha que o decide.
 * `porque` explica-se ao humano que ler a falha — sem isso o erro e so um numero.
 *
 * `obrigatorio` marca os sitios onde a AUSENCIA e que e o defeito: um instalador
 * que deixe de verificar o Node deixa de recusar seja o que for, e um verificador
 * que so compara numeros nunca daria por isso.
 */
export const SITIOS = [
  {
    ficheiro: 'package.json',
    porque: 'piso de desenvolvimento do workspace',
    padroes: [/"node":\s*">=\s*(\d+)/g],
  },
  {
    // O alvo do `build:packhint` chega a producao: o `install.sh` compila este
    // bundle na maquina do utilizador e instala-o como hook do Claude Code.
    // Codigo congelado, allowlistado a 2026-08-22 so para estas duas linhas.
    ficheiro: 'packages/router/package.json',
    porque: 'o alvo do pack-hint que corre na maquina do utilizador',
    padroes: [/--target=node(\d+)/g, /"node":\s*">=\s*(\d+)/g],
  },
  {
    ficheiro: 'install.sh',
    porque: 'o que o instalador POSIX recusa',
    obrigatorio: true,
    padroes: [/Verifies Claude Code \+ Node (\d+)/g, /NODE_MAJOR"?\s*-lt\s*(\d+)/g, /needs Node (\d+)\+/g],
  },
  {
    ficheiro: 'landing/public/install.sh',
    porque: 'a copia que o site serve por curl | sh',
    obrigatorio: true,
    padroes: [/Verifies Claude Code \+ Node (\d+)/g, /NODE_MAJOR"?\s*-lt\s*(\d+)/g, /needs Node (\d+)\+/g],
  },
  {
    ficheiro: 'install.ps1',
    porque: 'o que o instalador Windows recusa',
    obrigatorio: true,
    padroes: [/nodeMajor\s*-lt\s*(\d+)/g, /needs Node (\d+)\+/g],
  },
  {
    ficheiro: 'landing/public/install.ps1',
    porque: 'a copia que o site serve por irm | iex',
    obrigatorio: true,
    padroes: [/nodeMajor\s*-lt\s*(\d+)/g, /needs Node (\d+)\+/g],
  },
  { ficheiro: 'CONTRIBUTING.md', porque: 'o que se pede a quem contribui', padroes: PADROES_DOC },
  {
    ficheiro: 'README.md',
    porque: 'o requisito publicado a quem instala',
    obrigatorio: true,
    padroes: [...PADROES_DOC, /\bNode\.js (\d+)\+/g],
  },
  {
    ficheiro: 'landing/app/(marketing)/install/page.tsx',
    porque: 'o piso mostrado na pagina publica de instalacao',
    obrigatorio: true,
    padroes: [/verify Claude Code \+ Node (\d+)/g],
  },
  {
    // 2026-08-28 · este dizia `"minNodeVersion": "18.0.0"` enquanto os dois
    // instaladores recusavam Node < 22, e a guarda deu «todos os 13 sitios
    // dizem Node 22+» sem o ver. Ninguem LE este campo (grep por
    // `minNodeVersion` no repo: zero consumidores fora do proprio ficheiro),
    // o que o torna pior e nao melhor: um numero morto que contradiz o
    // instalador nao tem quem o corrija por deixar de funcionar.
    ficheiro: 'tools/router/version.json',
    porque: 'o piso declarado no SSOT da versao, que o site e o CLI servem',
    obrigatorio: true,
    padroes: [/"minNodeVersion":\s*"(\d+)/g],
  },
  {
    ficheiro: 'tools/cli/commands/doctor.js',
    porque: 'o diagnostico que aprova ou recusa o runtime instalado',
    obrigatorio: true,
    padroes: [/check\('Node\.js (\d+)\+'/g, /versionGte\(ver, '(\d+)\.0\.0'\)/g, /need (\d+)\+/g],
  },
  { ficheiro: 'tests/README.md', porque: 'o piso que o guia de testes promete', padroes: PADROES_DOC },
  { ficheiro: 'docs/strategy/MOOTER_OPERATIONS.md', porque: 'o runbook de operacao', padroes: PADROES_DOC },
  { ficheiro: 'docs/strategy/PASTOR_OPERATIONS.md', porque: 'o runbook do Pastor', padroes: PADROES_DOC },
];

/** Pares de ficheiros que TEM de ser byte-a-byte iguais. */
export const PARES = [
  ['install.sh', 'landing/public/install.sh'],
  ['install.ps1', 'landing/public/install.ps1'],
];

const ler = (raiz, f, readImpl) => {
  try { return String(readImpl(path.join(raiz, f), 'utf8')); } catch { return null; }
};

/** O numero verdadeiro. `null` quando nao se consegue ler — e isso e uma falha. */
export function pisoCanonico(raiz, { readImpl = fs.readFileSync } = {}) {
  const src = ler(raiz, CANONICO, readImpl);
  if (src === null) return null;
  try {
    const m = String(JSON.parse(src).engines?.node ?? '').match(/(\d+)/);
    return m ? Number(m[1]) : null;
  } catch { return null; }
}

/**
 * Que numeros cada sitio afirma, e quais discordam do canonico.
 *
 * Tres saidas distintas de proposito: `fora` e o numero errado, `ausentes` e o
 * ficheiro que desapareceu, `semDeclaracao` e o ficheiro que existe mas deixou
 * de afirmar seja o que for — e este ultimo e o mais perigoso, porque parece
 * silencio bom.
 */
export function divergencias(raiz, canonico, { readImpl = fs.readFileSync, sitios = SITIOS } = {}) {
  const fora = []; const ausentes = []; const semDeclaracao = [];
  for (const s of sitios) {
    const src = ler(raiz, s.ficheiro, readImpl);
    if (src === null) { ausentes.push(s.ficheiro); continue; }
    let achou = 0;
    for (const p of s.padroes) {
      // `matchAll` com um regex /g partilhado entre sitios: e preciso reiniciar
      // o lastIndex, senao o segundo ficheiro comeca a meio do primeiro.
      p.lastIndex = 0;
      for (const m of src.matchAll(p)) {
        achou += 1;
        const n = Number(m[1]);
        if (n !== canonico) {
          fora.push({ ficheiro: s.ficheiro, porque: s.porque, diz: n, devia: canonico, trecho: m[0].trim() });
        }
      }
    }
    if (!achou && s.obrigatorio) semDeclaracao.push({ ficheiro: s.ficheiro, porque: s.porque });
  }
  return { fora, ausentes, semDeclaracao };
}

/**
 * O `build.mjs` DERIVA o target, ou voltou a copia-lo?
 *
 * Ignoram-se comentarios `//`, senao a propria explicacao historica desta
 * mudanca ("esta linha dizia --target=node20") seria acusada de ser a mudanca.
 */
export function buildDeriva(raiz, { readImpl = fs.readFileSync } = {}) {
  const src = ler(raiz, 'packages/cli/build.mjs', readImpl);
  if (src === null) return { ok: false, motivo: 'packages/cli/build.mjs ausente' };
  const semComentarios = src.split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
  const fixo = semComentarios.match(/--target=node(\d+)/);
  if (fixo) return { ok: false, motivo: `--target=node${fixo[1]} fixo em vez de derivado do engines` };
  if (!/--target=node\$\{/.test(semComentarios)) {
    return { ok: false, motivo: 'nao se ve o target a ser derivado do engines' };
  }
  return { ok: true, motivo: 'derivado do engines.node' };
}

/** Os pares que tem de ser identicos ainda o sao? */
export function paresDessincronizados(raiz, { readImpl = fs.readFileSync, pares = PARES } = {}) {
  const maus = [];
  for (const [a, b] of pares) {
    const sa = ler(raiz, a, readImpl); const sb = ler(raiz, b, readImpl);
    if (sa === null || sb === null) { maus.push({ a, b, motivo: 'um dos dois nao existe' }); continue; }
    if (sa !== sb) maus.push({ a, b, motivo: 'conteudo diferente' });
  }
  return maus;
}

function principal() {
  const raiz = process.argv[2] || process.env.MOOTER_REPO || process.cwd();
  const canonico = pisoCanonico(raiz);
  if (canonico === null) {
    console.log(`sem piso canonico legivel em ${CANONICO} — n/d`);
    process.exitCode = 1;
    return;
  }
  console.log(`piso canonico: Node ${canonico}+   (${CANONICO} -> engines.node)\n`);

  const { fora, ausentes, semDeclaracao } = divergencias(raiz, canonico);
  const build = buildDeriva(raiz);
  const pares = paresDessincronizados(raiz);

  console.log(`build.mjs: ${build.ok ? 'OK' : 'FALHA'} — ${build.motivo}`);
  console.log(pares.length
    ? `pares dessincronizados: ${pares.map((p) => `${p.a} vs ${p.b} (${p.motivo})`).join(' · ')}`
    : `pares sincronizados: ${PARES.length}/${PARES.length}`);

  if (ausentes.length) console.log(`\nsitios que nao existem: ${ausentes.join(', ')}`);

  if (semDeclaracao.length) {
    console.log('\n⚠️  sitios que deixaram de declarar piso nenhum:');
    for (const s of semDeclaracao) console.log(`     ${s.ficheiro} — ${s.porque}`);
  }

  if (fora.length) {
    console.log('\n⚠️  sitios que afirmam outro piso:');
    for (const d of fora) {
      console.log(`     ${d.ficheiro} diz ${d.diz}, devia dizer ${d.devia}  — ${d.porque}`);
      console.log(`        ${d.trecho}`);
    }
  } else {
    console.log(`\ntodos os ${SITIOS.length - ausentes.length} sitios dizem Node ${canonico}+`);
  }

  if (fora.length || semDeclaracao.length || !build.ok || pares.length) process.exitCode = 1;
}

if (process.argv[1] && process.argv[1].endsWith('piso-de-node.mjs')) principal();
