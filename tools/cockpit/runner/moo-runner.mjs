#!/usr/bin/env node
/**
 * moo-runner.mjs — the perpetual $0 loop.
 *
 * One rule above all the others: this process only ever talks to the local
 * Ollama. `runner-core.assertLocalEngine` enforces it at the only place a
 * request can leave, so "zero subscription tokens" is a property of the code
 * rather than a promise in a README.
 *
 * The prototype cleared the STOP flag on startup. That was harmless while the
 * runner was launched by hand, and a real fail-open the moment it is wired to a
 * LaunchAgent: the owner presses stop, reboots, and the machine quietly starts
 * working again. STOP now survives a restart, and only an explicit `--play`
 * (the owner's gesture, not the scheduler's) clears it.
 *
 * QUE repo, e ONDE vive o estado desse repo, vivem em `project.mjs`. Ate 2026-08-18
 * o REPO_ROOT era derivado da localizacao deste ficheiro e o estado era global:
 * um ledger, um cursor, um lock, sem campo de repo. Dois projectos nao podiam
 * coexistir, e o runner so sabia conduzir o repo de onde ele proprio corria.
 *
 *   node tools/cockpit/runner/moo-runner.mjs
 *   node tools/cockpit/runner/moo-runner.mjs --repo ~/outro-projecto
 *   MOOTER_REPO=~/outro-projecto node tools/cockpit/runner/moo-runner.mjs --once
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
// `nextPillar` saiu daqui: o comandante substituiu o round-robin e o import
// ficou morto. Continua exportado pelo `runner-core.mjs` — e o fallback de quem
// nao tem ledger — mas este ficheiro ja nao o chama.
import { runRound, DEFAULT_MODEL, DEFAULT_OLLAMA } from './runner-core.mjs';
import { loadPillars, DIFF_LADDER } from './context-pack.mjs';
import { buildFleetState, readLedger } from './fleet-state.mjs';
import { decidir as decidirComandante, DEFAULT_CAPS } from './comandante.mjs';
import { lerTriagem } from './triagem.mjs';
import { sampleGpu } from './gpu-sampler.mjs';
import { beaconDir, writeBeacon, deviceName } from './fleet-beacon.mjs';
import { publicarBeacon, estaNaHora, ligado as publicacaoLigada } from './beacon-publisher.mjs';
import { buildAlignment } from './alignment.mjs';
import { createEngineBreaker } from './engine-breaker.mjs';
import { resolveRepoRoot, projectPaths, repoSha } from './project.mjs';
import { verConector } from './self-check.mjs';
import { verReserva, esperaS } from './reserva.mjs';

const HOME = os.homedir();
const MOO_DIR = process.env.MOOTER_HOME || path.join(HOME, '.mooter');
/** A raiz do repo de onde ESTE script corre — o ultimo degrau da resolucao. */
const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

// Base do diff: o que mudou desde este ref e trabalho novo para rever. Um repo
// parado devolve zero hunks e o runner cai para a ancora — a escada degrada
// sozinha, nunca falha. MOO_DIFF_BASE permite apontar para outro ref.
// origin/main como base era um bug: assim que o trabalho merja, o diff fica
// VAZIO e o runner cai para a ancora — que ja esta esgotada — e volta aos 97%
// de falso positivo. Medido a 2026-08-18: 30/30 rondas em modo ancorado, 29
// falsos positivos. A base tem de ser uma JANELA MOVEL de commits recentes, que
// nunca seca enquanto houver historia.
// Uma base so e um poco finito. MOO_DIFF_BASE continua a fixar UMA base
// (util para depurar); sem ela, a escada abre a seguinte quando a actual nao
// tem nada por rever.
const DIFF_BASE = process.env.MOO_DIFF_BASE || DIFF_LADDER;

/** Quantas chaves de revistos guardar. Um ficheiro que cresce para sempre acaba por ser o problema. */
const MAX_REVISTOS = 5000;
// Segundo parecer: outro modelo LOCAL, de LINHAGEM DIFERENTE do primario. Dois
// modelos da mesma familia partilham os mesmos erros — o par so vale se
// divergirem. Vazio ou ausente desliga a escalada; continua tudo a $0.
const SECOND_MODEL = process.env.MOO_SECOND_MODEL || 'gpt-oss:20b';

const SLEEP_MIN_S = 15;
const SLEEP_MAX_S = 30;
const IDLE_SLEEP_S = 5;

const log = (msg) => process.stdout.write(`[moo-runner] ${msg}\n`);
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));

/**
 * Que repo conduzir, onde guardar o seu estado, e com que pilares.
 *
 * Tudo o que decide o alvo passa por aqui, para que um teste possa perguntar
 * "com estes argumentos e este ambiente, que projecto sai?" sem levantar nada.
 */
export function resolverAlvo({
  argv = [], env = process.env, cwd = process.cwd(), mooDir = MOO_DIR,
  // O CATALOGO E INJECTAVEL, e passou a ter de o ser a 2026-08-25.
  //
  // Nesse dia o dono desligou o P2 e o P3 — os ultimos dois — depois de decidir
  // 20 achados a mao e nao manter nenhum. O catalogo ficou com ZERO pilares
  // activos, que e o estado honesto: nove de nove reprovaram por medicao.
  //
  // So que os testes E2E chamavam `main()` contra o catalogo REAL, e sem um
  // pilar activo nao ha ronda para exercitar. Dez testes passaram a falhar —
  // e nenhum deles por o motor estar partido. Um harness que so funciona
  // enquanto existir um pilar bom nao esta a testar o motor: esta a testar o
  // catalogo, e a fingir que e a mesma coisa.
  //
  // A alternativa era marcar os E2E como `skip`. Seria esconder perda de
  // cobertura, que e exactamente o genero de coisa que este ficheiro passou o
  // dia a corrigir noutros sitios.
  pillarsImpl = loadPillars,
} = {}) {
  const { root, fonte, chave } = resolveRepoRoot({ argv, env, cwd, scriptRoot: SCRIPT_ROOT });
  const paths = projectPaths({ repoRoot: root, mooDir, canonicalRoot: SCRIPT_ROOT });
  const pilares = pillarsImpl(root);
  return { repoRoot: root, fonte, chave, paths, pilares };
}

/**
 * O alvo por omissao: sem argumentos, so ambiente e cwd. Exportado para os
 * testes e para o `launch.mjs` saberem onde o loop escreve.
 */
export const PATHS = (() => {
  try {
    const { paths, repoRoot } = resolverAlvo({ argv: [] });
    return { ...paths, MOO_DIR, REPO_ROOT: repoRoot };
  } catch {
    // Uma env apontada a um repo que nao existe nao pode impedir o modulo de
    // carregar — rebenta no `main()`, onde ha quem leia a mensagem.
    const paths = projectPaths({ repoRoot: SCRIPT_ROOT, mooDir: MOO_DIR, canonicalRoot: SCRIPT_ROOT });
    return { ...paths, MOO_DIR, REPO_ROOT: SCRIPT_ROOT };
  }
})();

/** Fail-closed: an unusable home directory means we never dispatch. */
function assertHome(base, logImpl = log) {
  try {
    fs.mkdirSync(base, { recursive: true });
    fs.accessSync(base, fs.constants.W_OK);
  } catch {
    logImpl(`${base} inacessivel — fail-closed, nao arranca.`);
    process.exit(1);
  }
}

/** Refuses to start beside a live runner; a stale lock (dead PID) is reclaimed. */
function claimLock(lockPath, logImpl = log) {
  try {
    const pid = Number(fs.readFileSync(lockPath, 'utf8').trim());
    if (Number.isInteger(pid) && pid > 0) {
      try {
        process.kill(pid, 0);
        logImpl(`ja ha um runner vivo (PID ${pid}). Saio.`);
        process.exit(0);
      } catch {
        logImpl(`lock orfao do PID ${pid} — reclamado.`);
      }
    }
  } catch {
    /* no lock yet */
  }
  fs.writeFileSync(lockPath, String(process.pid));
}

function releaseLock(lockPath) {
  try {
    if (Number(fs.readFileSync(lockPath, 'utf8').trim()) === process.pid) fs.rmSync(lockPath, { force: true });
  } catch {
    /* nothing to release */
  }
}

/**
 * An unreadable or unknown focus is no focus — never a crash, never a guess.
 *
 * Mas RECUSAR em silencio e outra coisa. O painel valida o pilar contra o
 * catalogo que ELE carregou e devolve 200; se o loop tiver outro conjunto —
 * porque o `.mooter/pilares.json` mudou, ou porque o painel esta a servir um
 * snapshot velho — o foco e deitado fora sem uma palavra, e o dono fica a olhar
 * para um botao aceso que nao faz nada. Agora diz-se, uma vez por valor novo.
 */
let focoRecusado = null;
function readFocus(focusPath, ids, logImpl = log) {
  let pilar;
  try {
    ({ pilar } = JSON.parse(fs.readFileSync(focusPath, 'utf8')));
  } catch {
    focoRecusado = null;
    return null;
  }
  if (pilar == null) { focoRecusado = null; return null; }
  if (ids.includes(pilar)) { focoRecusado = null; return pilar; }
  if (focoRecusado !== pilar) {
    focoRecusado = pilar;
    logImpl(`foco "${pilar}" RECUSADO — nao esta nos pilares deste loop (${ids.join(',')}). O botao do painel nao teve efeito.`);
  }
  return null;
}

function readCursor(cursorPath) {
  try {
    const c = JSON.parse(fs.readFileSync(cursorPath, 'utf8'));
    return Number.isInteger(c.i) ? c.i : 0;
  } catch (erro) {
    if (erro && erro.code === 'ENOENT') return 0;
    // Cursor ilegível e primeiro arranque davam ambos zero. O loop ainda pode
    // começar em segurança, mas a rotação reiniciada deixa de ser silenciosa.
    try { process.stderr.write(`moo-runner: cursor n/d — ${(erro && erro.message) || erro}\n`); } catch { /* stderr fechado */ }
    return null;
  }
}

function writeCursor(cursorPath, i) {
  try {
    fs.writeFileSync(cursorPath, JSON.stringify({ i }));
  } catch {
    /* the cursor is an optimisation, never a blocker */
  }
}

/** Le as chaves ja julgadas. Ilegivel = conjunto vazio: remoer e mau, parar e pior. */
function readRevistos(p) {
  try {
    const v = JSON.parse(fs.readFileSync(p, 'utf8'));
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeRevistos(p, set) {
  try {
    const arr = [...set];
    fs.writeFileSync(p, JSON.stringify(arr.slice(Math.max(0, arr.length - MAX_REVISTOS))));
  } catch {
    /* memoria de trabalho, nunca um bloqueador */
  }
}

/**
 * Onde o ledger deixa de crescer.
 *
 * Medido a 2026-08-19: `runner-ledger.jsonl` com 4,27 MB e ZERO rotacao —
 * `appendFileSync` puro desde sempre. E o `readLedger` le o ficheiro INTEIRO
 * com `readFileSync` para depois usar so as ultimas 5000 linhas: a 3 em 3
 * segundos, vinte vezes por minuto. O comentario do proprio `readLedger` ja
 * dizia "so a 50 MB ledger cannot turn the payload into a page freeze" — mas
 * so o PAYLOAD estava limitado; a LEITURA nunca esteve.
 */
export const MAX_LEDGER_BYTES = 8 * 1024 * 1024;

/**
 * Quantas linhas passam para o ficheiro novo quando se roda.
 *
 * Tem de ser a MESMA janela que o `readLedger` usa (`maxLines = 5000`). Rodar
 * sem levar a cauda daria um penhasco visivel: no segundo a seguir a rotacao o
 * painel mostraria "3 recibos" e o dono acharia que o loop tinha sido apagado.
 */
export const CAUDA_AO_RODAR = 5000;

/**
 * Roda o ledger, sem perder uma linha e sem duplicar nenhuma.
 *
 * O historico anterior vai para `<nome>.1.jsonl` (substituindo o anterior — o
 * tecto e portanto 2x `MAX_LEDGER_BYTES`, e isso esta dito aqui em vez de ser
 * uma surpresa). A cauda fica no ficheiro novo, e nao nos dois: um recibo e
 * uma prova, e uma prova duplicada convida a ser contada duas vezes.
 */
export function rodarLedger(ledgerPath, {
  readImpl = fs.readFileSync,
  writeImpl = fs.writeFileSync,
  statImpl = fs.statSync,
  maxBytes = MAX_LEDGER_BYTES,
  cauda = CAUDA_AO_RODAR,
} = {}) {
  let tamanho;
  try {
    tamanho = statImpl(ledgerPath).size;
  } catch {
    return { rodou: false, porque: 'ledger ainda nao existe' };
  }
  if (tamanho <= maxBytes) return { rodou: false, porque: 'abaixo do tecto' };

  let linhas;
  try {
    linhas = String(readImpl(ledgerPath, 'utf8')).split('\n').filter((l) => l.trim());
  } catch (e) {
    return { rodou: false, porque: 'nao consegui ler para rodar: ' + String(e.message).slice(0, 80) };
  }
  const corte = Math.max(0, linhas.length - cauda);
  const antigas = linhas.slice(0, corte);
  const recentes = linhas.slice(corte);
  const arquivo = ledgerPath.replace(/\.jsonl$/, '') + '.1.jsonl';
  try {
    writeImpl(arquivo, antigas.length ? antigas.join('\n') + '\n' : '');
    writeImpl(ledgerPath, recentes.length ? recentes.join('\n') + '\n' : '');
  } catch (e) {
    // Rodar e higiene, nao trabalho: uma falha aqui nunca pode parar o loop.
    return { rodou: false, porque: String(e.message).slice(0, 120) };
  }
  return { rodou: true, arquivadas: antigas.length, mantidas: recentes.length, arquivo };
}

/**
 * A decisao do comandante para esta ronda, com os tectos do dono.
 *
 * Falha ABERTA de proposito: se o ledger ou a triagem nao se conseguirem ler, o
 * loop corre em vez de parar. Um escalonador que tranca o produto quando o seu
 * proprio input falta seria pior do que nao existir — e a licao dos verificadores
 * desta semana, aplicada ao contrario: aqui o silencio custa uma ronda a mais,
 * nao uma frota parada.
 */
function decidirRonda({ paths, ids, logImpl = log }) {
  try {
    // PELA MESMA PORTA QUE TODOS. Isto lia o ledger com o seu proprio
    // `readFileSync` — sem janela nenhuma — enquanto o `readLedger` (painel e
    // tique do nivel 1) usa `maxLines = 5000`. Duas leituras do mesmo ficheiro,
    // com fronteiras diferentes, a responder a mesma pergunta.
    //
    // MEDIDO a 2026-08-25, com o L1 acabado de ligar:
    //
    //   o L1 e o painel viam       fila  20   (janela de 5000)
    //   este contava               fila 101   (ficheiro inteiro, 9996 linhas)
    //
    // O runner pausa acima de 50, portanto pausava PARA SEMPRE: o L1 ja tinha
    // fechado tudo o que a janela dele mostra e nao consegue ver os 81 que
    // ficam de fora. `219 - 118 = 101`, a conta fecha exactamente. Nao era uma
    // espera — era um impasse, e so apareceu quando o L1 foi ligado.
    //
    // A janela nao e acidente: o `CAUDA_AO_RODAR` desta mesma ficheiro ja diz
    // "tem de ser a MESMA janela que o `readLedger` usa". A rotacao ja estava
    // alinhada com ela; esta leitura e que nao estava.
    const { receipts: registos } = readLedger(paths.LEDGER);
    const base = path.dirname(paths.LEDGER);
    const { decisoes } = lerTriagem(path.join(base, 'triagem.jsonl'));
    // As preferencias vivem ao lado do ledger, como tudo o resto. Liam-se de
    // `os.homedir()/.mooter` cravado, ignorando o `MOOTER_HOME` que a linha
    // acima ja honra — o contrato do `tools/guarda-home.mjs:59` — e por isso um
    // smoke com home isolada ia buscar o ficheiro REAL do dono, e os tectos que
    // ele testava nao eram os que ele tinha escrito.
    const prefs = (() => {
      try { return JSON.parse(fs.readFileSync(path.join(base, 'preferences.json'), 'utf8')); }
      catch { return {}; }
    })();
    // `Number(x) || omissao` engole um `0` explicito: quem escreve `fila_humana: 0`
    // esta a dizer "nao geres nada ate eu triar", e recebia 6 de volta. Um zero
    // que o dono escreveu e uma decisao, nao um campo por preencher.
    // `v == null` a primeira porque `Number(null)` e 0: sem isso, um campo
    // AUSENTE passava a valer "zero, nao geres nada" — trocar um default por uma
    // paragem total e pior do que o bug que se veio corrigir.
    const tecto = (v, omissao) => {
      if (v == null || v === '') return omissao;
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : omissao;
    };
    const caps = {
      perLoopOpen: tecto(prefs.fila_por_pilar, DEFAULT_CAPS.perLoopOpen),
      globalHumanQueue: tecto(prefs.fila_humana, DEFAULT_CAPS.globalHumanQueue),
    };
    return decidirComandante({ registos, decisoes: decisoes ?? new Map(), ids, caps });
  } catch (e) {
    logImpl(`comandante: nao consegui decidir (${(e && e.message) || e}) — corro na mesma`);
    return { pausa: false, pilar: ids[0], razao: 'comandante indisponivel — fail-open' };
  }
}

function appendReceipt(ledgerPath, receipt) {
  // `JSON.stringify({})` prova apenas que o valor e JSON, nao que e um recibo.
  // Sem este contrato, "gravei uma ronda" era indistinguivel de "gravei uma
  // linha sem instante, pilar ou veredicto"; ocupava o ledger, mas nenhum
  // consumidor conseguia atribuir-lhe significado. Eventos têm forma propria.
  const objecto = receipt && typeof receipt === 'object' && !Array.isArray(receipt);
  const instante = objecto && typeof receipt.ts === 'string' && Number.isFinite(Date.parse(receipt.ts));
  const evento = instante && typeof receipt.evento === 'string' && receipt.evento.trim() !== '';
  const ronda = instante
    && typeof receipt.pilar === 'string' && receipt.pilar.trim() !== ''
    && typeof receipt.verdict === 'string' && receipt.verdict.trim() !== '';
  if (!evento && !ronda) {
    throw new TypeError('recibo invalido: exige {ts, evento} ou {ts, pilar, verdict}');
  }
  fs.appendFileSync(ledgerPath, `${JSON.stringify(receipt)}\n`);
  rodarLedger(ledgerPath);
}

/**
 * Escreve o `state.json` que o painel le.
 *
 * Era inline, num sitio so. Quando a pausa passou a precisar de escrever o mesmo
 * ficheiro, duas copias da mesma forma era garantir que um dia divergiam — e o
 * campo que divergisse seria invisivel ate alguem reparar que o painel mentia.
 *
 * `pausa` e `null` numa ronda normal, e e ISSO que limpa a pausa anterior: quem
 * volta a trabalhar apaga o motivo por escrever por cima, sem precisar de um
 * passo de limpeza que se pode esquecer.
 */
function escreverEstado({ paths, repoRoot, pillar, focus, pausa = null, shaCarregado = null, writeImpl = fs.writeFileSync }) {
  writeImpl(
    paths.STATE,
    JSON.stringify({
      device: deviceName(),
      repo: repoRoot,
      pilar_atual: pillar,
      foco: focus,
      modelo: DEFAULT_MODEL,
      pausa,
      // O sha que ESTE processo carregou. Sem ele aqui, o painel nao consegue
      // dizer se o runner corre codigo velho: o `f10-server` e outro processo,
      // e recalcular o sha do disco de ambos os lados so prova que o disco e
      // igual a si proprio. Medido a 2026-08-23: o servidor chamava o
      // `buildAlignment` sem shas nenhuns, por isso a linha "running code" do
      // painel dizia SEMPRE "could not compare" e o aviso do #343 era codigo
      // morto em producao.
      sha_carregado: shaCarregado,
      ts: Math.floor(Date.now() / 1000),
    }),
  );
}

/**
 * Quanto esperar na n-esima ronda seguida de pausa: 5s a dobrar ate 60s.
 *
 * A pausa dura enquanto a fila estiver cheia — horas, tipicamente, porque quem a
 * esvazia e o dono. Reler o ledger inteiro de 5 em 5s para receber a mesma
 * resposta gasta CPU e enche o log com a mesma linha. O tecto de 60s existe para
 * o botao do painel continuar a fazer efeito dentro de um minuto: um recuo sem
 * tecto transforma "ja triei, podes ir" em dez minutos de silencio.
 */
export function esperaDaPausa(ciclos, { base = IDLE_SLEEP_S, tecto = 60 } = {}) {
  const n = Number.isFinite(ciclos) && ciclos > 0 ? Math.floor(ciclos) : 0;
  return Math.min(tecto, base * 2 ** Math.min(n, 10));
}

/**
 * Publishes this device's beacon so other machines' cockpits can see it. The
 * loop is the right writer because it is the thing that actually works — an
 * endpoint that is up while the loop is dead must not keep the beacon warm.
 * Failures are logged once and never block a round.
 */
let beaconWarned = false;
let ultimaPublicacao = 0;
let publicacaoAvisada = false;
async function publishBeacon({ repoRoot, paths, engineAlive = true, shaCarregado = null, logImpl = log } = {}) {
  try {
    const [gpu, alignment] = await Promise.all([
      sampleGpu(),
      // O sha de arranque viaja ate aqui para o painel poder dizer "este
      // processo esta a correr codigo velho" — o defeito que ja aconteceu tres
      // vezes em tres dias sem ninguem dar por ele.
      buildAlignment({ repoRoot, shaCarregado, shaEmDisco: repoSha(repoRoot) }).catch(() => null),
    ]);
    const state = buildFleetState({
      device: deviceName(),
      ledgerPath: paths.LEDGER,
      statePath: paths.STATE,
      stopFile: paths.STOP_FILE,
      // Sem isto o bloco de triagem vinha VAZIO no beacon, e a frota nao
      // conseguia mostrar onde esta o gargalo: um device com 70 achados por
      // decidir parecia igual a um com zero.
      triagemPath: path.join(paths.base, 'triagem.jsonl'),
      baseDir: paths.base,
      gpu,
      alignment,
      // Era `true` fixo: o beacon jurava motor vivo durante as 11 horas em que
      // ele esteve morto. Um sinal que nao pode dizer "nao" nao e sinal.
      engineAlive,
    });
    const where = beaconDir();
    /**
     * A versao do conector viaja com o beacon.
     *
     * `verConector` ja media isto — mas so no `/saude.json` DESTA maquina, e um
     * alerta que so se ve na maquina avariada nao e um alerta. Foi assim que o
     * Mac ficou em 1.33.0 contra 1.49.3 no repo sem ninguem dar por ela: quem
     * estava sentado ao PC nunca teve como saber.
     *
     * Aqui viajam FACTOS (instalado, repo). O juizo — e o CTA — nasce em
     * `naTuaMao`, do lado de quem le. Nunca as duas coisas no mesmo sitio.
     */
    let conector = null;
    try {
      const c = verConector(repoRoot);
      // `valor` e prosa ('X instalado ≠ Y no repo'); as versoes tiram-se dele
      // sem adivinhar: se o formato nao bater, fica `null` e o painel diz n/d.
      const m = typeof c.valor === 'string' ? c.valor.match(/^(\S+)\s+instalado\s+≠\s+(\S+)\s+no repo$/) : null;
      if (m) conector = { instalado: m[1], repo: m[2] };
      else if (c.estado === 'ok' && typeof c.valor === 'string') conector = { instalado: c.valor, repo: c.valor };
    } catch { /* um beacon nunca para por causa de telemetria sobre si proprio */ }
    const res = writeBeacon({ ...state, conector }, where);
    if (!res.ok && !beaconWarned) {
      beaconWarned = true;
      logImpl(`beacon nao escrito (${res.erro}) — a frota nao vera este device.`);
    }
    // Escrever o beacon nao basta: se a pasta partilhada for um repo git e
    // ninguem publicar, o ficheiro fica no disco desta maquina para sempre e
    // os dois cockpits mostram um device cada. DESLIGADO por omissao — o vault
    // e pessoal, e publicar nele pede-se, nao se assume.
    // `beaconDir()` devolve um OBJECTO (`{dir, transporte, partilhado}`) — a
    // primeira versao disto tratou-o como string e a publicacao morria com
    // `where.replace is not a function` a cada ronda. So publica se o
    // transporte for partilhado: uma pasta local nao e frota nenhuma.
    if (res.ok && where.partilhado && publicacaoLigada() && estaNaHora(ultimaPublicacao)) {
      ultimaPublicacao = Date.now();
      const raizVault = path.dirname(where.dir);
      const pub = publicarBeacon(raizVault, `50-fleet/${deviceName()}.json`);
      if (!pub.ok && !publicacaoAvisada) {
        publicacaoAvisada = true;
        logImpl(`beacon nao publicado (${pub.porque}) — escrito no disco, mas a frota nao o ve.`);
      }
    }
  } catch (err) {
    if (!beaconWarned) {
      beaconWarned = true;
      logImpl(`beacon falhou: ${String(err && err.message).slice(0, 100)}`);
    }
  }
}

/**
 * O ciclo. Tudo o que toca no mundo entra por parametro com o default real, para
 * que um teste possa levantar o loop inteiro sem GPU, sem rede e sem relogio.
 * `maxRounds` existe so para os testes; em producao e Infinity.
 */
export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  runRoundImpl = runRound,
  sleepImpl = sleep,
  publishBeaconImpl = publishBeacon,
  appendReceiptImpl = appendReceipt,
  nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  maxRounds = Infinity,
  logImpl = log,
  // Ver : o catalogo e injectavel desde que ele pode estar vazio.
  pillarsImpl = loadPillars,
} = {}) {
  const args = new Set(argv);
  const { repoRoot, fonte, chave, paths, pilares } = resolverAlvo({ argv, env, cwd, pillarsImpl });
  // O sha que este processo CARREGOU. Um `import` e estatico: a partir daqui o
  // codigo em memoria e este, aconteca o que acontecer ao disco. Guardar isto no
  // arranque e a unica forma de, mais tarde, se conseguir dizer que derivou.
  const shaCarregado = repoSha(repoRoot);
  let derivaAvisada = false;
  assertHome(paths.base, logImpl);

  // The owner's explicit gesture is the ONLY thing that lifts a STOP.
  if (args.has('--play')) {
    fs.rmSync(paths.STOP_FILE, { force: true });
    logImpl('--play explicito: STOP levantado pelo dono.');
  }

  claimLock(paths.LOCK, logImpl);
  const soltar = () => releaseLock(paths.LOCK);
  process.on('exit', soltar);
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      logImpl(`${sig} — a sair limpo.`);
      soltar();
      process.exit(0);
    });
  }

  const ids = pilares.ids;
  logImpl(`arranque ${new Date().toISOString()} — motor ${DEFAULT_OLLAMA} — $0 duro.`);
  // A linha que ja imprimia `repo ${REPO_ROOT}` dizia sempre o mesmo repo,
  // fosse qual fosse. Agora diz o repo E de onde veio a decisao.
  logImpl(`repo ${repoRoot} (via ${fonte}${chave ? `:${chave}` : ''}) · estado em ${paths.base}${paths.canonico ? ' (canonico)' : ''}`);
  logImpl(`pilares ${ids.join(',')} (${pilares.fonte}) · modelo ${DEFAULT_MODEL}`);
  // Nunca engolir em silencio: um pilares.json presente e recusado tem de doer.
  if (pilares.erro) logImpl(`AVISO ${pilares.erro} — a correr com os pilares embutidos.`);
  if (fs.existsSync(paths.STOP_FILE)) logImpl('STOP presente a arrancar — fica parado ate /play.');

  let i = readCursor(paths.CURSOR);
  if (i === null) i = 0;
  const once = args.has('--once');
  // O disjuntor guarda o estado do motor entre rondas. Ver engine-breaker.mjs:
  // 1767 recibos de um apagao de 11 horas foi o que custou nao o ter.
  const breaker = createEngineBreaker();
  const revistos = readRevistos(paths.REVISTOS);
  logImpl(`ja julgados ${revistos.size} excertos — nao voltam a fila enquanto nao mudarem`);
  let rondas = 0;

  // Uma reserva activa nao e um STOP: e alguem a precisar da maquina por um
  // bocado. Nao se grava recibo, nao se conta ronda, nao se acusa ninguem — e
  // quando o prazo passa, o loop volta sozinho. Ver reserva.mjs para o porque
  // de o STOP nao servir aqui.
  let reservaAvisada = null;
  // A pausa diz-se UMA vez por motivo, tal como a reserva. Um log por ronda
  // durante as horas que a fila demora a esvaziar e a mesma inundacao.
  let pausaAvisada = null;
  let pausaDesde = null;
  let pausaCiclos = 0;
  // `null` = ninguem perguntou ainda ao motor nesta execucao. Nao e `false`:
  // "nao sei" e "esta morto" sao respostas diferentes, e o beacon ja levou um
  // fix por confundi-las ao contrario.
  let ultimoMotorVivo = null;

  for (;;) {
    if (rondas >= maxRounds) return { rondas, breaker: breaker.estado, repoRoot, paths };

    const res = verReserva(paths.base);
    if (res.activa) {
      // Diz-se UMA vez por reserva. Um log por ronda durante duas horas e a
      // mesma inundacao que o disjuntor existe para travar, noutro sitio.
      if (reservaAvisada !== res.reserva.desde) {
        reservaAvisada = res.reserva.desde;
        logImpl(`cedo a maquina — ${res.motivo} · ate ${res.reserva.ate}`);
      }
      await sleepImpl(esperaS(res.faltaS));
      // Conta como volta do ciclo, tal como o ramo do STOP ao lado. Sem isto o
      // `maxRounds` nunca chegava e o loop ficava preso — em producao passava
      // despercebido (o sleep e real), mas um teste com sleep instantaneo gira
      // para sempre. Um ramo que nao conta e um ramo que nao se consegue testar.
      rondas += 1;
      if (once) return { rondas, breaker: breaker.estado, repoRoot, paths };
      continue;
    }
    if (reservaAvisada) {
      logImpl(`reserva terminada (${res.motivo}) — volto ao trabalho.`);
      reservaAvisada = null;
    }

    if (fs.existsSync(paths.STOP_FILE)) {
      await sleepImpl(IDLE_SLEEP_S);
      rondas += 1;
      if (once) return { rondas, breaker: breaker.estado, repoRoot, paths };
      continue;
    }

    // A focus set from the cockpit pins the rotation to one pillar; clearing it
    // resumes the round robin. Read every round so the button takes effect on
    // the next one instead of at the next restart.
    const focus = readFocus(paths.FOCUS, ids, logImpl);

    // ── Fleet Commander (2026-08-23) ────────────────────────────────────────
    // O `packages/fleet-commander/src/scheduler.mjs` existia desde a wave da
    // frota e NINGUEM o importava. Passa a decidir aqui, em vez do round-robin
    // cego, e pode dizer PAUSA — porque o recurso escasso nao e a GPU, e a
    // atencao do dono. Um foco explicito do painel continua a ganhar-lhe: quem
    // carrega no botao quer aquele pilar, e nao um conselho.
    //
    // Medido no dia em que se ligou: 215 achados abertos contra o tecto em vigor
    // de 50 (o `DEFAULT_CAPS` de 6 so vale sem `preferences.json`),
    // e 0 aceites em 247 decididos. Ele pausa a primeira ronda, e isso E o
    // produto a funcionar — gerar para uma fila que ninguem revê nao e trabalho,
    // e divida. O tecto vive no `preferences.json` para ser uma DECISAO do dono
    // e nao um numero cravado por mim.
    let pillar = focus;
    if (!pillar) {
      const d = decidirRonda({ paths, ids, logImpl });
      if (d.pausa) {
        // ── A pausa TEM de se ver, senao e indistinguivel de uma avaria ──────
        //
        // Este ramo nao produz recibo, e a vivacidade do painel deriva do `ts`
        // do ultimo RECIBO (fleet-state.mjs:freshness): `stale` aos 75s, `morto`
        // aos 300s. Sem o que esta aqui em baixo, um runner VIVO e a OBEDECER ao
        // escalonador era pintado a vermelho para sempre — e como com a fila
        // cheia a pausa e o caminho por omissao, "para sempre" era literal.
        //
        // A reserva ja tinha pago esta licao e resolveu-a com um campo proprio
        // ("um device que cedeu a maquina nao esta avariado"). A pausa era o
        // unico dos tres ramos sem valvula. Passa a ter a mesma.
        //
        // NAO se escreve um recibo falso. Uma pausa nao e trabalho feito, e
        // ~17k linhas/dia de "nao fiz nada" afogavam o registo do que se fez.
        // Publica-se o ESTADO e o beacon, que sao onde o painel pergunta.
        if (pausaAvisada !== d.razao) {
          pausaAvisada = d.razao;
          pausaDesde = nowIso();
          pausaCiclos = 0;
          logImpl(`comandante: PAUSA — ${d.razao}`);
        }
        escreverEstado({
          paths, repoRoot, pillar: null, focus, shaCarregado,
          pausa: { razao: d.razao, fila: d.fila ?? null, desde: pausaDesde },
        });
        // `ultimoMotorVivo` e null enquanto ninguem tiver perguntado ao motor.
        // Jurar `true` aqui repetia exactamente o bug que o publishBeacon
        // documenta ("o beacon jurava motor vivo durante as 11 horas em que ele
        // esteve morto"), e jurar `false` era o falso alarme simetrico.
        await publishBeaconImpl({ repoRoot, paths, engineAlive: ultimoMotorVivo, shaCarregado, logImpl });
        // Recuo progressivo: a pausa persiste ate o dono triar, e reparsear o
        // ledger inteiro de 5 em 5 segundos para reler a mesma resposta e
        // trabalho a fingir que se trabalha. Tecto de 60s para o botao do painel
        // continuar a fazer efeito dentro de um minuto.
        await sleepImpl(esperaDaPausa(pausaCiclos++));
        rondas += 1;
        if (once) return { rondas, breaker: breaker.estado, repoRoot, paths };
        continue;
      }
      pillar = d.pilar;
    }
    if (pausaAvisada) {
      logImpl(`comandante: retomo o trabalho — a fila desceu.`);
      pausaAvisada = null;
      pausaDesde = null;
      pausaCiclos = 0;
    }

    // Deriva de codigo: este processo carregou um sha e o disco ja tem outro.
    // Diz-se UMA vez, e nao se faz mais nada — reiniciar sozinho um loop que
    // escreve no ledger e uma decisao do dono, nao minha. O campo tambem viaja
    // no beacon, para a frota ver o mesmo.
    // `rondas % 60`: a ~30s por ronda, olha para o disco de meia em meia hora.
    // Verificar todas as rondas seriam ~3400 `rev-parse` por dia para dizer
    // quase sempre a mesma coisa — o custo que este ficheiro ja evitou uma vez
    // ao pendurar a comparacao no beacon em vez de a por no ciclo quente.
    if (!derivaAvisada && shaCarregado && rondas % 60 === 0) {
      const agora = repoSha(repoRoot);
      if (agora && agora !== shaCarregado) {
        derivaAvisada = true;
        logImpl(`ATENCAO: este processo corre o codigo de ${shaCarregado} e o disco ja tem ${agora}. `
          + 'Um import e estatico — so um reinicio carrega o codigo novo. '
          + '(Aconteceu tres vezes em tres dias sem ninguem dar por isso.)');
      }
    }
    const cursor = Math.floor(i / ids.length);
    escreverEstado({ paths, repoRoot, pillar, focus, shaCarregado });

    let receipt;
    try {
      ({ receipt } = await runRoundImpl({
        repoRoot,
        repoSha: repoSha(repoRoot),
        pillar,
        pillars: pilares.pillars,
        cursor,
        model: DEFAULT_MODEL,
        endpoint: DEFAULT_OLLAMA,
        stopFile: paths.STOP_FILE,
        anchorPath: paths.ANCORA,
        diffBase: DIFF_BASE,
        revistos,
        secondModel: SECOND_MODEL,
      }));
    } catch (err) {
      // A crash must still leave a trace: a silent gap in the ledger is the one
      // thing that would make the cockpit lie about what happened.
      receipt = {
        ts: nowIso(),
        pilar: pillar,
        repo: repoRoot,
        modelo: DEFAULT_MODEL,
        usd: 0,
        dur_s: 0,
        tokens_out: 0,
        verdict: 'sem-citacao',
        // Sem esta bandeira, uma ronda que REBENTA escapava ao disjuntor: 12
        // crashes seguidos escreviam 12 recibos sem backoff nenhum — a mesma
        // inundacao que o B8 existe para travar, por outra porta.
        falha_ronda: true,
        resultado_resumo: `ronda rebentou: ${String(err && err.message).slice(0, 160)}`,
        evidencia: 'n/d',
      };
    }

    // So conta como julgado quando o motor REALMENTE respondeu: marcar um
    // excerto como visto por causa de um apagao perdia-o para sempre.
    if (receipt.motor_ok === true && receipt.chave) {
      revistos.add(receipt.chave);
      writeRevistos(paths.REVISTOS, revistos);
    }

    const motorFalhou = Boolean(receipt.falha_motor);
    // A partir daqui ja se PERGUNTOU ao motor, por isso a pausa seguinte pode
    // repetir a ultima resposta em vez de inventar uma.
    ultimoMotorVivo = !motorFalhou;
    const { recibos, backoffS, aberto } = breaker.observe(receipt, nowIso());
    // O `appendReceipt` passou a LANCAR num recibo sem forma (residuo 5 do #366),
    // e isso esta certo: uma linha sem instante, pilar ou veredicto ocupa o
    // ledger e nao significa nada. Mas a excepcao NAO pode derrubar o ciclo —
    // e a mesma regra que este ficheiro ja aplica ao beacon: "um erro aqui nunca
    // pode derrubar o loop". Um recibo mau perde-se ALTO, com o objecto colado
    // ao aviso; o trabalho continua.
    for (const r of recibos) {
      try {
        appendReceiptImpl(paths.LEDGER, r);
      } catch (e) {
        logImpl(`recibo recusado pelo ledger (${String(e && e.message).slice(0, 60)}): ${JSON.stringify(r).slice(0, 160)}`);
      }
    }

    // O cursor anda SEMPRE. A versao anterior so o avancava quando o motor
    // respondia — "uma ronda que nao chegou ao motor nao gastou o alvo" — e
    // isso encravava o runner para sempre. Medido: 30 rondas com HTTP 404
    // (motor VIVO, modelo em falta) deram 1 alvo, 3 recibos e cursor nunca
    // escrito. Um device novo, sem o modelo puxado, ficava mudo. Os alvos
    // reciclam por modulo, por isso andar durante um apagao nao perde trabalho.
    //
    // A premissa original — "`pillar` e `cursor` derivam ambos de `i`" — deixou
    // de ser verdade quando o comandante passou a escolher o pilar: so o cursor
    // deriva de `i`. A REGRA continua certa (congelar `i` congela o alvo), mas
    // um comentario que explica uma regra com uma premissa falsa e a proxima
    // pessoa a procurar codigo que ja nao existe.
    i += 1;
    writeCursor(paths.CURSOR, i);
    await publishBeaconImpl({ repoRoot, paths, engineAlive: !motorFalhou, shaCarregado, logImpl });

    if (motorFalhou) {
      // O stdout nao e o ledger: aqui podemos falar. O que nao se pode e
      // escrever 1767 linhas de apagao no registo do trabalho feito.
      logImpl(
        `motor em baixo (${breaker.estado.falhas} seguidas desde ${breaker.estado.inicio}) · ` +
          `${aberto ? 'disjuntor ABERTO, ledger em silencio' : 'ainda a registar'} · espera ${backoffS}s`,
      );
    } else {
      logImpl(
        `${pillar} ${receipt.verdict} · ${receipt.dur_s}s · ${receipt.tokens_out} tok · $0 · ` +
          `${String(receipt.evidencia).slice(0, 90)}`,
      );
    }

    rondas += 1;
    if (once) return { rondas, breaker: breaker.estado, repoRoot, paths };
    await sleepImpl(backoffS || SLEEP_MIN_S + Math.floor(Math.random() * (SLEEP_MAX_S - SLEEP_MIN_S + 1)));
  }
}

/**
 * O guard que faltava. Sem ele, `import './moo-runner.mjs'` arrancava o loop
 * perpetuo dentro do processo de teste — por isso nenhum teste o importava, e
 * por isso o ciclo era a UNICA parte do runner sem cobertura nenhuma. Um TDZ
 * no modo diff passou 161 testes e rebentou todas as rondas em producao.
 */
export const invocadoComoPrograma = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invocadoComoPrograma) {
  main().catch((err) => {
    log(`fatal: ${err && err.stack}`);
    releaseLock(PATHS.LOCK);
    process.exit(1);
  });
}
