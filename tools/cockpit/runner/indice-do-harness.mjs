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
 *   1,5  cobertura de telemetria          o que nao esta instrumentado nao existe
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

/** Uma parcela. `valor` a null = nao medida = vale zero, e o `porque` diz-se. */
export function parcela(id, { num = null, den = null, porque = null, fonte = null, orfaos = null } = {}) {
  const medida = Number.isFinite(num) && Number.isFinite(den) && den > 0;
  return {
    id,
    peso: PESOS[id],
    num: Number.isFinite(num) ? num : null,
    den: Number.isFinite(den) ? den : null,
    valor: medida ? num / den : null,
    pontos: medida ? (num / den) * PESOS[id] : 0,
    porque,
    fonte,
    ...(orfaos ? { orfaos } : {}),
  };
}

// ── C1 · testes gateados pelo CI ────────────────────────────────────────────

/**
 * Um ficheiro de teste que nenhum workflow corre nao protege ninguem.
 *
 * O denominador sao os ficheiros `*.test.*` que o git segue. O numerador sao os
 * que estao ao alcance de alguma coisa que o CI invoca:
 *
 *   a) nomeados num `node --test ...` dentro de um workflow;
 *   b) nomeados num script de `package.json` que um workflow invoca com
 *      `npm run <nome>` (a raiz e os package.json dos pacotes);
 *   c) dentro de um directorio onde um workflow corre `node --test` **sem
 *      argumentos** — a descoberta automatica do node apanha-os todos.
 *
 * O (c) e o que impede este contador de mentir ao contrario: o
 * `packages/mooter-bridge` corre `node --test` pelado, e listar os ficheiros
 * dele um a um daria "0 cobertos" para um pacote inteiramente coberto.
 */
export function testesGateados({
  raiz = RAIZ_REPO, runImpl = execFileSync, readImpl = fs.readFileSync, readdirImpl = fs.readdirSync,
  /**
   * Inclui ficheiros ainda NAO versionados (mas nao ignorados).
   *
   * O INDICE usa `false`: o numero tem de ser reproduzivel, e um ficheiro de
   * rascunho na arvore de alguem nao pode mexer numa metrica publicada.
   *
   * O GUARDA (`teste-fora-do-ci.mjs`) usa `true`, e a razao esta medida: com
   * `false`, criar um `.test.mjs` novo e correr o guarda dava VERDE — `git
   * ls-files` so ve o que ja esta no indice do git. Um guarda que so morde
   * depois do commit chega tarde ao unico momento em que corrigir custa dois
   * minutos. E um guarda que nunca mordeu e indistinguivel de um partido: foi
   * um teste de mordida que apanhou isto, nao uma revisao.
   */
  incluirNaoVersionados = false,
} = {}) {
  const gitLs = (padroes) => {
    const extra = incluirNaoVersionados ? ['--cached', '--others', '--exclude-standard'] : [];
    const out = String(runImpl('git', ['ls-files', '-z', ...extra, ...padroes], {
      cwd: raiz, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, windowsHide: true,
    }) || '');
    return out.split('\0').map((s) => s.trim()).filter(Boolean);
  };

  let ficheiros;
  try {
    ficheiros = gitLs(['*.test.js', '*.test.mjs', '*.test.ts', '*.test.cjs']);
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

  const cobertos = new Set();
  const dirsDescoberta = new Set();
  const juntar = (base, rel) => path.posix.normalize(base ? `${base}/${rel}` : rel).replace(/^\.\//, '');

  /**
   * Um comando do CI, resolvido no `working-directory` onde ele corre.
   *
   * O `working-directory` nao e cosmetico: `npm test` em `packages/cli` e
   * `npm test` em `landing` sao dois comandos diferentes a correr dois
   * conjuntos diferentes. A primeira versao procurava a string `npm run <nome>`
   * em qualquer sitio do YAML, e dava por coberto o `test` de um pacote so
   * porque OUTRO pacote tinha um script com o mesmo nome.
   */
  const analisarComando = (base, cmd, profundidade = 0) => {
    const c = String(cmd).trim();
    if (profundidade > 3) return; // scripts a chamarem-se uns aos outros
    for (const m of c.matchAll(/[\w./@-]+\.test\.(?:mjs|js|ts|cjs)/g)) cobertos.add(juntar(base, m[0]));
    const dirDo = (d) => dirsDescoberta.add(d ? juntar(base, d) : (base || '.'));
    // Runners que DESCOBREM ficheiros sozinhos cobrem um directorio inteiro, e
    // lista-los um a um daria zero para um pacote inteiramente coberto.
    if (/(^|[\s/])(node|tsx) --test\s*$/.test(c)) dirDo('');
    if (/\b(vitest|jest)\b/.test(c)) dirDo('');
    for (const g of c.matchAll(/([\w./@-]*)\*[\w.*-]*\.test\.(?:mjs|js|ts|cjs)/g)) {
      dirDo(String(g[1] || '').replace(/\/$/, ''));
    }
    // Um wrapper com `--cwd X -- <cmd>` corre `<cmd>` DENTRO de X. E o caso do
    // `test:cli-guardado`, que corre o `npm test` do `packages/cli` a partir da
    // raiz: sem isto, os 82 ficheiros de teste do CLI apareciam como orfaos por
    // o analisador estar a procurar um script `test` na raiz, que nao existe.
    const mCwd = /--cwd\s+([\w./@-]+)\s+--\s+(.+)$/.exec(c);
    if (mCwd) { analisarComando(mCwd[1].replace(/\/$/, ''), mCwd[2], profundidade + 1); return; }

    // `npm test` / `npm run x` expande-se no package.json DESTE directorio.
    const s = scriptsDe.get(base);
    if (!s) return;
    for (const m of c.matchAll(/npm (?:run )?([\w:@./-]+)/g)) {
      const alvo = s[m[1]];
      if (alvo) analisarComando(base, alvo, profundidade + 1);
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

  const estaCoberto = (rel) => {
    if (cobertos.has(rel)) return true;
    for (const d of dirsDescoberta) {
      // A raiz cobriria o repositorio inteiro, e nada corre `node --test` na
      // raiz. Assumi-lo daria 100% a esta parcela sem ninguem correr um teste.
      if (d === '.' || d === '') continue;
      if (rel.startsWith(d.endsWith('/') ? d : d + '/')) return true;
    }
    return false;
  };

  const orfaos = ficheiros.filter((f) => !estaCoberto(f));
  return parcela('testes_gateados', {
    num: ficheiros.length - orfaos.length,
    den: ficheiros.length,
    fonte: 'git ls-files *.test.* × comandos dos workflows, resolvidos no working-directory de cada passo',
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
export function devicesNoMesmoSha({ frota = null, shaAlvo = null } = {}) {
  if (!frota) {
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
 * O que se conta e a fraccao de decisoes que trazem os campos de que a
 * metrica-mae precisa (`tokens_in` e `tokens_out`). Uma decisao sem eles entra
 * na contagem de volume e desaparece da de custo, e e assim que uma poupanca
 * se sobrestima sem ninguem mentir.
 */
export const CAMPOS_TELEMETRIA = Object.freeze(['tokens_in', 'tokens_out']);

export function coberturaDeTelemetria({ caminho = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions_v2.jsonl'), readImpl = fs.readFileSync, maxLinhas = 50000 } = {}) {
  let bruto;
  try {
    bruto = String(readImpl(caminho, 'utf8'));
  } catch {
    return parcela('cobertura_de_telemetria', { porque: `sem registo de decisoes em ${caminho}` });
  }
  const linhas = bruto.split('\n').filter((l) => l.trim()).slice(-maxLinhas);
  let total = 0;
  let completas = 0;
  for (const l of linhas) {
    let j;
    try { j = JSON.parse(l); } catch { continue; }
    total += 1;
    if (CAMPOS_TELEMETRIA.every((c) => Number(j && j[c]) > 0)) completas += 1;
  }
  if (!total) {
    return parcela('cobertura_de_telemetria', { porque: 'registo de decisoes vazio ou ilegivel' });
  }
  return parcela('cobertura_de_telemetria', {
    num: completas,
    den: total,
    fonte: `${path.basename(caminho)} (ultimas ${linhas.length} linhas)`,
    porque: `${total - completas} decisoes sem ${CAMPOS_TELEMETRIA.join(' e ')} — invisiveis para a metrica de custo`,
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
  cobertura_de_telemetria: 'cobertura de telemetria',
  higiene_de_prs: 'higiene de PRs abertos',
  limiares_medidos: 'limiares derivados de medicao',
});

export function imprimir(r) {
  const barra = (v) => (v === null ? '  n/d ' : `${String(Math.round(v * 100)).padStart(4)}% `);
  console.log(`INDICE DO ARNES  ${r.pontos.toFixed(2)} / ${r.total.toFixed(1)}  (${r.pct}%)`);
  // A data e o sha nao sao decoracao: sem eles este numero e uma afirmacao sem
  // data, e as parcelas leem estado vivo que se mexe entre duas corridas.
  if (r.medido_em) console.log(`medido em ${r.medido_em}${r.sha ? ` · sha ${r.sha}` : ''} — as parcelas leem estado vivo, outra corrida da outro numero`);
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
  try {
    return String(runImpl('git', ['rev-parse', 'origin/main'], {
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
    return Array.isArray(r.frota) && r.frota.length ? r.frota : null;
  } catch {
    return null;
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
  const frota = await recolherFrota();
  const shaAlvo = shaDeReferencia({ raiz });
  const r = indice([
    testesGateados({ raiz }),
    recibosDeCenso({}),
    veredictosPublicados({ prs }),
    devicesNoMesmoSha({ frota, shaAlvo }),
    coberturaDeTelemetria({}),
    higieneDePrs({ prs, agora }),
    limiaresMedidos({ raiz }),
  ]);
  return {
    ...r,
    medido_em: new Date(agora).toISOString(),
    // O sha do repo no momento da medicao: sem ele, duas corridas do mesmo
    // numero em arvores diferentes sao indistinguiveis.
    sha: shaAlvo ? String(shaAlvo).slice(0, 12) : null,
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
    sha: r.sha || null,
    pontos: r.pontos,
    total: r.total,
    pct: r.pct,
    peso_nao_medido: r.peso_nao_medido,
    nao_medidas: r.nao_medidas,
    // Sem os `porque` e sem os `orfaos`: o instantaneo e para o painel, e um
    // painel nao precisa da lista dos 180 ficheiros para mostrar `419/599`.
    parcelas: r.parcelas.map((p) => ({ id: p.id, peso: p.peso, num: p.num, den: p.den })),
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
  const idade_s = Math.max(0, Math.round((agora - ts) / 1000));
  return {
    presente: true,
    fresco: idade_s <= IDADE_MAX_S,
    idade_s,
    ts: j.ts,
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
