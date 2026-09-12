/**
 * indice-do-harness.mjs — quanto e que o arnes deste projecto se aguenta a si
 * proprio, em sete parcelas com numerador e denominador a vista. Zero-LLM.
 *
 * ── PORQUE E QUE ISTO NAO E MAIS UM "SCORE" ─────────────────────────────────
 *
 * Um numero unico sem parcelas e um adjectivo com aspecto de metrica: nao se
 * pode discordar dele, nao se pode reproduzir, e sobe quando alguem muda a
 * formula. Aqui **cada parcela imprime `num/den`**, e o indice e so a soma
 * ponderada. Quem discordar do peso recalcula em dez segundos; quem discordar
 * do numerador vai ver a fonte, que esta escrita ao lado.
 *
 * ── A REGRA QUE MAIS IMPORTA ────────────────────────────────────────────────
 *
 * **Uma parcela que nao se consegue medir vale ZERO e diz porque.** Nunca `n/d`
 * a fingir de neutro, nunca "assumimos 100% porque nao ha dados". A ausencia de
 * medicao e uma falha do arnes, e um arnes que se auto-desculpa por nao saber
 * medir-se e exactamente o que este ficheiro existe para tornar visivel.
 *
 * O contrario tambem vale: uma parcela cujo DENOMINADOR e zero por o universo
 * ser vazio (zero PRs abertos, zero rondas) nao e uma falha — e um `n/d`
 * honesto, e conta como zero na mesma, com o porque escrito. A diferenca entre
 * "nao medi" e "nao havia o que medir" fica no texto, nao no numero.
 *
 * ── AS SETE PARCELAS E OS PESOS ─────────────────────────────────────────────
 *
 *   2,0  testes gateados pelo CI          um teste que ninguem corre nao protege ninguem
 *   2,0  medicoes com recibo de censo     um numero sem recibo e uma opiniao
 *   1,5  vereditos adversariais publicados um critico que nao se le nao criticou
 *   1,5  devices no mesmo sha             uma frota em shas diferentes mede coisas diferentes
 *   1,5  turnos com custo casados com decisao  custo que nenhuma recomendacao reclama e custo cego
 *   1,0  higiene de PRs abertos           trabalho parado a apodrecer e divida
 *   0,5  limiares derivados de medicao    um limiar escolhido a olho e um palpite com autoridade
 *   ───
 *  10,0
 *
 * Uso:
 *   node tools/cockpit/runner/indice-do-harness.mjs
 *   node tools/cockpit/runner/indice-do-harness.mjs --json
 *   node tools/cockpit/runner/indice-do-harness.mjs --sem-rede   # C3 e C6 valem 0
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const RAIZ_REPO = path.resolve(AQUI, '..', '..', '..');

export const PESOS = Object.freeze({
  testes_gateados: 2.0,
  recibos_de_censo: 2.0,
  vereditos_publicados: 1.5,
  devices_no_mesmo_sha: 1.5,
  cobertura_de_telemetria: 1.5,
  higiene_de_prs: 1.0,
  limiares_medidos: 0.5,
});

export const TOTAL_PESOS = Object.values(PESOS).reduce((a, b) => a + b, 0);

/**
 * Uma parcela. `valor` a null = nao medida = vale zero, e o `porque` diz-se.
 *
 * CONTRATO: `num` e `den` sao inteiros >= 0 e `num <= den`. Somar os pesos a
 * 10 nao limita o indice a 10 — foi um adversario que o mostrou, com sete
 * parcelas de `2/1` a darem **20/10**. Uma fonte que devolva `num > den`, um
 * negativo ou um nao-inteiro esta partida, e uma parcela partida sai NAO
 * MEDIDA com o `porque` a dizer o que veio: nunca conta, nunca lanca em
 * producao, e os dois numeros ficam a vista para quem for ver a fonte.
 */
export function parcela(id, { num = null, den = null, porque = null, fonte = null, orfaos = null } = {}) {
  const temNum = Number.isFinite(num);
  const temDen = Number.isFinite(den);
  let violacao = null;
  if (temNum && temDen) {
    if (!Number.isInteger(num) || !Number.isInteger(den)) violacao = `num=${num} den=${den} nao sao inteiros`;
    else if (num < 0 || den < 0) violacao = `num=${num} den=${den} negativo`;
    else if (num > den) violacao = `num=${num} > den=${den}`;
  } else if ((temNum && num < 0) || (temDen && den < 0)) {
    violacao = `num=${num} den=${den} negativo`;
  }
  const medida = !violacao && temNum && temDen && den > 0;
  return {
    id,
    peso: PESOS[id],
    num: temNum ? num : null,
    den: temDen ? den : null,
    valor: medida ? num / den : null,
    pontos: medida ? (num / den) * PESOS[id] : 0,
    porque: violacao ? `contrato violado: ${violacao} (esperado inteiros >= 0, num <= den) — a fonte esta partida, a parcela nao conta` : porque,
    fonte,
    ...(orfaos ? { orfaos } : {}),
  };
}

// ── C1 · testes gateados pelo CI ────────────────────────────────────────────

/**
 * Um ficheiro de teste que nenhum workflow corre nao protege ninguem.
 *
 * O denominador sao os ficheiros `*.test.{js,mjs,cjs,ts,tsx}` que o git segue.
 * O `.tsx` entrou a 2026-09-11: havia 2 no `landing/app/_components/` e o
 * denominador nao os via. `*.spec.*` fica de fora com a medicao escrita: nesse
 * dia `git ls-files '*.spec.*'` devolvia UM ficheiro, `_handoff/maestro-spec/
 * F0.spec.json`, que nao e um teste — zero testes `.spec`, zero razao para
 * alargar o padrao.
 *
 * O numerador sao os ficheiros ao alcance de alguma coisa que o CI invoca.
 * Cada `run:` de cada workflow e partido em COMANDOS (por `&&`, `||`, `|`,
 * `;` e fim de linha, fora de aspas), cada comando e resolvido no
 * `working-directory` do passo, e **so os comandos com um RUNNER contam**
 * (`node`, `tsx`, `npx`, `vitest`, `jest`, ou um `--test` solto):
 *
 *   a) `node --test a.test.mjs` — o nome conta. `echo a.test.mjs` NAO conta:
 *      nao ha runner nesse comando. A primeira versao recolhia nomes de
 *      ficheiro de qualquer sitio do texto, e um `echo` cobria um teste;
 *   b) `node --test "dir/*.test.mjs"` — o glob e casado contra o caminho de
 *      cada ficheiro com as regras do executor: `*` nao atravessa `/`, `**`
 *      seguido de `/` atravessa, `?` e um caracter, `{a,b}` e alternativa,
 *      `?(x)` e opcional.
 *      Confirmado em Node v24.14.0 por um adversario noutro motor:
 *      `node --test "a/*.test.mjs"` correu so `a/b.test.mjs`;
 *      `"a/**` `/*.test.mjs"` correu tambem `a/sub/c.test.mjs`. A primeira
 *      versao transformava o glob num directorio e perdia o filtro —
 *      `unit-*.test.mjs` deixava de ver `unit-x.test.mjs` sozinho e passava a
 *      cobrir `outro.test.mjs`;
 *   c) `node --test` / `tsx --test` SEM ficheiros nem globs — a descoberta do
 *      node apanha o directorio inteiro, recursivamente, pelo padrao dele
 *      (`**` `/*.test.?(c|m)js`). E o que impede este contador de mentir ao
 *      contrario: o `packages/mooter-bridge` corre `node --test` pelado, e
 *      listar os ficheiros dele um a um daria "0 cobertos" para um pacote
 *      inteiramente coberto. `node --test && echo done` tambem e pelado — o
 *      comando acaba no `&&`, nao no fim da linha;
 *   d) `vitest` — le o `vitest.config.{ts,js,mts,mjs}` do directorio e aplica
 *      os globs de `include`; sem `include`, o default do vitest. A 2026-09-11
 *      o `landing/vitest.config.ts` limita a `app/**`: um `landing/zz.test.ts`
 *      fora de `app/` NAO corre, e a primeira versao contava-o como coberto
 *      (474/667 com um ficheiro injectado — foi o adversario que o mediu);
 *   e) `npm test` / `npm run x` expande-se no package.json DESTE directorio, e
 *      `--cwd X -- <cmd>` corre `<cmd>` dentro de X.
 *
 * ── O QUE ESTE MATCHER NAO SEGUE (limitacoes escritas, nao corrigidas) ──────
 *
 *   · Execucao INDIRECTA: `wave-gate.yml` corre `node tools/wave-gate.mjs`, e
 *     e esse script que chama `node --test` por dentro (`tools/wave-gate.mjs`,
 *     `execFile(process.execPath, ['--test', ...])`). O matcher le YAML e
 *     package.json; nao le JavaScript. O que so corre por dentro de um script
 *     nao conta.
 *   · Variaveis de ambiente nos caminhos (`"$HOME/.claude/.../x.test.js"`): o
 *     caminho nao se resolve e nao casa com nenhum ficheiro. O ficheiro so
 *     conta se OUTRO comando o nomear.
 *   · `--test-reporter tap` (valor separado por espaco): o `tap` parece um
 *     argumento posicional e o runner deixa de ser «pelado».
 *
 * Os erros que restam vao todos na mesma direccao: um ficheiro que corre e
 * que o matcher nao ve fica orfao, nunca o contrario. E a direccao certa para
 * um contador que alimenta uma catraca — o pior que faz e pedir uma
 * justificacao a mais, nunca deixar passar um orfao a menos.
 */
export const EXTENSOES_DE_TESTE = Object.freeze(['js', 'mjs', 'cjs', 'ts', 'tsx']);
const RE_FICHEIRO_TESTE = /\.test\.(?:js|mjs|cjs|ts|tsx)$/;
// `node_modules` nao e `node`: o runner tem de vir seguido de espaco ou fim.
const RE_RUNNER = /(^|[\s/])(node|tsx|npx|vitest|jest)(\s|$)|(^|\s)--test(\s|$)/;
const VITEST_INCLUDE_OMISSAO = Object.freeze(['**/*.{test,spec}.?(c|m)[jt]s?(x)']);
// O que `node --test` pelado descobre (docs do node:test); com `tsx` a frente,
// o loader deixa passar `.ts` tambem.
const NODE_TEST_OMISSAO = '**/*.test.?(c|m)js';
const TSX_TEST_OMISSAO = '**/*.test.?(c|m)[jt]s';
const JEST_OMISSAO = '**/*.test.[jt]s?(x)';

const escaparRe = (s) => String(s).replace(/[.+^$()|\\]/g, '\\$&');

/**
 * Um glob de caminho, nas regras do `node --test` / vitest, para RegExp
 * ancorada. Nao e o minimatch inteiro — e o subconjunto que aparece em
 * scripts deste repo, cada regra com um caso no teste:
 *
 *   `*`      um segmento (nao atravessa `/`)
 *   `**` `/` zero ou mais directorios
 *   `?`      um caracter
 *   `{a,b}`  alternativa
 *   `?(x|y)` opcional (extglob, usado no default do vitest)
 *   `[jt]`   classe de caracteres, passa como esta
 */
export function globParaRegex(glob) {
  const g = String(glob);
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const ch = g[i];
    if (ch === '*') {
      if (g[i + 1] === '*') {
        if (g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (ch === '?' && g[i + 1] === '(') {
      const fim = g.indexOf(')', i);
      if (fim < 0) { re += '[^/]'; continue; }
      re += '(?:' + g.slice(i + 2, fim).split('|').map(escaparRe).join('|') + ')?';
      i = fim;
    } else if (ch === '?') {
      re += '[^/]';
    } else if (ch === '{') {
      const fim = g.indexOf('}', i);
      if (fim < 0) { re += '\\{'; continue; }
      re += '(?:' + g.slice(i + 1, fim).split(',').map(escaparRe).join('|') + ')';
      i = fim;
    } else if (ch === '[') {
      const fim = g.indexOf(']', i);
      if (fim < 0) { re += '\\['; continue; }
      re += g.slice(i, fim + 1);
      i = fim;
    } else {
      re += escaparRe(ch);
    }
  }
  return new RegExp('^' + re + '$');
}

/**
 * Um bloco `run:` partido nos comandos que a shell executa: por `&&`, `||`,
 * `|`, `;`, `&` e fim de linha — FORA de aspas, porque o `test` do router
 * leva `--test-skip-pattern="(a|b|c)"` e partir ai deixava 97 ficheiros num
 * comando sem runner. Continuacoes de linha (`\` + newline) juntam-se antes.
 */
export function comandosDe(bloco) {
  const s = String(bloco).replace(/\s*\\\r?\n\s*/g, ' ');
  const out = [];
  let cur = '';
  let aspas = null;
  for (const ch of s) {
    if (aspas) { cur += ch; if (ch === aspas) aspas = null; continue; }
    if (ch === '"' || ch === "'") { aspas = ch; cur += ch; continue; }
    if (ch === '\n' || ch === ';' || ch === '|' || ch === '&') { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim()).filter((c) => c && !c.startsWith('#'));
}

/** Os argumentos de um comando, com as aspas retiradas e o conteudo inteiro. */
export function argumentosDe(comando) {
  const out = [];
  let cur = '';
  let aspas = null;
  let vazioEntreAspas = false;
  for (const ch of String(comando)) {
    if (aspas) { if (ch === aspas) aspas = null; else cur += ch; continue; }
    if (ch === '"' || ch === "'") { aspas = ch; vazioEntreAspas = true; continue; }
    if (/\s/.test(ch)) { if (cur || vazioEntreAspas) out.push(cur); cur = ''; vazioEntreAspas = false; continue; }
    cur += ch;
  }
  if (cur || vazioEntreAspas) out.push(cur);
  return out;
}

export function testesGateados({ raiz = RAIZ_REPO, runImpl = execFileSync, readImpl = fs.readFileSync, readdirImpl = fs.readdirSync } = {}) {
  const gitLs = (padroes) => {
    const out = String(runImpl('git', ['ls-files', '-z', ...padroes], {
      cwd: raiz, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true,
    }) || '');
    return out.split('\0').map((s) => s.trim()).filter(Boolean);
  };

  let ficheiros;
  try {
    ficheiros = gitLs(EXTENSOES_DE_TESTE.map((e) => `*.test.${e}`));
  } catch (e) {
    return parcela('testes_gateados', { porque: `git ls-files falhou: ${String(e && e.message).slice(0, 90)}` });
  }
  if (!ficheiros.length) {
    return parcela('testes_gateados', { porque: 'nenhum ficheiro de teste versionado — nao ha o que gatear' });
  }

  // Os package.json sao DESCOBERTOS, nunca listados a mao. A primeira versao
  // tinha cinco caminhos escritos no codigo e deixava seis pacotes de fora —
  // entre eles o `landing`, o `hub` e o `vscode-extension`, todos com o `test`
  // invocado pelo CI. Um denominador com uma lista escrita a mao mente na
  // direccao de quem a escreveu, e ninguem da por isso.
  let pkgs = [];
  try {
    pkgs = gitLs(['package.json', '*/package.json', '*/*/package.json']).filter((f) => !f.includes('node_modules/'));
  } catch { /* sem package.json e um estado legitimo */ }
  const scriptsDe = new Map();
  for (const rel of pkgs) {
    try {
      const j = JSON.parse(String(readImpl(path.join(raiz, rel), 'utf8')));
      const base = path.posix.dirname(rel.split(path.sep).join('/'));
      scriptsDe.set(base === '.' ? '' : base, (j && j.scripts) || {});
    } catch { /* package.json partido nao cobre nada */ }
  }

  const cobertos = new Set();   // caminhos nomeados
  const padroes = [];           // RegExp de globs, ja relativas a raiz
  const juntar = (base, rel) => path.posix.normalize(base ? `${base}/${rel}` : rel).replace(/^\.\//, '');
  const cobrirGlob = (base, glob) => padroes.push(globParaRegex(juntar(base, glob)));

  // O `include` do vitest do directorio onde ele corre; sem ficheiro de
  // configuracao, ou sem `include` dentro de `test: {}`, o default do vitest.
  const includeDoVitest = (base) => {
    for (const nome of ['vitest.config.ts', 'vitest.config.js', 'vitest.config.mts', 'vitest.config.mjs']) {
      let src;
      try { src = String(readImpl(path.join(raiz, base, nome), 'utf8')); } catch { continue; }
      const bloco = /\btest\s*:\s*\{/.exec(src);
      const m = /\binclude\s*:\s*\[([^\]]*)\]/.exec(bloco ? src.slice(bloco.index) : '');
      if (!m) return VITEST_INCLUDE_OMISSAO;
      const globs = [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
      return globs.length ? globs : VITEST_INCLUDE_OMISSAO;
    }
    return VITEST_INCLUDE_OMISSAO;
  };

  /**
   * Um bloco `run:` do CI, resolvido no `working-directory` onde ele corre.
   *
   * O `working-directory` nao e cosmetico: `npm test` em `packages/cli` e
   * `npm test` em `landing` sao dois comandos diferentes a correr dois
   * conjuntos diferentes. A primeira versao procurava a string `npm run <nome>`
   * em qualquer sitio do YAML, e dava por coberto o `test` de um pacote so
   * porque OUTRO pacote tinha um script com o mesmo nome.
   */
  const analisarComando = (base, bloco, profundidade = 0) => {
    if (profundidade > 3) return; // scripts a chamarem-se uns aos outros
    for (const c of comandosDe(bloco)) {
      // Um wrapper com `--cwd X -- <cmd>` corre `<cmd>` DENTRO de X. E o caso
      // do `test:cli-guardado`, que corre o `npm test` do `packages/cli` a
      // partir da raiz: sem isto, os 82 ficheiros de teste do CLI apareciam
      // como orfaos por o analisador procurar um script `test` na raiz.
      const mCwd = /--cwd\s+(\S+)\s+--\s+(.+)$/.exec(c);
      if (mCwd) { analisarComando(mCwd[1].replace(/\/$/, ''), mCwd[2], profundidade + 1); continue; }

      // `npm test` / `npm run x` expande-se no package.json DESTE directorio.
      const s = scriptsDe.get(base);
      if (s) {
        for (const m of c.matchAll(/(?:^|\s)npm\s+(?:run(?:\s+-\S+)*\s+(\S+)|(test))(?=\s|$)/g)) {
          const alvo = s[m[1] || m[2]];
          if (alvo) analisarComando(base, alvo, profundidade + 1);
        }
      }

      // Sem runner, um nome de ficheiro e texto. `echo a.test.mjs` nao corre nada.
      if (!RE_RUNNER.test(c)) continue;

      if (/(^|[\s/])vitest(\s|$)/.test(c)) { for (const g of includeDoVitest(base)) cobrirGlob(base, g); continue; }
      if (/(^|[\s/])jest(\s|$)/.test(c)) { cobrirGlob(base, JEST_OMISSAO); continue; }

      const args = argumentosDe(c);
      const iTest = args.indexOf('--test');
      // Posicionais depois do `--test`: o que nao e flag nem redireccao.
      const posicionais = [];
      for (let i = iTest + 1; iTest >= 0 && i < args.length; i++) {
        const a = args[i];
        if (/^\d*[<>]/.test(a)) { if (!/[<>]./.test(a)) i += 1; continue; } // `> log` / `>log` / `2>&1`
        if (a.startsWith('-')) continue;
        posicionais.push(a);
      }
      if (iTest >= 0 && !posicionais.length) {
        // Runner pelado: descobre sozinho, recursivamente, a partir do cwd.
        // A raiz cobriria o repositorio inteiro, e nada corre `node --test`
        // na raiz. Assumi-lo daria 100% a esta parcela sem ninguem correr um
        // teste — por isso a raiz nao conta.
        if (base) cobrirGlob(base, /(^|[\s/])tsx(\s|$)/.test(c) ? TSX_TEST_OMISSAO : NODE_TEST_OMISSAO);
        continue;
      }
      for (const a of posicionais) {
        if (/[*?{[]/.test(a)) cobrirGlob(base, a);
        else if (RE_FICHEIRO_TESTE.test(a)) cobertos.add(juntar(base, a));
      }
    }
  };

  const dirWf = path.join(raiz, '.github', 'workflows');
  let nomesWf = [];
  try {
    nomesWf = readdirImpl(dirWf).filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'));
  } catch (e) {
    return parcela('testes_gateados', { porque: `workflows ilegiveis: ${String(e && e.message).slice(0, 90)}` });
  }

  for (const nome of nomesWf) {
    let linhas;
    try { linhas = String(readImpl(path.join(dirWf, nome), 'utf8')).split('\n'); } catch { continue; }
    // O `working-directory` pode viver no JOB, em `defaults: run:`, e valer para
    // todos os passos. E o caso do `publish-cockpit.yml`: sem isto, os 91
    // ficheiros de teste da extensao apareciam como orfaos, quando na verdade o
    // `node --test src/*.test.js` corre dentro de `packages/vscode-extension`.
    let wdJob = '';
    let emSteps = false;
    for (const l of linhas) {
      if (/^\s{2,}steps:\s*$/.test(l)) { emSteps = true; continue; }
      if (emSteps) continue;
      const m = /^\s*working-directory:\s*(\S+)/.exec(l);
      if (m) wdJob = m[1].replace(/['"]/g, '').replace(/^\.\//, '');
    }
    let wd = wdJob;
    let dentroDeRun = false;
    let bufferRun = [];
    const fecharRun = () => {
      if (bufferRun.length) analisarComando(wd, bufferRun.join('\n'));
      bufferRun = [];
      dentroDeRun = false;
    };
    for (const l of linhas) {
      if (/^\s*-\s+(name|uses):/.test(l)) { fecharRun(); wd = wdJob; continue; }
      const mWd = /^\s*working-directory:\s*(\S+)/.exec(l);
      if (mWd) { wd = mWd[1].replace(/['"]/g, '').replace(/^\.\//, ''); continue; }
      const mRun = /^\s*run:\s*(.*)$/.exec(l);
      if (mRun) {
        const resto = mRun[1].trim();
        if (resto && !/^[|>]/.test(resto)) { analisarComando(wd, resto); dentroDeRun = false; } else { dentroDeRun = true; bufferRun = []; }
        continue;
      }
      if (dentroDeRun) {
        if (/^\s*[\w-]+:\s/.test(l)) fecharRun();
        else bufferRun.push(l);
      }
    }
    fecharRun();
  }

  const estaCoberto = (rel) => cobertos.has(rel) || padroes.some((re) => re.test(rel));

  const orfaos = ficheiros.filter((f) => !estaCoberto(f));
  return parcela('testes_gateados', {
    num: ficheiros.length - orfaos.length,
    den: ficheiros.length,
    fonte: 'git ls-files *.test.{js,mjs,cjs,ts,tsx} × comandos com runner nos workflows, resolvidos no working-directory de cada passo',
    porque: orfaos.length
      ? `${orfaos.length} ficheiros de teste nao sao alcancados por nada que o CI invoque`
      : 'todos os ficheiros de teste versionados sao alcancados pelo CI',
    orfaos,
  });
}

// ── C2 · medicoes com recibo de censo ───────────────────────────────────────

/**
 * Uma medicao com recibo e uma que foi **verificada contra ficheiros reais**.
 *
 * O `evidence-verifier` da um veredicto a cada ronda que produziu uma afirmacao.
 * `citacao-ok` quer dizer que a citacao do modelo apontava para um ficheiro:linha
 * que existe mesmo. `refutado`, `sem-citacao` e ausencia de veredicto sao
 * afirmacoes sem recibo valido — e sao elas que fazem o denominador valer a pena.
 *
 * As rondas `nada-por-rever` (o loop correu e nao havia nada para rever) ficam
 * FORA das duas pontas: nao sao uma afirmacao, e conta-las como sucesso ou como
 * falha era inventar um juizo sobre uma coisa que nao aconteceu.
 */
export const VEREDICTO_COM_RECIBO = 'citacao-ok';
export const VEREDICTO_SEM_AFIRMACAO = 'nada-por-rever';

export function recibosDeCenso({ caminho = path.join(os.homedir(), '.mooter', 'runner-ledger.jsonl'), readImpl = fs.readFileSync } = {}) {
  let bruto;
  try {
    bruto = String(readImpl(caminho, 'utf8'));
  } catch {
    return parcela('recibos_de_censo', { porque: `sem registo de recibos em ${caminho} — o loop nunca correu nesta maquina` });
  }
  let comRecibo = 0;
  let afirmacoes = 0;
  let semAfirmacao = 0;
  let partidas = 0;
  for (const linha of bruto.split('\n')) {
    if (!linha.trim()) continue;
    let j;
    try { j = JSON.parse(linha); } catch { partidas += 1; continue; }
    const v = j && j.verdict;
    if (v === VEREDICTO_SEM_AFIRMACAO) { semAfirmacao += 1; continue; }
    afirmacoes += 1;
    if (v === VEREDICTO_COM_RECIBO) comRecibo += 1;
  }
  if (!afirmacoes) {
    return parcela('recibos_de_censo', { porque: `${semAfirmacao} rondas, nenhuma produziu uma afirmacao — nao ha o que ter recibo` });
  }
  return parcela('recibos_de_censo', {
    num: comRecibo,
    den: afirmacoes,
    fonte: path.basename(caminho),
    porque: `${afirmacoes - comRecibo} afirmacoes sem recibo valido · ${semAfirmacao} rondas sem afirmacao (fora das contas) · ${partidas} linhas partidas`,
  });
}

// ── C3 · vereditos adversariais publicados ──────────────────────────────────

/**
 * Um critico que ninguem le nao criticou.
 *
 * A regra do MP e "adversario em motor diferente por PR, com o veredicto
 * PUBLICADO em comentario". Isto conta: dos PRs abertos, quantos tem um
 * comentario com um veredicto adversarial.
 *
 * O padrao esta fixado aqui e nao se afina depois de ver o numero.
 */
export const PADRAO_VEREDICTO = /VEREDICTO:\s*(BLOQUEIA|PASSA)/i;

export function veredictosPublicados({ prs = null } = {}) {
  if (!prs) {
    return parcela('vereditos_publicados', { porque: 'sem acesso ao GitHub — a parcela vale zero em vez de fingir que nao ha PRs' });
  }
  if (!prs.length) {
    return parcela('vereditos_publicados', { porque: 'zero PRs abertos — nao ha o que julgar' });
  }
  const com = prs.filter((p) => (p.comentarios || []).some((c) => PADRAO_VEREDICTO.test(String(c))));
  return parcela('vereditos_publicados', {
    num: com.length,
    den: prs.length,
    fonte: 'gh api graphql · comentarios dos PRs abertos',
    porque: `${prs.length - com.length} PRs abertos sem veredicto adversarial publicado`,
  });
}

// ── C4 · devices no mesmo sha ───────────────────────────────────────────────

/**
 * Uma frota em shas diferentes nao mede a mesma coisa — mede coisas diferentes
 * e chama-lhes o mesmo nome. O numerador sao os devices cujo codigo CARREGADO e
 * o mesmo que o `origin/main`; o denominador sao os devices com beacon fresco.
 *
 * Usa-se o `sha_carregado` e nao o `sha_disco` de proposito: o que decide o que
 * um device faz e o codigo que ele tem em memoria, nao o que esta no checkout a
 * espera de um restart.
 */
export function devicesNoMesmoSha({ frota = null, shaAlvo = null, rejeitados = null } = {}) {
  if (!frota) {
    // Dois n/d diferentes, e nao se podem confundir: «nao ha ficheiros» e uma
    // pasta por montar; «ha ficheiros e todos rejeitados» e uma frota que
    // deixou de emitir. A 2026-09-11 era o segundo caso — 3 beacons, os 3 com
    // assinatura expirada (o mais recente com 8 dias) — e a parcela dizia
    // «vault nao montado» com o vault montado.
    if (Array.isArray(rejeitados) && rejeitados.length) {
      const lista = rejeitados.map((r) => `${r.device || r.ficheiro}: ${r.codigo || 'rejeitado'}${r.ts ? ' (' + String(r.ts).slice(0, 10) + ')' : ''}`).join(' · ');
      return parcela('devices_no_mesmo_sha', { porque: `${rejeitados.length} beacon(s), todos rejeitados — ${lista}` });
    }
    return parcela('devices_no_mesmo_sha', { porque: 'sem beacons legiveis — o vault nao esta montado ou a pasta da frota nao existe' });
  }
  if (!shaAlvo) {
    return parcela('devices_no_mesmo_sha', { porque: 'sem sha de referencia (origin/main) — nao ha contra o que comparar' });
  }
  const frescos = frota.filter((d) => d && d.codigo && d.codigo.sha_carregado);
  if (!frescos.length) {
    return parcela('devices_no_mesmo_sha', { porque: `${frota.length} beacons, nenhum com sha carregado declarado` });
  }
  const curto = String(shaAlvo).slice(0, 12);
  const iguais = frescos.filter((d) => String(d.codigo.sha_carregado).slice(0, 12) === curto);
  const fora = frescos.filter((d) => !iguais.includes(d))
    .map((d) => `${d.device}@${String(d.codigo.sha_carregado).slice(0, 8)}`);
  return parcela('devices_no_mesmo_sha', {
    num: iguais.length,
    den: frescos.length,
    fonte: `beacons da frota × origin/main ${curto}`,
    porque: fora.length ? `fora do sha: ${fora.join(', ')}` : 'toda a frota no mesmo sha',
  });
}

// ── C5 · cobertura de telemetria ────────────────────────────────────────────

/**
 * O que nao esta instrumentado nao existe — e o que esta instrumentado a meio
 * e pior, porque produz medias sobre a metade que respondeu.
 *
 * ── A PRIMEIRA VERSAO DESTA PARCELA MEDIA A COISA ERRADA ────────────────────
 *
 * A 2026-08-26 esta parcela contava a fraccao de linhas do `decisions_v2.jsonl`
 * com `tokens_in > 0 && tokens_out > 0`, e deu **0/4830**. O numero era
 * verdadeiro e a leitura era errada: esse ficheiro e escrito pelo hook
 * `UserPromptSubmit`, que corre ANTES de o modelo responder — os tokens sao
 * zero por construcao, nao por falta de instrumentacao. Um contador que so pode
 * dar zero nao mede cobertura nenhuma.
 *
 * A 2026-08-28 entrou em `main` o `tools/router/recibo.js`: os tokens sempre
 * estiveram no disco (`~/.claude/projects/** /*.jsonl`, `message.usage`
 * completo) e o recibo atribui cada chamada ao turno humano pela cadeia
 * `parentUuid`, e casa cada turno com a decisao do router (mesma sessao,
 * janela de 30 s). E ESSA a cobertura que interessa a metrica-mae:
 *
 *     num = turnos humanos com custo medido E com decisao do router casada
 *     den = turnos humanos com custo medido
 *
 * O que falta no numerador nao e «tokens em falta» — e custo REAL que nenhuma
 * recomendacao consegue reclamar.
 *
 * ── O QUE ESTA PARCELA MEDE, E O QUE NAO MEDE (limitacao escrita) ────────────
 *
 * O nome `cobertura_de_telemetria` fica por ser o id da parcela; a descricao
 * passou a «turnos com custo casados com decisao», que e o que o numero e.
 * Um adversario leu o `recibo.js` de main e mostrou tres coisas:
 *
 *   · o denominador nao e «todos os turnos»: `recibo.js` so cria um turno a
 *     partir de chamadas que trazem `message.usage` (linha ~227). Um turno
 *     sem `usage` nao existe para o recibo; uma chamada com `usage` mas sem
 *     preco na tabela cria o turno na mesma (`semPreco`);
 *   · o casamento decisao→turno e por janela de 30 s dentro da mesma sessao e
 *     NAO CONSOME a decisao (`casar`, linha ~298): uma decisao em 100000 ms
 *     foi atribuida a dois turnos, em 101000 e 120000 ms. `session_id`
 *     restringe a sessao, nao prova causalidade. Logo o numerador pode contar
 *     a mesma decisao duas vezes, e a parcela sobre-conta nessa medida;
 *   · a fonte das decisoes e `~/.claude/tools/router/decisions.log` filtrado
 *     por `event === 'classified'` — a interseccao entre transcripts do Claude
 *     Code e esse historico. Nao mede a instrumentacao de todos os motores
 *     (Codex, Kimi, Ollama nao passam por aqui), nem so deste projecto.
 *
 * O numero que aqui se escreve e DATADO e mexe-se sozinho: a 2026-09-11 esta
 * maquina deu **81/1686** em 524 transcripts (4,8 %); nos 40 mais recentes,
 * 53/240. Uma hora depois, o adversario obteve 81/1689 em 527 transcripts.
 * Outra corrida da outro numero, e nenhum dos dois esta errado.
 *
 * O ramo `session_id` que existia num branch paralelo (`ab-audit/telemetria`)
 * foi abandonado: `recibo.js` documenta porque essa chave reconstruia o defeito
 * dos «25 por prompt».
 */
export const CAMPOS_TELEMETRIA = Object.freeze(['tokens_in', 'tokens_out']);

function reciboReal() {
  // CJS a partir de ESM — o recibo vive em tools/router e e require()-avel.
  return createRequire(import.meta.url)('../../router/recibo.js').recibo;
}

export function coberturaDeTelemetria({ reciboImpl = null, limite = 0 } = {}) {
  let r;
  try {
    const fn = reciboImpl || reciboReal();
    r = fn(limite ? { limite } : {});
  } catch (e) {
    return parcela('cobertura_de_telemetria', { porque: `recibo.js indisponivel: ${e && e.message ? e.message : e}` });
  }
  if (!r || !Number.isFinite(r.turnos)) {
    return parcela('cobertura_de_telemetria', { porque: 'recibo devolveu uma forma que nao se le' });
  }
  if (!r.turnos) {
    return parcela('cobertura_de_telemetria', {
      porque: `0 turnos humanos com custo medido em ${r.transcriptsLidos || 0} transcript(s) — sem denominador nao ha cobertura`,
    });
  }
  const num = Number(r.comDecisao) || 0;
  return parcela('cobertura_de_telemetria', {
    num,
    den: r.turnos,
    fonte: `recibo.js — ${r.transcriptsLidos}/${r.transcriptsTotais} transcripts, ${r.chamadas} chamadas com usage`,
    porque: `${r.turnos - num} turnos com custo medido sem decisao do router casada — custo real que nenhuma recomendacao reclama. Mede turnos com custo medido (so chamadas com usage) que casam com uma decisao do router (mesma sessao, janela 30 s, sem consumo: uma decisao pode casar com dois turnos) — nao mede instrumentacao de todos os motores. O decisions_v2.jsonl traz tokens a 0 por construcao (o hook escreve antes de o modelo responder)`,
  });
}

// ── C6 · higiene de PRs abertos ─────────────────────────────────────────────

/**
 * Trabalho parado a apodrecer e divida, e um PR de 40 dias ja nao aplica no
 * `main` de hoje. Saudavel = **nao-draft e com menos de 14 dias**.
 *
 * Nao se usa `mergeable`: o GitHub calcula-o preguicosamente e devolve
 * `UNKNOWN` na maioria dos PRs que ninguem abriu recentemente. Um criterio que
 * depende de um campo que costuma vir vazio nao e um criterio.
 */
export const IDADE_SAUDAVEL_DIAS = 14;

export function higieneDePrs({ prs = null, agora = null } = {}) {
  if (!prs) {
    return parcela('higiene_de_prs', { porque: 'sem acesso ao GitHub — a parcela vale zero em vez de fingir que nao ha PRs' });
  }
  if (!prs.length) {
    return parcela('higiene_de_prs', { porque: 'zero PRs abertos — a fila esta vazia' });
  }
  if (!Number.isFinite(agora)) {
    return parcela('higiene_de_prs', { porque: 'sem relogio injectado — a idade nao se calcula' });
  }
  const dias = (iso) => (agora - Date.parse(iso)) / 86400000;
  const sao = prs.filter((p) => !p.draft && Number.isFinite(dias(p.criado)) && dias(p.criado) <= IDADE_SAUDAVEL_DIAS);
  const velhos = prs.filter((p) => dias(p.criado) > IDADE_SAUDAVEL_DIAS).length;
  const drafts = prs.filter((p) => p.draft).length;
  return parcela('higiene_de_prs', {
    num: sao.length,
    den: prs.length,
    fonte: 'gh pr list --state open',
    porque: `${velhos} com mais de ${IDADE_SAUDAVEL_DIAS} dias · ${drafts} em draft`,
  });
}

// ── C7 · limiares derivados de medicao ──────────────────────────────────────

/**
 * Um limiar escolhido a olho e um palpite com autoridade: ninguem lhe pergunta
 * de onde veio, porque esta em codigo.
 *
 * O DENOMINADOR e construido a partir do **codigo**, nao do registo. E de
 * proposito: se o registo fosse a unica fonte, esconder um limiar seria tao
 * facil como nao o escrever la, e a parcela subia por omissao. Um limiar no
 * codigo que nao esteja no registo conta como **nao medido**.
 *
 * ⚠️ NOTA SOBRE ESTE PROPRIO SCANNER, medida a 2026-08-26. A primeira versao
 * usava `^export const ([A-Z][A-Z0-9_]*(?:LIMIAR|LIMIARES|...))` — e o `[A-Z]`
 * comia o `L` de `LIMIARES`, portanto o alvo mais importante do repo (o portao
 * `LIMIARES` de `portao.mjs`) era o UNICO que o scanner nao via. Um denominador
 * construido por regex pode falhar em silencio, e falha primeiro no caso que
 * mais interessa. Por isso o nome e capturado inteiro e testado **depois**.
 */
export const SUFIXOS_DE_LIMIAR = /(MINIMO|MAXIMO|LIMIAR|LIMIARES|ALARM|TOLERANCE|THRESHOLD|TETO|PISO|_S|_MS|_PCT|_GB|_DIAS|_LENGTH|_LINES|_BYTES)$/;

export function limiaresNoCodigo({ raiz = RAIZ_REPO, dirRel = 'tools/cockpit/runner', readdirImpl = fs.readdirSync, readImpl = fs.readFileSync } = {}) {
  const dir = path.join(raiz, dirRel);
  const achados = [];
  let nomes;
  try { nomes = readdirImpl(dir); } catch { return achados; }
  for (const f of nomes) {
    if (!f.endsWith('.mjs') || f.includes('.test.')) continue;
    let linhas;
    try { linhas = String(readImpl(path.join(dir, f), 'utf8')).split('\n'); } catch { continue; }
    linhas.forEach((l, i) => {
      const m = /^export const ([A-Z][A-Z0-9_]*)\s*=\s*(.+)$/.exec(l.trim());
      if (!m) return;
      if (!SUFIXOS_DE_LIMIAR.test(m[1])) return;
      const valor = m[2].trim();
      // So numeros e objectos congelados de limiares. Uma string longa com um
      // nome que acaba em `_S` nao e um limiar.
      if (!/^[-\d]|^Object\.freeze|^\{/.test(valor)) return;
      achados.push({ id: `${dirRel}/${f}:${m[1]}`, ficheiro: `${dirRel}/${f}`, linha: i + 1, nome: m[1] });
    });
  }
  return achados;
}

export function limiaresMedidos({ raiz = RAIZ_REPO, readImpl = fs.readFileSync, scanImpl = limiaresNoCodigo } = {}) {
  const noCodigo = scanImpl({ raiz });
  if (!noCodigo.length) {
    return parcela('limiares_medidos', { porque: 'nenhum limiar encontrado no codigo — o scanner nao viu nada, o que e por si um problema' });
  }
  let registo = {};
  let erroRegisto = null;
  try {
    registo = JSON.parse(String(readImpl(path.join(raiz, 'tools', 'cockpit', 'runner', 'limiares.json'), 'utf8'))).limiares || {};
  } catch (e) {
    erroRegisto = String(e && e.message).slice(0, 80);
  }
  const medidos = noCodigo.filter((l) => {
    const r = registo[l.id];
    return r && r.medicao && typeof r.medicao.onde === 'string' && r.medicao.onde.length > 10;
  });
  const semRegisto = noCodigo.filter((l) => !registo[l.id]).length;
  return parcela('limiares_medidos', {
    num: medidos.length,
    den: noCodigo.length,
    fonte: 'scan do codigo × tools/cockpit/runner/limiares.json',
    porque: erroRegisto
      ? `registo de limiares ilegivel (${erroRegisto}) — todos contam como nao medidos`
      : `${noCodigo.length - medidos.length} limiares sem medicao declarada, dos quais ${semRegisto} nem sequer estao no registo`,
  });
}

// ── o indice ────────────────────────────────────────────────────────────────

export function indice(parcelas) {
  const pontos = parcelas.reduce((a, p) => a + p.pontos, 0);
  const naoMedidas = parcelas.filter((p) => p.valor === null);
  return {
    pontos: Math.round(pontos * 100) / 100,
    total: TOTAL_PESOS,
    pct: Math.round((1000 * pontos) / TOTAL_PESOS) / 10,
    parcelas,
    nao_medidas: naoMedidas.map((p) => p.id),
    // Um indice com parcelas por medir vale menos do que o numero diz, e quem o
    // le tem de saber isso sem ir procurar.
    peso_nao_medido: Math.round(naoMedidas.reduce((a, p) => a + p.peso, 0) * 100) / 100,
  };
}

export const NOMES = Object.freeze({
  testes_gateados: 'testes gateados pelo CI',
  recibos_de_censo: 'medicoes com recibo de censo',
  vereditos_publicados: 'vereditos adversariais publicados',
  devices_no_mesmo_sha: 'devices no mesmo sha',
  cobertura_de_telemetria: 'turnos com custo casados com decisao',
  higiene_de_prs: 'higiene de PRs abertos',
  limiares_medidos: 'limiares derivados de medicao',
});

export function imprimir(r) {
  const barra = (v) => (v === null ? '  n/d ' : `${String(Math.round(v * 100)).padStart(4)}% `);
  console.log(`INDICE DO ARNES  ${r.pontos.toFixed(2)} / ${r.total.toFixed(1)}  (${r.pct}%)`);
  // A data e o sha nao sao decoracao: sem eles este numero e uma afirmacao sem
  // data, e as parcelas leem estado vivo que se mexe entre duas corridas.
  // Dois shas, e nao um: C1 e C7 leem o checkout de HEAD (o codigo MEDIDO);
  // C4 compara a frota com origin/main (a REFERENCIA). Um so `sha` estampava
  // o origin/main e chamava-lhe o sha da medicao — um adversario apanhou.
  if (r.medido_em) {
    const shas = [
      r.sha_head ? `codigo medido HEAD ${r.sha_head}` : 'HEAD n/d',
      r.sha_origin_main ? `referencia da frota origin/main ${r.sha_origin_main}` : 'origin/main n/d',
    ].join(' · ');
    console.log(`medido em ${r.medido_em} · ${shas} — as parcelas leem estado vivo, outra corrida da outro numero`);
  }
  if (r.peso_nao_medido > 0) {
    console.log(`⚠ ${r.peso_nao_medido.toFixed(1)} pontos de peso NAO FORAM MEDIDOS e valem zero: ${r.nao_medidas.join(', ')}`);
  }
  console.log('');
  for (const p of r.parcelas) {
    const frac = p.valor === null ? 'n/d' : `${p.num}/${p.den}`;
    console.log(`${barra(p.valor)}${String(p.peso.toFixed(1)).padStart(4)}  ${NOMES[p.id].padEnd(34)} ${frac.padStart(12)}  ${p.pontos.toFixed(2)} pts`);
    if (p.porque) console.log(`${''.padEnd(12)}${p.porque}`);
    if (p.fonte) console.log(`${''.padEnd(12)}fonte: ${p.fonte}`);
  }
  return 0;
}

// ── recolha do mundo real ───────────────────────────────────────────────────

/**
 * Os PRs abertos e os comentarios deles, numa unica chamada.
 *
 * Um `gh pr view` por PR seriam 36 chamadas para responder a uma pergunta; o
 * GraphQL responde a tudo de uma vez. Sem rede, devolve `null` — e `null` faz
 * as parcelas C3 e C6 valerem ZERO com o porque escrito, nunca 100% por
 * ausencia de contra-prova.
 */
export function recolherPrs({ raiz = RAIZ_REPO, runImpl = execFileSync } = {}) {
  const q = `query { repository(owner: "pauloloureiroshp-ship-it", name: "mooter") {
    pullRequests(states: OPEN, first: 100) { nodes {
      number isDraft createdAt
      comments(last: 40) { nodes { body } }
    } } } }`;
  try {
    const out = String(runImpl('gh', ['api', 'graphql', '-f', `query=${q}`], {
      cwd: raiz, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true,
    }) || '');
    const j = JSON.parse(out);
    const nodes = j?.data?.repository?.pullRequests?.nodes;
    if (!Array.isArray(nodes)) return null;
    return nodes.map((p) => ({
      numero: p.number,
      draft: !!p.isDraft,
      criado: p.createdAt,
      comentarios: (p.comments?.nodes || []).map((c) => String(c.body || '')),
    }));
  } catch {
    return null;
  }
}

/** O sha de referencia: o `origin/main` que a frota devia estar a correr. */
export function shaDeReferencia({ raiz = RAIZ_REPO, runImpl = execFileSync } = {}) {
  return revParse('origin/main', { raiz, runImpl });
}

/** O sha do checkout MEDIDO: o HEAD de onde C1 e C7 leram ficheiros. */
export function shaDoHead({ raiz = RAIZ_REPO, runImpl = execFileSync } = {}) {
  return revParse('HEAD', { raiz, runImpl });
}

function revParse(ref, { raiz, runImpl }) {
  try {
    return String(runImpl('git', ['rev-parse', ref], {
      cwd: raiz, encoding: 'utf8', windowsHide: true,
    }) || '').trim() || null;
  } catch {
    return null;
  }
}

/**
 * A frota, lida dos beacons. Importa-se o leitor que ja existe em vez de ler os
 * JSON a mao: a verificacao de assinatura Ed25519 vive la, e um leitor proprio
 * seria um leitor sem ela.
 */
export async function recolherFrota() {
  try {
    const m = await import('./fleet-beacon.mjs');
    const b = m.beaconDir({});
    const r = m.readBeacons({ dir: b.dir, transporte: b.transporte, partilhado: b.partilhado });
    return {
      frota: Array.isArray(r.frota) && r.frota.length ? r.frota : null,
      rejeitados: Array.isArray(r.rejeitados) ? r.rejeitados : [],
    };
  } catch {
    return { frota: null, rejeitados: [] };
  }
}

/**
 * ⚠️ ESTE NUMERO NAO E REPRODUZIVEL, E TEM DE O DIZER.
 *
 * As sete parcelas leem estado VIVO — o indice do git, os registos que crescem
 * a cada ronda, e a API do GitHub. Entre escrever um numero e alguem o repetir,
 * ele mexe-se sozinho.
 *
 * Medido a 2026-08-26, com ~90 minutos entre as duas corridas: cinco das sete
 * parcelas derivaram. `testes_gateados` 419/599 -> 421/601, `vereditos` 2/36 ->
 * 2/38, `telemetria` 0/4830 -> 0/4833, `higiene_de_prs` 4/36 -> 6/38, e o total
 * 3,20 -> 3,24. Nenhuma linha de codigo mudou entre as duas.
 *
 * Foi um agente adversarial que apanhou isto: o PR que publicou o `3,20/10` no
 * titulo nao dizia de quando era, e quem corresse o comando obteria outro numero
 * e concluiria que o PR mentia. **Um numero sem carimbo de quando foi medido e
 * uma afirmacao sem data** — e este ficheiro existe precisamente para nao
 * publicar afirmacoes dessas.
 *
 * Por isso o `medido_em` viaja SEMPRE com o resultado, e o `imprimir` poe-no na
 * primeira linha.
 */
export async function calcular({ raiz = RAIZ_REPO, semRede = false, agora = Date.now() } = {}) {
  const prs = semRede ? null : recolherPrs({ raiz });
  const { frota, rejeitados } = await recolherFrota();
  const shaAlvo = shaDeReferencia({ raiz });
  const shaHead = shaDoHead({ raiz });
  const r = indice([
    testesGateados({ raiz }),
    recibosDeCenso({}),
    veredictosPublicados({ prs }),
    devicesNoMesmoSha({ frota, shaAlvo, rejeitados }),
    coberturaDeTelemetria({}),
    higieneDePrs({ prs, agora }),
    limiaresMedidos({ raiz }),
  ]);
  return {
    ...r,
    medido_em: new Date(agora).toISOString(),
    // DOIS shas, separados de proposito. `sha_head` e o checkout de onde C1
    // (workflows, package.json) e C7 (limiares) leram — o codigo MEDIDO.
    // `sha_origin_main` e a referencia contra a qual C4 compara a frota. A
    // primeira versao estampava so o origin/main e chamava-lhe «o sha da
    // medicao»: numa worktree com o branch a frente, o numero dizia ser de um
    // codigo que ninguem tinha medido.
    sha_head: shaHead ? String(shaHead).slice(0, 12) : null,
    sha_origin_main: shaAlvo ? String(shaAlvo).slice(0, 12) : null,
  };
}

// ── publicacao ──────────────────────────────────────────────────────────────

/**
 * O indice NAO se calcula dentro do beacon.
 *
 * Calcula-lo custa um `git ls-files` sobre o repo, a leitura de dois registos
 * de dezenas de milhar de linhas e uma chamada ao GitHub — entre 2 e 8 segundos
 * medidos. O beacon escreve-se a cada ronda do loop. Meter isto la dentro
 * transformava um sinal de vida barato numa operacao cara, e a primeira coisa
 * que ia acontecer era alguem desligar o beacon.
 *
 * Logo: quem calcula ESCREVE um instantaneo, e quem publica LE-O. E se o
 * instantaneo for velho, publica-se velho **com a idade a vista** — nunca
 * silenciosamente, e nunca omitido como se nao existisse.
 */
export const IDADE_MAX_S = 24 * 3600;
export const CAMINHO_INSTANTANEO = path.join(os.homedir(), '.mooter', 'indice-do-harness.json');

export function escreverInstantaneo(r, { caminho = CAMINHO_INSTANTANEO, agoraIso, writeImpl = fs.writeFileSync } = {}) {
  const magro = {
    // O carimbo vem do resultado quando ele o traz; o parametro continua a valer
    // para quem chama isto com um relogio injectado (os testes).
    ts: agoraIso || r.medido_em || null,
    sha_head: r.sha_head || null,
    sha_origin_main: r.sha_origin_main || null,
    pontos: r.pontos,
    total: r.total,
    pct: r.pct,
    peso_nao_medido: r.peso_nao_medido,
    nao_medidas: r.nao_medidas,
    // COM o `porque` de cada parcela: um `n/d` sem o porque e um numero mudo,
    // e o painel tem de poder dizer «sem acesso ao GitHub» em vez de so «n/d».
    // A primeira versao deitava-os fora aqui, e o leitor deitava fora o sha.
    // Sem a lista dos `orfaos`: um painel nao precisa de 190 caminhos para
    // mostrar `473/667`; a lista vive na catraca (`testes-orfaos.baseline.json`).
    parcelas: r.parcelas.map((p) => ({ id: p.id, peso: p.peso, num: p.num, den: p.den, porque: p.porque ?? null })),
  };
  writeImpl(caminho, JSON.stringify(magro, null, 2) + '\n');
  return magro;
}

export function lerInstantaneo({ caminho = CAMINHO_INSTANTANEO, agora = Date.now(), readImpl = fs.readFileSync } = {}) {
  let j;
  try {
    j = JSON.parse(String(readImpl(caminho, 'utf8')));
  } catch {
    // Ausente e um estado legitimo (ninguem correu o calculo ainda) e diz-se.
    // Um zero aqui seria lido como "o arnes vale zero", que e outra coisa.
    return { presente: false, porque: 'indice nunca calculado nesta maquina — correr `node tools/cockpit/runner/indice-do-harness.mjs --escrever`' };
  }
  const ts = Date.parse(j && j.ts);
  if (!Number.isFinite(ts)) {
    return { presente: false, porque: 'instantaneo sem carimbo de tempo legivel — nao se publica um numero sem saber de quando e' };
  }
  // SEM `Math.max(0, …)`: um carimbo no futuro dava `idade 0, fresco: true`,
  // que e a leitura mais confiante possivel de um relogio que esta errado.
  // Idade negativa e um sinal, nao um zero — publica-se como NAO fresco, com
  // o porque, e com o numero negativo a vista para quem for ver o relogio.
  const idade_s = Math.round((agora - ts) / 1000);
  const noFuturo = idade_s < 0;
  return {
    presente: true,
    fresco: !noFuturo && idade_s <= IDADE_MAX_S,
    idade_s,
    ...(noFuturo ? { porque: `relogio no futuro: o carimbo do instantaneo esta ${-idade_s} s a frente do relogio de quem le — nao se publica como fresco um numero de um relogio errado` } : {}),
    ts: j.ts,
    // Os dois shas viajam. Um instantaneo de antes de 2026-09-11 so tem `sha`,
    // e esse era o origin/main — le-se como tal, nunca como o HEAD medido.
    sha_head: typeof j.sha_head === 'string' ? j.sha_head : null,
    sha_origin_main: typeof j.sha_origin_main === 'string' ? j.sha_origin_main : (typeof j.sha === 'string' ? j.sha : null),
    pontos: j.pontos,
    total: j.total,
    pct: j.pct,
    peso_nao_medido: j.peso_nao_medido,
    nao_medidas: j.nao_medidas || [],
    parcelas: j.parcelas || [],
  };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
//
// No FIM do ficheiro, e nao a meio. O bloco precisa de `escreverInstantaneo` e
// de `CAMINHO_INSTANTANEO`, que sao declaracoes `const`: nao sobem por
// hoisting. Na primeira versao o bloco estava acima delas e o `--escrever`
// falhava — em silencio, porque o `process.exit()` da linha seguinte levava o
// processo antes de alguem reparar.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const semRede = process.argv.includes('--sem-rede');
  const r = await calcular({ semRede });
  if (process.argv.includes('--escrever')) {
    // O carimbo vem do relogio de quem calcula: e o que permite ao painel dizer
    // "de ha 3 h" em vez de publicar um numero sem idade.
    const m = escreverInstantaneo(r, { agoraIso: new Date().toISOString() });
    console.error(`instantaneo escrito em ${CAMINHO_INSTANTANEO} (${m.pontos}/${m.total})`);
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(0);
  }
  process.exit(imprimir(r));
}
