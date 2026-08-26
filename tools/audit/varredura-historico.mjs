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
 * Tres ambitos, e a diferenca entre eles e a diferenca entre tres perguntas:
 *
 *   `--refs origin`  o que esta MESMO no mundo (clonavel por qualquer pessoa)
 *   `--refs all`     + branches locais que nunca foram empurradas — o risco
 *   `--refs todos`   + objectos SOLTOS (rebases, amends, branches apagadas).
 *                    Nao sao clonaveis por ninguem, mas respondem a "isto
 *                    alguma vez existiu nesta maquina?". Medido a 2026-08-26:
 *                    1 571 blobs e 242 commits fora do alcance de `--all`.
 *
 * Em qualquer ambito lem-se tambem as MENSAGENS de commit e de tag. Um token
 * colado numa mensagem de commit e tao publico como um token num ficheiro, e a
 * primeira versao desta ferramenta nunca olhou para nenhuma.
 *
 * Uso:
 *   node tools/audit/varredura-historico.mjs                # refs=all
 *   node tools/audit/varredura-historico.mjs --refs origin  # so o que foi empurrado
 *   node tools/audit/varredura-historico.mjs --refs todos   # + objectos soltos
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

/** Tecto de `git log --find-object`: cada um percorre o historico todo. */
export const MAX_PROVENIENCIA = 40;

/**
 * O caminho que se usa quando um objecto nao tem nenhum (objectos soltos).
 *
 * ── PORQUE E NEUTRO, E NAO SENSIVEL ─────────────────────────────────────────
 *
 * O adversario apontou que passar o SHA ao detector fazia a severidade descer
 * por ignorancia, e tinha razao **na direccao**. A primeira correccao foi usar
 * um caminho que batesse `isSensitivePath()` — falhar fechado. O resultado
 * medido: 101 achados HIGH em `--refs todos`, **os 101 da mesma classe
 * heuristica** (`generic-secret-assignment`), elevados so por nao se saber
 * onde o blob esteve. Um guarda que grita 101 vezes por ignorancia ensina toda
 * a gente a ignora-lo — e a ignorar tambem o 102.º, que podia ser a serio.
 *
 * O que resolve a questao e ler o detector (`lp-secret-scan.js:22-29,133,161`):
 *
 *   · as chaves com FORMA DE FORNECEDOR — `AKIA`, `ghp_`, `sk_live_`,
 *     `sk-ant-`, PEM — sao `critical` **independentemente do caminho**;
 *   · `isSensitivePath()` so ELEVA a heuristica generica (`nome = valor`).
 *
 * Ou seja: uma credencial a serio num `.env` que um rebase apagou continua
 * critica sem sentinela nenhuma. A sentinela nao protegia o que interessa —
 * so inflacionava o que ja se sabia ser ruido.
 *
 * Logo: caminho neutro, e a incerteza vai para o relatorio em vez de ir para a
 * severidade. O que nao se sabe diz-se; nao se converte num numero.
 */
export const CAMINHO_DESCONHECIDO = '(objecto solto — caminho desconhecido)';

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
  for (const [blob, e] of Object.entries((j && j.declarados) || {})) {
    if (!/^[0-9a-f]{40}$/.test(blob)) { recusadas.push({ blob, porque: 'nao e um sha de blob' }); continue; }
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      recusadas.push({ blob, porque: 'entrada tem de ser um objecto com motivo, tipos e n' });
      continue;
    }
    if (typeof e.motivo !== 'string' || e.motivo.trim().length < 20) {
      recusadas.push({ blob, porque: 'motivo ausente ou curto demais' });
      continue;
    }
    if (!Array.isArray(e.tipos) || e.tipos.length === 0 || !e.tipos.every((x) => typeof x === 'string' && x)) {
      recusadas.push({ blob, porque: 'tipos ausentes — declarar sem dizer O QUE se declara nao vale' });
      continue;
    }
    if (!Number.isInteger(e.n) || e.n < 1) {
      recusadas.push({ blob, porque: 'n ausente ou invalido' });
      continue;
    }
    mapa.set(blob, {
      motivo: e.motivo.trim(),
      tipos: [...e.tipos].sort(),
      n: e.n,
      // Opcional: uma declaracao sem `niveis` continua a valer, mas nao protege
      // contra uma mudanca futura na tabela de severidade.
      niveis: Array.isArray(e.niveis) ? [...e.niveis].sort() : null,
    });
  }
  return { mapa, recusadas };
}

/**
 * Uma declaracao so vale se descrever o que esta la.
 *
 * Uma allowlist e sempre abusavel — o adversario descreveu o caminho mais curto:
 * commitar a credencial, `git hash-object`, e escrever no JSON qualquer mentira
 * de vinte caracteres. Isso NAO se elimina com codigo: elimina-se com revisao.
 * O que o codigo pode fazer e **encarecer a mentira**, obrigando-a a ser
 * especifica.
 *
 * Com `tipos` e `n` obrigatorios, quem quiser esconder uma chave da Anthropic
 * tem de escrever `"tipos": ["anthropic-api-key"], "n": 1` na mesma linha em que
 * escreve "e um fixture". Fica no diff, ao lado da frase que o contradiz. Uma
 * declaracao vaga passava despercebida; esta tem de ser lida para ser escrita.
 *
 * E se a forma nao bater, a declaracao NAO se aplica — o achado fica com o nivel
 * que tinha, e a discrepancia e reportada.
 */
export function declaracaoBate(decl, achadosDoBlob) {
  if (!decl) return { bate: false, porque: null };
  const tipos = [...new Set(achadosDoBlob.map((a) => String(a.type)))].sort();
  const niveis = [...new Set(achadosDoBlob.map((a) => String(a.nivel_bruto)))].sort();
  if (achadosDoBlob.length !== decl.n) {
    return { bate: false, porque: `declarados n=${decl.n}, encontrados ${achadosDoBlob.length}` };
  }
  if (tipos.join(',') !== decl.tipos.join(',')) {
    return { bate: false, porque: `declarados tipos=[${decl.tipos}], encontrados [${tipos}]` };
  }
  // Sem isto, uma mudanca futura na tabela de severidade podia subir um achado
  // de LOW para HIGH e a declaracao continuava a silencia-lo, porque nem o tipo
  // nem a contagem mudavam. A declaracao tem de descrever tambem a GRAVIDADE.
  if (decl.niveis && decl.niveis.join(',') !== niveis.join(',')) {
    return { bate: false, porque: `declarados niveis=[${decl.niveis}], encontrados [${niveis}]` };
  }
  return { bate: true, porque: null };
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
  // `--remotes=origin` NAO inclui `refs/tags`, e uma tag e empurrada e publica
  // como qualquer branch: conteudo alcancavel so por tag ficava fora do ambito
  // que responde "isto esta no mundo?". `--tags` traz as tags LOCAIS, o que e
  // conservador (pode incluir uma tag ainda por empurrar) — e num varredor de
  // segredos o erro conservador e o unico aceitavel.
  const seletor = refs === 'origin' ? ['--remotes=origin', '--tags'] : ['--all'];
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
    // Um corpo truncado NAO se aceita. `Buffer.slice` devolve o que houver sem
    // se queixar, o objecto contava como devolvido, e o `emFalta` ficava a
    // zero: um segredo na metade que faltou desaparecia com `erro: null`.
    if (inicio + tamanho > buf.length) break;
    out.push({ sha, tipo, tamanho, conteudo: buf.subarray(inicio, inicio + tamanho) });
    i = inicio + tamanho + 1; // o \n a seguir ao conteudo
  }
  return out;
}

/**
 * Le um lote de objectos. Devolve `{ objs, emFalta }`.
 *
 * O `emFalta` existe porque a primeira versao **falhava aberto**: pedia 400
 * shas, recebia 399 por um buffer truncado ou um objecto `missing`, e devolvia
 * `erro: null`, `ilegiveis: 0`, `HIGH: 0`. Um objecto que nunca foi lido e
 * indistinguivel de um objecto limpo — a nao ser que alguem conte.
 */
export function lerLote(dir, shas, { runImpl = execFileSync } = {}) {
  if (!shas.length) return { objs: [], emFalta: 0 };
  const buf = runImpl('git', ['cat-file', '--batch'], {
    cwd: dir, input: shas.join('\n') + '\n', maxBuffer: 512 * 1024 * 1024, windowsHide: true,
  });
  const objs = parseBatch(Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8'));
  return { objs, emFalta: Math.max(0, shas.length - objs.length) };
}

/**
 * TODOS os objectos da base, alcancaveis ou nao.
 *
 * `--all` nao ve objectos soltos: os que sobraram de um rebase, de um `commit
 * --amend`, de uma branch apagada. Medido neste repo a 2026-08-26: **1 571
 * blobs e 242 commits** fora do alcance de `--all`.
 *
 * Estes objectos **nao sao clonaveis** — ninguem os recebe num `git clone`, e
 * por isso nao sao um incidente publico. Mas respondem a outra pergunta, que
 * tambem interessa: *este segredo alguma vez existiu nesta maquina?*
 */
export function todosOsObjectos(dir, { runImpl = execFileSync, alcancaveisImpl = blobsAlcancaveis } = {}) {
  const bruto = String(runImpl('git', [
    'cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype)',
  ], { cwd: dir, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, windowsHide: true }) || '');
  const porSha = new Map();
  for (const linha of bruto.split('\n')) {
    if (!linha) continue;
    const [sha, tipo] = linha.split(' ');
    if (!sha || !TIPOS_LIDOS.has(tipo)) continue;
    porSha.set(sha, { sha, tipo, caminhos: new Set() });
  }
  // Os caminhos dos que SAO alcancaveis vem de `rev-list --objects`, porque o
  // `--batch-all-objects` nao os traz. Sem esta juncao, TODOS os objectos
  // ficavam sem caminho — e como um objecto sem caminho e lido como sensivel
  // (para a ignorancia nao baixar a severidade), o modo `todos` passava o repo
  // inteiro a HIGH. Medido a 2026-08-26: 2 425 HIGH, todos artefacto.
  // Depois desta juncao, so os objectos MESMO soltos ficam sem caminho.
  try {
    for (const [sha, e] of alcancaveisImpl(dir, { refs: 'all' })) {
      const alvo = porSha.get(sha);
      if (alvo) for (const c of e.caminhos) alvo.caminhos.add(c);
    }
  } catch { /* sem os caminhos, cada objecto falha fechado — que e o lado certo */ }
  return porSha;
}

/**
 * Commits e tags cujas MENSAGENS se leem.
 *
 * Um token colado numa mensagem de commit e tao publico como um token num
 * ficheiro, e a primeira versao desta ferramenta nunca olhou para nenhuma
 * mensagem — so para blobs. Foi o adversario que apanhou.
 */
export const TIPOS_LIDOS = new Set(['blob', 'commit', 'tag']);

export function objectosComMensagem(dir, { refs = 'all', runImpl = execFileSync } = {}) {
  // `--remotes=origin` NAO inclui `refs/tags`, e uma tag e empurrada e publica
  // como qualquer branch: conteudo alcancavel so por tag ficava fora do ambito
  // que responde "isto esta no mundo?". `--tags` traz as tags LOCAIS, o que e
  // conservador (pode incluir uma tag ainda por empurrar) — e num varredor de
  // segredos o erro conservador e o unico aceitavel.
  const seletor = refs === 'origin' ? ['--remotes=origin', '--tags'] : ['--all'];
  const porSha = new Map();
  const bruto = String(runImpl('git', ['rev-list', ...seletor], {
    cwd: dir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true,
  }) || '');
  for (const sha of bruto.split('\n')) {
    if (sha) porSha.set(sha, { sha, tipo: 'commit', caminhos: new Set(['(mensagem de commit)']) });
  }
  // As tags anotadas tambem tem corpo, e nao aparecem no `rev-list` como tags.
  try {
    const tags = String(runImpl('git', ['for-each-ref', '--format=%(objecttype) %(objectname)', 'refs/tags'], {
      cwd: dir, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, windowsHide: true,
    }) || '');
    for (const l of tags.split('\n')) {
      const [tipo, sha] = l.split(' ');
      if (tipo === 'tag' && sha) porSha.set(sha, { sha, tipo: 'tag', caminhos: new Set(['(mensagem de tag)']) });
    }
  } catch { /* sem tags e um estado legitimo */ }
  return porSha;
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
  listaImpl = null, loteImpl = lerLote, commitsImpl = commitsQueTocam,
  mensagensImpl = objectosComMensagem, shallowImpl = eShallow,
} = {}) {
  // `todos` inclui o que ficou solto de rebases e amends — nao clonavel por
  // ninguem, mas responde a "isto alguma vez existiu nesta maquina?".
  if (!listaImpl) listaImpl = refs === 'todos' ? todosOsObjectos : blobsAlcancaveis;
  if (refs === 'todos') mensagensImpl = null; // ja vem tudo, incluindo commits e tags
  if (shallowImpl(dir, {})) {
    return {
      erro: 'clone SHALLOW: nao ha historico para varrer. `git fetch --unshallow` (ou `fetch-depth: 0` no checkout do CI) antes de correr isto — um "HIGH 0" sobre a ponta seria uma mentira calma.',
      achados: [], blobs: 0, lidos: 0,
      saltados: { binarios: 0, grandes: 0, ilegiveis: 0, naoBlob: 0 },
      refs,
    };
  }
  const corpus = { nome: 'repo-historico', publico: true, dir };
  const saltados = { binarios: 0, grandes: 0, ilegiveis: 0, naoBlob: 0, emFalta: 0 };
  const achados = [];
  let porSha;
  try {
    porSha = listaImpl(dir, { refs });
    // As mensagens de commit e de tag sao historico tanto como os ficheiros, e
    // um token colado numa delas e igualmente publico.
    if (mensagensImpl) {
      for (const [sha, e] of mensagensImpl(dir, { refs })) if (!porSha.has(sha)) porSha.set(sha, e);
    }
  } catch (e) {
    return { erro: `git rev-list falhou: ${String(e && e.message).slice(0, 160)}`, achados: [], blobs: 0, lidos: 0, saltados, refs };
  }

  // Um `origin` vazio nao e um historico limpo — e um `origin` que nunca foi
  // buscado. Sem isto, `--refs origin` num clone acabado de fazer sem remoto
  // devolveria `HIGH 0` com a mesma cara com que devolve um repo mesmo limpo.
  if (porSha.size === 0) {
    return {
      erro: `nenhum objecto alcancavel com refs=${refs}. Um zero aqui nao e "historico limpo": e "nao havia historico para ler". Verificar o remoto (\`git fetch origin\`) antes de acreditar em qualquer numero.`,
      achados: [], blobs: 0, lidos: 0, saltados, refs,
    };
  }

  // Candidatos: exclui extensoes binarias antes de sequer pedir o conteudo ao git.
  const candidatos = [];
  for (const [sha, e] of porSha) {
    const temCaminho = e.caminhos.size > 0;
    const algumTexto = !temCaminho || [...e.caminhos].some((c) => !EXT_BINARIA.has(path.extname(c).toLowerCase()));
    if (!algumTexto) { saltados.binarios += 1; continue; }
    candidatos.push(sha);
  }

  let lidos = 0;
  for (let i = 0; i < candidatos.length; i += lote) {
    const fatia = candidatos.slice(i, i + lote);
    let objs;
    try {
      const r = loteImpl(dir, fatia, {});
      objs = r.objs;
      saltados.emFalta += r.emFalta;
    } catch {
      saltados.ilegiveis += fatia.length;
      continue;
    }
    for (const o of objs) {
      if (!TIPOS_LIDOS.has(o.tipo)) { saltados.naoBlob += 1; continue; }
      if (o.tamanho > MAX_BYTES) { saltados.grandes += 1; continue; }
      // Um NUL diz binario melhor do que qualquer lista de extensoes.
      if (o.conteudo.includes(0)) { saltados.binarios += 1; continue; }
      const texto = o.conteudo.toString('utf8');
      lidos += 1;
      const caminhos = [...(porSha.get(o.sha)?.caminhos || [])];
      // Um objecto solto nao tem caminho nenhum. Ver o comentario de
      // `CAMINHO_DESCONHECIDO` para o porque de o caminho ser NEUTRO e a
      // incerteza ir para o relatorio em vez de ir para a severidade.
      const semCaminho = caminhos.length === 0;
      const rel = semCaminho ? CAMINHO_DESCONHECIDO : caminhos[0];
      for (const a of detector.scanSecrets([{ path: rel, content: texto }])) {
        const dummy = motivoDeDummy(a, texto);
        const nivelBruto = severidade(a, corpus, dummy);
        achados.push({
          ...a,
          blob: o.sha,
          tipo_objecto: o.tipo,
          caminhos: semCaminho ? [CAMINHO_DESCONHECIDO] : caminhos,
          caminho_desconhecido: semCaminho,
          corpus: corpus.nome,
          dummy,
          declarado: null,
          nivel_bruto: nivelBruto,
          // A declaracao NAO se aplica aqui: so depois de o blob estar todo
          // varrido e que se sabe quantos achados tem e de que tipos, e sem
          // isso nao se pode verificar se a declaracao descreve o que esta la.
          nivel: nivelBruto,
        });
      }
    }
  }

  // As declaracoes aplicam-se agora, com o blob todo varrido: uma declaracao
  // que nao descreva o que la esta NAO se aplica, e a discrepancia e reportada.
  const porBlob = new Map();
  for (const a of achados) {
    if (!porBlob.has(a.blob)) porBlob.set(a.blob, []);
    porBlob.get(a.blob).push(a);
  }
  const discrepancias = [];
  for (const [blob, decl] of declarados) {
    const doBlob = porBlob.get(blob);
    if (!doBlob) continue; // declarado e nao encontrado: nao e um erro, e um blob que ja nao existe
    const { bate, porque } = declaracaoBate(decl, doBlob);
    if (!bate) { discrepancias.push({ blob, porque }); continue; }
    for (const a of doBlob) { a.declarado = decl.motivo; a.nivel = 'INFO'; }
  }

  // So agora, e so para o que DECIDE, se pergunta ao git QUANDO isto entrou.
  //
  // `git log --all --find-object` percorre os 2478 commits do repo por cada blob
  // que se lhe da. A primeira versao chamava-o para HIGH **e** LOW: a corrida
  // passou dos 8 minutos sem acabar, porque o LOW e abundante por construcao
  // (heuristica em repo publico). E proveniencia que ninguem le para decidir
  // nada — o que decide e o HIGH. Os LOW ficam com `commits: null`, e o campo
  // `proveniencia_omitida` diz quantos, para nao parecer cobertura.
  //
  // Duas travas mais, ambas por medicao (2026-08-26):
  //   · um blob SEM CAMINHO e um objecto solto — nao esta em commit nenhum, e
  //     o `--find-object` percorre o historico inteiro para nao devolver nada.
  //   · e ha um tecto. Quando o modo `todos` passou a falhar fechado sobre
  //     objectos sem caminho, os HIGH multiplicaram-se e a corrida passou dos
  //     dois minutos so a perguntar proveniencias. O tecto e `MAX_PROVENIENCIA`
  //     e o que fica de fora e CONTADO, nunca calado.
  const candidatosProv = achados.filter((a) => a.nivel === 'HIGH' && !a.caminho_desconhecido);
  const comProveniencia = candidatosProv.slice(0, MAX_PROVENIENCIA);
  for (const a of comProveniencia) a.commits = commitsImpl(dir, a.blob, {});
  const proveniencia_omitida = achados.filter((a) => a.nivel === 'LOW').length
    + (candidatosProv.length - comProveniencia.length)
    + achados.filter((a) => a.nivel === 'HIGH' && a.caminho_desconhecido).length;

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
    sem_caminho: {
      achados: achados.filter((a) => a.caminho_desconhecido).length,
      blobs: new Set(achados.filter((a) => a.caminho_desconhecido).map((a) => a.blob)).size,
    },
    declarados: achados.filter((a) => a.declarado).length,
    discrepancias,
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
  console.log(`saltados: ${r.saltados.binarios} binarios · ${r.saltados.grandes} grandes · ${r.saltados.ilegiveis} ilegiveis · ${r.saltados.naoBlob} nao-lidos · ${r.saltados.emFalta || 0} EM FALTA`);
  // Um `HIGH 0` com objectos por ler nao e a mesma frase que um `HIGH 0` com
  // tudo lido, e o leitor tem de ver a diferenca sem ir procurar.
  const naoOlhados = (r.saltados.binarios || 0) + (r.saltados.grandes || 0)
    + (r.saltados.ilegiveis || 0) + (r.saltados.emFalta || 0);
  if (naoOlhados > 0) {
    console.log(`⚠ COBERTURA INCOMPLETA: ${naoOlhados} objectos nao foram lidos. Um zero abaixo vale para os ${r.lidos} que foram.`);
  }
  if ((r.saltados.emFalta || 0) > 0) {
    console.log('⚠ objectos PEDIDOS ao git e nao devolvidos — isto nao e um salto deliberado, e uma leitura que falhou.');
  }
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
  if (r.discrepancias && r.discrepancias.length) {
    console.log('\n⚠ declaracoes que NAO se aplicaram (a forma declarada nao bate com o que esta no blob):');
    for (const d of r.discrepancias) console.log(`  ${d.blob.slice(0, 8)} · ${d.porque}`);
    console.log('  Os achados desses blobs mantem o nivel que tinham.');
  }
  if (r.recusadas && r.recusadas.length) {
    console.log('\nentradas RECUSADAS na allowlist (nao valem nada — corrigir ou remover):');
    for (const x of r.recusadas) console.log(`  ${x.blob} · ${x.porque}`);
  }
  // A incerteza que existe e nao se consegue resolver diz-se em texto. Nao se
  // converte num numero — ver o comentario de `CAMINHO_DESCONHECIDO`.
  if (r.sem_caminho && r.sem_caminho.achados > 0) {
    console.log(`\n⚠ ${r.sem_caminho.achados} achados em ${r.sem_caminho.blobs} objectos SOLTOS, sem caminho conhecido.`);
    console.log('  Lidos com caminho neutro. Uma chave com forma de fornecedor (AKIA, ghp_, sk_live_,');
    console.log('  sk-ant-, PEM) e critica em QUALQUER caminho, portanto nenhuma escapa por isto.');
    console.log('  O que nao se consegue saber e se algum deles esteve num ficheiro sensivel — nesse');
    console.log('  caso a heuristica generica valeria mais do que LOW. Fica dito, nao contado.');
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
  if (!['all', 'origin', 'todos'].includes(refs)) {
    // Um `--refs orign` mal escrito nao pode cair no ambito por omissao em
    // silencio: o relatorio diria `refs=orign` e varreria outra coisa.
    console.error(`--refs invalido: ${refs}. Vale "all", "origin" ou "todos".`);
    return 2;
  }
  let detector;
  try {
    // O detector e a allowlist sao DESTA ferramenta, nao do repositorio que se
    // varre. A primeira versao carregava-os de dentro do `--repo`, o que queria
    // dizer que apontar isto a outro repositorio falhava com "detector nao
    // encontrado" — e que um repositorio varrido podia trazer a sua propria
    // allowlist. Um alvo nao declara as suas proprias excepcoes.
    detector = carregarDetector(RAIZ_PADRAO);
  } catch (e) {
    console.error(String(e.message));
    return 2;
  }
  const cam = path.join(RAIZ_PADRAO, 'tools', 'audit', 'blobs-declarados.json');
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
