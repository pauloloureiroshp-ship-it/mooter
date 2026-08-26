/**
 * ambito-ab.mjs — a lista de ficheiros que os tres bracos do A/B do Moo Audit veem.
 *
 * PORQUE ISTO EXISTE, E PORQUE VIVE DENTRO DO REPO.
 *
 * O pre-registo (`_handoff/AB_MOO_AUDIT_PREREGISTO.md` §2.2, branch
 * `ab-audit/preregisto`) diz, a letra:
 *
 *     "Para cada sujeito, o ambito e o conjunto de ficheiros *.js|mjs|cjs|ts|tsx|jsx
 *      excluindo: node_modules/, .git/, ficheiros de teste (*.test.*, *.spec.*, test/,
 *      tests/, __tests__/), dist/, build/, coverage/, e ficheiros gerados (*.min.js,
 *      *.d.ts).
 *
 *      O ambito e calculado por um unico script e os tres bracos recebem a mesma
 *      lista, gravada em _handoff/ab-audit/ambito-<sujeito>.txt. Braco que veja
 *      outra lista e um braco invalido."
 *
 * Ate 2026-08-26 este script vivia num directorio temporario de sessao
 * (`AppData/Local/Temp/claude/.../scratchpad/`). Ou seja: a frase "um unico
 * script" era verdade durante uma tarde e mentira no dia seguinte — ninguem fora
 * daquela sessao o podia correr, e "braco que veja outra lista e invalido" nao
 * era verificavel por ninguem porque nao havia lista versionada com que comparar.
 * Trazer o produtor E as listas para dentro do repo e o que torna a frase do §2.2
 * uma afirmacao testavel em vez de uma intencao.
 *
 * O QUE ESTE FICHEIRO NAO FAZ. Nao escreve o manifesto das listas versionadas.
 * O manifesto (`_handoff/ab-audit/ambito-MANIFESTO.json`) foi escrito UMA VEZ, no
 * acto de versionar, e a partir dai so se VERIFICA (`ab-vendorizado.mjs`). Se este
 * script pudesse reescrever o manifesto, um ficheiro corrompido produziria um
 * manifesto a concordar com a corrupcao — o guarda validaria a propria falha.
 * Escritor unico: o acto de vendorizar. Leitor: o verificador.
 *
 * DETERMINISMO — as escolhas, e o que cada uma paga.
 *
 *   * ordenacao por code-unit UTF-16 (comparacao `<` de JS), NUNCA `localeCompare`:
 *     `localeCompare` depende do locale do SO, e a lista mudaria entre a maquina do
 *     dono e a de quem tenta reproduzir;
 *   * entradas de cada directorio ordenadas ANTES de descer: a ordem do `readdir`
 *     e do sistema de ficheiros, nao do programa;
 *   * separador normalizado para "/" em qualquer SO;
 *   * caminhos relativos a raiz do sujeito — um caminho absoluto levaria colado o
 *     nome do utilizador e o nome da worktree, e deixaria de ser comparavel entre
 *     maquinas (o mesmo erro que o `check_id` do semgrep faz quando se o invoca de
 *     fora do directorio das regras);
 *   * symlinks NAO sao seguidos: evita ciclos e travessia dependente do SO;
 *   * contagem de linhas com semantica `wc -l` (numero de bytes 0x0a) — a mesma que
 *     o §1 do pre-registo usou.
 *
 * Uso:  node tools/cockpit/runner/ambito-ab.mjs [--out <dir>] [--raiz-S1 <path>] ...
 *       node tools/cockpit/runner/ambito-ab.mjs --verificar   (nao escreve nada;
 *            regenera em memoria e compara com as listas versionadas)
 */

import { readdirSync, lstatSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

/**
 * Os sujeitos do §1 do pre-registo. As raizes sao caminhos da maquina do dono e
 * por isso sao SUBSTITUIVEIS (`--raiz-S1 <path>`): fixa-las como unica hipotese
 * tornaria o script incorrivel em qualquer outra maquina, que e o contrario do
 * problema que ele veio resolver.
 *
 * `sha_preregisto` e o commit que o §1 ancora. NAO e verificado aqui: verificar
 * exigiria mexer na worktree do sujeito, e uma worktree que anda para a frente
 * (a de S1 andou duas vezes no mesmo dia) e um facto a REGISTAR, nao a corrigir
 * a sorrelfa.
 */
export const SUJEITOS = Object.freeze([
  { id: 'S1', nome: 'mooter', raizPorOmissao: 'C:/Users/Paulo Loureiro/frugal-ab-audit', sha_preregisto: '97ad846b40d7e1939e02d7b826e4388fe65d60e6' },
  { id: 'S2', nome: 'fastify', raizPorOmissao: 'C:/Users/Paulo Loureiro/ab-audit-subjects/fastify', sha_preregisto: '1beaf7e72d24b2fc63a02a7f5806772a00e45454' },
  { id: 'S3', nome: 'hono', raizPorOmissao: 'C:/Users/Paulo Loureiro/ab-audit-subjects/hono', sha_preregisto: '06880c4a2b04de9dd74217f26dd831209b9c01f1' },
]);

/** §2.2: as extensoes que entram. Minusculas — a comparacao normaliza. */
export const EXT_INCLUIDAS = Object.freeze(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);

/**
 * §2.2: directorios excluidos, a qualquer profundidade.
 *
 * NOTA DE FIDELIDADE, deliberada: o §2.2 nomeia SO `.git/` entre os
 * directorios-ponto. Nao exclui `.github/`, `.claude/`, `.planning/`. Este script
 * segue a letra e mantem-nos no ambito — e por isso que a lista de S1 abre em
 * `.claude/skills/...`. Alargar esta lista seria alterar o ambito depois de
 * escrito, que o §10 do pre-registo proibe.
 */
export const DIRS_EXCLUIDOS = Object.freeze([
  'node_modules', '.git',
  'test', 'tests', '__tests__',
  'dist', 'build', 'coverage',
]);

const EXT_SET = new Set(EXT_INCLUIDAS);
const DIRS_SET = new Set(DIRS_EXCLUIDOS);

/** §2.2: ficheiros de teste (`*.test.*`, `*.spec.*`) e gerados (`*.min.js`, `*.d.ts`). */
export function ficheiroExcluidoPeloNome(base) {
  if (base.includes('.test.') || base.includes('.spec.')) return true;
  if (base.endsWith('.min.js')) return true;
  if (base.endsWith('.d.ts')) return true;
  return false;
}

/** §2.2: a extensao entra? */
export function extensaoIncluida(base) {
  return EXT_SET.has(path.extname(base).toLowerCase());
}

/**
 * Travessia determinista. O IO e injectavel para que o teste possa exercer arvores
 * sinteticas sem depender de os sujeitos existirem na maquina — em CI nao existem,
 * e um teste que so corre na maquina do dono nao prova nada a mais ninguem.
 */
export function recolher(raiz, {
  readdirImpl = readdirSync,
  lstatImpl = lstatSync,
  avisar = (m) => process.stderr.write(m),
} = {}) {
  const encontrados = [];
  const pilha = ['']; // caminhos relativos; '' = raiz
  while (pilha.length > 0) {
    const rel = pilha.pop();
    const abs = rel === '' ? raiz : path.join(raiz, rel);
    let entradas;
    try {
      entradas = readdirImpl(abs, { withFileTypes: true });
    } catch (err) {
      // Um directorio ilegivel e um FACTO, nao um silencio. Uma lista que encolhe
      // sem dizer porque e a maneira mais barata de um braco acabar a ver "outra
      // lista" sem ninguem dar por isso.
      avisar('AVISO  readdir falhou em ' + abs + ': ' + (err && err.code) + '\n');
      continue;
    }
    entradas.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entradas) {
      const filhoRel = rel === '' ? e.name : rel + '/' + e.name;
      const filhoAbs = path.join(raiz, filhoRel);
      let st;
      try { st = lstatImpl(filhoAbs); } catch { continue; }
      if (st.isSymbolicLink()) continue;
      if (st.isDirectory()) {
        if (DIRS_SET.has(e.name)) continue;
        pilha.push(filhoRel);
      } else if (st.isFile()) {
        if (!extensaoIncluida(e.name)) continue;
        if (ficheiroExcluidoPeloNome(e.name)) continue;
        encontrados.push(filhoRel);
      }
    }
  }
  encontrados.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return encontrados;
}

/**
 * O corpo do ficheiro de lista: um caminho por linha, terminador final, e nada
 * mais. Isolado numa funcao porque e ELE que e hasheado — se o formato mudar num
 * sitio e nao no outro, o sha deixa de significar o que diz que significa.
 */
export function corpoDaLista(lista) {
  return lista.length ? lista.join('\n') + '\n' : '';
}

export function sha256(texto) {
  return createHash('sha256').update(texto, 'utf8').digest('hex');
}

/** Semantica `wc -l`: numero de bytes 0x0a. Nao "linhas nao vazias", nao "linhas logicas". */
export function contarLinhas(buf) {
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (buf[i] === 0x0a) n++;
  return n;
}

/**
 * Calcula um sujeito por inteiro: lista + metricas + sha.
 * Nao escreve nada — quem escreve e o CLI, e so o CLI.
 */
export function calcularSujeito(raiz, {
  readdirImpl, lstatImpl, avisar,
  readImpl = readFileSync,
  medir = true,
} = {}) {
  const lista = recolher(raiz, { readdirImpl, lstatImpl, avisar });
  const corpo = corpoDaLista(lista);
  const resultado = {
    ficheiros: lista.length,
    lista,
    corpo,
    sha256_lista: sha256(corpo),
    bytes_lista: Buffer.byteLength(corpo, 'utf8'),
  };
  if (!medir) return resultado;

  let linhas = 0;
  let bytes = 0;
  const porFicheiro = [];
  for (const rel of lista) {
    const buf = readImpl(path.join(raiz, rel));
    const l = contarLinhas(buf);
    linhas += l;
    bytes += buf.length;
    porFicheiro.push({ rel, linhas: l, bytes: buf.length });
  }
  resultado.linhas = linhas;
  resultado.bytes = bytes;
  // Desempate pelo caminho: sem ele, dois ficheiros com o mesmo numero de linhas
  // trocariam de lugar consoante a ordem de leitura, e o manifesto deixaria de
  // ser reproduzivel por uma razao que ninguem iria procurar.
  resultado.tres_maiores = porFicheiro
    .slice()
    .sort((a, b) => (b.linhas - a.linhas) || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))
    .slice(0, 3);
  return resultado;
}

// ─────────────────────────────────────────────────────────────────────── CLI

function argValor(argv, flag) {
  const i = argv.indexOf(flag);
  return (i !== -1 && argv[i + 1]) ? argv[i + 1] : null;
}

export function principal(argv, {
  out = process.stdout,
  err = process.stderr,
  existsImpl = existsSync,
  readImpl = readFileSync,
  writeImpl = writeFileSync,
  mkdirImpl = mkdirSync,
  calcular = calcularSujeito,
} = {}) {
  const verificar = argv.includes('--verificar');
  const dirOut = argValor(argv, '--out')
    || path.resolve(process.cwd(), '_handoff', 'ab-audit');
  if (!verificar) mkdirImpl(dirOut, { recursive: true });

  let falhas = 0;
  let ausentes = 0;
  for (const s of SUJEITOS) {
    const raiz = argValor(argv, '--raiz-' + s.id) || s.raizPorOmissao;
    if (!existsImpl(raiz)) {
      // Raiz ausente NAO e falha do script: e a maquina a nao ter o sujeito.
      // Chamar-lhe "erro" ensinaria toda a gente a ignorar o vermelho.
      err.write('n/d    ' + s.id + ' (' + s.nome + '): raiz inexistente nesta maquina — ' + raiz + '\n');
      ausentes++;
      continue;
    }
    const r = calcular(raiz);
    const destino = path.join(dirOut, 'ambito-' + s.id + '.txt');

    if (verificar) {
      const noDisco = existsImpl(destino) ? String(readImpl(destino, 'utf8')) : null;
      if (noDisco === null) {
        err.write('FALHA  ' + s.id + ': ' + destino + ' nao existe\n');
        falhas++;
      } else if (noDisco !== r.corpo) {
        err.write('FALHA  ' + s.id + ': a lista versionada difere da que a raiz produz agora\n'
          + '       versionada  sha256=' + sha256(noDisco) + '  ficheiros=' + (noDisco.match(/\n/g) || []).length + '\n'
          + '       regenerada  sha256=' + r.sha256_lista + '  ficheiros=' + r.ficheiros + '\n'
          + '       raiz=' + raiz + '\n');
        falhas++;
      } else {
        out.write('OK     ' + s.id + ' ' + s.nome.padEnd(8) + ' ' + r.sha256_lista + '\n');
      }
      continue;
    }

    writeImpl(destino, r.corpo, 'utf8');
    out.write(s.id + ' ' + s.nome.padEnd(8)
      + ' ficheiros=' + String(r.ficheiros).padStart(5)
      + '  linhas=' + String(r.linhas).padStart(7)
      + '  sha256=' + r.sha256_lista + '\n');
    for (const m of (r.tres_maiores || [])) {
      out.write('      maior: ' + String(m.linhas).padStart(6) + ' linhas  ' + m.rel + '\n');
    }
  }

  if (ausentes > 0) {
    err.write('n/d    ' + ausentes + ' sujeito(s) ausente(s) nesta maquina: nada foi afirmado sobre eles.\n');
  }
  return falhas > 0 ? 1 : 0;
}

const invocadoDirectamente = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase().endsWith('ambito-ab.mjs');
if (invocadoDirectamente) {
  process.exitCode = principal(process.argv.slice(2));
}
