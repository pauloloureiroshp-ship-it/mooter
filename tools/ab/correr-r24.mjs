#!/usr/bin/env node
/**
 * correr-r24.mjs — a fase de execução do R-24.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PORQUE É UM FICHEIRO SEPARADO
 *
 * `tools/ab/mooter-use-ab.mjs` está CONGELADO por sha256 no pré-registo
 * (`12ca8b2e…`). Acrescentar-lhe o laço de execução parte o congelamento — o
 * `--check` passaria a dizer `sha_diferente` e, com razão, recusaria correr.
 *
 * Então o laço vive aqui e **importa** o congelado. Nenhuma decisão é tomada
 * neste ficheiro: `zDaTarefa`, `analisar`, `validarCorrida`, `atribuicao`,
 * `correrBraco`, `correrAceitacao` e os limiares vêm todos de lá. Este
 * ficheiro só sequencia — prepara o terreno, chama, e escreve a linha.
 *
 * Mas «só sequencia» não é «não pode falsear». Um executor livre consegue
 * saltar uma tarefa que correu mal, repetir um braço até dar jeito, ou correr
 * o teste no sítio errado. Por isso ELE TAMBÉM entra no congelamento
 * (Emenda 2), e recusa-se a correr se o seu próprio sha não bater.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AS QUATRO COISAS QUE ESTE FICHEIRO GARANTE
 *
 * 1. O SNAPSHOT NÃO TEM `.git`.
 *    Extraído com `git archive <pai> | tar -x`. Com um `.git` dentro, o braço
 *    ON podia fazer `git log --all` e ler o commit-filho — a solução, servida.
 *    Sem ele, os dois braços são igualmente cegos. A cegueira tem de ser
 *    SIMÉTRICA, e é: o mesmo método para ON e para OFF.
 *
 * 2. O TESTE VEM DO COMMIT-FILHO, NUNCA DO PAI.
 *    Instalado por `instalarTesteDeAceitacao` (congelado), depois do archive.
 *    O sha do conteúdo realmente instalado vai para o ledger.
 *
 * 3. O SNAPSHOT É VERIFICADO ANTES DE O BRAÇO CORRER.
 *    Se o teste JÁ passa no snapshot preparado, não há trabalho nenhum a
 *    fazer e o par é INVÁLIDO — não é uma vitória de 0 segundos. O manifest
 *    afirma que falha; um ambiente podre (node_modules em falta, versão de
 *    Node diferente) faz a afirmação envelhecer. Verificar custa ~10 s e
 *    apanha isso; não verificar produz 46 corridas que parecem dados.
 *
 * 4. UM SNAPSHOT NOVO POR BRAÇO.
 *    O braço ON escreve nos ficheiros. Reaproveitar o directório dava ao
 *    segundo braço o trabalho do primeiro já feito.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * Uso:
 *   node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --verificar
 *       Prepara os 25 snapshots e confirma que o teste falha em cada um.
 *       NÃO chama o modelo. Custa $0. Corre isto ANTES das 23 horas.
 *
 *   node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --controlo
 *       O outro lado da moeda: prepara a partir do commit-FILHO e exige que o
 *       teste PASSE. Sem isto, um teste que falha por falta de dependências
 *       parece uma tarefa e é uma derrota garantida. $0.
 *
 *   node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --correr
 *       A corrida a sério. Retoma sozinho: um par já no ledger não repete.
 *
 *   node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --analisar
 *       Só a estatística, sobre o ledger existente.
 *
 *   --so N        limita às primeiras N tarefas (fumo; NÃO produz veredicto)
 *   --ledger P    caminho do ledger (por omissão o do pré-registo)
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

import {
  TECTO_S,
  ambienteApto,
  verificarCongelamento,
  instalarTesteDeAceitacao,
  correrBraco,
  correrAceitacao,
  escreverLedger,
  atribuicao,
  analisar,
  limiarMinimo,
  validarCorrida,
} from './mooter-use-ab.mjs';

import {
  EFFORT, MARCA, argsComuns, definicoesDoBraco, escreverDefinicoes,
  exposicaoValida, FONTE_DO_INVOLUCRO, shaDaArvore,
  envDaCorrida, shaDoEnv, shaDoEstadoVivo, shaDoCacheNm,
} from './r24-exposicao.mjs';

// ───────────────────────────────────────────────────────────────────────────
// O comando de aceitação — parsing, porque `acceptance_cmd` é uma linha de sh.
// ───────────────────────────────────────────────────────────────────────────

/**
 * `cd <repo>/tools/router && node --test --test-skip-pattern="(a|b)" x.test.js`
 * →  { comando: 'node', args: ['--test', '--test-skip-pattern=(a|b)', 'x.test.js'] }
 *
 * O `cd` é descartado de propósito: o cwd vem de `acceptance_cwd`, que é um
 * campo do manifest congelado. Confiar no `cd` embutido significava deixar o
 * caminho ser reescrito por quem editasse a string.
 */
export function dividirComando(cmd) {
  const i = cmd.indexOf('&&');
  const resto = (i >= 0 ? cmd.slice(i + 2) : cmd).trim();
  const args = [];
  let actual = '';
  let aspas = false;
  let temConteudo = false;
  for (const ch of resto) {
    if (ch === '"') { aspas = !aspas; temConteudo = true; continue; }
    if (ch === ' ' && !aspas) {
      if (temConteudo) { args.push(actual); actual = ''; temConteudo = false; }
      continue;
    }
    actual += ch;
    temConteudo = true;
  }
  if (temConteudo) args.push(actual);
  if (args.length === 0) throw new Error(`acceptance_cmd vazio: ${cmd}`);
  return { comando: args[0], args: args.slice(1) };
}

// ───────────────────────────────────────────────────────────────────────────
// O executavel do agente — a guarda que faltava, e que quase custou tudo.
// ───────────────────────────────────────────────────────────────────────────

/**
 * MEDIDO 2026-09-04, nesta maquina: `spawnSync('claude', ...)` devolve ENOENT.
 * No Windows o `claude` do PATH e um shim (`claude.cmd` / `claude.ps1` / um
 * script sh), e o `CreateProcess` do Node so lanca executaveis. O binario a
 * serio existe, escondido: `<dir do shim>/node_modules/@anthropic-ai/claude-code/bin/claude.exe`.
 *
 * PORQUE ISTO ERA CATASTROFICO, e nao apenas chato:
 * `correrBraco` (congelado) trata `r.error` como falha do AGENTE — devolve
 * `invalido: false`, `tva_s = 1800`, `aceite: false`. Com o ENOENT, os DOIS
 * bracos das 23 tarefas davam exactamente isso. Todos os 23 pares contavam
 * como VALIDOS, X = 0, e `analisar` imprimia **PERDEU com p = 1,0** — uma
 * derrota fabricada, produzida em 46 corridas de 4 milissegundos, com toda a
 * aparelhagem estatistica a dar-lhe cobertura.
 *
 * Um instrumento partido a produzir um numero e pior do que instrumento
 * nenhum: o numero e citavel.
 *
 * As duas correccoes vivem aqui, no executor, e nao no controlador congelado:
 *   1. `resolverClaude()` encontra um binario que responde `--version` com 0,
 *      e o executor RECUSA-SE a arrancar se nao encontrar nenhum. Barulho ao
 *      segundo zero, em vez de um veredicto ao fim de 23 horas.
 *   2. `spawn:*` passa a INVALIDO. Um comando que nao arranca nao e o agente a
 *      falhar a tarefa — e o aparato a falhar, e um par assim nao vota.
 */
export function candidatosClaude(env = process.env, plataforma = process.platform) {
  const cands = [];
  if (env.MOOTER_CLAUDE_BIN) cands.push(env.MOOTER_CLAUDE_BIN);
  cands.push('claude');
  if (plataforma === 'win32') {
    const dirs = String(env.PATH || env.Path || '').split(';').filter(Boolean);
    for (const d of dirs) {
      cands.push(path.join(d, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'));
      cands.push(path.join(d, 'claude.exe'));
    }
  }
  return [...new Set(cands)];
}

/** Devolve o primeiro candidato que responde `--version` com exit 0. */
export function resolverClaude({
  env = process.env, plataforma = process.platform,
  spawnImpl = spawnSync, fsImpl = fs, tectoS = 60,
} = {}) {
  const tentados = [];
  for (const c of candidatosClaude(env, plataforma)) {
    if (c !== 'claude' && !fsImpl.existsSync(c)) continue;
    const r = spawnImpl(c, ['--version'], { encoding: 'utf8', timeout: tectoS * 1000, input: '' });
    tentados.push(`${c}:${r.error ? r.error.code : `exit${r.status}`}`);
    if (!r.error && r.status === 0) {
      return { ok: true, caminho: c, versao: String(r.stdout || '').trim().slice(0, 60), tentados };
    }
  }
  return {
    ok: false,
    motivo: 'nenhum executavel do agente responde `--version` com exit 0',
    tentados,
  };
}

/**
 * A SONDA. Não pergunta se o executável existe — pergunta se ele CHEGA AO
 * MODELO, que é a única coisa que interessa antes de 23 horas de corrida.
 *
 * Medido 2026-09-04, e é por isso que existe: `claude --version` devolve exit
 * 0 com a conta sem crédito, com o OAuth expirado, e de dentro de uma sessão
 * Claude Code. As três condições passavam a pré-condição e rebentavam as 46
 * corridas — cada uma delas com `is_error`, que `validarCorrida` marca como
 * inválida. Vinte e três pares inválidos são `ENSAIO INVALIDO`, portanto não
 * há veredicto falso; há 23 horas de máquina deitadas fora e um relatório que
 * não diz nada.
 *
 * A sonda custa uma chamada minúscula e devolve o motivo verdadeiro:
 * «Credit balance is too low», «OAuth session expired», ou o silêncio de quem
 * nunca chegou lá. Corre UMA vez, no arranque — nunca por tarefa.
 */
export function sondarAgente({
  caminho, spawnImpl = spawnSync, tectoS = 120, prompt = 'Responde apenas: OK',
} = {}) {
  const args = ['-p', prompt, '--output-format', 'json',
    '--permission-mode', 'bypassPermissions', '--allow-dangerously-skip-permissions'];
  const r = spawnImpl(caminho || 'claude', args, {
    encoding: 'utf8', timeout: tectoS * 1000, maxBuffer: 16 * 1024 * 1024, input: '',
  });
  if (r.error) return { ok: false, motivo: `spawn:${r.error.code}` };
  if (r.signal) return { ok: false, motivo: `timeout apos ${tectoS}s` };
  let json = null;
  try { json = JSON.parse(r.stdout || 'null'); } catch { /* fica null */ }
  const v = validarCorrida(json);
  if (v.invalido) return { ok: false, motivo: v.motivo, bruto: json };
  return {
    ok: true,
    motivo: null,
    duracao_api_ms: json.duration_api_ms,
    tokens_in: json?.usage?.input_tokens ?? null,
    custo: json.total_cost_usd ?? null,
  };
}

/**
 * Envolve o spawn para que o `'claude'` cravado no controlador congelado
 * chegue ao binario que existe mesmo. So reescreve esse nome; tudo o resto
 * (git, tar, node) passa intacto.
 */
export function spawnComClaude(caminho, spawnImpl = spawnSync, env = null) {
  return (cmd, args, opts) => {
    const ehAgente = cmd === 'claude';
    const alvo = ehAgente && caminho ? caminho : cmd;
    // O `correrBraco` congelado faz spawn SEM `env`, portanto o CLI herdava o
    // terminal inteiro — incluindo a chave que liga o arbitro e os modos do
    // Mooter, que mudam o tratamento sem mudar um byte do router pinado.
    const opcoes = ehAgente && env ? { ...opts, env } : opts;
    return spawnImpl(alvo, args, opcoes);
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Ledger — leitura e retoma.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Devolve as linhas legíveis E o número das que não o eram. Engolir uma linha
 * truncada em silêncio era perder um braço sem uma palavra — e um par a que
 * falta um braço valia, até hoje, uma derrota do ON.
 */
export function lerLedgerCru(ledgerPath, readImpl = fs.readFileSync) {
  let cru;
  try { cru = readImpl(ledgerPath, 'utf8'); } catch { return { linhas: [], descartadas: 0 }; }
  const brutas = String(cru).split(String.fromCharCode(10)).filter(Boolean);
  const linhas = [];
  let descartadas = 0;
  for (const l of brutas) {
    try { linhas.push(JSON.parse(l)); } catch { descartadas++; }
  }
  return { linhas, descartadas };
}

export function lerLedger(ledgerPath, readImpl = fs.readFileSync) {
  return lerLedgerCru(ledgerPath, readImpl).linhas;
}

export function chave(taskId, braco) { return `${taskId}:${braco}`; }

/**
 * Só as linhas DESTA experiência. Cada linha já transportava `experiment_id` e
 * `seed` — e ninguém os lia de volta. O caminho do ledger é fixo, portanto um
 * ledger de outra geração (manifest renumerado, corrida abortada sob um
 * executor anterior) era saltado pela retoma com um «já feito» e contado pela
 * análise como se fosse desta. Um `task_id` fora das primárias também não
 * entra: uma reserva substituída continuava a votar ao lado da substituta.
 */
export function desta(linhas, prereg) {
  const ids = new Set(idsPrimarias(prereg));
  return linhas.filter((l) => l.tipo === 'braco'
    && l.experiment_id === prereg.experiment_id
    && l.seed === prereg.seed
    && ids.has(l.task_id));
}

/** Um par (tarefa, braço) já escrito nunca se repete: repetir é escolher. */
export function jaFeitos(linhas) {
  return new Set(linhas.filter((l) => l.tipo === 'braco').map((l) => chave(l.task_id, l.braco)));
}

/** Reconstrói os pares {on, off} a partir do ledger, para `analisar`. */
export function paresDoLedger(linhas) {
  const por = new Map();
  for (const l of linhas) {
    if (l.tipo !== 'braco') continue;
    if (!por.has(l.task_id)) por.set(l.task_id, {});
    por.get(l.task_id)[l.braco === 'ON' ? 'on' : 'off'] = {
      tva_s: l.tva_s, aceite: l.aceite, invalido: l.invalido, motivo: l.motivo,
    };
  }
  return [...por.entries()].map(([task_id, p]) => ({ task_id, ...p }));
}

export function ordemDosBracos(primeiro) {
  if (primeiro !== 'ON' && primeiro !== 'OFF') throw new Error(`primeiro inválido: ${primeiro}`);
  return primeiro === 'ON' ? ['ON', 'OFF'] : ['OFF', 'ON'];
}

// ───────────────────────────────────────────────────────────────────────────
// O tratamento, pinado — e uma cópia de node_modules que protege o repo vivo.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Os braços correm com `--permission-mode bypassPermissions`, porque sem isso
 * um `claude -p` não escreve ficheiro nenhum e as 46 corridas falhavam todas.
 * Mas o snapshot tinha uma junção para o `node_modules` do repositório VIVO —
 * e um agente sem travões escreve através de uma junção. Um `npm install`
 * dentro do snapshot mexia em `~/frugal`.
 *
 * A junção passa a apontar para uma cópia descartável, feita UMA vez.
 */
export function prepararCacheNodeModules({ repo, cache, dirs, fsImpl = fs, log = () => {} }) {
  const feitos = [];
  for (const dir of dirs) {
    const origem = path.join(repo, dir, 'node_modules');
    const destino = path.join(cache, 'nm', dir, 'node_modules');
    if (!fsImpl.existsSync(origem)) continue;
    if (fsImpl.existsSync(destino)) { feitos.push(dir); continue; }
    log(`  a copiar node_modules de ${dir} (uma vez)…`);
    fsImpl.mkdirSync(path.dirname(destino), { recursive: true });
    fsImpl.cpSync(origem, destino, { recursive: true, dereference: false, force: true });
    feitos.push(dir);
  }
  return feitos;
}

/**
 * O router do tratamento, copiado uma vez e imutável a partir daí.
 *
 * Medido 2026-09-04: `classify.js` difere do sha congelado em 4 dos 23
 * commits-pai. Se o hook apontasse para o `tools/router/` do snapshot, quatro
 * tarefas corriam um classificador diferente — e três das 23 tarefas MEXEM em
 * `tools/router/`, portanto o agente podia alterar o próprio tratamento a meio
 * da corrida. Pinar torna o tratamento idêntico nas 23 e dá-lhe um sha.
 */
export function prepararRouterPinado({ repo, cache, fsImpl = fs, refazer = false }) {
  const destino = path.join(cache, 'router-pinado');
  // SEMPRE refeita. A versão anterior só copiava se `inject_context.js`
  // faltasse, portanto uma alteração ao router ou ao invólucro deixava para
  // trás uma cópia velha — e o `router_sha` do ledger passava a certificar
  // código que já não era o do repositório. Custa ~1 s e fecha uma classe
  // inteira de «o sha diz uma coisa, o disco tem outra».
  void refazer;
  fsImpl.rmSync(destino, { recursive: true, force: true });
  fsImpl.mkdirSync(path.dirname(destino), { recursive: true });
  fsImpl.cpSync(path.join(repo, 'tools', 'router'), destino, {
    recursive: true, force: true,
    filter: (src) => !src.includes('node_modules'),
  });
  fsImpl.writeFileSync(path.join(destino, 'r24-hook.cjs'), FONTE_DO_INVOLUCRO);
  const nmCache = path.join(cache, 'nm', 'tools/router', 'node_modules');
  const nmAlvo = path.join(destino, 'node_modules');
  if (fsImpl.existsSync(nmCache) && !fsImpl.existsSync(nmAlvo)) {
    try { fsImpl.symlinkSync(nmCache, nmAlvo, process.platform === 'win32' ? 'junction' : 'dir'); } catch { /* n/d */ }
  }
  return {
    caminho: destino,
    hook: path.join(destino, 'r24-hook.cjs'),
    sha: shaDaArvore(destino, { fsImpl }),
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Preparação do snapshot.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Extrai o commit-pai para um directório limpo, SEM `.git`, e liga o
 * `node_modules` do repositório vivo por junção (idêntico nos dois braços).
 *
 * `git archive` escreve um tar em stdout; `tar -x` desempacota. Ambos existem
 * no Git for Windows. `maxBuffer` generoso porque o tar passa em memória.
 */
export function prepararSnapshot({
  repo, parent, destino, acceptanceCwd, cacheNm = null,
  spawnImpl = spawnSync, fsImpl = fs,
}) {
  fsImpl.rmSync(destino, { recursive: true, force: true });
  fsImpl.mkdirSync(destino, { recursive: true });

  const ar = spawnImpl('git', ['archive', '--format=tar', parent], {
    cwd: repo, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024,
  });
  if (ar.status !== 0 || !ar.stdout || ar.stdout.length === 0) {
    return { ok: false, motivo: `git_archive:${ar.status}:${String(ar.stderr || '').slice(0, 120)}` };
  }
  // `-C <destino>` NÃO serve: o tar do Git for Windows recebe o caminho como
  // argumento e mastiga-o (medido 2026-09-04: «Cannot open: No such file or
  // directory» com o caminho meio escapado). Passar por `cwd` deixa o Node
  // resolver o caminho, e o tar nunca chega a vê-lo.
  const tar = spawnImpl('tar', ['-xf', '-'], {
    cwd: destino, input: ar.stdout, encoding: 'buffer', maxBuffer: 512 * 1024 * 1024,
  });
  if (tar.status !== 0) {
    return { ok: false, motivo: `tar:${tar.status}:${String(tar.stderr || '').slice(0, 120)}` };
  }

  // node_modules não está em git. Sem ele metade dos testes falha por razão
  // nenhuma — e falharia nos DOIS braços, transformando o par em ruído.
  const ligados = [];
  for (const dir of new Set([acceptanceCwd, '.'])) {
    // do CACHE, nunca do repositório vivo: os braços correm com
    // bypassPermissions e um agente sem travões escreve através de uma junção
    const origem = cacheNm ? path.join(cacheNm, 'nm', dir, 'node_modules') : path.join(repo, dir, 'node_modules');
    const alvo = path.join(destino, dir, 'node_modules');
    if (!fsImpl.existsSync(origem) || fsImpl.existsSync(alvo)) continue;
    try {
      fsImpl.mkdirSync(path.dirname(alvo), { recursive: true });
      fsImpl.symlinkSync(origem, alvo, process.platform === 'win32' ? 'junction' : 'dir');
      ligados.push(dir);
    } catch (e) {
      return { ok: false, motivo: `node_modules:${e.code || e.message}` };
    }
  }
  return { ok: true, node_modules_ligados: ligados };
}

/** O conteúdo do teste do commit-FILHO. Nunca o do pai. */
export function testeDoFilho({ repo, commit, testFile, spawnImpl = spawnSync }) {
  const r = spawnImpl('git', ['show', `${commit}:${testFile}`], {
    cwd: repo, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
  });
  if (r.status !== 0) return { ok: false, motivo: `git_show:${String(r.stderr || '').slice(0, 120)}` };
  return { ok: true, conteudo: r.stdout };
}

/**
 * Prepara e confirma a pré-condição: o teste do filho TEM de falhar no pai.
 * Se passa, não há tarefa — e não há trabalho a medir.
 */
export function prepararTarefa({
  repo, tarefa, destino, cacheNm = null, spawnImpl = spawnSync, fsImpl = fs, tectoS = TECTO_S,
}) {
  const snap = prepararSnapshot({
    repo, parent: tarefa.parent, destino, acceptanceCwd: tarefa.acceptance_cwd, cacheNm, spawnImpl, fsImpl,
  });
  if (!snap.ok) return { ok: false, motivo: snap.motivo };

  const t = testeDoFilho({ repo, commit: tarefa.commit, testFile: tarefa.test_file, spawnImpl });
  if (!t.ok) return { ok: false, motivo: t.motivo };

  const shaTeste = instalarTesteDeAceitacao({
    snapshotDir: destino, ficheiroTeste: tarefa.test_file, conteudo: t.conteudo,
    writeImpl: fsImpl.writeFileSync, mkdirImpl: fsImpl.mkdirSync,
  });

  const { comando, args } = dividirComando(tarefa.acceptance_cmd);
  const antes = correrAceitacao({
    cwd: path.join(destino, tarefa.acceptance_cwd), comando, args, tectoS, spawnImpl,
  });
  if (antes.aceite) {
    return { ok: false, motivo: 'teste_ja_passa_no_pai', sha_teste: shaTeste };
  }
  return { ok: true, sha_teste: shaTeste, conteudo_teste: t.conteudo, comando, args, node_modules_ligados: snap.node_modules_ligados };
}

/**
 * O CONTROLO. Prepara a partir do commit-FILHO e exige que o teste PASSE.
 *
 * `prepararTarefa` só prova metade: que o teste falha no pai. Um teste que
 * falha no pai POR FALTA DE DEPENDÊNCIAS falha na mesma no filho — e nesse
 * caso o braço ON nunca podia ganhar, por mais bem que trabalhasse. Vinte e
 * três pares assim davam «PERDEU» com aspecto de resultado.
 *
 * Este repositório já pagou por confundir as duas coisas: um instrumento e um
 * controlo escritos com a mesma suposição errada concordam um com o outro e
 * dizem que está tudo bem. O controlo tem de vir de outro sítio — e aqui vem
 * do único sítio incontestável: o commit onde o autor humano fez o teste passar.
 */
export function prepararControlo({
  repo, tarefa, destino, cacheNm = null, spawnImpl = spawnSync, fsImpl = fs, tectoS = TECTO_S,
}) {
  const snap = prepararSnapshot({
    repo, parent: tarefa.commit, destino, acceptanceCwd: tarefa.acceptance_cwd, cacheNm, spawnImpl, fsImpl,
  });
  if (!snap.ok) return { ok: false, motivo: snap.motivo };

  const t = testeDoFilho({ repo, commit: tarefa.commit, testFile: tarefa.test_file, spawnImpl });
  if (!t.ok) return { ok: false, motivo: t.motivo };
  instalarTesteDeAceitacao({
    snapshotDir: destino, ficheiroTeste: tarefa.test_file, conteudo: t.conteudo,
    writeImpl: fsImpl.writeFileSync, mkdirImpl: fsImpl.mkdirSync,
  });

  const { comando, args } = dividirComando(tarefa.acceptance_cmd);
  const r = correrAceitacao({
    cwd: path.join(destino, tarefa.acceptance_cwd), comando, args, tectoS, spawnImpl,
  });
  if (!r.aceite) return { ok: false, motivo: `teste_nao_passa_no_filho:status=${r.status}` };
  return { ok: true };
}

// ───────────────────────────────────────────────────────────────────────────
// Um braço, de ponta a ponta.
// ───────────────────────────────────────────────────────────────────────────

/**
 * TVA: tudo o que não seja «terminou E o teste passa» vale o tecto.
 * Uma corrida inválida NÃO vale o tecto — vale `null`, e invalida o par.
 */
export function tvaFinal(res, aceite, tectoS = TECTO_S, aceitacaoS = 0) {
  if (res.invalido) return null;
  if (aceite !== true) return tectoS;
  // O desenho congelado diz «do arranque da sessão até o processo terminar E um
  // comando de aceitação devolver exit 0». O relógio corre até o teste PASSAR,
  // não até o agente sair — e a implementação parava antes, o que dava ao braço
  // ON um desconto de 5 a 25 segundos que o desenho não autoriza. Incluir a
  // aceitação é conservador: sobe o TVA do braço que passa, e o único braço que
  // pode passar num par decidido é o ON.
  return Math.min(res.tva_s + aceitacaoS, tectoS);
}

export function correrUmBraco({
  braco, tarefa, repo, raizSnapshots, prereg, router = null, cacheNm = null, ambiente = null,
  spawnImpl = spawnSync, fsImpl = fs, clockImpl, nowImpl = () => new Date().toISOString(),
}) {
  const destino = path.join(raizSnapshots, `${tarefa.task_id}-${braco}`);
  const prep = prepararTarefa({ repo, tarefa, destino, cacheNm, spawnImpl, fsImpl });
  if (!prep.ok) {
    return {
      tipo: 'braco', ts: nowImpl(), experiment_id: prereg.experiment_id, seed: prereg.seed,
      task_id: tarefa.task_id, braco, invalido: true, motivo: `preparacao:${prep.motivo}`,
      tva_s: null, aceite: null, sha_teste: prep.sha_teste ?? null, snapshot: destino,
    };
  }

  // A ÚNICA diferença entre os braços: o `.claude/settings.json` do snapshot.
  // A linha de comando é idêntica — ver `r24-exposicao.mjs`.
  const defs = escreverDefinicoes({ snapshotDir: destino, braco, caminhoDoHook: router ? router.hook : '', fsImpl });

  const res = correrBraco({
    // O braço corre na RAIZ do snapshot — é um repositório, não um pacote.
    // `acceptance_cwd` é só onde o TESTE corre.
    braco, prompt: tarefa.prompt, cwd: destino, extraArgs: argsComuns(),
    spawnImpl, ...(clockImpl ? { clockImpl } : {}),
  });

  // «Braço mal exposto» era um motivo de invalidez que o pré-registo listava e
  // que nenhuma linha de código calculava. Passa a ser calculado.
  const caminhoMarca = path.join(destino, MARCA);
  const marcaExiste = fsImpl.existsSync(caminhoMarca);
  // A marca agora traz o que o hint disse. Guardar isto e o que permite a um
  // auditor distinguir «o hook correu» de «o hook disse T0 sem arbitro».
  let hint = null;
  if (marcaExiste) {
    try { hint = JSON.parse(String(fsImpl.readFileSync(caminhoMarca, 'utf8')).split(String.fromCharCode(10))[0]); }
    catch { hint = { ilegivel: true }; }
  }
  const exp = exposicaoValida({ braco, marcaExiste });

  // O controlador congelado devolve `invalido: false` para um erro de spawn —
  // trata-o como falha do agente. Nao e: um comando que nao arranca e o
  // aparato partido, e um par assim nao pode votar. Corrigido aqui.
  const spawnPartido = typeof res.motivo === 'string' && res.motivo.startsWith('spawn:');
  const invalido = res.invalido === true || spawnPartido || !exp.ok;

  // D5 · O teste é REINSTALADO depois de o agente correr e antes de correr.
  //
  // Até 2026-09-04 o ficheiro era instalado e hasheado ANTES do agente, e
  // depois ninguém voltava a olhar para ele. `correrAceitacao` lia o que
  // estivesse no disco nesse momento. 13 das 25 tarefas falham por UMA
  // asserção: um agente que a apague — ou que reescreva o ficheiro num
  // «refactor» de boa-fé, já que o snapshot não tem `.git` para ele verificar
  // a proveniência — saía com exit 0 e marcava Z=1. Com o limiar em 16/23, UM
  // par fabricado leva «PERDEU · X=15» a «GANHOU · X=16». E a linha do ledger
  // carregava um `sha_teste` correcto: exactamente a prova que um auditor
  // usaria para excluir a hipótese, e que não a excluía.
  //
  // A proibição vivia só no texto do prompt. Isso é uma instrução ao modelo,
  // não uma guarda.
  let aceite = null;
  let tocouNoTeste = null;
  let aceitacaoS = 0;
  const relogio = clockImpl || (() => process.hrtime.bigint());
  if (!invalido) {
    const antes = prep.sha_teste;
    const agora = (() => {
      try { return crypto.createHash('sha256').update(fsImpl.readFileSync(path.join(destino, tarefa.test_file))).digest('hex'); }
      catch { return null; }
    })();
    tocouNoTeste = agora !== antes;
    // reinstalar por cima: o critério de aceitação é o do commit-filho, sempre
    instalarTesteDeAceitacao({
      snapshotDir: destino, ficheiroTeste: tarefa.test_file, conteudo: prep.conteudo_teste,
      writeImpl: fsImpl.writeFileSync, mkdirImpl: fsImpl.mkdirSync,
    });
    const tA = relogio();
    const a = correrAceitacao({
      cwd: path.join(destino, tarefa.acceptance_cwd), comando: prep.comando, args: prep.args, spawnImpl,
    });
    aceitacaoS = Number(relogio() - tA) / 1e9;
    aceite = a.aceite;
  }

  return {
    tipo: 'braco', ts: nowImpl(), experiment_id: prereg.experiment_id, seed: prereg.seed,
    task_id: tarefa.task_id, braco,
    invalido,
    motivo: res.motivo ?? exp.motivo ?? null,
    tva_s: invalido ? null : tvaFinal(res, aceite, TECTO_S, aceitacaoS),
    aceitacao_s: invalido ? null : aceitacaoS,
    aceite,
    decorrido_s: res.decorrido_s ?? null,
    session_id: res.session_id ?? null,
    sha_teste: prep.sha_teste,
    tocou_no_teste: tocouNoTeste,
    definicoes_sha: defs.sha,
    router_sha: router ? router.sha : null,
    hook_disparou: marcaExiste,
    hint_tier: hint ? hint.tier ?? null : null,
    hint_max_tier: hint ? hint.max_tier ?? null : null,
    hint_opcao_a: hint ? hint.opcao_a ?? null : null,
    hint_bytes: hint ? hint.bytes ?? null : null,
    env_sha: ambiente ? ambiente.env_sha : null,
    estado_vivo_sha: ambiente ? ambiente.estado_vivo_sha : null,
    cache_nm_sha: ambiente ? ambiente.cache_nm_sha : null,
    effort: EFFORT,
    prompt_sha256: tarefa.prompt_sha256,
    commit: tarefa.commit,
    parent: tarefa.parent,
    snapshot: destino,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// As tarefas primárias — regra cronológica, congelada no pré-registo.
// ───────────────────────────────────────────────────────────────────────────

/**
 * As 23 primárias, na forma REAL do pré-registo: os ids vivem em
 * `corpus.primarias`, a ordem dos braços em `atribuicao.pares`.
 *
 * Até 2026-09-04 estas duas funções liam `prereg.atribuicao.primarias`, que
 * NÃO EXISTE. `--correr`, `--verificar` e `--controlo` rebentavam todos com
 * «Cannot read properties of undefined (reading 'map')» antes de fazer
 * trabalho nenhum. E os 28 testes passavam à mesma, porque a fixture tinha
 * sido escrita à mão pela mesma mão que escreveu o código, com a mesma
 * suposição errada. Por isso estas funções são agora exercitadas por um teste
 * que carrega o FICHEIRO A SÉRIO — um contrato de forma que só quebra quando
 * a forma quebra.
 */
export function idsPrimarias(prereg) {
  const ids = prereg?.corpus?.primarias;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error('pré-registo sem corpus.primarias — forma inesperada');
  }
  return ids;
}

export function primarias(manifest, prereg) {
  const ids = new Set(idsPrimarias(prereg));
  const t = manifest.tarefas.filter((x) => ids.has(x.task_id));
  if (t.length !== ids.size) {
    throw new Error(`manifest não tem todas as primárias: ${t.length} de ${ids.size}`);
  }
  const ordem = new Map([...ids].map((id, i) => [id, i]));
  return t.sort((x, y) => ordem.get(x.task_id) - ordem.get(y.task_id));
}

export function primeiroDe(prereg, taskId) {
  const pares = prereg?.atribuicao?.pares;
  if (!Array.isArray(pares)) throw new Error('pré-registo sem atribuicao.pares — forma inesperada');
  const a = pares.find((p) => p.id === taskId);
  if (!a) throw new Error(`tarefa fora do pré-registo: ${taskId}`);
  return a.primeiro;
}

// ───────────────────────────────────────────────────────────────────────────
// Guardas de arranque — corridas a CADA tarefa, não só uma vez.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Verificar uma vez no arranque deixa 23 horas de janela para alguém editar o
 * manifest a meio. Verificar a cada tarefa custa ~5 ms e fecha-a.
 *
 * O próprio executor está na lista: se ele mudar a meio da corrida, pára.
 */
/**
 * O sha do proprio pre-registo, calculado sobre o ficheiro SEM o campo que o
 * transporta — senao seria auto-referencial e impossivel de fixar.
 *
 * Isto fechava o ultimo buraco: `n` atravessa a fronteira e mexe nas duas
 * pontas (abre o portao dos pares validos E baixa o limiar), e vinha do unico
 * ficheiro do circuito que o congelamento nao verificava. Medido: os mesmos 23
 * pares com X=15 dao «PERDEU · p=0,10502» com n=23 e «GANHOU · p=0,02069» com
 * n=20 — e por-lhe n=20 e a «correccao honesta» que qualquer executante
 * alcanca depois de 3 pares invalidos.
 */
export function shaDoPrereg(prereg) {
  const copia = JSON.parse(JSON.stringify(prereg));
  delete copia.sha_do_prereg;
  return crypto.createHash('sha256').update(JSON.stringify(copia)).digest('hex');
}

export function guardas(prereg, {
  fsImpl = fs, envImpl = process.env, spawnImpl = spawnSync,
  exigirAgente = false, exigirAmbiente = true,
} = {}) {
  // `exigirAmbiente: false` é para `--analisar`, que só lê o ledger e nunca
  // lança o agente. Declarado como opção em vez de contornado passando um
  // `envImpl` vazio — um contorno silencioso é indistinguível de um defeito.
  if (exigirAmbiente) {
    const amb = ambienteApto(envImpl);
    if (!amb.apto) return { ok: false, motivo: amb.motivo };
  }
  if (exigirAgente) {
    const cl = resolverClaude({ env: envImpl, spawnImpl, fsImpl });
    if (!cl.ok) {
      return { ok: false, motivo: `${cl.motivo}. Tentados: ${cl.tentados.join(' · ')}. `
        + 'Define MOOTER_CLAUDE_BIN com o caminho do executavel. '
        + 'Sem esta guarda, os dois bracos falhavam identicamente e a experiencia imprimia PERDEU com p=1,0.' };
    }
  }
  if (prereg.estado !== 'CONGELADO') return { ok: false, motivo: `pré-registo ${prereg.estado}` };
  const c = verificarCongelamento(prereg, { readImpl: fsImpl.readFileSync });
  if (!c.ok) return { ok: false, motivo: `congelamento: ${c.falhas.map((f) => `${f.nome}=${f.motivo}`).join(', ')}` };

  // o pre-registo verifica-se a si proprio
  if (typeof prereg.sha_do_prereg === 'string') {
    const real = shaDoPrereg(prereg);
    if (real !== prereg.sha_do_prereg) {
      return { ok: false, motivo: `o proprio pre-registo mudou: sha ${real.slice(0, 12)} != ${prereg.sha_do_prereg.slice(0, 12)}` };
    }
  } else {
    return { ok: false, motivo: 'pre-registo sem sha_do_prereg — o ficheiro que fixa o n nao esta fixado' };
  }

  // e o limiar pre-registado tem de bater com o recalculado
  const e = prereg.estatistica || {};
  const limiar = limiarMinimo(e.n, 0.5, e.alfa);
  if (limiar !== e.limiar_X) {
    return { ok: false, motivo: `limiar recalculado ${limiar} != limiar_X pre-registado ${e.limiar_X} (n=${e.n}, alfa=${e.alfa})` };
  }
  return { ok: true, motivo: null };
}

// ───────────────────────────────────────────────────────────────────────────
// CLI
// ───────────────────────────────────────────────────────────────────────────

function flag(argv, nome) {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 ? (argv[i + 1] ?? true) : undefined;
}

/**
 * D8 · Duas instancias partilhavam o ledger E o caminho deterministico do
 * snapshot (`<tmp>/r24-snapshots/<task>-<braco>`), e `prepararSnapshot` comeca
 * por `rmSync` desse directorio. A instancia B apagava a arvore onde o agente
 * de A estava a trabalhar; o braco de A saia `{aceite:false, tva_s:1800}` —
 * indistinguivel de uma derrota honesta. E bidireccional: se A estivesse no
 * OFF, o OFF ia a 1800 e um ON legitimo de 600 s passava a satisfazer o racio.
 * A propria retoma convida ao segundo lancamento.
 */
export function tomarTranca(raiz, { fsImpl = fs, pid = process.pid, agora = 'n/d' } = {}) {
  const alvo = path.join(raiz, '.tranca');
  fsImpl.mkdirSync(raiz, { recursive: true });
  try {
    fsImpl.writeFileSync(alvo, JSON.stringify({ pid, agora }), { flag: 'wx' });
    return { ok: true, caminho: alvo };
  } catch (e) {
    if (e.code !== 'EEXIST') return { ok: false, motivo: `tranca:${e.code || e.message}` };
    let dono = '?';
    try { dono = String(fsImpl.readFileSync(alvo, 'utf8')).slice(0, 120); } catch { /* n/d */ }
    return { ok: false, motivo: `ja corre outra instancia (${dono}). Se tens a certeza que nao, apaga ${alvo}` };
  }
}

export function largarTranca(caminho, { fsImpl = fs } = {}) {
  try { fsImpl.rmSync(caminho, { force: true }); } catch { /* n/d */ }
}

function raizPadrao() {
  return path.join(os.tmpdir(), 'r24-snapshots');
}

export function main(argv = process.argv.slice(2), io = {}) {
  const log = io.log ?? console.log;
  const err = io.err ?? console.error;
  const fsImpl = io.fsImpl ?? fs;
  const spawnImpl = io.spawnImpl ?? spawnSync;
  // Costura só para os testes serem herméticos: a entrada CLI nunca passa `io`,
  // por isso na corrida real isto é sempre `process.env`. A guarda em si é
  // testada em `guardas`, que é onde o defeito plantado tem de morder.
  const envImpl = io.envImpl ?? process.env;

  const preregPath = flag(argv, 'prereg');
  if (!preregPath) { err('falta --prereg <ficheiro>'); return 2; }
  const repo = path.resolve(path.dirname(preregPath), '..', '..');

  let prereg;
  try { prereg = JSON.parse(fsImpl.readFileSync(preregPath, 'utf8')); }
  catch (e) { err(`pré-registo ilegível: ${e.message}`); return 2; }

  const ledgerPath = flag(argv, 'ledger') || path.join(repo, prereg.ledger?.path || '_handoff/r24/ledger.jsonl');
  const manifestPath = path.join(repo, prereg.congelados.manifest.path);
  let manifest;
  try { manifest = JSON.parse(fsImpl.readFileSync(manifestPath, 'utf8')); }
  catch (e) { err(`manifest ilegível: ${e.message}`); return 2; }

  // `--analisar` corria ANTES das guardas: o caminho que imprime o veredicto
  // era o unico que nao verificava congelamento nenhum.
  const gA = guardas(prereg, { fsImpl, envImpl, spawnImpl, exigirAgente: false, exigirAmbiente: false });
  if (!gA.ok && argv.includes('--analisar')) { err('RECUSO ANALISAR.'); err(`  ${gA.motivo}`); return 2; }

  if (argv.includes('--analisar')) {
    const cru = lerLedgerCru(ledgerPath, fsImpl.readFileSync);
    if (cru.descartadas > 0) { err(`ledger com ${cru.descartadas} linha(s) ilegivel(is) — nao analiso um ledger truncado`); return 2; }
    const pares = paresDoLedger(desta(cru.linhas, prereg));
    const r = analisar(pares, { n: prereg.estatistica.n, alfa: prereg.estatistica.alfa, limiarEsperado: prereg.estatistica.limiar_X });
    log(`R-24 · ${r.veredicto}`);
    log(`  ${r.motivo}`);
    log(`  X=${r.X} · n=${r.n} · limiar=${r.limiar} · p=${r.p.toFixed(5)} · potência=${r.potencia.toFixed(5)}`);
    log(`  pares válidos: ${r.pares_validos} · inválidos: ${r.invalidos}`);
    return r.veredicto === 'ENSAIO INVALIDO' ? 1 : 0;
  }

  // `--verificar` e `--controlo` nunca chamam o agente, por isso nao exigem um.
  // `--correr` exige — e falha ao segundo zero se nao houver.
  const precisaDeAgente = argv.includes('--correr');
  // `--verificar` e `--controlo` tambem nao exigem AMBIENTE: nunca lancam o
  // agente. Exigi-lo era a razao pela qual o CLI nunca era corrido de dentro de
  // uma sessao — e foi assim que um TypeError em `primarias()` sobreviveu a 28
  // testes verdes: eu corria scripts por baixo do CLI em vez do CLI.
  const g = guardas(prereg, { fsImpl, envImpl, spawnImpl, exigirAgente: precisaDeAgente, exigirAmbiente: precisaDeAgente });
  if (!g.ok) { err('RECUSO CORRER.'); err(`  ${g.motivo}`); return 2; }

  const tarefas = primarias(manifest, prereg);
  const limite = Number(flag(argv, 'so') || tarefas.length);
  const alvo = tarefas.slice(0, limite);
  const raiz = flag(argv, 'snapshots') || raizPadrao();

  // O cache de node_modules e o router pinado servem os três modos: assim o
  // que o `--controlo` valida é a MESMA maquinaria que o `--correr` usa.
  const dirsNm = [...new Set(['.', ...alvo.map((t) => t.acceptance_cwd), 'tools/router'])];
  prepararCacheNodeModules({ repo, cache: raiz, dirs: dirsNm, fsImpl, log });
  const router = prepararRouterPinado({ repo, cache: raiz, fsImpl });
  const shaEsperado = prereg?.tratamento?.router_sha ?? null;
  if (shaEsperado && router.sha !== shaEsperado) {
    err('RECUSO CORRER.');
    err(`  o router pinado nao bate com o pre-registo: ${router.sha.slice(0, 12)} != ${shaEsperado.slice(0, 12)}`);
    err(`  apaga ${router.caminho} para o refazer a partir do repositorio, ou emenda o pre-registo.`);
    return 2;
  }
  log(`  tratamento: router pinado ${router.sha.slice(0, 12)}… · effort ${EFFORT}`);

  // ── modo controlo: $0. Prova que o teste PASSA no commit-filho ───────────
  if (argv.includes('--controlo')) {
    log(`R-24 · controlo de ${alvo.length} tarefas — o teste tem de PASSAR no filho`);
    let mau = 0;
    for (const t of alvo) {
      const destino = path.join(raiz, `controlo-${t.task_id}`);
      const c = prepararControlo({ repo, tarefa: t, destino, cacheNm: raiz, spawnImpl, fsImpl });
      log(`  ${c.ok ? 'passa' : 'FALHA'} ${t.task_id}  ${t.area}${c.ok ? '' : `  · ${c.motivo}`}`);
      if (!c.ok) mau++;
      fsImpl.rmSync(destino, { recursive: true, force: true });
    }
    log(`
  ${alvo.length - mau} de ${alvo.length} passam no filho.`);
    if (mau > 0) log('  Um teste que não passa no filho é impossível de ganhar: o braço ON não tem como vencer, e o par mede o ambiente, não o Mooter.');
    return mau === 0 ? 0 : 1;
  }

  // ── modo verificação: $0, não chama o modelo ─────────────────────────────
  if (argv.includes('--verificar')) {
    log(`R-24 · verificação de ${alvo.length} tarefas (sem chamar o modelo)`);
    let mau = 0;
    for (const t of alvo) {
      const destino = path.join(raiz, `verificar-${t.task_id}`);
      const p = prepararTarefa({ repo, tarefa: t, destino, cacheNm: raiz, spawnImpl, fsImpl });
      log(`  ${p.ok ? 'ok  ' : 'FALHA'} ${t.task_id}  ${t.area}${p.ok ? '' : `  · ${p.motivo}`}`);
      if (!p.ok) mau++;
      fsImpl.rmSync(destino, { recursive: true, force: true });
    }
    log(`\n  ${alvo.length - mau} de ${alvo.length} prontas.`);
    if (mau > 0) log('  Uma tarefa que não falha no pai não é tarefa. Corrige ou substitui pelas reservas ANTES de correr.');
    return mau === 0 ? 0 : 1;
  }

  if (!argv.includes('--correr')) {
    err('escolhe um modo: --verificar (grátis), --controlo (grátis), --correr, ou --analisar');
    return 2;
  }

  // ── a corrida ────────────────────────────────────────────────────────────
  const cl = resolverClaude({ env: envImpl, spawnImpl, fsImpl });
  const envDoBraco = envDaCorrida(envImpl);
  const spawnDaCorrida = spawnComClaude(cl.caminho, spawnImpl, envDoBraco);
  const routerVivo = path.join(os.homedir(), '.claude', 'tools', 'router');

  // O que o `router_sha` NAO cobre: o ambiente que decide se o arbitro fala, e
  // o estado vivo que o hook le (modo, pin, perfil, cache de orcamento). Fica
  // fotografado a cada tarefa; se mudar a meio das 23 horas, a corrida para.
  const fotografar = () => ({
    env_sha: shaDoEnv(envDoBraco),
    estado_vivo_sha: shaDoEstadoVivo(routerVivo, { fsImpl }),
    cache_nm_sha: shaDoCacheNm(raiz, { fsImpl }),
    router_sha: shaDaArvore(router.caminho, { fsImpl }),
  });
  const ambiente0 = fotografar();
  log(`  ambiente: env ${ambiente0.env_sha.slice(0, 8)} · estado vivo ${ambiente0.estado_vivo_sha.slice(0, 8)} · cache ${String(ambiente0.cache_nm_sha).slice(0, 8)}`);
  log('  arbitro: DESLIGADO (ANTHROPIC_* removida do ambiente do braço) — declarado no pré-registo');

  const sonda = sondarAgente({ caminho: cl.caminho, spawnImpl });
  if (!sonda.ok) {
    err('RECUSO CORRER.');
    err(`  a sonda nao chegou ao modelo: ${sonda.motivo}`);
    err('  `--version` responde 0 com a conta vazia, com o OAuth expirado e de dentro de uma sessao.');
    err('  Sem esta sonda, as 46 corridas davam todas invalidas e as 23 horas eram deitadas fora.');
    return 2;
  }
  log(`  sonda: chegou ao modelo em ${sonda.duracao_api_ms} ms · ${sonda.tokens_in} tokens de entrada`);

  const tranca = tomarTranca(raiz, { fsImpl });
  if (!tranca.ok) { err('RECUSO CORRER.'); err(`  ${tranca.motivo}`); return 2; }

  const cru = lerLedgerCru(ledgerPath, fsImpl.readFileSync);
  if (cru.descartadas > 0) { largarTranca(tranca.caminho, { fsImpl }); err(`ledger com ${cru.descartadas} linha(s) ilegivel(is) — nao continuo por cima de um ledger truncado`); return 2; }
  const feitos = jaFeitos(desta(cru.linhas, prereg));
  log(`R-24 · ${alvo.length} tarefas · ${feitos.size} braços já no ledger · ledger: ${ledgerPath}`);
  log(`  agente: ${cl.caminho} ${cl.versao ? `(${cl.versao})` : ''}`);

  for (const t of alvo) {
    const g2 = guardas(prereg, { fsImpl, envImpl, spawnImpl, exigirAgente: precisaDeAgente, exigirAmbiente: precisaDeAgente });
    if (!g2.ok) { largarTranca(tranca.caminho, { fsImpl }); err(`PÁRA a meio: ${g2.motivo}`); return 2; }

    // O congelamento cobre `prereg.congelados`; o tratamento e o ambiente
    // ficam de fora dele e sao verificados aqui, a cada tarefa.
    const agora = fotografar();
    for (const campo of ['env_sha', 'estado_vivo_sha', 'cache_nm_sha', 'router_sha']) {
      if (agora[campo] !== ambiente0[campo]) {
        largarTranca(tranca.caminho, { fsImpl });
        err(`PÁRA a meio: ${campo} mudou (${String(ambiente0[campo]).slice(0, 12)} -> ${String(agora[campo]).slice(0, 12)})`);
        err('  o tratamento ou o terreno mudaram durante a corrida; as tarefas ja feitas e as seguintes deixariam de ser comparaveis.');
        return 2;
      }
    }

    for (const braco of ordemDosBracos(primeiroDe(prereg, t.task_id))) {
      if (feitos.has(chave(t.task_id, braco))) { log(`  · ${t.task_id} ${braco} — já feito`); continue; }
      const linha = correrUmBraco({ braco, tarefa: t, repo, raizSnapshots: raiz, prereg, router, cacheNm: raiz, ambiente: ambiente0, spawnImpl: spawnDaCorrida, fsImpl });
      escreverLedger(linha, { ledgerPath, appendImpl: fsImpl.appendFileSync, mkdirImpl: fsImpl.mkdirSync });
      feitos.add(chave(t.task_id, braco));
      const estado = linha.invalido ? `INVÁLIDO (${linha.motivo})` : `${linha.aceite ? 'passa' : 'falha'} · ${linha.tva_s?.toFixed(1)}s`;
      log(`  · ${t.task_id} ${braco} — ${estado}`);
    }
  }

  largarTranca(tranca.caminho, { fsImpl });
  const fim = lerLedgerCru(ledgerPath, fsImpl.readFileSync);
  const r = analisar(paresDoLedger(desta(fim.linhas, prereg)),
    { n: prereg.estatistica.n, alfa: prereg.estatistica.alfa, limiarEsperado: prereg.estatistica.limiar_X });
  log(`\nR-24 · ${r.veredicto}\n  ${r.motivo}`);
  log(`  X=${r.X} · limiar=${r.limiar} · p=${r.p.toFixed(5)} · pares válidos ${r.pares_validos}/${r.n}`);
  return r.veredicto === 'ENSAIO INVALIDO' ? 1 : 0;
}

if (process.argv[1]?.endsWith('correr-r24.mjs')) {
  process.exit(main());
}
