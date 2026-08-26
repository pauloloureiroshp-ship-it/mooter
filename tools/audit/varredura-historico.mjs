/**
 * varredura-historico.mjs — a mesma bateria de segredos, mas sobre TODO o
 * historico do git, nao sobre a arvore de hoje.
 *
 * ── PORQUE E QUE ISTO NAO E O `varredura-segredos.mjs` ──────────────────────
 *
 * O `varredura-segredos.mjs` varre `git ls-files`, e o cabecalho dele diz-o com
 * todas as letras: *"varre o que o git segue"*. O que ele varre e a arvore de
 * **HEAD**. Um segredo commitado a 12 de Abril e apagado a 13 desaparece dessa
 * varredura no dia 13 — e continua no historico para sempre, clonavel por
 * qualquer pessoa, num repositorio que e **publico**.
 *
 * `git log -p | grep` nao serve como substituto por duas razoes mecanicas: um
 * blob que sobrevive 400 commits e lido 400 vezes, e um `grep` sobre o diff nao
 * ve o ficheiro inteiro, so as linhas que mudaram. Aqui varre-se cada **blob
 * distinto** exactamente uma vez, com o conteudo completo.
 *
 * ── O QUE ESTA FERRAMENTA NAO FAZ ───────────────────────────────────────────
 *
 * NAO escreve um detector novo. Importa o mesmo `scanSecrets` e a mesma tabela
 * de `severidade()`/`motivoDeDummy()` que o `varredura-segredos.mjs` ja usa. Um
 * segundo conjunto de regras seria uma segunda verdade a divergir da primeira no
 * primeiro mes — e a primeira coisa que divergiria era a lista de dummies.
 *
 * NAO reescreve historico, NAO revoga nada, NAO apaga nada. Le e conta. A
 * decisao de reescrever historico e do dono e e irreversivel para quem ja
 * clonou; uma ferramenta que a tomasse sozinha seria pior do que o problema.
 *
 * NAO afirma cobertura que nao tem: o que salta (binario, grande demais,
 * ilegivel) e contado e impresso. Uma varredura que nao diz o que nao olhou e
 * uma varredura que finge.
 *
 * ── PUBLICO vs LOCAL ────────────────────────────────────────────────────────
 *
 * `--refs all` (por omissao) ve tudo o que qualquer ref alcanca, incluindo
 * branches locais que nunca foram empurradas. `--refs origin` ve so o que esta
 * mesmo em `origin` — que e o que esta mesmo no mundo. Os dois numeros
 * interessam e sao diferentes: o primeiro e o risco, o segundo e o incidente.
 *
 * Uso:
 *   node tools/audit/varredura-historico.mjs                # refs=all
 *   node tools/audit/varredura-historico.mjs --refs origin  # so o que foi empurrado
 *   node tools/audit/varredura-historico.mjs --json
 *   node tools/audit/varredura-historico.mjs --repo <dir>
 *
 * Saida: 0 = sem HIGH. 1 = ha HIGH (parar e reportar). 2 = a varredura falhou.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { motivoDeDummy, severidade } from './varredura-segredos.mjs';

const require_ = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ_PADRAO = path.resolve(AQUI, '..', '..');

/** Igual ao da varredura da arvore, de proposito: os dois corpora saltam o mesmo. */
const EXT_BINARIA = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.gz', '.tgz',
  '.woff', '.woff2', '.ttf', '.eot', '.mp4', '.mp3', '.wav', '.bin', '.exe', '.dll',
  '.node', '.wasm', '.jar', '.class', '.so', '.dylib', '.7z', '.rar', '.psd',
]);
const MAX_BYTES = 2 * 1024 * 1024;

/** Quantos blobs por invocacao do `git cat-file --batch`. */
export const LOTE = 400;

function carregarDetector(raizRepo) {
  const p = path.join(raizRepo, 'packages', 'vscode-extension', 'src', 'lp-secret-scan.js');
  if (!fs.existsSync(p)) {
    throw new Error(`detector nao encontrado em ${p} — a varredura nao corre sem ele, e nao inventa um substituto`);
  }
  return require_(p);
}

/**
 * A allowlist por BLOB. Um blob e conteudo imutavel: declarar um blob nunca cega
 * o detector para outro conteudo — ao contrario de allowlistar um CAMINHO (passa
 * a valer para tudo o que la for escrito amanha) ou um VALOR (passa a valer em
 * todo o repo, e um dos fixtures existe precisamente para provar que um AKIA
 * desconhecido continua HIGH; allowlistar o valor partiria esse teste).
 *
 * Uma entrada SEM motivo escrito e recusada. Uma allowlist silenciosa seria a
 * forma mais limpa de esconder uma fuga, e por isso o numero de blobs declarados
 * — e o motivo de cada um — sai sempre no relatorio.
 */
export function lerDeclarados(caminho, { readImpl = fs.readFileSync } = {}) {
  let bruto;
  try {
    bruto = readImpl(caminho, 'utf8');
  } catch {
    return { mapa: new Map(), recusadas: [] };
  }
  let j;
  try {
    j = JSON.parse(String(bruto));
  } catch {
    // Uma allowlist ilegivel nao pode ser tratada como allowlist vazia em
    // silencio: vazia e um estado legitimo, partida e um erro que alguem tem de
    // ver. Devolve vazia E diz que estava partida.
    return { mapa: new Map(), recusadas: [{ blob: '(ficheiro)', porque: 'JSON invalido' }] };
  }
  const mapa = new Map();
  const recusadas = [];
  for (const [blob, motivo] of Object.entries((j && j.declarados) || {})) {
    if (!/^[0-9a-f]{40}$/.test(blob)) { recusadas.push({ blob, porque: 'nao e um sha de blob' }); continue; }
    if (typeof motivo !== 'string' || motivo.trim().length < 20) {
      recusadas.push({ blob, porque: 'motivo ausente ou curto demais' });
      continue;
    }
    mapa.set(blob, motivo.trim());
  }
  return { mapa, recusadas };
}

/**
 * Um clone shallow nao tem historico — tem a ponta.
 *
 * `actions/checkout@v4` clona com `fetch-depth: 1` por omissao. Correr esta
 * varredura sobre esse clone devolveria `HIGH 0` num tom perfeitamente calmo, e
 * esse zero seria uma mentira: nao ha nada para tras para encontrar. Um guarda
 * que responde "limpo" quando nao olhou para nada e pior do que guarda nenhum,
 * porque toda a gente passa a confiar nele.
 *
 * Por isso isto rebenta em vez de responder.
 */
export function eShallow(dir, { runImpl = execFileSync } = {}) {
  try {
    const out = String(runImpl('git', ['rev-parse', '--is-shallow-repository'], {
      cwd: dir, encoding: 'utf8', windowsHide: true,
    }) || '').trim();
    return out === 'true';
  } catch {
    return false;
  }
}

/**
 * Todos os blobs alcancaveis, com os caminhos por onde ja apareceram.
 *
 * `git rev-list --objects` imprime `<sha> <caminho>` para blobs e arvores, e
 * `<sha>` sozinho para commits. O MESMO blob aparece uma vez por cada
 * (caminho, arvore) onde vive: e por isso que se agrupa por sha e se guarda o
 * conjunto de caminhos — varrer o conteudo uma vez, reportar todos os sitios.
 */
export function blobsAlcancaveis(dir, { refs = 'all', runImpl = execFileSync } = {}) {
  const seletor = refs === 'origin' ? ['--remotes=origin'] : ['--all'];
  const bruto = String(runImpl('git', ['rev-list', '--objects', ...seletor], {
    cwd: dir, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, windowsHide: true,
  }) || '');
  const porSha = new Map();
  for (const linha of bruto.split('\n')) {
    if (!linha) continue;
    const esp = linha.indexOf(' ');
    if (esp < 0) continue; // commit: sem caminho
    const sha = linha.slice(0, esp);
    const caminho = linha.slice(esp + 1);
    if (!caminho) continue;
    let e = porSha.get(sha);
    if (!e) { e = { sha, caminhos: new Set() }; porSha.set(sha, e); }
    e.caminhos.add(caminho);
  }
  return porSha;
}

/**
 * Parte a saida do `git cat-file --batch`, que e binaria e nao delimitada por
 * linhas: `<sha> <tipo> <tamanho>\n<conteudo>\n`. O `tamanho` e a UNICA forma
 * fiavel de saber onde o conteudo acaba — um blob pode conter `\n` e pode
 * conter uma linha que se parece com um cabecalho.
 */
export function parseBatch(buf) {
  const out = [];
  let i = 0;
  while (i < buf.length) {
    const nl = buf.indexOf(0x0a, i);
    if (nl < 0) break;
    const cabecalho = buf.slice(i, nl).toString('utf8');
    const partes = cabecalho.split(' ');
    if (partes.length < 3) { i = nl + 1; continue; } // "<sha> missing"
    const [sha, tipo] = partes;
    const tamanho = Number(partes[2]);
    if (!Number.isFinite(tamanho) || tamanho < 0) { i = nl + 1; continue; }
    const inicio = nl + 1;
    out.push({ sha, tipo, tamanho, conteudo: buf.slice(inicio, inicio + tamanho) });
    i = inicio + tamanho + 1; // o \n a seguir ao conteudo
  }
  return out;
}

/** Le um lote de blobs. Devolve [] se o git falhar — um lote perdido e contado, nao mata a corrida. */
export function lerLote(dir, shas, { runImpl = execFileSync } = {}) {
  if (!shas.length) return [];
  const buf = runImpl('git', ['cat-file', '--batch'], {
    cwd: dir, input: shas.join('\n') + '\n', maxBuffer: 512 * 1024 * 1024, windowsHide: true,
  });
  return parseBatch(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8'));
}

/**
 * Onde e que este blob entrou. So se chama para blobs COM achados — e um
 * `git log` por blob, e correr isto para 30 000 blobs demoraria mais do que a
 * varredura inteira para responder a uma pergunta que so interessa quando ha
 * alguma coisa.
 */
export function commitsQueTocam(dir, blobSha, { runImpl = execFileSync, limite = 3 } = {}) {
  try {
    const out = String(runImpl('git', [
      'log', '--all', '--format=%H|%cI|%an', '--find-object=' + blobSha, '--max-count=' + limite,
    ], { cwd: dir, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, windowsHide: true }) || '');
    return out.split('\n').filter(Boolean).map((l) => {
      const [sha, data, autor] = l.split('|');
      return { commit: sha, data, autor };
    });
  } catch {
    return [];
  }
}

/**
 * A varredura. Corpus fixo: este repo, publico — a severidade e a de um repo
 * publico porque e isso que ele e, e um segredo no historico de um repo publico
 * ja saiu da maquina por definicao.
 */
export function varrerHistorico({
  dir, refs = 'all', detector, lote = LOTE, declarados = new Map(),
  listaImpl = blobsAlcancaveis, loteImpl = lerLote, commitsImpl = commitsQueTocam,
  shallowImpl = eShallow,
} = {}) {
  if (shallowImpl(dir, {})) {
    return {
      erro: 'clone SHALLOW: nao ha historico para varrer. `git fetch --unshallow` (ou `fetch-depth: 0` no checkout do CI) antes de correr isto — um "HIGH 0" sobre a ponta seria uma mentira calma.',
      achados: [], blobs: 0, lidos: 0,
      saltados: { binarios: 0, grandes: 0, ilegiveis: 0, naoBlob: 0 },
      refs,
    };
  }
  const corpus = { nome: 'repo-historico', publico: true, dir };
  const saltados = { binarios: 0, grandes: 0, ilegiveis: 0, naoBlob: 0 };
  const achados = [];
  let porSha;
  try {
    porSha = listaImpl(dir, { refs });
  } catch (e) {
    return { erro: `git rev-list falhou: ${String(e && e.message).slice(0, 160)}`, achados: [], blobs: 0, lidos: 0, saltados, refs };
  }

  // Candidatos: exclui extensoes binarias antes de sequer pedir o conteudo ao git.
  const candidatos = [];
  for (const [sha, e] of porSha) {
    const algumTexto = [...e.caminhos].some((c) => !EXT_BINARIA.has(path.extname(c).toLowerCase()));
    if (!algumTexto) { saltados.binarios += 1; continue; }
    candidatos.push(sha);
  }

  let lidos = 0;
  for (let i = 0; i < candidatos.length; i += lote) {
    const fatia = candidatos.slice(i, i + lote);
    let objs;
    try {
      objs = loteImpl(dir, fatia, {});
    } catch {
      saltados.ilegiveis += fatia.length;
      continue;
    }
    for (const o of objs) {
      if (o.tipo !== 'blob') { saltados.naoBlob += 1; continue; }
      if (o.tamanho > MAX_BYTES) { saltados.grandes += 1; continue; }
      // Um NUL diz binario melhor do que qualquer lista de extensoes.
      if (o.conteudo.includes(0)) { saltados.binarios += 1; continue; }
      const texto = o.conteudo.toString('utf8');
      lidos += 1;
      const caminhos = [...(porSha.get(o.sha)?.caminhos || [])];
      const rel = caminhos[0] || o.sha;
      for (const a of detector.scanSecrets([{ path: rel, content: texto }])) {
        const dummy = motivoDeDummy(a, texto);
        const declarado = declarados.get(o.sha) || null;
        const nivelBruto = severidade(a, corpus, dummy);
        achados.push({
          ...a,
          blob: o.sha,
          caminhos,
          corpus: corpus.nome,
          dummy,
          declarado,
          nivel_bruto: nivelBruto,
          // Um blob declarado desce a INFO, mas o nivel bruto fica no registo: o
          // relatorio tem de poder dizer "isto SERIA HIGH e foi declarado porque X".
          nivel: declarado ? 'INFO' : nivelBruto,
        });
      }
    }
  }

  // So agora, e so para o que DECIDE, se pergunta ao git QUANDO isto entrou.
  //
  // `git log --all --find-object` percorre os 2478 commits do repo por cada blob
  // que se lhe da. A primeira versao chamava-o para HIGH **e** LOW: a corrida
  // passou dos 8 minutos sem acabar, porque o LOW e abundante por construcao
  // (heuristica em repo publico). E proveniencia que ninguem le para decidir
  // nada — o que decide e o HIGH. Os LOW ficam com `commits: null`, e o campo
  // `proveniencia_omitida` diz quantos, para nao parecer cobertura.
  const comProveniencia = achados.filter((a) => a.nivel === 'HIGH');
  for (const a of comProveniencia) a.commits = commitsImpl(dir, a.blob, {});
  const proveniencia_omitida = achados.filter((a) => a.nivel === 'LOW').length;

  const conta = (n) => achados.filter((a) => a.nivel === n).length;
  return {
    erro: null,
    refs,
    blobs: porSha.size,
    candidatos: candidatos.length,
    lidos,
    saltados,
    achados,
    proveniencia_omitida,
    declarados: achados.filter((a) => a.declarado).length,
    resumo: { HIGH: conta('HIGH'), LOW: conta('LOW'), INFO: conta('INFO') },
  };
}

const ORDEM = { HIGH: 0, LOW: 1, INFO: 2 };

export function imprimir(r) {
  if (r.erro) {
    console.error('varredura FALHOU:', r.erro);
    return 2;
  }
  console.log(`refs=${r.refs} · blobs alcancaveis ${r.blobs} · candidatos ${r.candidatos} · lidos ${r.lidos}`);
  console.log(`saltados: ${r.saltados.binarios} binarios · ${r.saltados.grandes} grandes · ${r.saltados.ilegiveis} ilegiveis · ${r.saltados.naoBlob} nao-blob`);
  const ord = [...r.achados].sort((a, b) => ORDEM[a.nivel] - ORDEM[b.nivel]);
  for (const a of ord) {
    if (a.nivel === 'INFO') continue;
    const onde = a.caminhos.slice(0, 2).join(' , ') + (a.caminhos.length > 2 ? ` (+${a.caminhos.length - 2})` : '');
    const quando = (a.commits && a.commits[0]) ? ` · entrou em ${a.commits[0].commit.slice(0, 8)} ${String(a.commits[0].data).slice(0, 10)}` : '';
    console.log(`[${a.nivel}] ${a.type} · blob ${a.blob.slice(0, 8)} · ${onde}:${a.line}${quando}`);
  }
  // Uma allowlist que nao se ve e uma allowlist que se pode abusar. O que foi
  // descido de nivel sai sempre, com o nivel que TERIA e o motivo escrito.
  const decl = r.achados.filter((a) => a.declarado);
  if (decl.length) {
    console.log('\nblobs DECLARADOS (desceram a INFO por motivo escrito em tools/audit/blobs-declarados.json):');
    const porBlob = new Map();
    for (const a of decl) {
      if (!porBlob.has(a.blob)) porBlob.set(a.blob, { n: 0, motivo: a.declarado, brutos: new Set() });
      const e = porBlob.get(a.blob);
      e.n += 1;
      e.brutos.add(a.nivel_bruto);
    }
    for (const [blob, e] of porBlob) {
      console.log(`  ${blob.slice(0, 8)} · ${e.n} achados (seriam ${[...e.brutos].sort().join('/')}) · ${e.motivo.slice(0, 100)}…`);
      console.log(`     verificar com: git cat-file -p ${blob}`);
    }
  }
  if (r.recusadas && r.recusadas.length) {
    console.log('\nentradas RECUSADAS na allowlist (nao valem nada — corrigir ou remover):');
    for (const x of r.recusadas) console.log(`  ${x.blob} · ${x.porque}`);
  }
  console.log(`\nHIGH ${r.resumo.HIGH} · LOW ${r.resumo.LOW} · INFO ${r.resumo.INFO} (INFO = dummy ou blob declarado)`);
  if (r.resumo.HIGH > 0) {
    console.log('\nHIGH no historico: PARAR e reportar ao dono.');
    console.log('Revogar PRIMEIRO. Reescrever historico nao desfaz um clone que ja aconteceu.');
    return 1;
  }
  return 0;
}

function principal(argv) {
  const iRepo = argv.indexOf('--repo');
  const dir = iRepo >= 0 ? argv[iRepo + 1] : RAIZ_PADRAO;
  const iRefs = argv.indexOf('--refs');
  const refs = iRefs >= 0 ? argv[iRefs + 1] : 'all';
  let detector;
  try {
    detector = carregarDetector(dir);
  } catch (e) {
    console.error(String(e.message));
    return 2;
  }
  const cam = path.join(dir, 'tools', 'audit', 'blobs-declarados.json');
  const { mapa: declarados, recusadas } = lerDeclarados(cam);
  const r = varrerHistorico({ dir, refs, detector, declarados });
  r.recusadas = recusadas;
  if (argv.includes('--json')) {
    // Nunca se imprime o segredo: o detector ja redige, e o que sai daqui pode
    // acabar num log de CI publico.
    console.log(JSON.stringify(r, (k, v) => (v instanceof Set ? [...v] : v), 2));
    return r.erro ? 2 : (r.resumo.HIGH > 0 ? 1 : 0);
  }
  return imprimir(r);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(principal(process.argv.slice(2)));
}
