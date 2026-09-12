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
 * O MANIFESTO (`_handoff/ab-audit/ambito-MANIFESTO.json`) so e escrito em
 * `--manifesto` — o acto de vendorizar — e NUNCA em `--verificar`. O verificador
 * (`ab-vendorizado.mjs`) continua a nao escrever nada: se o verificador soubesse
 * reescrever o manifesto, um ficheiro corrompido produziria um manifesto a
 * concordar com a corrupcao. Escritor unico: este produtor, sob a flag explicita.
 * Leitor: o verificador.
 *
 * Ate 2026-09-11 o manifesto tinha sido escrito UMA vez, a mao, fora do repo. A
 * primeira vez que precisou de mudar (S1 tinha sido varrido em 2d5fd762 e nao no
 * sha que o §1 ancora, 97ad846b — objeccao 1 do adversario ao PR #505) a
 * alternativa era editar um JSON a mao, e um manifesto editado a mao e um numero
 * que ninguem mediu. O `--manifesto` le o HEAD de cada raiz (`git rev-parse`),
 * compara-o com o sha pre-registado, e regista em `substituidos[]` a entrada que
 * substitui — com o porque derivado dos dados, nao escrito por quem regenera.
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
 *       node tools/cockpit/runner/ambito-ab.mjs --manifesto   (escreve as listas E
 *            o ambito-MANIFESTO.json, com o HEAD de cada raiz medido por git)
 */

import { readdirSync, lstatSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * Os sujeitos do §1 do pre-registo. As raizes sao caminhos da maquina do dono e
 * por isso sao SUBSTITUIVEIS (`--raiz-S1 <path>`): fixa-las como unica hipotese
 * tornaria o script incorrivel em qualquer outra maquina, que e o contrario do
 * problema que ele veio resolver.
 *
 * `sha_preregisto` e o commit que o §1 ancora. `--manifesto` LE o HEAD de cada
 * raiz (`git rev-parse HEAD`, leitura pura) e regista se bate; nao mexe na raiz.
 * Uma raiz que ande para a frente e um facto a REGISTAR, nao a corrigir a
 * sorrelfa — e foi exactamente isso que aconteceu a S1 ate 2026-09-11: a raiz
 * era a worktree de trabalho da F0, que andou de 97ad846b para 2d5fd762 no
 * proprio dia da corrida. Passa a ser um checkout destacado em
 * `ab-audit-subjects/mooter` (git worktree, detached @ 97ad846b), ao lado de S2
 * e S3, que sempre viveram ai.
 */
export const SUJEITOS = Object.freeze([
  { id: 'S1', nome: 'mooter', raizPorOmissao: 'C:/Users/Paulo Loureiro/ab-audit-subjects/mooter', sha_preregisto: '97ad846b40d7e1939e02d7b826e4388fe65d60e6' },
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

/**
 * HEAD da raiz de um sujeito, por `git rev-parse HEAD`. Leitura pura. Devolve
 * `null` quando o git nao responde — e `null` e o que vai para o manifesto,
 * nunca o sha pre-registado copiado para o lugar do medido.
 */
export function headDaRaiz(raiz, { execImpl = execFileSync } = {}) {
  try {
    const saida = String(execImpl('git', ['-C', raiz, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })).trim();
    return /^[0-9a-f]{40}$/.test(saida) ? saida : null;
  } catch {
    return null;
  }
}

export const NOME_MANIFESTO = 'ambito-MANIFESTO.json';

/**
 * O manifesto das listas de ambito, calculado dos dados e nao escrito a mao.
 *
 * `anterior` e o manifesto que estava no disco (ou null). Cada sujeito cuja
 * lista muda de sha256 fica registado em `substituidos[]` com a entrada antiga
 * inteira, a data, e um `porque` DERIVADO: se a entrada antiga nao estava no sha
 * pre-registado, o porque e o §10.2; se estava, o porque e "investigar" — uma
 * lista que muda sem o sha mudar e um sinal, nao uma rotina. As entradas
 * antigas de `substituidos[]` sao preservadas (append-only): o manifesto conta a
 * historia toda, nao so a ultima versao.
 *
 * `artefactos_da_corrida_invalidada` lista os ficheiros `braco-a-<id>.INVALIDO-
 * <sha8>.*` presentes no directorio de saida — o nome que a corrida invalidada
 * recebe quando e posta de lado em vez de apagada.
 */
export function construirManifesto({ sujeitos, anterior, agora, nomesNoDirOut = [] }) {
  const substituidos = Array.isArray(anterior && anterior.substituidos) ? anterior.substituidos.slice() : [];
  const entradas = [];
  let totalFicheiros = 0;
  let totalBytes = 0;
  for (const s of sujeitos) {
    const entrada = {
      id: s.id,
      nome: s.nome,
      ficheiro: 'ambito-' + s.id + '.txt',
      raiz: s.raiz,
      sha_preregisto: s.sha_preregisto,
      head_da_raiz_ao_versionar: s.head,
      no_sha_preregistado: s.head === null ? null : s.head === s.sha_preregisto,
      ficheiros_no_ambito: s.ficheiros,
      bytes: s.bytes_lista,
      sha256: s.sha256_lista,
      gerado_em: agora,
    };
    if (s.head === null) entrada.porque_n_d = 'git rev-parse HEAD nao respondeu na raiz; o sha varrido e n/d';
    entradas.push(entrada);
    totalFicheiros += s.ficheiros;
    totalBytes += s.bytes_lista;

    const velha = anterior && Array.isArray(anterior.sujeitos)
      ? anterior.sujeitos.find((v) => v && v.id === s.id) : null;
    if (velha && velha.sha256 !== entrada.sha256) {
      // 8 hex: a forma curta que este repo usa para citar commits (97ad846b, 2d5fd762).
      const head8 = String(velha.head_da_raiz_ao_versionar || '').slice(0, 8);
      const pre8 = String(velha.sha_preregisto || s.sha_preregisto).slice(0, 8);
      const prefixo = 'braco-a-' + s.id + '.INVALIDO-' + head8 + '.';
      substituidos.push({
        ...velha,
        substituido_em: agora,
        substituido_por_sha256: entrada.sha256,
        porque: velha.no_sha_preregistado === false
          ? 'lista gerada em ' + head8 + ', fora do sha pre-registado ' + pre8
            + ' — §10.2 do pre-registo: trocar o sha de um sujeito invalida a corrida.'
            + ' A varredura feita sobre esta lista nao conta; os seus artefactos ficam com o prefixo ' + prefixo
          : 'lista regenerada com sha256 diferente SEM o sha da raiz ter saido do pre-registado — investigar antes de aceitar',
        artefactos_da_corrida_invalidada: nomesNoDirOut.filter((n) => n.startsWith(prefixo)).sort(),
      });
    }
  }
  return {
    regra: 'AB_MOO_AUDIT_PREREGISTO.md §2.2 (branch ab-audit/preregisto)',
    escrito_em: agora,
    produtor: 'tools/cockpit/runner/ambito-ab.mjs --manifesto',
    como_verificar: 'node tools/cockpit/runner/ab-vendorizado.mjs   (bytes)\n'
      + 'node tools/cockpit/runner/ambito-ab.mjs --verificar        (regenera das raizes e compara)',
    sujeitos: entradas,
    totais: { ficheiros_no_ambito: totalFicheiros, bytes_das_listas: totalBytes },
    substituidos,
  };
}

export function principal(argv, {
  out = process.stdout,
  err = process.stderr,
  existsImpl = existsSync,
  readImpl = readFileSync,
  writeImpl = writeFileSync,
  mkdirImpl = mkdirSync,
  readdirImpl = readdirSync,
  calcular = calcularSujeito,
  headImpl = headDaRaiz,
  agora = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
} = {}) {
  const verificar = argv.includes('--verificar');
  const manifesto = argv.includes('--manifesto');
  const dirOut = argValor(argv, '--out')
    || path.resolve(process.cwd(), '_handoff', 'ab-audit');
  if (!verificar) mkdirImpl(dirOut, { recursive: true });

  let falhas = 0;
  let ausentes = 0;
  const calculados = [];
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
    if (manifesto) calculados.push({ ...s, raiz, ...r, head: headImpl(raiz) });

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

  if (manifesto) {
    // Um manifesto com um sujeito a menos e um manifesto que verifica menos do
    // que diz. Sem os tres, nao se escreve.
    if (calculados.length !== SUJEITOS.length) {
      err.write('FALHA  --manifesto exige os ' + SUJEITOS.length + ' sujeitos presentes; ' + calculados.length + ' presente(s). Manifesto NAO escrito.\n');
      return 1;
    }
    const destino = path.join(dirOut, NOME_MANIFESTO);
    let anterior = null;
    if (existsImpl(destino)) {
      try { anterior = JSON.parse(String(readImpl(destino, 'utf8'))); } catch { anterior = null; }
    }
    let nomes = [];
    try { nomes = readdirImpl(dirOut); } catch { nomes = []; }
    const m = construirManifesto({ sujeitos: calculados, anterior, agora: agora(), nomesNoDirOut: nomes });
    writeImpl(destino, JSON.stringify(m, null, 2) + '\n', 'utf8');
    for (const e of m.sujeitos) {
      out.write('manifesto ' + e.id + ' head=' + (e.head_da_raiz_ao_versionar || 'n/d').slice(0, 8)
        + ' pre-registo=' + e.sha_preregisto.slice(0, 8)
        + ' no_sha_preregistado=' + String(e.no_sha_preregistado)
        + ' ficheiros=' + e.ficheiros_no_ambito + '\n');
    }
    for (const v of m.substituidos) {
      out.write('substituido ' + v.id + ' sha256=' + String(v.sha256).slice(0, 12) + '… (' + v.ficheiros_no_ambito + ' ficheiros, head '
        + String(v.head_da_raiz_ao_versionar || 'n/d').slice(0, 8) + ') — ' + v.artefactos_da_corrida_invalidada.length + ' artefacto(s) invalidado(s) no disco\n');
    }
    out.write('escrito ' + destino + '\n');
  }
  return falhas > 0 ? 1 : 0;
}

const invocadoDirectamente = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase().endsWith('ambito-ab.mjs');
if (invocadoDirectamente) {
  process.exitCode = principal(process.argv.slice(2));
}
