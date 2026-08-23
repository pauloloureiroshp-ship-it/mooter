#!/usr/bin/env node
/**
 * sync-cockpit.mjs — espelha o cockpit para ~/.claude/tools/cockpit/.
 *
 * A causa que este modulo existe para matar, medida a 2026-08-18:
 *   nada fora de `tools/cockpit/` importa o cockpit (`grep -rl tools/cockpit
 *   packages/ hub/ landing/` -> vazio), o `/mooter-update` so sincroniza
 *   `tools/router/*.js`, skills, agents e hooks, e o LaunchAgent aponta direto
 *   para dentro do checkout: `<checkout>/tools/cockpit/runner/moo-runner.mjs`.
 *   Ou seja: o runner nao tinha canal de distribuicao NENHUM. Melhora-lo
 *   melhorava uma maquina — a que tem o repo clonado.
 *
 * O erro que NAO se repete aqui: o `sync-hooks.js` nasceu porque o espelho dos
 * hooks existia e o `settings.json` apontava para outro sitio — 63 sessoes, 0
 * journals, em silencio. Um espelho que ninguem corre e decoracao. Por isso o
 * self-check nao se limita a comparar shas: vai ver O QUE A MAQUINA CORRE.
 *
 * COMO ELE SABE (medido a 2026-08-22, e a razao de a primeira versao mentir).
 *
 *   A primeira versao respondia a pergunta certa com a prova errada: ia ler um
 *   `~/Library/LaunchAgents/ai.mooter.runner.plist` — caminho que so existe em
 *   macOS — e, quando nao o encontrava, afirmava "nada o corre". Em Windows isso
 *   e estruturalmente impossivel de passar: gritava sempre. E gritava FALSO — na
 *   maquina do dono havia dois processos vivos, `moo-runner.mjs` e
 *   `f10-server.mjs`, ambos a correr a partir do checkout. Um verificador
 *   cronicamente vermelho e um verificador que se ignora, e no dia em que a
 *   maquina correr mesmo a copia errada ninguem repara — a mesma doenca que o
 *   `ci-coerencia.mjs` teve de curar na mesma semana.
 *
 *   A pergunta verdadeira nunca foi "que lancador esta instalado?" mas "o que
 *   esta a correr vem do espelho ou de outra copia?". Essa responde-se olhando
 *   para os PROCESSOS VIVOS — independente de plataforma, e prova mais forte do
 *   que um ficheiro de configuracao (um lancador pode estar instalado e parado;
 *   um processo vivo esta, por definicao, a correr). O lancador passa a ser o
 *   plano B, para quando o cockpit esta legitimamente parado — e ai e lido no
 *   sitio certo de cada sistema: plist em macOS, tarefa agendada em Windows.
 *
 *   E quando nenhuma das duas provas existe, ele diz `n/d`. Nao falha, e sobre-
 *   tudo nao AFIRMA. Um guarda que inventa a resposta que nao tem e pior do que
 *   um guarda calado, porque tambem gasta a confianca de quem o le.
 *
 * Idempotente (salta ficheiros identicos). Aditivo (nunca apaga). Seguro (.bak
 * antes de sobrepor). Node puro, sem dependencias.
 *
 *   node tools/cockpit/sync-cockpit.mjs             espelha + self-check
 *   node tools/cockpit/sync-cockpit.mjs --check     so o self-check
 *   node tools/cockpit/sync-cockpit.mjs --dry-run   diz o que faria
 *   node tools/cockpit/sync-cockpit.mjs --dest <d>  outro destino
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { LABEL, TASK_NAME } from './runner/autostart.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const ORIGEM_RUNNER = path.join(AQUI, 'runner');
export const ORIGEM_SHELL = path.join(AQUI, 'moo-pilot-shell.html');

/** O destino canonico, ao lado do espelho do router que ja existe. */
export function destinoPadrao(home = os.homedir()) {
  return path.join(home, '.claude', 'tools', 'cockpit');
}

const sha = (b) => crypto.createHash('sha256').update(b).digest('hex').slice(0, 16);

/**
 * O que constitui um cockpit a correr. Testes NAO viajam: sao a prova de que o
 * codigo esta bem, nao parte do que corre — e mandar 6 ficheiros de teste para
 * o runtime so aumenta a superficie sem aumentar a garantia.
 */
export function ficheirosCanonicos(origemRunner = ORIGEM_RUNNER) {
  let nomes;
  try {
    nomes = fs.readdirSync(origemRunner);
  } catch {
    return [];
  }
  return nomes
    .filter((n) => n.endsWith('.mjs') && !n.includes('.test.'))
    .sort()
    .map((n) => ({ rel: path.join('runner', n), abs: path.join(origemRunner, n) }));
}

/** Um ficheiro por copiar, ou a razao por que nao precisa. */
export function planear(origem = ORIGEM_RUNNER, dest = destinoPadrao(), shell = ORIGEM_SHELL) {
  const itens = ficheirosCanonicos(origem);
  if (fs.existsSync(shell)) itens.push({ rel: 'moo-pilot-shell.html', abs: shell });
  return itens.map((it) => {
    const alvo = path.join(dest, it.rel);
    let estado = 'novo';
    try {
      estado = sha(fs.readFileSync(alvo)) === sha(fs.readFileSync(it.abs)) ? 'igual' : 'desactualizado';
    } catch {
      /* novo */
    }
    return { ...it, alvo, estado };
  });
}

export function espelhar(plano, { dryRun = false } = {}) {
  const feitos = [];
  for (const it of plano) {
    if (it.estado === 'igual') continue;
    if (dryRun) { feitos.push({ ...it, accao: 'copiaria' }); continue; }
    fs.mkdirSync(path.dirname(it.alvo), { recursive: true });
    // .bak antes de sobrepor: um espelho nunca pode ser a unica copia.
    if (it.estado === 'desactualizado') {
      try { fs.copyFileSync(it.alvo, `${it.alvo}.bak`); } catch { /* best effort */ }
    }
    fs.copyFileSync(it.abs, it.alvo);
    feitos.push({ ...it, accao: 'copiado' });
  }
  return feitos;
}

// ---------------------------------------------------------------------------
// O que a maquina corre — por evidencia, nao por suposicao de plataforma
// ---------------------------------------------------------------------------

/**
 * Os processos cuja presenca PROVA que o cockpit esta a correr. Sao os dois de
 * longa duracao; os utilitarios de um disparo so (triagem, ab-report...) nao
 * provariam nada por estarem ausentes.
 */
export const PROCESSOS_DO_COCKPIT = ['moo-runner.mjs', 'f10-server.mjs'];

/** Comparar caminhos sem tropecar em `\` vs `/` nem em maiusculas do Windows. */
export function normalizar(p, foldCase = process.platform === 'win32') {
  const s = String(p).replace(/\\/g, '/');
  return foldCase ? s.toLowerCase() : s;
}

const ehAbsoluto = (p) => /^([a-zA-Z]:[\\/]|[\\/])/.test(String(p));

/**
 * Parte uma linha de comando em argumentos respeitando aspas — sem isto,
 * `"C:\Program Files\nodejs\node.exe" "C:\Users\Paulo Loureiro\...\moo-runner.mjs"`
 * partia-se ao meio em cada espaco do nome do utilizador.
 */
export function partirLinhaDeComando(linha) {
  const out = [];
  let actual = '';
  let dentroDeAspas = false;
  for (const ch of String(linha)) {
    if (ch === '"') { dentroDeAspas = !dentroDeAspas; continue; }
    if (!dentroDeAspas && /\s/.test(ch)) {
      if (actual) { out.push(actual); actual = ''; }
      continue;
    }
    actual += ch;
  }
  if (actual) out.push(actual);
  return out;
}

/** Os argumentos que sao um modulo do cockpit (`.../moo-runner.mjs`). */
export function caminhosDeRunner(texto) {
  return partirLinhaDeComando(texto).filter((tok) => {
    const n = tok.replace(/\\/g, '/');
    return PROCESSOS_DO_COCKPIT.some((base) => n === base || n.endsWith(`/${base}`));
  });
}

/**
 * De onde vem esta copia. `n/d` quando o caminho e relativo: `node
 * tools/cockpit/runner/moo-runner.mjs` nao diz de que arvore saiu, e chamar-lhe
 * "outro" seria tirar a acusacao mais grave da prova mais fraca.
 */
export function classificarCaminho(caminhos, { destAbs, raizesCheckout = [], foldCase } = {}) {
  const absolutos = (caminhos || []).filter(ehAbsoluto);
  if (absolutos.length === 0) {
    return { classe: 'n/d', caminho: (caminhos || [])[0] || null };
  }
  const dentroDe = (caminho, raiz) =>
    normalizar(caminho, foldCase).startsWith(`${normalizar(raiz, foldCase).replace(/\/+$/, '')}/`);
  for (const c of absolutos) {
    if (destAbs && dentroDe(c, destAbs)) return { classe: 'espelho', caminho: c };
    for (const raiz of raizesCheckout) {
      if (dentroDe(c, raiz)) return { classe: 'checkout', caminho: c };
    }
  }
  return { classe: 'outro', caminho: absolutos[0] };
}

/**
 * As arvores que contam como "este repo". Inclui o worktree principal: um
 * `git worktree` e o mesmo checkout noutra pasta, e marca-lo como copia
 * estranha poria o guarda vermelho para toda a gente que trabalha em branches.
 */
export function raizesDeCheckout(checkout, execImpl = execFileSync) {
  const raizes = [path.resolve(checkout)];
  try {
    const comum = String(execImpl('git', ['rev-parse', '--git-common-dir'], {
      cwd: checkout, encoding: 'utf8', timeout: 10_000, windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    })).trim();
    // `--git-common-dir` e `.git` num checkout normal e absoluto num worktree.
    if (comum) {
      const principal = path.resolve(checkout, comum, '..');
      if (!raizes.includes(principal)) raizes.push(principal);
    }
  } catch {
    // Sem git (tarball, espelho, PATH magro): o checkout local ja chega.
  }
  return raizes;
}

/** Listar processos vivos: `ps` em POSIX, CIM em Windows. Nunca lanca. */
export function lerProcessos({ plataforma = process.platform, execImpl = execFileSync } = {}) {
  const opcoes = { encoding: 'utf8', timeout: 20_000, windowsHide: true, maxBuffer: 8 << 20 };
  try {
    if (plataforma === 'win32') {
      // Sem uma unica aspa dupla no script: o escape de argumentos do Windows
      // reescreve-as pelo caminho e o comando chegaria partido ao PowerShell.
      const ps = 'Get-CimInstance Win32_Process | '
        + 'Where-Object { $_.CommandLine } | ForEach-Object { $_.CommandLine }';
      const out = execImpl('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', ps], opcoes);
      return { ok: true, linhas: String(out).split(/\r?\n/).filter(Boolean) };
    }
    const out = execImpl('ps', ['-A', '-o', 'args='], opcoes);
    return { ok: true, linhas: String(out).split(/\r?\n/).filter(Boolean) };
  } catch (e) {
    return { ok: false, linhas: [], erro: String((e && e.message) || e).slice(0, 200) };
  }
}

/**
 * O lancador de arranque, no sitio certo de cada sistema. Os nomes vem do
 * `autostart.mjs`, que e quem os instala — a mesma constante em dois ficheiros
 * e a receita para ficarem diferentes.
 */
export function alvoDoLancador({
  plataforma = process.platform,
  home = os.homedir(),
  readImpl = fs.readFileSync,
  execImpl = execFileSync,
} = {}) {
  if (plataforma === 'darwin') {
    const onde = path.join(home, 'Library', 'LaunchAgents', `${LABEL}.plist`);
    try {
      const xml = String(readImpl(onde, 'utf8')).replace(/<[^>]*>/g, ' ');
      return { tipo: 'launchagent', onde, caminhos: caminhosDeRunner(xml), ausente: false };
    } catch {
      return { tipo: 'launchagent', onde, caminhos: [], ausente: true };
    }
  }
  if (plataforma === 'win32') {
    const onde = `tarefa agendada ${TASK_NAME}`;
    try {
      const out = execImpl('schtasks', ['/Query', '/TN', TASK_NAME, '/FO', 'LIST', '/V'], {
        encoding: 'utf8', timeout: 20_000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
      });
      // Varre a saida inteira em vez do rotulo "Task To Run:" — o rotulo e
      // traduzido consoante o idioma do Windows, o caminho nao.
      return { tipo: 'schtasks', onde, caminhos: caminhosDeRunner(String(out)), ausente: false };
    } catch (e) {
      // Sair !=0 e como o `autostart.mjs --status` ja le "nao instalada"; nao
      // conseguir sequer lancar o schtasks e outra coisa — nao se sabe.
      if (e && e.code === 'ENOENT') {
        return {
          tipo: 'schtasks', onde, caminhos: [], indeterminado: true,
          motivo: 'schtasks indisponivel — nao da para inspeccionar o arranque',
        };
      }
      return { tipo: 'schtasks', onde, caminhos: [], ausente: true };
    }
  }
  // O `autostart.mjs` nao tem receita para mais nenhum sistema; nao havendo
  // sitio onde procurar, a resposta honesta e que nao se sabe.
  return {
    tipo: 'nenhum',
    onde: `sem receita de arranque automatico para ${plataforma}`,
    caminhos: [],
    indeterminado: true,
    motivo: `plataforma ${plataforma} sem lancador conhecido`,
  };
}

/**
 * Self-check. Devolve `ok:false` quando o espelho esta incompleto OU quando a
 * maquina corre uma copia que nao e nem o espelho nem este repo — as duas
 * maneiras de este ficheiro falhar. Nunca devolve `ok:false` por NAO SABER:
 * sem prova, `corre` fica `n/d` e isso diz-se em voz alta.
 */
export function selfCheck({
  origem = ORIGEM_RUNNER,
  dest = destinoPadrao(),
  shell = ORIGEM_SHELL,
  home = os.homedir(),
  plataforma = process.platform,
  // A raiz do checkout de onde este script corre. Correr O CHECKOUT nesta
  // maquina nao e um erro — e a configuracao CERTA para quem tem o repo.
  checkout = path.resolve(AQUI, '..', '..'),
  raizesCheckout,
  processos,
  lancador,
} = {}) {
  const plano = planear(origem, dest, shell);
  const emFalta = plano.filter((p) => p.estado !== 'igual');
  const avisos = [];
  const notas = [];
  if (plano.length === 0) avisos.push('nenhum ficheiro canonico encontrado na origem');

  const destAbs = path.resolve(dest);
  const raizes = raizesCheckout || raizesDeCheckout(checkout);
  const foldCase = plataforma === 'win32';
  const onde = { destAbs, raizesCheckout: raizes, foldCase };

  // Prova nº1: o que esta VIVO. Um processo a correr e prova mais forte do que
  // qualquer ficheiro de configuracao, e nao depende da plataforma.
  const procs = typeof processos === 'function' ? processos() : lerProcessos({ plataforma });
  const vivos = (procs.linhas || [])
    .filter((l) => PROCESSOS_DO_COCKPIT.some((b) => l.includes(b)))
    .map((l) => ({ linha: l, ...classificarCaminho(caminhosDeRunner(l), onde) }));

  let corre = null;
  let evidencia = null;
  const primeiro = (classe) => vivos.find((v) => v.classe === classe);

  // O caso perigoso ganha: havendo uma copia estranha viva, e isso que interessa
  // dizer, mesmo que tambem haja uma boa.
  const estranho = primeiro('outro');
  if (estranho) {
    corre = 'outro';
    evidencia = 'processo vivo';
    avisos.push(
      `a maquina corre ${estranho.caminho}, que nao e nem o espelho nem este checkout `
      + '— sincronizar aqui nao muda o que a maquina executa',
    );
  } else if (primeiro('espelho')) {
    corre = 'espelho'; evidencia = 'processo vivo';
  } else if (primeiro('checkout')) {
    corre = 'checkout'; evidencia = 'processo vivo';
  } else if (vivos.length > 0) {
    corre = 'n/d'; evidencia = 'processo vivo';
    notas.push(
      `ha ${vivos.length} processo(s) do cockpit vivos mas invocados por caminho relativo `
      + '— nao da para dizer de que copia sairam',
    );
  }

  // Prova nº2: quem o levanta ao arranque. So se nao houver nada vivo — o
  // cockpit pode estar legitimamente parado (STOP activo, por exemplo).
  if (corre === null) {
    const la = typeof lancador === 'function' ? lancador() : alvoDoLancador({ plataforma, home });
    if (la.caminhos && la.caminhos.length > 0) {
      const c = classificarCaminho(la.caminhos, onde);
      corre = c.classe;
      evidencia = 'lancador';
      if (c.classe === 'outro') {
        avisos.push(
          `o lancador (${la.onde}) corre ${c.caminho}, que nao e nem o espelho nem este checkout `
          + '— sincronizar aqui nao muda o que a maquina executa',
        );
      } else if (c.classe === 'n/d') {
        notas.push(`o lancador (${la.onde}) usa um caminho relativo — nao da para dizer de que copia sai`);
      }
    } else if (la.indeterminado || !procs.ok) {
      // Sem prova nenhuma: dizer "nada o corre" seria a mesma afirmacao sem
      // medicao que esta versao veio corrigir.
      corre = 'n/d';
      const motivo = la.indeterminado ? la.motivo : `nao consegui listar processos (${procs.erro})`;
      notas.push(`n/d: ${motivo} — e nao se afirma o que nao se mediu`);
    } else {
      // Aqui SIM: os processos foram listados (nenhum do cockpit) e o lancador
      // foi procurado no sitio certo desta plataforma (nao existe).
      corre = 'nada';
      evidencia = 'processos + lancador';
      avisos.push(
        `nenhum lancador configurado (${la.onde}) e nenhum processo do cockpit vivo `
        + '— o espelho existe e nada o corre',
      );
    }
  }

  return {
    ok: emFalta.length === 0 && avisos.length === 0,
    total: plano.length,
    emFalta: emFalta.map((p) => p.rel),
    // O espelho serve OUTRAS maquinas; esta pode correr o checkout. Dizer QUAL
    // e o ponto: 'ok' sem dizer o que corre era o que faltava.
    corre,
    evidencia,
    vivos: vivos.map((v) => ({ classe: v.classe, caminho: v.caminho })),
    avisos,
    notas,
  };
}

export function main(argv = process.argv.slice(2), escrever = process.stdout.write.bind(process.stdout)) {
  const i = argv.indexOf('--dest');
  const dest = i >= 0 && argv[i + 1] ? argv[i + 1] : destinoPadrao();
  const soCheck = argv.includes('--check');
  const dryRun = argv.includes('--dry-run');

  if (!soCheck) {
    const feitos = espelhar(planear(ORIGEM_RUNNER, dest, ORIGEM_SHELL), { dryRun });
    escrever(`${dryRun ? '[dry-run] ' : ''}${feitos.length} ficheiro(s) para ${dest}\n`);
    for (const f of feitos) escrever(`  ${f.accao} ${f.rel}\n`);
  }

  const r = selfCheck({ dest });
  const porque = r.evidencia ? ` (por ${r.evidencia})` : '';
  const onde = {
    espelho: `e e o espelho que esta maquina corre${porque}`,
    checkout: `e esta maquina corre o CHECKOUT${porque} — o que esta certo para quem tem o repo; o espelho e para as outras`,
    nada: 'e nada o corre',
    outro: `e a maquina corre outra coisa qualquer${porque}`,
    'n/d': 'e n/d o que o corre — ver NOTA abaixo',
  }[r.corre] || '';
  escrever(`espelho: ${r.total - r.emFalta.length}/${r.total} em dia — ${onde}\n`);
  for (const rel of r.emFalta) escrever(`  EM FALTA ${rel}\n`);
  // Nunca engolir em silencio: um espelho que ninguem corre e o modo de falha
  // caro deste ficheiro, e tem de doer no stdout.
  for (const a of r.avisos) escrever(`  AVISO ${a}\n`);
  // Nota != aviso: nao saber nao e falhar, mas tambem nao se cala.
  for (const n of r.notas) escrever(`  NOTA ${n}\n`);
  escrever(r.ok ? 'OK self-check\n' : 'SELF-CHECK FALHOU\n');
  return r;
}

export const invocadoComoPrograma = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invocadoComoPrograma) {
  const r = main();
  process.exitCode = r.ok ? 0 : 1;
}
