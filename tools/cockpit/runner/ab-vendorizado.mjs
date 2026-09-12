/**
 * ab-vendorizado.mjs — o que foi vendorizado para dentro do repo continua a ser
 * o que diz que e, ou a verificacao FALHA.
 *
 * PORQUE ISTO EXISTE.
 *
 * O pre-registo do A/B do Moo Audit exige duas coisas que so valem se forem
 * bytes, e nao intencoes:
 *
 *   §2.1  "O conjunto de regras e descarregado UMA VEZ, antes da corrida, e
 *          guardado em `_handoff/ab-audit/regras-semgrep/` com o sha256 de cada
 *          ficheiro registado. (...) Conjuntos fixados: p/javascript, p/typescript,
 *          p/security-audit, p/nodejs. A lista nao cresce nem encolhe depois
 *          desta linha."
 *
 *   §2.2  "O ambito e calculado por um unico script e os tres bracos recebem a
 *          MESMA lista, gravada em `_handoff/ab-audit/ambito-<sujeito>.txt`.
 *          Braco que veja outra lista e um braco invalido."
 *
 * Ate 2026-08-26 as regras e as listas viviam num directorio temporario de
 * sessao. Fora do repo quer dizer: nao versionadas, nao verificaveis por
 * terceiros, e a corrida nao reproduzivel por mais ninguem. Traze-las para
 * dentro resolve metade do problema. A outra metade e esta: **um ficheiro
 * copiado e um ficheiro que se assume**, e "assumi que chegou inteiro" e
 * exactamente o genero de coisa que morde tarde, quando ja ha achados em cima e
 * ninguem quer acreditar que a causa esta na copia.
 *
 * O DESENHO — escritor unico, e o verificador nunca escreve.
 *
 * O manifesto e escrito UMA VEZ, no acto de vendorizar. Este modulo so LE e
 * COMPARA: nao tem modo `--update`, de proposito. Um verificador que sabe
 * reescrever o manifesto valida a propria corrupcao — o ficheiro muda, o
 * manifesto e "actualizado" para concordar, e o guarda fica verde sobre um
 * conjunto de regras diferente daquele em que a corrida comecou. Foi assim que
 * a §2.1 justificou congelar as regras: "um conjunto que mude no registo remoto
 * entre a corrida de S1 e a de S3 torna os tres sujeitos incomparaveis, e
 * ninguem daria por isso". Um manifesto auto-actualizavel reintroduz o mesmo
 * buraco dentro de casa.
 *
 * TRES MANEIRAS DE FALHAR, E TODAS AS TRES CONTAM:
 *
 *   1. sha256 diferente   -> o conteudo mudou (ou a copia chegou partida);
 *   2. ficheiro ausente   -> a lista encolheu;
 *   3. ficheiro a mais    -> a lista cresceu. E o caso menos obvio e o mais
 *      perigoso: um quinto conjunto de regras largado no directorio nao muda
 *      sha256 nenhum, passa em qualquer verificacao ingenua, e muda os achados
 *      de A e de B. O §2.1 diz "nao cresce nem encolhe" — as duas metades.
 *
 * A QUARTA MANEIRA — a licenca — entrou a 2026-09-12, depois de as tres de cima
 * terem estado verdes 17 dias sobre ficheiros que nao podiam estar aqui. Cada
 * uma das 409 regras vendorizadas traz `license: Semgrep Rules License v1.0`,
 * cujo texto diz "only for your own internal business purposes" e "does not
 * allow you to distribute the rules" — e este repo e publico e MIT. O sha256
 * respondia a "foi adulterado?"; ninguem tinha perguntado "podemos ter isto
 * aqui?". Integridade nao e permissao. Desde entao as regras vivem FORA do repo
 * (`AB_REGRAS_SEMGREP`, ou `--regras <dir>`), o manifesto (esse fica) diz
 * `distribuivel: false` e nomeia a licenca, e o verificador:
 *
 *   4. yaml dentro do repo com `distribuivel: false` -> FALHA [licenca];
 *      sem directorio externo -> N/D com o porque (nao "OK": verde por nao
 *      verificar nada e a falha que este ficheiro existe para evitar);
 *      com directorio externo -> os tres testes de cima, la, e a licenca lida
 *      de cada ficheiro impressa no relatorio;
 *      ficheiro no repo que DECLARA `license:` sem o manifesto dizer
 *      `distribuivel: true` -> FALHA [licenca] (o caso de 2026-08-26).
 *
 * Uso:  node tools/cockpit/runner/ab-vendorizado.mjs [raiz-do-repo] [--regras <dir>]
 * Saida: 0 = tudo bate (ou n/d declarado); 1 = pelo menos uma divergencia (impressa por extenso).
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';

/** Onde vive cada coisa. Caminhos relativos a raiz do repo. */
export const DIR_AB = '_handoff/ab-audit';
export const MANIFESTO_REGRAS = DIR_AB + '/regras-semgrep/MANIFESTO.json';
export const MANIFESTO_AMBITO = DIR_AB + '/ambito-MANIFESTO.json';

export function sha256Buf(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Le um manifesto e devolve a lista normalizada de entradas a verificar.
 *
 * Os dois manifestos tem formas diferentes (`conjuntos[]` para as regras,
 * `sujeitos[]` para o ambito) porque descrevem coisas diferentes; o que e comum
 * — ficheiro, sha256, bytes — e o que este modulo consome. Um manifesto sem
 * nenhuma dessas listas nao e "vazio, logo OK": e um manifesto que nao verifica
 * nada, e isso e uma falha.
 */
export function entradasDoManifesto(manifesto) {
  const bruto = (manifesto && (manifesto.conjuntos || manifesto.sujeitos)) || null;
  if (!Array.isArray(bruto)) {
    return { erro: 'manifesto sem `conjuntos[]` nem `sujeitos[]` — nada para verificar', entradas: [] };
  }
  if (bruto.length === 0) {
    return { erro: 'manifesto com lista vazia — um verificador que verifica zero ficheiros esta verde por nao fazer nada', entradas: [] };
  }
  const entradas = [];
  for (const e of bruto) {
    if (!e || typeof e.ficheiro !== 'string' || typeof e.sha256 !== 'string') {
      return { erro: 'entrada sem `ficheiro` ou sem `sha256`: ' + JSON.stringify(e), entradas: [] };
    }
    entradas.push({ ficheiro: e.ficheiro, sha256: e.sha256, bytes: e.bytes, nome: e.nome || e.id || e.ficheiro });
  }
  return { erro: null, entradas };
}

/**
 * Verifica um conjunto de ficheiros contra as entradas de um manifesto.
 *
 * `extrasEm` (opcional) e o directorio onde ficheiros NAO manifestados sao um
 * defeito, e `extrasFiltro` diz quais contam. Sem isto, "a lista nao cresce" nao
 * era verificado por ninguem.
 */
export function verificarEntradas({
  base,
  entradas,
  readImpl = readFileSync,
  existsImpl = existsSync,
  readdirImpl = readdirSync,
  extrasEm = null,
  extrasFiltro = () => false,
} = {}) {
  const falhas = [];
  let verificados = 0;

  for (const e of entradas) {
    const abs = path.join(base, e.ficheiro);
    if (!existsImpl(abs)) {
      falhas.push({ tipo: 'ausente', ficheiro: e.ficheiro, porque: 'o manifesto declara-o e ele nao esta no disco' });
      continue;
    }
    let buf;
    try {
      buf = readImpl(abs);
    } catch (err) {
      falhas.push({ tipo: 'ilegivel', ficheiro: e.ficheiro, porque: String((err && err.code) || err) });
      continue;
    }
    const sha = sha256Buf(buf);
    if (sha !== e.sha256) {
      falhas.push({
        tipo: 'sha256',
        ficheiro: e.ficheiro,
        esperado: e.sha256,
        obtido: sha,
        porque: 'o conteudo nao e o que foi vendorizado — a corrida deixou de ser comparavel com a que o manifesto descreve',
      });
      continue; // ja falhou pelo que importa; nao vale a pena acusar tambem os bytes
    }
    if (Number.isInteger(e.bytes) && buf.length !== e.bytes) {
      // Praticamente impossivel com o sha a bater, mas nao e caro dize-lo: se
      // algum dia acontecer, a hipotese a investigar e a funcao de hash, nao o
      // ficheiro.
      falhas.push({
        tipo: 'bytes',
        ficheiro: e.ficheiro,
        esperado: e.bytes,
        obtido: buf.length,
        porque: 'sha256 bate mas o tamanho nao — suspeitar do verificador, nao do ficheiro',
      });
      continue;
    }
    verificados++;
  }

  if (extrasEm) {
    const dirAbs = path.join(base, extrasEm);
    let noDisco = [];
    try {
      noDisco = readdirImpl(dirAbs);
    } catch (err) {
      falhas.push({ tipo: 'directorio', ficheiro: extrasEm, porque: 'nao se consegue listar: ' + String((err && err.code) || err) });
      noDisco = [];
    }
    const manifestados = new Set(entradas.map((e) => path.posix.basename(String(e.ficheiro).replace(/\\/g, '/'))));
    for (const nome of noDisco) {
      if (!extrasFiltro(nome)) continue;
      if (manifestados.has(nome)) continue;
      falhas.push({
        tipo: 'extra',
        // `.` e o proprio directorio do manifesto: prefixar "./" so tornava a
        // mensagem mais dificil de ler, e uma mensagem dificil de ler acaba ignorada.
        ficheiro: (extrasEm === '.' ? '' : extrasEm + '/') + nome,
        porque: 'esta no disco e nao esta no manifesto — §2.1 diz que a lista nao cresce nem encolhe',
      });
    }
  }

  return { ok: falhas.length === 0, falhas, verificados };
}

/** Le um manifesto do disco e verifica-o. Devolve tambem `titulo`, para o relatorio. */
export function verificarManifesto({
  raiz,
  manifestoRel,
  titulo,
  readImpl = readFileSync,
  existsImpl = existsSync,
  readdirImpl = readdirSync,
  extrasEm = null,
  extrasFiltro = () => false,
} = {}) {
  const abs = path.join(raiz, manifestoRel);
  if (!existsImpl(abs)) {
    return { titulo, ok: false, verificados: 0, falhas: [{ tipo: 'manifesto', ficheiro: manifestoRel, porque: 'manifesto ausente' }] };
  }
  let manifesto;
  try {
    manifesto = JSON.parse(String(readImpl(abs, 'utf8')));
  } catch (err) {
    return { titulo, ok: false, verificados: 0, falhas: [{ tipo: 'manifesto', ficheiro: manifestoRel, porque: 'JSON invalido: ' + (err && err.message) }] };
  }
  const { erro, entradas } = entradasDoManifesto(manifesto);
  if (erro) {
    return { titulo, ok: false, verificados: 0, falhas: [{ tipo: 'manifesto', ficheiro: manifestoRel, porque: erro }] };
  }
  const base = path.join(raiz, path.dirname(manifestoRel));
  const r = verificarEntradas({ base, entradas, readImpl, existsImpl, readdirImpl, extrasEm, extrasFiltro });
  return { titulo, ...r };
}

/** Onde vivem as regras quando nao podem estar no repo: esta variavel, ou `--regras <dir>`. */
export const ENV_REGRAS = 'AB_REGRAS_SEMGREP';

/**
 * Le as linhas `license:` de um ficheiro de regras e conta os valores distintos.
 * E texto, nao YAML parseado: chega para a unica pergunta que se faz ("que
 * licenca declara este ficheiro?") e nao traz dependencia nenhuma.
 */
export function licencasNoFicheiro(buf) {
  const texto = Buffer.isBuffer(buf) ? buf.toString('utf8') : String(buf);
  const contagem = {};
  const re = /^[ \t]*license:[ \t]*(.+?)[ \t]*$/gm;
  let m;
  while ((m = re.exec(texto)) !== null) {
    const v = m[1].replace(/^["']|["']$/g, '');
    contagem[v] = (contagem[v] || 0) + 1;
  }
  return contagem;
}

function somarLicencas(total, parcela) {
  for (const k of Object.keys(parcela)) total[k] = (total[k] || 0) + parcela[k];
  return total;
}

/**
 * As regras do §2.1. Tres caminhos, decididos pelo manifesto — nunca pelo
 * verificador, que so le:
 *
 *   - `distribuivel: false`  -> nenhum `.yaml` pode estar no directorio do repo
 *                               (falha `licenca`); os ficheiros verificam-se em
 *                               `dirExterno` se for dado, senao o resultado e
 *                               `n/d` com o porque — nao "OK", que seria verde
 *                               por nao ter feito nada;
 *   - `distribuivel: true`   -> verificam-se no repo, e a licenca lida de cada
 *                               ficheiro vai para o relatorio;
 *   - sem o campo            -> verificam-se no repo, e um ficheiro que DECLARE
 *                               `license:` falha: e o caso de 2026-08-26, em que
 *                               ninguem tinha lido a linha.
 */
export function verificarRegras({
  raiz,
  manifestoRel = MANIFESTO_REGRAS,
  dirExterno = null,
  readImpl = readFileSync,
  existsImpl = existsSync,
  readdirImpl = readdirSync,
} = {}) {
  const titulo = 'regras do semgrep (§2.1)';
  const abs = path.join(raiz, manifestoRel);
  if (!existsImpl(abs)) {
    return { titulo, ok: false, verificados: 0, falhas: [{ tipo: 'manifesto', ficheiro: manifestoRel, porque: 'manifesto ausente' }] };
  }
  let manifesto;
  try {
    manifesto = JSON.parse(String(readImpl(abs, 'utf8')));
  } catch (err) {
    return { titulo, ok: false, verificados: 0, falhas: [{ tipo: 'manifesto', ficheiro: manifestoRel, porque: 'JSON invalido: ' + (err && err.message) }] };
  }
  const { erro, entradas } = entradasDoManifesto(manifesto);
  if (erro) {
    return { titulo, ok: false, verificados: 0, falhas: [{ tipo: 'manifesto', ficheiro: manifestoRel, porque: erro }] };
  }
  const dirRepoRel = path.dirname(manifestoRel);
  const dirRepo = path.join(raiz, dirRepoRel);
  const io = { readImpl, existsImpl, readdirImpl };
  const licenca = manifesto.licenca || 'licenca nao nomeada no manifesto';

  if (manifesto.distribuivel === false) {
    const falhas = [];
    let noRepo = [];
    try {
      noRepo = readdirImpl(dirRepo);
    } catch {
      noRepo = [];
    }
    for (const nome of noRepo) {
      if (!ehRegraYaml(nome)) continue;
      falhas.push({
        tipo: 'licenca',
        ficheiro: dirRepoRel + '/' + nome,
        porque: 'esta dentro do repo e o manifesto diz `distribuivel: false` (' + licenca + ') — o repo e publico, o ficheiro nao pode estar aqui',
      });
    }
    if (!dirExterno) {
      return {
        titulo,
        ok: falhas.length === 0,
        nd: true,
        verificados: 0,
        falhas,
        porque: 'n/d — ' + entradas.length + ' ficheiro(s) fora do repo por licenca (' + licenca + '); os sha256 estao no manifesto; para verificar: ' + ENV_REGRAS + '=<dir> ou --regras <dir>',
      };
    }
    const r = verificarEntradas({ base: dirExterno, entradas, ...io, extrasEm: '.', extrasFiltro: ehRegraYaml });
    const licencas = {};
    for (const e of entradas) {
      try {
        somarLicencas(licencas, licencasNoFicheiro(readImpl(path.join(dirExterno, e.ficheiro))));
      } catch {
        // ausente ou ilegivel: verificarEntradas ja o acusou
      }
    }
    return {
      titulo: titulo + ' — fora do repo, em ' + dirExterno,
      ok: r.ok && falhas.length === 0,
      verificados: r.verificados,
      falhas: [...falhas, ...r.falhas],
      licencas,
    };
  }

  const r = verificarEntradas({ base: dirRepo, entradas, ...io, extrasEm: '.', extrasFiltro: ehRegraYaml });
  const falhas = [...r.falhas];
  const licencas = {};
  for (const e of entradas) {
    let c;
    try {
      c = licencasNoFicheiro(readImpl(path.join(dirRepo, e.ficheiro)));
    } catch {
      continue;
    }
    somarLicencas(licencas, c);
    if (Object.keys(c).length && manifesto.distribuivel !== true) {
      falhas.push({
        tipo: 'licenca',
        ficheiro: e.ficheiro,
        porque: 'declara `license: ' + Object.keys(c).join(' | ') + '` e o manifesto nao diz `distribuivel: true` — alguem tem de ler a licenca antes de o ficheiro ficar num repo publico',
      });
    }
  }
  return { titulo, ok: falhas.length === 0, verificados: r.verificados, falhas, licencas };
}

/** O `.yaml` e o unico tipo de ficheiro que muda o que o semgrep corre. */
export const ehRegraYaml = (nome) => /\.ya?ml$/i.test(nome);

export function verificarTudo(raiz, io = {}, { dirRegrasExterno = process.env[ENV_REGRAS] || null } = {}) {
  return [
    verificarRegras({ raiz, dirExterno: dirRegrasExterno, ...io }),
    verificarManifesto({
      raiz,
      manifestoRel: MANIFESTO_AMBITO,
      titulo: 'listas de ambito (§2.2)',
      ...io,
    }),
  ];
}

function licencasTexto(r) {
  const ks = r.licencas ? Object.keys(r.licencas) : [];
  if (!ks.length) return '';
  return '; licenca(s) lida(s) nos ficheiros: ' + ks.map((k) => k + ' ×' + r.licencas[k]).join(', ');
}

export function relatorio(resultados) {
  const linhas = [];
  let falhasTotais = 0;
  for (const r of resultados) {
    if (r.ok && r.nd) {
      linhas.push('N/D    ' + r.titulo + ' — ' + r.porque);
      continue;
    }
    if (r.ok) {
      linhas.push('OK     ' + r.titulo + ' — ' + r.verificados + ' ficheiro(s) batem byte a byte' + licencasTexto(r));
      continue;
    }
    linhas.push('FALHA  ' + r.titulo);
    for (const f of r.falhas) {
      falhasTotais++;
      let l = '       [' + f.tipo + '] ' + f.ficheiro + ' — ' + f.porque;
      if (f.esperado !== undefined) l += '\n              esperado: ' + f.esperado + '\n              obtido:   ' + f.obtido;
      linhas.push(l);
    }
  }
  return { texto: linhas.join('\n') + '\n', falhas: falhasTotais };
}

const invocadoDirectamente = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase().endsWith('ab-vendorizado.mjs');
if (invocadoDirectamente) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--regras');
  const dirRegrasExterno = i >= 0 ? args[i + 1] : (process.env[ENV_REGRAS] || null);
  const raiz = args.filter((a, j) => j !== i && j !== i + 1)[0] || process.cwd();
  const { texto, falhas } = relatorio(verificarTudo(raiz, {}, { dirRegrasExterno }));
  process.stdout.write(texto);
  process.exitCode = falhas > 0 ? 1 : 0;
}
