/**
 * f10-server.mjs — the local read/control endpoint the cockpit talks to.
 *
 * Binds to loopback only. `GET /fleet.json` is world-readable to any local page
 * (the cockpit may be opened from `file://`), but `POST /play` and `POST /stop`
 * are NOT: the prototype answered `Access-Control-Allow-Origin: *` on every
 * verb, which meant any website the owner happened to visit could stop or start
 * the runner on their machine. Control verbs now require a same-machine origin.
 */

import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildFleetState, readLedger } from './fleet-state.mjs';
import { sampleGpu } from './gpu-sampler.mjs';
import { buildAlignment } from './alignment.mjs';
import { loadPillars } from './context-pack.mjs';
import { resolveRepoRoot, projectPaths, versaoDoConector, repoSha } from './project.mjs';
import { anotarFrota } from './rotulos-da-frota.mjs';
import { metricaMae, quotaPorMotor } from './metrica-mae.mjs';

/**
 * O sha que o RUNNER carregou, lido do estado que ele escreve.
 *
 * `null` quando nao ha estado, ou quando o estado e de uma versao anterior a
 * este campo — e `null` faz o `verDeriva` responder "nao sei", que e a verdade.
 * Nunca `false`, que seria afirmar que estao iguais sem ter comparado.
 */
function shaDoRunner(statePath) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return typeof s.sha_carregado === 'string' && s.sha_carregado ? s.sha_carregado : null;
  } catch { return null; }
}
import {
  registarTriagem, registarVarias, DECISOES, AUTORES, MOTIVOS, menuDeMotores,
  lerTriagem, porTriar, contarTriagem, ORIGEM_DETECTOR,
} from './triagem.mjs';
import { escolherModelo, perguntar, validarMensagem, MAX_MENSAGEM } from './assist.mjs';
import { estadoDaActualizacao } from './actualizacao.mjs';
import { verificarBind, linhaDeLog } from './bind-check.mjs';
import {
  NIVEIS, portoes, tectoPermitido, efectivo, lerEstado, normalizar,
  ORCAMENTOS, orcamento, curar, severidade, suporteDaCitacao,
  naAmostraDeAuditoria, anomaliaDeDreno, avisoDeDreno, AUDITORIA_1_EM, reservarParaODono,
} from './autopilot.mjs';
import { beaconDir, readBeacons, deviceName, naTuaMao } from './fleet-beacon.mjs';
import { uptime as uptimeDoF10, lerRegisto as lerRegistoDoWatchdog } from './watchdog.mjs';
import { beaconsDoRemoto } from './fleet-remoto.mjs';
import { spendByModel } from './spend-by-model.mjs';
import { autoVerificar } from './self-check.mjs';
import { renderLedgerHtml, versaoInstalada } from './build-ledger-snapshot.mjs';

const MAX_BODY_BYTES = 4096;

/** Bounded body read: a control endpoint must not be a memory sink. */
export function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

export const HOST = '127.0.0.1';

/**
 * Os verbos POST que o servidor aceita — e a lista e a GUARDA.
 *
 * Estava inline num `||` de cinco termos, e por isso cada rota nova exigia que
 * quem a escrevesse se lembrasse de a acrescentar ali. Com a lista num sitio so,
 * acrescentar uma rota e acrescentar-lhe a guarda de origem.
 *
 * Isso, sozinho, PIOROU um perigo antigo em vez de o corrigir — apanhado em
 * revisao antes de sair. O `/play` era o `else` final do bloco, portanto um
 * verbo listado sem ramo proprio apagava o STOP e ligava a maquina a trabalhar;
 * e a lista tornou "acrescentar um verbo" no passo de menor atrito de todos.
 * Por isso o `/play` passou a ter `if` proprio e a cauda passou a 404. Agora as
 * duas metades tem de andar juntas, e o teste `smoke` exige que cada entrada
 * desta lista seja servida por um ramo — a lista deixou de ser um atalho para
 * religar o loop por engano.
 */
export const VERBOS_DE_CONTROLO = Object.freeze([
  '/play', '/stop', '/focus', '/triagem', '/triage', '/autopilot', '/assist', '/update',
]);

/**
 * O custo por modelo tem de varrer os ficheiros de sessao. O quota.js so rele
 * o que mudou (chave: tamanho+mtime), mas uma sondagem de 3 em 3 segundos a
 * bater no disco seria o painel a atrapalhar o trabalho que diz vigiar.
 */
const CUSTO_TTL_MS = 30_000;
let custoCache = { em: 0, dados: null };
/**
 * A porta. Cravada a 4290 desde sempre; com `MOO_PORT` uma segunda conta de SO
 * na mesma maquina — ou um segundo projecto — deixa de matar o primeiro.
 */
export const PORT = Number(process.env.MOO_PORT) || 4290;
const OLLAMA = 'http://127.0.0.1:11434';

const HOME = os.homedir();
const MOO_DIR = process.env.MOOTER_HOME || path.join(HOME, '.mooter');
/** A raiz do repo de onde ESTE script corre — o repo canonico deste device. */
const SCRIPT_ROOT = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));

/**
 * O aviso que acompanha um painel que NAO e o canonico.
 *
 * Nao e decoracao: sem ele, `moo-pilot-preview.html` — um prototipo em
 * portugues, de antes da traducao — servia-se com 200 e sem nada a distingui-lo
 * do painel a serio. Um ecra que parece actual e nao e vale menos do que um
 * erro, porque o erro nao se deixa acreditar.
 */
export const AVISO_PROTOTIPO = '<div style="background:#8a5600;color:#fff;font:600 14px/1.4 system-ui;'
  + 'padding:12px 16px;text-align:center">This is the fallback prototype panel, not the current one. '
  + 'The canonical shell at <code>tools/cockpit/moo-pilot-shell.html</code> could not be read — '
  + 'nothing below is guaranteed to match this device.</div>';

/** The cockpit shell, canonical copy first, prototype second, honest 503 last. */
export function panelCandidates(repoRoot) {
  return [
    path.join(repoRoot, 'tools', 'cockpit', 'moo-pilot-shell.html'),
    path.join(repoRoot, 'moo-pilot-preview.html'),
  ];
}

/**
 * Control verbs are only accepted from this machine. A browser always sends
 * `Origin` on cross-origin POSTs, so an absent one is a local tool (curl, the
 * shell); `null` is a `file://` page, which is how the cockpit is opened.
 */
export function originAllowed(origin) {
  // `null` used to be allowed here so a `file://` panel could drive the runner.
  // That also hands control to any sandboxed iframe on any website the owner
  // visits, because a sandboxed document's origin is the string "null" too.
  // The cockpit is served over http from loopback and sends a real Origin, so
  // the convenience bought nothing and cost a remote kill-switch.
  if (origin === 'null') return false;
  // Absent Origin means a non-browser client on this machine (curl, the CLI).
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  } catch {
    return false;
  }
}

/**
 * Defence in depth against DNS rebinding: a hostile page can resolve its own
 * domain to 127.0.0.1 and then talk to this server as same-origin. The Host
 * header is what gives that away, since it carries the attacker's name.
 */
export function hostAllowed(host) {
  if (!host) return false;
  const name = String(host).replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  return name === '127.0.0.1' || name === 'localhost' || name === '::1';
}

async function engineAlive(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1200) });
    return Boolean(res && res.ok);
  } catch {
    return false;
  }
}

async function loadedModels(fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${OLLAMA}/api/ps`, { signal: AbortSignal.timeout(1500) });
    if (!res || !res.ok) return [];
    const body = await res.json();
    return (body.models || []).map((m) => ({
      name: m.name,
      vram_gb: Math.round(((m.size || 0) / 1e9) * 10) / 10,
      expira: String(m.expires_at || '').slice(0, 19),
    }));
  } catch {
    // Falhar /api/ps e não haver modelos residentes eram ambos `[]`; o estado
    // viaja como null para o painel mostrar n/d sem chamar `.map()` ao neutro.
    return null;
  }
}

/**
 * CORS sem wildcard. `*` deixava qualquer site que o dono visitasse LER o
 * fleet.json (nome do device, branch, contagens, GPU%) — divulgação de
 * informação, mesmo com os verbos de controlo guardados por `originAllowed`.
 * Agora só se ecoa a origem quando ela é loopback; um pedido sem Origin
 * (curl, CLI local) não precisa de header nenhum.
 */
export function corsHeaders(origin) {
  if (!origin) return {};
  if (origin === 'null') return {};
  try {
    const { hostname } = new URL(origin);
    if (hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1') {
      return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' };
    }
  } catch {
    return {};
  }
  return {};
}

/**
 * A frota, com os outros devices lidos do REMOTO do vault quando da.
 *
 * Sem isto, a frescura de outro device esperava pelo `pull --rebase` DESTE
 * lado, que corre de 10 em 10 min — somado ao ciclo de publicacao do outro,
 * dava ate 20 min de idade para um device perfeitamente sao. Medido a
 * 2026-08-21: o Mac publicava certinho e o painel do PC dizia "sem sinal ha
 * 716s". O `fetch` corta a metade que e nossa.
 *
 * So quando o vault e um repo git; no modo local `beaconsDoRemoto` e um no-op
 * honesto e a frota vale o que o disco valer, exactamente como antes.
 */
function lerFrota(where, device) {
  const remoto = where.partilhado ? beaconsDoRemoto(path.dirname(where.dir)) : null;
  const fleet = readBeacons({ ...where, selfDevice: device, remotos: remoto ? remoto.remotos : null });
  // O estado do canal viaja com a frota: um painel que mostra devices frescos
  // sem dizer que o fetch falhou esta a afirmar uma frescura que nao mediu.
  if (remoto) fleet.remoto = { ref: remoto.ref, fetch: remoto.fetch, porque: remoto.porque };
  // O ROTULO calcula-se aqui, nao no painel. Ate 2026-08-25 a unica coisa que o
  // painel afirmava ao dono — o chip de cada device — era a unica sem teste
  // nenhum: a logica vivia inline no `moo-pilot-shell.html` e nenhum teste do
  // repo le esse ficheiro. E foi la que nasceu o defeito medido a 24/08 ("1 min
  // ago" com um ficheiro de dois dias): o campo `via` existia nos dados e o
  // painel nunca o renderizou. Mesma regra dos shas, tres funcoes acima — o
  // painel renderiza factos, nao os deriva.
  return anotarFrota(fleet);
}

/**
 * Quantos segundos esperar depois de um 503. Nao e um numero de cabeca: o poll
 * do painel e de 3s, e um `Retry-After` mais curto do que isso nao muda nada.
 */
export const RETRY_AFTER_S = 5;

function sendJson(res, code, obj, { cors = true, origin = null } = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    // ⚠️ 503 SEM `Retry-After` E UM 503 QUE NAO DIZ NADA.
    //
    // Medido a 2026-09-01 pelo dono: em rajada (<3s entre pedidos) o
    // `/fleet.json` devolvia 503 sem `Retry-After`; espacado 4s, 5/5 em 200 OK
    // (~250ms). Do lado da pagina os dois casos eram indistinguiveis de uma
    // avaria — e a resposta dela era voltar a bater na mesma cadencia, que e
    // exactamente o que nao ajuda. O cabecalho e a metade do servidor; a outra
    // metade e o backoff do cliente. Aplica-se a TODOS os 503 deste servidor:
    // nenhum deles significa "desiste", todos significam "ainda nao".
    ...(code === 503 ? { 'Retry-After': String(RETRY_AFTER_S) } : {}),
    ...(cors ? corsHeaders(origin) : {}),
  });
  res.end(body);
}

export function createServer({
  // O endpoint tem de olhar para o MESMO projecto que o loop conduz, senao o
  // painel mostra o ledger de um repo enquanto a GPU trabalha noutro. A
  // resolucao e a mesma de `moo-runner`, pela mesma ordem, no mesmo modulo.
  repoRoot = null,
  mooDir = MOO_DIR,
  device = deviceName(),
  fetchImpl = fetch,
  argv = process.argv.slice(2),
  env = process.env,
  // Injectavel pela mesma razao que no `moo-runner`: desde 2026-08-25 a rotacao
  // real pode estar VAZIA (esta), e um teste do endpoint que precise de um pilar
  // para exercitar o `/focus` estaria a testar o catalogo, nao o servidor.
  pillarsImpl = loadPillars,
} = {}) {
  const raiz = repoRoot
    || (() => {
      try {
        return resolveRepoRoot({ argv, env, scriptRoot: SCRIPT_ROOT }).root;
      } catch {
        // Uma env apontada a um repo que nao existe nao pode impedir o painel de
        // abrir: sem painel, o dono nem consegue ver que se enganou.
        return SCRIPT_ROOT;
      }
    })();
  const paths = projectPaths({ repoRoot: raiz, mooDir, canonicalRoot: SCRIPT_ROOT });
  // Sem isto, num projecto que o loop ainda nao tocou, `POST /play` respondia
  // 200 (o `rmSync` com `force` nao precisa da pasta) e `POST /stop` rebentava
  // com ENOENT — o kill-switch a falhar ABERTO, na polaridade pior possivel:
  // arrancar funciona, parar nao. E o `launch.mjs` levanta o servidor ANTES do
  // runner, que e exactamente quando essa janela esta aberta.
  try {
    fs.mkdirSync(paths.base, { recursive: true });
  } catch {
    // Se nem isto der, os verbos de controlo vao falhar alto e dizer porque —
    // que e melhor do que um botao de parar que responde 200 e nao para nada.
  }
  const pilares = pillarsImpl(raiz);
  const stopFile = paths.STOP_FILE;
  const ledgerPath = paths.LEDGER;
  const statePath = paths.STATE;
  // O autopilot vive ao lado do STOP e do FOCUS: um ficheiro pequeno que
  // sobrevive a um reboot e que se apaga a mao se for preciso.
  const autopilotFile = path.join(paths.base, 'autopilot.json');
  const lerAutopilot = () => lerEstado(autopilotFile, fs.readFileSync);
  const focusFile = paths.FOCUS;
  /** O foco pedido pelo painel, lido do FICHEIRO — nunca do estado do loop. */
  const lerFocoPedido = (ficheiro) => {
    try { const { pilar } = JSON.parse(fs.readFileSync(ficheiro, 'utf8')); return pilar ?? null; }
    catch { return null; }
  };
  const triagemFile = path.join(paths.base, "triagem.jsonl");

  /**
   * O tique do nivel 1 — a unica coisa neste ficheiro que decide sem o dono.
   *
   * Fecha achados `low` com um motivo TIPADO e assinado por `agente`, para que a
   * fila que sobra seja so o que precisa dele. Nao toca no repo e nao apaga
   * nada: o `triagem.jsonl` e append-only e uma decisao errada reverte-se com
   * outra linha. Corre com tecto porque um autopilot que despeja 200 decisoes de
   * uma vez e indistinguivel de um acidente, e escreve no log o que fez —
   * trabalho sem dono visivel e trabalho que ninguem consegue auditar.
   *
   * Fail-closed em cada tique: se a taxa de citacao inventada subir acima do
   * tecto desde o tique anterior, o autopilot suspende-se AQUI, sozinho, e diz
   * porque. Nao ha estado de confianca acumulado.
   */
  /**
   * O estado do alarme de dreno, entre tiques. Vive AQUI, no fecho do servidor,
   * e nao num modulo: dois servidores no mesmo processo (os testes levantam
   * varios) tem de ter relogios de silencio independentes.
   */
  const avisoDreno = { ultimoMs: null, silenciados: 0 };

  function tiqueCurar(logImpl = (s) => process.stdout.write(s)) {
    let feitos = 0;
    try {
      const pedido = lerAutopilot();
      if (pedido.nivel < 1) return 0;
      const { receipts } = readLedger(ledgerPath);
      const { decisoes } = lerTriagem(triagemFile);
      // A fila SEM o corte de 50. O corte existe para o painel nao despejar
      // 400 linhas num ecra; aqui ele so escondia trabalho — e escondia a
      // reserva, que passava a contar sobre uma janela dentro de outra janela.
      const fila = porTriar(receipts, decisoes, Number.MAX_SAFE_INTEGER);
      // Quantas decisoes do dono e que o PORTAO 2 conta — nao quantas existem
      // no ficheiro.
      //
      // A diferenca nao e teorica: `contarTriagem` cruza as decisoes com os
      // recibos da JANELA do ledger (5000 linhas), e so conta as que ainda
      // correspondem a um achado dentro dela. Contar aqui o ficheiro inteiro
      // criava duas contagens da mesma coisa — e, com o ledger a crescer, as
      // decisoes do dono saem da janela: o tique via `jaDoDono=20` e PARAVA de
      // reservar, enquanto o portao via 0 e continuava fechado. Era a fome de
      // volta, pela porta do lado.
      //
      // Duas verdades para o mesmo numero foi exactamente o defeito que o
      // `porTriar`/`contarTriagem` teve ate hoje. Uma so fonte.
      const jaDoDono = (() => {
        const c = contarTriagem(receipts, decisoes).do_dono;
        return c.aceite + c.descartado + c.issue;
      })();
      const ps = portoes({
        recibos: {
          total: receipts.length,
          refutado: receipts.filter((r) => r && r.verdict === 'refutado').length,
        },
        triagem: {},
      });
      if (efectivo(pedido.nivel, ps) < 1) {
        logImpl(`autopilot L1 SUSPENSO: ${ps[0].porque_fechado}
`);
        return 0;
      }
      // Quem fica de fora do dreno. A reserva olha para o ALVO: enquanto o dono
      // nao tiver as decisoes que o portao 2 exige, guarda-se o que falta; a
      // partir dai volta a ser so 1-em-20. Sem isto havia estado absorvente — a
      // fila estabilizava vazia com 5 decisoes dele e o portao pedia 20.
      const reservadas = reservarParaODono(fila, { jaDoDono });
      const actos = curar(fila, { jaDoDono });
      // O que foi MESMO escrito, com o `ts` que ficou no ficheiro. Gerar um
      // `new Date()` novo para a analise punha o acto num dia diferente daquele
      // em que ele foi persistido sempre que o tique atravessasse a meia-noite
      // do dono — `persisted=2026-08-23` contra `sintetico=2026-08-24`. O
      // alarme lia um dia que nao existia no ledger.
      // `registarVarias` NAO para na primeira colisao. O guard do dono e uma
      // excepcao, e uma excepcao a meio de um `for` deixava metade do trabalho
      // feito e o log a dizer que a fila ficara intacta.
      const r = registarVarias(triagemFile, actos.map((a) => ({ ...a, via: 'autopilot-l1' })));
      // A entrada persistida JA leva o pilar do seu recibo. Reassocia-la por
      // indice fazia "a segunda escrita" ser indistinguivel de "o segundo
      // acto": depois de uma recusa o lote compacta `escritas`, e o alarme
      // atribuía a escrita seguinte ao pilar recusado.
      const escritos = r.escritas;
      feitos = r.escritas.length;
      if (r.recusadas.length) logImpl(`autopilot L1: ${r.recusadas.length} nao escritas — o dono ja decidiu essas chaves
`);
      if (r.erros.length) logImpl(`autopilot L1: ${r.erros.length} falharam por outra razao: ${r.erros[0].porque.slice(0, 100)}
`);
      const porAmostra = fila.filter((a) => naAmostraDeAuditoria(a && a.chave)).length;
      const extra = reservadas.size - porAmostra;
      if (feitos) {
        const nota = reservadas.size
          ? ` · ${reservadas.size} reservado(s) para a tua auditoria (${porAmostra} por amostra 1-em-${AUDITORIA_1_EM}${extra > 0 ? ` + ${extra} para o portao 2 poder abrir` : ''})`
          : '';
        logImpl(`autopilot L1: ${feitos} achado(s) de baixa severidade fechados com motivo tipado${nota}
`);
      }
      // O alarme corre sobre o dreno INCLUINDO o que este tique acabou de
      // escrever. Ler so o `decisoes` de antes das escritas era um off-by-one:
      // um pico que comecasse neste tique so aparecia no seguinte, e o alarme
      // que existe para ser atempado chegava sempre tarde.
      const fechadosPeloAgente = [
        // So o que ESTE canal escreveu. Filtrar so por `por:'agente'` mostrava
        // ao dono, como actividade do L1, decisoes de agentes de outros canais.
        ...[...decisoes.values()].filter((d) => d && d.por === 'agente' && d.via === 'autopilot-l1'),
        ...escritos,
      ];
      // `agora` materializa o dia de hoje mesmo sem actos nenhuns. Sem ele, uma
      // PARAGEM TOTAL do dreno era invisivel: o detector so via dias que tinham
      // trabalho, e o pior caso — o pilar que morre de vez — nunca disparava.
      const an = anomaliaDeDreno(fechadosPeloAgente, { agora: Date.now() });
      // O alarme e verdadeiro; dize-lo a cada poll do painel nao o torna mais
      // verdadeiro — torna-o invisivel. Medido: 9558 destas linhas em 9784 do
      // `f10.log`, 97,7% do ficheiro. `avisoDeDreno` cala a fila vazia (zero de
      // zero nao e paragem) e limita o resto a 1/h, dizendo quantos calou.
      const av = avisoDeDreno(an, {
        fila: fila.length, ultimoMs: avisoDreno.ultimoMs,
        agora: Date.now(), silenciados: avisoDreno.silenciados,
      });
      avisoDreno.ultimoMs = av.ultimoMs;
      avisoDreno.silenciados = av.silenciados;
      if (av.avisar) {
        const calados = av.calados ? ` (+${av.calados} repeticao(oes) calada(s) na ultima hora)` : '';
        logImpl(`⚠️  autopilot L1 ANOMALIA DE DRENO: ${av.porque}${calados}
`);
      }
    } catch (err) {
      logImpl(`autopilot L1 falhou apos ${feitos} escrita(s) — o que ja foi escrito FICA (append-only): ${String(err && err.message).slice(0, 160)}
`);
    }
    return feitos;
  }

  const servidor = http.createServer(async (req, res) => {
    const route = (req.url || '/').split('?')[0];

    if (!hostAllowed(req.headers.host)) {
      return sendJson(res, 403, { erro: 'Host nao local recusado' }, { cors: false });
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        ...corsHeaders(req.headers.origin),
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    if (req.method === 'GET' && (route === '/fleet.json' || route === '/fleet')) {
      const [gpu, alive, models, alignment] = await Promise.all([
        sampleGpu(),
        engineAlive(fetchImpl),
        loadedModels(fetchImpl),
        // Os shas vem do ESTADO que o runner escreveu, nao de um recalculo
        // aqui. Este servidor e outro processo: perguntar duas vezes ao disco
        // so prova que o disco e igual a si proprio. Ate 2026-08-23 era isso
        // que acontecia — `buildAlignment({ repoRoot })` sem shas — e a linha
        // "running code" do painel dizia SEMPRE "could not compare". O aviso de
        // deriva era codigo morto em producao.
        buildAlignment({
          repoRoot: raiz,
          shaCarregado: shaDoRunner(statePath),
          shaEmDisco: repoSha(raiz),
        }).catch(() => null),
      ]);
      const where = beaconDir();
      const fleet = lerFrota(where, device);
      const estado = buildFleetState({
        device,
        // Lida do manifest a cada pedido: o painel nunca pode afirmar uma
        // versao que o repo ja nao tem.
        connector: versaoDoConector(raiz),
        ledgerPath,
        statePath,
        stopFile,
        triagemPath: triagemFile,
        baseDir: paths.base,
        repoRoot: raiz,
        gpu,
        engineAlive: alive,
        loadedModels: models,
        alignment,
        fleet,
      });
      // `foco` e o pilar com que o loop CORREU a ultima ronda; so muda quando a
      // ronda seguinte acabar (ate ~35 s). O ficheiro de foco muda no instante
      // do clique. Publicar apenas `foco` fazia o botao parecer morto durante
      // uma ronda inteira — medido a 2026-08-19: 6 cliques, 1 confirmado.
      // Dois campos, duas verdades, nenhuma mentira.
      estado.foco_pedido = lerFocoPedido(focusFile);
      // A severidade viaja JA CALCULADA. Ate aqui o painel tinha a sua propria
      // copia da regra e o autopilot tinha a dele: duas verdades sobre o mesmo
      // achado, a um refactor de distancia de discordarem em silencio — que e
      // exactamente o defeito que o pilar P9 existe para cacar. Uma fonte.
      //
      // E ao lado dela o SUPORTE DA CITACAO, que responde a outra pergunta:
      // `citacao-ok` diz que a linha existe no disco; isto diz se a linha
      // contem o numero que o achado afirma. Sao coisas diferentes, e a
      // diferenca chegava a fila do dono marcada HIGH.
      if (Array.isArray(estado.por_triar)) {
        estado.por_triar = estado.por_triar.map((a) => {
          if (a.origem === ORIGEM_DETECTOR) {
            return {
              ...a,
              suporte: null,
              suporte_porque: 'not applicable — a regex pointer has no model citation',
            };
          }
          const s = severidade(a);
          const sup = suporteDaCitacao(a);
          return { ...a, sev: { k: s.k, n: s.n, porque: s.porque }, suporte: sup.ok, suporte_porque: sup.porque };
        });
      }
      // O autopilot viaja com os PORTOES ja medidos: o painel nunca calcula se
      // um nivel pode abrir, so mostra o numero que o abre e o numero que ha.
      const pedido = lerAutopilot();
      const ps = portoes({ recibos: estado.recibos, triagem: estado.triagem });
      estado.autopilot = {
        pedido: pedido.nivel,
        efectivo: efectivo(pedido.nivel, ps),
        tecto: tectoPermitido(ps),
        orcamento: pedido.orcamento,
        orcamento_diz: orcamento(pedido.orcamento).diz,
        orcamentos: Object.entries(ORCAMENTOS).map(([id, o]) => ({ id, rotulo: o.rotulo, diz: o.diz })),
        niveis: NIVEIS,
        portoes: ps,
      };
      return sendJson(res, 200, estado);
    }

    // Static catalogue, fetched once at boot instead of riding every poll: the
    // pillar names and questions never change while the process is up.
    // Os motores e o custo REAL de mandar um achado a cada um. A tabela vem de
    // tools/router/pricing.js; um modelo fora dela sai `n/d`, nunca estimado.
    if (req.method === 'GET' && route === '/motores.json') {
      return sendJson(res, 200, { motores: menuDeMotores() });
    }

    // O que os turnos do Claude Code desta maquina custariam ao preco de tabela
    // da API, modelo a modelo.
    //
    // ⚠️ Isto NAO se soma ao `usd: 0` do /fleet.json e nunca se pode misturar
    // com ele. Aquele e o que o LOOP gastou — zero por construcao, porque o
    // `assertLocalEngine` recusa qualquer motor que nao seja loopback. Este e o
    // que os MESMOS tokens custariam se tivessem ido pela API. Sao dois numeros
    // verdadeiros e diferentes, e e a diferenca entre eles que e a tese do
    // produto. Um painel que os somasse estaria a inventar uma factura.
    // A auto-verificacao: o cockpit a olhar para si proprio, sem modelo nenhum.
    //
    // Os nove defeitos de 2026-08-19 foram todos encontrados a ler ficheiros a
    // mao, e nenhum precisava de um modelo — um `stat` e uma comparacao
    // chegavam. Isto corre-os a cada pedido, de graca. "Nao ha alertas" nunca
    // quis dizer "esta tudo bem": queria dizer que ninguem estava a olhar.
    if (req.method === 'GET' && route === '/saude.json') {
      const saude = autoVerificar({
        paths,
        mooDir: paths.base,
        vaultDir: beaconDir().partilhado ? path.dirname(beaconDir().dir) : null,
        beaconFile: path.join(beaconDir().dir, `${device}.json`),
      });
      // `autoVerificar` so olha para ESTA maquina. Um dono com dois
      // computadores tinha de abrir os dois paineis para descobrir que um
      // estava desactualizado — e por isso o Mac ficou dezasseis versoes atras.
      // `naTuaMao` le a frota inteira e devolve o que pede a mao do dono, com
      // o nome do device na instrucao.
      const w = beaconDir();
      const f = lerFrota(w, device);
      saude.frota = naTuaMao(f.frota, { rejeitados: f.rejeitados });
      // A autenticidade do canal e um facto do painel, nao um detalhe: sem ela
      // "a frota diz X" vale exactamente o que valer quem escreve na pasta.
      saude.autenticacao = f.autenticacao;
      /**
       * A METRICA-MAE, do ledger de decisoes do router.
       *
       * E o par que a concorrencia publica (RouteLLM): que fraccao das chamadas
       * subiu ao modelo forte, contra que fraccao da qualidade se manteve.
       * Aqui so a PRIMEIRA metade tem dados — a segunda sai `n/d` com o motivo,
       * porque o `decisions_v2.jsonl` nao regista qualidade por decisao e o
       * unico sinal de qualidade do sistema pertence a outra populacao.
       * Cruza-los daria um numero publicavel e inventado.
       *
       * Best-effort por desenho: se o ledger do router nao existir nesta
       * maquina, o campo sai `n/d` e o resto do /saude.json continua igual —
       * uma metrica nao pode derrubar a auto-verificacao.
       */
      try {
        const dv = path.join(os.homedir(), '.claude', 'tools', 'router', 'decisions_v2.jsonl');
        const linhas = fs.readFileSync(dv, 'utf8').split('\n');
        saude.metrica_mae = metricaMae(linhas);
        saude.quota_por_motor = quotaPorMotor(linhas).slice(0, 7);
      } catch (e) {
        saude.metrica_mae = { total: 0, porque: `sem decisions_v2.jsonl legivel: ${String(e && e.message).slice(0, 80)}` };
        saude.quota_por_motor = [];
      }
      /**
       * O UPTIME DO PROPRIO ENDPOINT, lido do registo do watchdog.
       *
       * O `KeepAlive` do launchd cobre um caso — o processo morrer. Nao cobre o
       * que acontece mais: processo VIVO, endpoint inutil. E um numero de
       * disponibilidade guardado na memoria deste processo nao valeria nada,
       * porque reiniciar poe-no a 100%. Vem do `watchdog.jsonl`, que e
       * append-only e sobrevive ao reinicio.
       *
       * Entra em `itens` SO quando ha alerta: o cartao da saude do painel mostra
       * apenas o que precisa de mao, e um verde a mais ensina a ignorar o cartao.
       */
      const wd = uptimeDoF10(lerRegistoDoWatchdog({ mooDir: paths.base }));
      saude.watchdog = wd;
      if (wd.alerta) {
        saude.itens = [...(saude.itens || []), {
          o_que: 'o endpoint do cockpit falhou seguidas vezes',
          valor: `${wd.seguidas} falhas seguidas · uptime ${wd.pct == null ? 'n/d' : `${wd.pct}%`} em 24 h`,
          estado: 'mau',
          porque: wd.porque,
          resolver: 'launchctl kickstart -k gui/$(id -u)/ai.mooter.f10',
        }];
      }
      return sendJson(res, 200, saude);
    }

    if (req.method === 'GET' && route === '/custo.json') {
      const agora = Date.now();
      if (!custoCache.dados || agora - custoCache.em > CUSTO_TTL_MS) {
        try {
          custoCache = { em: agora, dados: { curta: spendByModel({ horas: 5 }), longa: spendByModel({ horas: 168 }) } };
        } catch (e) {
          // Um medidor que rebenta nao pode derrubar o painel: diz que nao sabe.
          return sendJson(res, 200, { curta: null, longa: null, disponivel: false, porque: String((e && e.message) || e) });
        }
      }
      return sendJson(res, 200, custoCache.dados);
    }

    if (req.method === 'GET' && route === '/pilares.json') {
      return sendJson(res, 200, {
        repo: raiz,
        fonte: pilares.fonte,
        // Um pilares.json recusado nao pode desaparecer: o painel tem de poder
        // dizer ao dono que o ficheiro dele foi ignorado, e porque.
        erro: pilares.erro,
        pilares: pilares.ids.map((id) => ({
          id,
          label: pilares.pillars[id].label,
          pergunta: pilares.pillars[id].ask,
          ancoras: pilares.pillars[id].files,
        })),
      });
    }

    /**
     * `GET /ledger` — a vista do DONO (o Moo Ledger, casca v4).
     *
     * O `/panel` v1 fica exactamente onde estava: e a vista do OPERADOR, com os
     * controlos (▶/⏸, foco, triagem) que o Ledger ainda nao tem. Duas vistas,
     * duas rotas, zero ambiguidade — substituir uma pela outra tirava botoes ao
     * dono sem lhe dar nada em troca.
     *
     * Constroi-se A CADA PEDIDO. E mais caro do que servir um ficheiro, e e
     * esse o ponto: um Ledger servido de disco seria um instantaneo a fingir-se
     * vivo, que e a unica coisa que esta pagina promete nunca ser. Se a
     * construcao falhar, responde 503 e DIZ porque — nunca uma copia velha.
     */
    if (req.method === 'GET' && route === '/ledger') {
      try {
        const { html, snapshot, shell } = await renderLedgerHtml({ repoRoot: raiz, mooDir: paths.base });
        const buf = Buffer.from(html, 'utf8');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': buf.length,
          'Cache-Control': 'no-store',
          'X-Moo-Panel': 'ledger',
          'X-Moo-Panel-Source': 'tools/cockpit/moo-ledger-shell.html',
          'X-Moo-Ledger-Shell': shell.version,
          'X-Moo-Ledger-Generated': snapshot.generated_at,
        });
        return res.end(buf);
      } catch (e) {
        return sendJson(res, 503, {
          erro: 'nao consegui construir o ledger',
          porque: String((e && e.message) || e),
          faz_assim: 'node tools/cockpit/runner/build-ledger-snapshot.mjs',
        });
      }
    }

    if (req.method === 'GET' && ['/', '/panel', '/index.html'].includes(route)) {
      const candidatos = panelCandidates(raiz);
      for (let i = 0; i < candidatos.length; i += 1) {
        const candidate = candidatos[i];
        try {
          let texto = fs.readFileSync(candidate, 'utf8');
          // ⚠️ O fallback servia-se em SILENCIO, com 200 e nada a distingui-lo.
          // Se o painel canonico falhasse a leitura, o dono ficava a olhar para
          // um prototipo antigo a acreditar que era o estado actual — o pior
          // tipo de mentira que este projecto pode contar, porque parece certa.
          if (i > 0) texto = AVISO_PROTOTIPO + texto;
          const html = Buffer.from(texto, 'utf8');
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'X-Moo-Panel': i === 0 ? 'canonico' : 'prototipo',
            'Content-Length': html.length,
            'Cache-Control': 'no-store',
            // POSIX SEMPRE, mesmo no Windows. Um cabecalho e um valor de fio, nao
            // um caminho de disco: `path.relative` devolvia
            // `tools\cockpit\moo-pilot-shell.html` na maquina Windows do dono, e a
            // skill `/moo-pilot` manda conferir `tools/cockpit/moo-pilot-shell.html`.
            // O painel CANONICO seria reportado como "outro ficheiro" — um alarme
            // falso sobre a peca que o cabecalho existe para autenticar. Apanhado
            // pelo job `cockpit tests (windows)` na primeira vez que alguem
            // comparou o valor em vez de o imprimir.
            'X-Moo-Panel-Source': (path.relative(raiz, candidate) || candidate).split(path.sep).join('/'),
          });
          return res.end(html);
        } catch {
          /* try the next candidate */
        }
      }
      return sendJson(res, 503, {
        erro: 'painel nao encontrado',
        procurado: panelCandidates(raiz),
      });
    }

    if (req.method === 'POST' && VERBOS_DE_CONTROLO.includes(route)) {
      if (!originAllowed(req.headers.origin)) {
        return sendJson(res, 403, { erro: 'origem nao local recusada' }, { cors: false });
      }

      /**
       * O Moo responde — na GPU desta maquina, a $0, sem tocar em nada.
       *
       * Guardado pela MESMA origem que o kill-switch, e a razao nao e obvia: ler
       * nao muda estado, mas isto gasta a GPU do dono e recebe texto que ele
       * escreveu sobre o codigo dele. Um site que ele visite nao pode fazer
       * nenhuma das duas coisas.
       */
      if (route === '/assist') {
        const body = await readBody(req);
        const v = validarMensagem(body && body.mensagem);
        if (!v.ok) return sendJson(res, 400, { erro: v.erro, porque: v.porque, tecto: MAX_MENSAGEM });
        // A escada de tres degraus, lida do disco e do motor — nunca um nome
        // cravado aqui, que envelheceria no dia em que o dono trocasse de modelo.
        const residentes = await loadedModels(fetchImpl);
        let state = {};
        try { state = JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { state = {}; }
        const { modelo, fonte } = escolherModelo({ residentes, state, env });
        const r = await perguntar({ mensagem: v.mensagem, modelo, fetchImpl });
        if (!r.ok) {
          // 503 e nao 500: o motor local estar em baixo nao e um defeito deste
          // servidor, e a doca tem de o poder dizer com essas palavras.
          return sendJson(res, 503, { ok: false, modelo: r.modelo, porque: r.porque },
                          { origin: req.headers.origin });
        }
        return sendJson(res, 200, { ...r, fonte_do_modelo: fonte }, { origin: req.headers.origin });
      }

      /**
       * Onde esta o conector novo, e o que se faz com ele. NAO instala.
       * A recusa esta no payload (`instala_sozinho:false`) para quem leia o
       * endpoint a espera de um botao encontrar ali a razao de nao haver um.
       */
      if (route === '/update') {
        return sendJson(res, 200, estadoDaActualizacao({
          repoRoot: raiz,
          instalada: versaoInstalada(),
          disponivel: versaoDoConector(raiz),
        }), { origin: req.headers.origin });
      }

      // Triagem: a unica escrita do painel que produz VALOR em vez de estado.
      // Guardada pela mesma origem que o kill-switch — decidir sobre os achados
      // do dono e uma accao dele, nao de um site que ele visitou.
      //
      // `/triage` e a MESMA rota com o nome em ingles, porque o Ledger fala
      // ingles e o painel v1 fala portugues. Duas portas, UM escritor: um
      // segundo bloco de codigo aqui seria uma segunda maneira de escrever no
      // `triagem.jsonl`, e as duas divergiriam no primeiro campo novo.
      if (route === '/triagem' || route === '/triage') {
        const body = await readBody(req);
        if (!body || !body.chave || !DECISOES.includes(body.decisao)) {
          return sendJson(res, 400, { erro: 'triagem precisa de { chave, decisao }', aceites: DECISOES });
        }
        // QUEM assina, e o unico sitio no sistema onde "nao disse" pode querer
        // dizer "foi o dono". `registarTriagem` deixou de ter default nenhum,
        // porque uma biblioteca que assume `dono` assina em nome dele a partir
        // de qualquer script.
        //
        // E aqui o default e CONDICIONADO A PROVA que existe. Um browser
        // mandado pelo painel envia sempre `Origin` num POST; um `curl` na
        // mesma maquina nao envia nenhum. Ate 2026-08-24 este endpoint dava
        // `por:'dono'` aos dois — bastava um processo local qualquer fazer POST
        // sem corpo completo para escrever uma decisao em nome do dono, na
        // contagem que abre o nivel 2. Sem `Origin`, o cliente tem de se
        // identificar; e o unico sinal disponivel sem introduzir credenciais, e
        // e melhor do que fingir que o campo prova alguma coisa.
        const origem = req.headers.origin;
        if (!body.por && !origem) {
          return sendJson(res, 400, {
            erro: 'sem Origin, quem escreve tem de se identificar em `por`',
            porque: 'so o painel pode assinar como dono por omissao, e um pedido sem Origin nao veio do painel',
            aceites: AUTORES,
          });
        }
        //
        // O QUE ISTO NAO FECHA, e o PR anterior deu a entender que fechava:
        // qualquer processo local que DIGA `por:'dono'` passa por aqui. O 400
        // acima so apanha quem nao diz nada e nao traz `Origin`. Fechar isto a
        // serio exige uma credencial no canal — e uma credencial que o proprio
        // painel serve pode ser lida por quem faca um GET a esse painel, ou
        // seja seria uma fechadura de papel.
        //
        // O que se faz em vez disso: `via` regista o que se OBSERVOU, e o
        // `prontidao-l2` conta quantas decisoes `dono` NAO trazem
        // `via:'painel'`. Nao prova nada — torna visivel uma pergunta que so o
        // dono sabe responder. Contar o que nao se consegue impedir e mais
        // honesto do que fingir que se impediu.
        const por = body.por || 'dono';
        if (!AUTORES.includes(por)) {
          return sendJson(res, 400, { erro: 'autor desconhecido', aceites: AUTORES });
        }
        // Um descarte sem motivo devolve 400 com a lista, em vez de 500: o
        // painel precisa de saber O QUE mandar, nao so que falhou.
        if (body.decisao === 'descartado' && !MOTIVOS.includes(body.motivo)) {
          return sendJson(res, 400, { erro: 'descartar exige um motivo', aceites: MOTIVOS });
        }
        try {
          const e = registarTriagem(triagemFile, {
            chave: body.chave, decisao: body.decisao, por,
            recibo: body.recibo || null, nota: body.nota || null,
            motivo: body.motivo || null,
            // O canal fica na linha, e e o que se OBSERVOU, nao um carimbo
            // fixo: `painel` quando o pedido trouxe `Origin` (browser), e
            // `cliente-local` quando nao trouxe. Carimbar `painel` nos dois
            // casos era escrever no ledger uma coisa que nao se sabia.
            via: origem ? 'painel' : 'cliente-local',
          });
          return sendJson(res, 200, { ok: true, registado: e });
        } catch (err) {
          return sendJson(res, 500, { ok: false, erro: String(err.message).slice(0, 200) });
        }
      }

      // O nivel de autonomia e o orcamento de GPU. Guardado como PEDIDO; o que
      // vale e o `efectivo`, cortado pelos portoes a cada leitura — pedir 3 com
      // o portao 1 fechado nao da 3, da o que os numeros permitem.
      if (route === '/autopilot') {
        const body = await readBody(req);
        const bruto = {
          nivel: body && body.nivel !== undefined ? body.nivel : lerAutopilot().nivel,
          orcamento: body && body.orcamento !== undefined ? body.orcamento : lerAutopilot().orcamento,
        };
        if (body && body.nivel !== undefined && !Number.isInteger(Number(body.nivel))) {
          return sendJson(res, 400, { erro: 'nivel tem de ser 0..3' });
        }
        if (body && body.orcamento !== undefined && !Object.prototype.hasOwnProperty.call(ORCAMENTOS, String(body.orcamento))) {
          return sendJson(res, 400, { erro: 'orcamento desconhecido', aceites: Object.keys(ORCAMENTOS) });
        }
        const guardar = normalizar(bruto);
        try {
          fs.mkdirSync(path.dirname(autopilotFile), { recursive: true });
          fs.writeFileSync(autopilotFile, JSON.stringify(guardar));
        } catch (err) {
          return sendJson(res, 500, { ok: false, erro: String(err.message).slice(0, 200) });
        }
        return sendJson(res, 200, { ok: true, ...guardar });
      }

      // Per-pillar focus. The cockpit must never show a control that does
      // nothing, so the button writes a preference the loop actually reads.
      if (route === '/focus') {
        const body = await readBody(req);
        const pilar = body && body.pilar;
        if (pilar !== null && !pilares.ids.includes(pilar)) {
          return sendJson(res, 400, { erro: 'pilar desconhecido', aceites: pilares.ids });
        }
        try {
          if (pilar === null) fs.rmSync(focusFile, { force: true });
          else fs.writeFileSync(focusFile, JSON.stringify({ pilar }));
        } catch (err) {
          return sendJson(res, 500, { ok: false, erro: String(err.message) });
        }
        return sendJson(res, 200, { ok: true, foco: pilar });
      }
      if (route === '/stop') {
        try {
          fs.writeFileSync(stopFile, String(Math.floor(Date.now() / 1000)));
        } catch (err) {
          return sendJson(res, 500, { ok: false, running: true, erro: String(err.message) });
        }
        return sendJson(res, 200, { ok: true, running: false });
      }
      if (route === '/play') {
        try {
          fs.rmSync(stopFile, { force: true });
        } catch (err) {
          return sendJson(res, 500, { ok: false, running: false, erro: String(err.message) });
        }
        return sendJson(res, 200, { ok: true, running: !fs.existsSync(stopFile) });
      }

      // ⚠️ A CAUDA E UM 404, e nao o `/play`.
      //
      // Ate 2026-09-01 o religar do loop era o `else` final: qualquer verbo
      // desta lista que ficasse sem ramo proprio APAGAVA o STOP. Nao era
      // hipotetico — era o comportamento por omissao, e a lista tornou
      // acrescentar um verbo no passo mais facil de todos. Um endpoint novo mal
      // ligado passava a ligar a maquina a trabalhar, que e a accao com mais
      // consequencia que este servidor tem.
      return sendJson(res, 404, {
        erro: 'verbo declarado sem tratamento',
        rota: route,
        porque: 'esta rota esta em VERBOS_DE_CONTROLO e nenhum ramo a serve — e um defeito, nao um pedido invalido',
      });
    }

    return sendJson(res, 404, { erro: 'not found', rota: route });
  });

  // 45 s: mais lento do que uma ronda, para nunca competir com o loop pela mesma
  // leitura do ledger. `unref` para que o tique nunca segure o processo vivo.
  const tique = setInterval(() => tiqueCurar(), 45_000);
  if (typeof tique.unref === 'function') tique.unref();
  servidor.on('close', () => clearInterval(tique));
  servidor.tiqueCurar = tiqueCurar;
  return servidor;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  const { root, fonte } = resolveRepoRoot({ argv: process.argv.slice(2), scriptRoot: SCRIPT_ROOT });
  const srv = createServer({ repoRoot: root });
  // Sem isto, um EADDRINUSE derrubava o processo com um stack trace e sem dizer
  // o que fazer — e a causa mais provavel e trivial: um F10 ja vivo.
  srv.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      process.stdout.write(`F10: a porta ${PORT} ja esta ocupada — provavelmente ha outro F10 vivo.\n`);
      process.stdout.write(`     usa MOO_PORT=<outra> para levantar um segundo, ou fecha o que esta a correr.\n`);
      process.exit(1);
    }
    process.stdout.write(`F10 nao arrancou: ${err && err.message}\n`);
    process.exit(1);
  });
  srv.listen(PORT, HOST, () => {
    process.stdout.write(`F10 vivo em http://${HOST}:${PORT} (repo ${root}, via ${fonte})\n`);
    // A linha acima e um ECO do que pedimos; esta e o que o SO responde. Vao
    // as duas para o log de proposito: quando divergirem, e o par que o mostra.
    const bind = verificarBind(PORT);
    process.stdout.write(linhaDeLog(bind, PORT));
    if (bind.estado === 'exposto') {
      process.stdout.write('     esta porta responde fora desta maquina. Fecha o F10 e confirma o HOST.\n');
    }
  });
}
