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
} from './mooter-use-ab.mjs';

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
// Ledger — leitura e retoma.
// ───────────────────────────────────────────────────────────────────────────

export function lerLedger(ledgerPath, readImpl = fs.readFileSync) {
  let cru;
  try { cru = readImpl(ledgerPath, 'utf8'); } catch { return []; }
  return String(cru).split('\n').filter(Boolean).map((l) => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

export function chave(taskId, braco) { return `${taskId}:${braco}`; }

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
  repo, parent, destino, acceptanceCwd,
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
    const origem = path.join(repo, dir, 'node_modules');
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
  repo, tarefa, destino, spawnImpl = spawnSync, fsImpl = fs, tectoS = TECTO_S,
}) {
  const snap = prepararSnapshot({
    repo, parent: tarefa.parent, destino, acceptanceCwd: tarefa.acceptance_cwd, spawnImpl, fsImpl,
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
  return { ok: true, sha_teste: shaTeste, comando, args, node_modules_ligados: snap.node_modules_ligados };
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
  repo, tarefa, destino, spawnImpl = spawnSync, fsImpl = fs, tectoS = TECTO_S,
}) {
  const snap = prepararSnapshot({
    repo, parent: tarefa.commit, destino, acceptanceCwd: tarefa.acceptance_cwd, spawnImpl, fsImpl,
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
export function tvaFinal(res, aceite, tectoS = TECTO_S) {
  if (res.invalido) return null;
  if (aceite !== true) return tectoS;
  return Math.min(res.tva_s, tectoS);
}

export function correrUmBraco({
  braco, tarefa, repo, raizSnapshots, prereg,
  spawnImpl = spawnSync, fsImpl = fs, clockImpl, nowImpl = () => new Date().toISOString(),
}) {
  const destino = path.join(raizSnapshots, `${tarefa.task_id}-${braco}`);
  const prep = prepararTarefa({ repo, tarefa, destino, spawnImpl, fsImpl });
  if (!prep.ok) {
    return {
      tipo: 'braco', ts: nowImpl(), experiment_id: prereg.experiment_id, seed: prereg.seed,
      task_id: tarefa.task_id, braco, invalido: true, motivo: `preparacao:${prep.motivo}`,
      tva_s: null, aceite: null, sha_teste: prep.sha_teste ?? null, snapshot: destino,
    };
  }

  const res = correrBraco({
    // O braço corre na RAIZ do snapshot — é um repositório, não um pacote.
    // `acceptance_cwd` é só onde o TESTE corre.
    braco, prompt: tarefa.prompt, cwd: destino,
    spawnImpl, ...(clockImpl ? { clockImpl } : {}),
  });

  let aceite = null;
  if (!res.invalido) {
    const a = correrAceitacao({
      cwd: path.join(destino, tarefa.acceptance_cwd), comando: prep.comando, args: prep.args, spawnImpl,
    });
    aceite = a.aceite;
  }

  return {
    tipo: 'braco', ts: nowImpl(), experiment_id: prereg.experiment_id, seed: prereg.seed,
    task_id: tarefa.task_id, braco,
    invalido: res.invalido === true,
    motivo: res.motivo ?? null,
    tva_s: tvaFinal(res, aceite),
    aceite,
    decorrido_s: res.decorrido_s ?? null,
    session_id: res.session_id ?? null,
    sha_teste: prep.sha_teste,
    prompt_sha256: tarefa.prompt_sha256,
    commit: tarefa.commit,
    parent: tarefa.parent,
    snapshot: destino,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// As tarefas primárias — regra cronológica, congelada no pré-registo.
// ───────────────────────────────────────────────────────────────────────────

export function primarias(manifest, prereg) {
  const ids = new Set(prereg.atribuicao.primarias.map((p) => p.id));
  const t = manifest.tarefas.filter((x) => ids.has(x.task_id));
  if (t.length !== ids.size) {
    throw new Error(`manifest não tem todas as primárias: ${t.length} de ${ids.size}`);
  }
  return t;
}

export function primeiroDe(prereg, taskId) {
  const a = prereg.atribuicao.primarias.find((p) => p.id === taskId);
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
export function guardas(prereg, { fsImpl = fs, envImpl = process.env } = {}) {
  const amb = ambienteApto(envImpl);
  if (!amb.apto) return { ok: false, motivo: amb.motivo };
  if (prereg.estado !== 'CONGELADO') return { ok: false, motivo: `pré-registo ${prereg.estado}` };
  const c = verificarCongelamento(prereg, { readImpl: fsImpl.readFileSync });
  if (!c.ok) return { ok: false, motivo: `congelamento: ${c.falhas.map((f) => `${f.nome}=${f.motivo}`).join(', ')}` };
  return { ok: true, motivo: null };
}

// ───────────────────────────────────────────────────────────────────────────
// CLI
// ───────────────────────────────────────────────────────────────────────────

function flag(argv, nome) {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 ? (argv[i + 1] ?? true) : undefined;
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

  if (argv.includes('--analisar')) {
    const pares = paresDoLedger(lerLedger(ledgerPath, fsImpl.readFileSync));
    const r = analisar(pares, { n: prereg.estatistica.n });
    log(`R-24 · ${r.veredicto}`);
    log(`  ${r.motivo}`);
    log(`  X=${r.X} · n=${r.n} · limiar=${r.limiar} · p=${r.p.toFixed(5)} · potência=${r.potencia.toFixed(5)}`);
    log(`  pares válidos: ${r.pares_validos} · inválidos: ${r.invalidos}`);
    return r.veredicto === 'ENSAIO INVALIDO' ? 1 : 0;
  }

  const g = guardas(prereg, { fsImpl, envImpl });
  if (!g.ok) { err('RECUSO CORRER.'); err(`  ${g.motivo}`); return 2; }

  const tarefas = primarias(manifest, prereg);
  const limite = Number(flag(argv, 'so') || tarefas.length);
  const alvo = tarefas.slice(0, limite);
  const raiz = flag(argv, 'snapshots') || raizPadrao();

  // ── modo controlo: $0. Prova que o teste PASSA no commit-filho ───────────
  if (argv.includes('--controlo')) {
    log(`R-24 · controlo de ${alvo.length} tarefas — o teste tem de PASSAR no filho`);
    let mau = 0;
    for (const t of alvo) {
      const destino = path.join(raiz, `controlo-${t.task_id}`);
      const c = prepararControlo({ repo, tarefa: t, destino, spawnImpl, fsImpl });
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
      const p = prepararTarefa({ repo, tarefa: t, destino, spawnImpl, fsImpl });
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
  const feitos = jaFeitos(lerLedger(ledgerPath, fsImpl.readFileSync));
  log(`R-24 · ${alvo.length} tarefas · ${feitos.size} braços já no ledger · ledger: ${ledgerPath}`);

  for (const t of alvo) {
    const g2 = guardas(prereg, { fsImpl, envImpl });
    if (!g2.ok) { err(`PÁRA a meio: ${g2.motivo}`); return 2; }

    for (const braco of ordemDosBracos(primeiroDe(prereg, t.task_id))) {
      if (feitos.has(chave(t.task_id, braco))) { log(`  · ${t.task_id} ${braco} — já feito`); continue; }
      const linha = correrUmBraco({ braco, tarefa: t, repo, raizSnapshots: raiz, prereg, spawnImpl, fsImpl });
      escreverLedger(linha, { ledgerPath, appendImpl: fsImpl.appendFileSync, mkdirImpl: fsImpl.mkdirSync });
      feitos.add(chave(t.task_id, braco));
      const estado = linha.invalido ? `INVÁLIDO (${linha.motivo})` : `${linha.aceite ? 'passa' : 'falha'} · ${linha.tva_s?.toFixed(1)}s`;
      log(`  · ${t.task_id} ${braco} — ${estado}`);
    }
  }

  const r = analisar(paresDoLedger(lerLedger(ledgerPath, fsImpl.readFileSync)), { n: prereg.estatistica.n });
  log(`\nR-24 · ${r.veredicto}\n  ${r.motivo}`);
  log(`  X=${r.X} · limiar=${r.limiar} · p=${r.p.toFixed(5)} · pares válidos ${r.pares_validos}/${r.n}`);
  return r.veredicto === 'ENSAIO INVALIDO' ? 1 : 0;
}

if (process.argv[1]?.endsWith('correr-r24.mjs')) {
  process.exit(main());
}
