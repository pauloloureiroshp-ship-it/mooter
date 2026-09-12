/**
 * ci-coerencia.mjs — os workflows do CI tambem nao levam pilar. Levam isto.
 *
 * PORQUE NAO E UM PILAR.
 *
 * Mediram-se SEIS classes candidatas nos 17 workflows antes de escrever qualquer
 * enunciado:
 *
 *     classe                              densidade   porque nao serve
 *     name: vs o que o run: faz              84        exige juizo
 *     token citado no name vs run            27        81% de falsos (22/27):
 *                                                      `Typecheck (tsc --noEmit)`
 *                                                      corre `npm run typecheck`,
 *                                                      que INVOCA o tsc; e
 *                                                      `(informativo)`/`(optional)`
 *                                                      sao descricoes, nao comandos
 *     portao com continue-on-error            1        e o unico e intencional e
 *                                                      documentado (typecheck)
 *     `if:` alcancavel                       19        exige juizo
 *     numero no name vs numero no run         2        raro demais
 *     "Setup Node N" vs node-version          1        raro demais
 *
 * Duas medicoes seguidas — o `landing/` e este — dizem a mesma coisa: **ficheiros
 * de configuracao e de marcacao nao tem a estrutura de pares literais densos que
 * os ficheiros de CODIGO tem.** Os dois pilares que funcionam (P2, P3) e o que se
 * criou de novo (P11) vivem todos sobre codigo.
 *
 * O QUE FICA AQUI, e porque e deterministico:
 * as duas coisas verificaveis no CI sao ENTRE FICHEIROS — que versao de Node cada
 * workflow usa, e se os scripts que ele manda correr existem. Uma janela de 70
 * linhas nunca ve nem uma nem outra. Um modelo tambem nao: nao e falta de
 * inteligencia, e falta de contexto.
 *
 * Uso: node tools/cockpit/runner/ci-coerencia.mjs [raiz-do-repo]
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** Workflows que PUBLICAM alguma coisa para fora. */
const PUBLICA = /^publish-|^deploy-/;
/** O workflow que corre a suite — a referencia de runtime. */
const TESTA = /^test\.ya?ml$/;

export function lerWorkflows(dir, { readdirImpl = fs.readdirSync, readImpl = fs.readFileSync } = {}) {
  let nomes = [];
  try { nomes = readdirImpl(dir).filter((f) => /\.ya?ml$/.test(f)); }
  catch (erro) {
    if (erro && erro.code === 'ENOENT') return [];
    // Uma pasta ilegível e uma pasta sem workflows davam ambas `[]`, fazendo a
    // verificação publicar "sem workflows" como se tivesse conseguido medir.
    try { process.stderr.write(`ci-coerencia: workflows n/d — ${erro && erro.message ? erro.message : erro}\n`); } catch { /* stderr fechado */ }
    return null;
  }
  return nomes.map((f) => {
    let src = '';
    try { src = String(readImpl(path.join(dir, f), 'utf8')); } catch { src = ''; }
    return { ficheiro: f, src };
  });
}

/** A versao MAIOR de Node que cada workflow instala. `null` quando nao instala. */
export function nodeDe(src) {
  const m = String(src || '').match(/node-version:\s*['"]?([0-9]+)/);
  return m ? m[1] : null;
}

/**
 * O que se PUBLICA foi construido no mesmo runtime em que se TESTOU?
 *
 * Medido a 2026-08-22: o `test.yml` corre em Node 22; o `publish-npm.yml` e o
 * `publish-cockpit.yml` correm em Node 20. Nao afirmo que seja um defeito —
 * publicar no Node mais antigo que se suporta e uma escolha legitima. O que nao
 * pode e ser uma escolha por acidente, e ninguem consegue ve-la sem juntar 17
 * ficheiros. Isto junta-os.
 */
export function runtimeDePublicacao(workflows) {
  const teste = workflows.find((w) => TESTA.test(w.ficheiro));
  const nodeTeste = teste ? nodeDe(teste.src) : null;
  const divergentes = [];
  for (const w of workflows) {
    if (!PUBLICA.test(w.ficheiro)) continue;
    const n = nodeDe(w.src);
    if (!n || !nodeTeste) continue;
    if (n !== nodeTeste) divergentes.push({ ficheiro: w.ficheiro, node: n });
  }
  return { nodeTeste, divergentes };
}

/**
 * Um nome de passo que carrega um numero de Node diz a verdade sobre a linha que
 * o decide?
 *
 * Classe de N=1 quando foi medida — o `install-reliability.yml` tinha um passo
 * chamado "Setup Node 20". Rara demais para gastar rondas de GPU, e e por isso
 * que nao virou pilar; mas para uma comparacao literal entre dois numeros na
 * mesma janela de texto, o silencio E prova, e o custo e zero. Fica como catraca:
 * o nome so pode voltar a mentir se alguem reintroduzir o numero no nome.
 */
export function nomeQueMente(workflows) {
  const mentiras = [];
  for (const w of workflows) {
    // Um "passo" comeca em `- name:` e vai ate ao proximo. Chega para o par
    // nome/node-version, que vivem sempre no mesmo passo.
    for (const passo of String(w.src).split(/^\s*- name:/m).slice(1)) {
      const noNome = passo.split('\n')[0].match(/\bnode\s*[-_ ]?([0-9]+)/i);
      if (!noNome) continue;
      const usado = nodeDe(passo);
      if (!usado || usado === noNome[1]) continue;
      mentiras.push({
        ficheiro: w.ficheiro,
        nome: passo.split('\n')[0].trim(),
        diz: noNome[1],
        usa: usado,
      });
    }
  }
  return mentiras;
}

/**
 * Alguma linha de conteudo escapou do seu bloco `run:` para a coluna 0?
 *
 * Num block scalar de YAML (`run: |`) a indentacao da PRIMEIRA linha define o
 * bloco, e qualquer linha menos indentada FECHA-O. Uma string multilinha escrita
 * a coluna 0 dentro de um `run:` deixa de ser conteudo e passa a ser lida como
 * chave nova — e o ficheiro deixa de ser YAML.
 *
 * Isto nao e hipotetico. Medido a 2026-09-01: o `version-sync.yml` estava assim
 * desde 2026-08-29, por um commit chamado — sem ironia — «fix(ci): o Version
 * Sync deixa de falhar em todas as tags». Consequencia real: 12 de 12 corridas
 * em falha, e o workflow NUNCA chegou a correr numa tag. O GitHub anuncia o
 * sintoma de forma facil de ignorar: mostra o CAMINHO do ficheiro onde devia
 * mostrar o `name:`, e marca a corrida como falhada em cada push.
 *
 * Porque e que nenhuma guarda apanhou: o `lerWorkflows` acima le cada workflow
 * como TEXTO e faz analises por expressao regular. Um ficheiro que nao e YAML
 * nenhum continua a ser uma string perfeitamente boa — passa em tudo. Presenca,
 * outra vez, em vez de cobertura.
 *
 * LIMITE, dito de frente: isto NAO e um parser de YAML. Valida uma classe — a
 * que partiu este ficheiro e a que parte sempre que alguem cola um corpo de
 * texto dentro de um `run:`. Validacao completa exigia uma dependencia, e o
 * repo tem viés de zero dependencias; uma catraca barata que morde a classe
 * conhecida vale mais do que uma dependencia nova para o caso geral.
 */
export function blocoPartido(workflows) {
  // As chaves de topo legitimas de um workflow sao sempre uma palavra seguida
  // de dois pontos. Qualquer outra coisa a coluna 0 e conteudo fugido.
  const CHAVE_DE_TOPO = /^[A-Za-z_][A-Za-z0-9_-]*:/;
  const fugidas = [];
  for (const w of workflows) {
    // O `\r` do CRLF tem de cair ANTES de qualquer teste. Sem isto, uma linha
    // vazia num ficheiro com fins de linha do Windows chega aqui como '\r' —
    // comprimento 1, primeiro caracter que nao e espaco — e a guarda acusa
    // todas as linhas em branco do ficheiro. Apanhado na propria mordida:
    // 15 acusacoes, das quais 8 eram brancos. Uma guarda que grita a mais
    // ensina toda a gente a ignora-la, que e a maneira mais rapida de a matar.
    // (O repo ja pagou por CRLF uma vez: o sha do `classify.js` congelado nao
    //  batia em Windows por falta de `.gitattributes`.)
    String(w.src).split('\n').forEach((cru, i) => {
      const linha = cru.replace(/\r$/, '');
      if (!linha.length) return;                       // linha vazia e legitima
      if (linha[0] === ' ' || linha[0] === '\t') return; // indentada: dentro do bloco
      if (linha[0] === '#') return;                    // comentario de topo
      if (linha === '---' || linha === '...') return;  // marcadores de documento
      if (CHAVE_DE_TOPO.test(linha)) return;
      fugidas.push({ ficheiro: w.ficheiro, linha: i + 1, texto: linha.slice(0, 60) });
    });
  }
  return fugidas;
}

/**
 * O caminho esta ausente por ser um ARTEFACTO que o proprio CI constroi?
 *
 * A pergunta nao e retorica. O `packages/cli/mooter.js` e gerado por esbuild no
 * passo anterior do `install-reliability.yml` e por doutrina nunca e commitado —
 * acusa-lo de "em falta" punha este verificador a vermelho para sempre num caso
 * legitimo, que e a maneira mais rapida de ensinar toda a gente a ignora-lo.
 * O teste mecanico e o `.gitignore`: um caminho que o repo ignora de proposito e
 * um artefacto; um caminho que ninguem ignora e que nao existe e um defeito.
 * Sem git disponivel, assume-se defeito — falhar a acusar e pior que acusar a mais.
 */
export function ehArtefacto(alvo, raiz, { checkIgnoreImpl } = {}) {
  try {
    if (checkIgnoreImpl) return Boolean(checkIgnoreImpl(alvo));
    execFileSync('git', ['check-ignore', '-q', '--', alvo], { cwd: raiz, stdio: 'ignore', windowsHide: true });
    return true;
  } catch { return false; }
}

/**
 * Os scripts que o CI manda correr existem mesmo no repo?
 *
 * Devolve `{ faltam, construidos }`: o primeiro e o defeito, o segundo e ruido
 * legitimo que se mostra mas nao faz falhar.
 */
export function scriptsEmFalta(workflows, raiz, { existsImpl = fs.existsSync, checkIgnoreImpl } = {}) {
  const faltam = []; const construidos = [];
  for (const w of workflows) {
    for (const m of String(w.src).matchAll(
      /(?:node|bash|sh)\s+((?:tools|packages|scripts|landing|hub)\/[A-Za-z0-9_./-]+\.(?:m?js|sh|ts))/g,
    )) {
      if (existsImpl(path.join(raiz, m[1]))) continue;
      const onde = { ficheiro: w.ficheiro, alvo: m[1] };
      if (ehArtefacto(m[1], raiz, { checkIgnoreImpl })) construidos.push(onde);
      else faltam.push(onde);
    }
  }
  return { faltam, construidos };
}

function principal() {
  const raiz = process.argv[2] || process.env.MOOTER_REPO || process.cwd();
  const workflows = lerWorkflows(path.join(raiz, '.github', 'workflows'));
  if (workflows === null) { console.log('workflows: n/d — não consegui listar a pasta'); return; }
  if (!workflows.length) { console.log('sem workflows — n/d'); return; }

  const porVersao = {};
  for (const w of workflows) {
    const n = nodeDe(w.src) || '(nao instala)';
    (porVersao[n] ||= []).push(w.ficheiro);
  }
  console.log(`workflows: ${workflows.length}\n`);
  for (const [v, fs_] of Object.entries(porVersao).sort()) {
    console.log(`  Node ${String(v).padEnd(14)} ${fs_.length}: ${fs_.sort().join(', ')}`);
  }

  const { nodeTeste, divergentes } = runtimeDePublicacao(workflows);
  const { faltam, construidos } = scriptsEmFalta(workflows, raiz);

  console.log('');
  if (divergentes.length) {
    console.log(`⚠️  a suite corre em Node ${nodeTeste}, mas publica-se noutro runtime:`);
    for (const d of divergentes) console.log(`     ${d.ficheiro} -> Node ${d.node}`);
    console.log('     (nao e por si um defeito — mas tem de ser escolha, nao acidente)');
  } else {
    console.log(`publicacao e teste no mesmo runtime (Node ${nodeTeste ?? 'n/d'})`);
  }

  const mentiras = nomeQueMente(workflows);
  if (mentiras.length) {
    console.log('\n⚠️  o nome do passo nao diz o que o passo faz:');
    for (const m of mentiras) console.log(`     ${m.ficheiro}: "${m.nome}" -> instala Node ${m.usa}`);
    process.exitCode = 1;
  }

  if (construidos.length) {
    console.log(`\nartefactos que o proprio CI constroi (nao e defeito): ${construidos.length}`);
    for (const c of construidos) console.log(`     ${c.ficheiro} -> ${c.alvo}`);
  }
  if (faltam.length) {
    console.log('\n⚠️  o CI manda correr scripts que nao existem nem sao construidos:');
    for (const f of faltam) console.log(`     ${f.ficheiro} -> ${f.alvo}`);
    process.exitCode = 1;
  } else {
    console.log('todos os scripts citados pelo CI existem ou sao construidos');
  }
}

if (process.argv[1] && process.argv[1].endsWith('ci-coerencia.mjs')) principal();
