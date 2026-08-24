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
import { registarTriagem, DECISOES, AUTORES, MOTIVOS, menuDeMotores, lerTriagem, porTriar } from './triagem.mjs';
import {
  NIVEIS, portoes, tectoPermitido, efectivo, lerEstado, normalizar,
  ORCAMENTOS, orcamento, curar, severidade, suporteDaCitacao,
  naAmostraDeAuditoria, anomaliaDeDreno, AUDITORIA_1_EM,
} from './autopilot.mjs';
import { beaconDir, readBeacons, deviceName, naTuaMao } from './fleet-beacon.mjs';
import { beaconsDoRemoto } from './fleet-remoto.mjs';
import { spendByModel } from './spend-by-model.mjs';
import { autoVerificar } from './self-check.mjs';

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
    return [];
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
  return fleet;
}

function sendJson(res, code, obj, { cors = true, origin = null } = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
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
  const pilares = loadPillars(raiz);
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
  function tiqueCurar(logImpl = (s) => process.stdout.write(s)) {
    let feitos = 0;
    try {
      const pedido = lerAutopilot();
      if (pedido.nivel < 1) return 0;
      const { receipts } = readLedger(ledgerPath);
      const { decisoes } = lerTriagem(triagemFile);
      const fila = porTriar(receipts, decisoes);
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
      const actos = curar(fila);
      for (const acto of actos) {
        // `via` diz por onde a decisao entrou. Uma linha `agente` sem
        // `via:'autopilot-l1'` nao veio deste tique.
        registarTriagem(triagemFile, { ...acto, via: 'autopilot-l1' });
        feitos += 1;
      }
      // Quantos ficaram DE FORA do dreno para o dono os ver. Sem esta linha, o
      // nivel 1 esvaziava a fila e ninguem sabia que uma amostra tinha sido
      // reservada — uma rede que ninguem ve nao e uma rede.
      const reservados = fila.filter((a) => naAmostraDeAuditoria(a && a.chave)).length;
      if (feitos) {
        logImpl(`autopilot L1: ${feitos} achado(s) de baixa severidade fechados com motivo tipado${reservados ? ` · ${reservados} reservado(s) para a tua auditoria (1 em ${AUDITORIA_1_EM})` : ''}
`);
      }
      // O alarme corre sobre o que o dreno JA fechou, lido do proprio ledger de
      // triagem — nao sobre o que acabou de acontecer neste tique. Um pilar que
      // regride nao se ve num tique; ve-se na forma do dia.
      const fechadosPeloAgente = [...decisoes.values()].filter((d) => d && d.por === 'agente');
      const an = anomaliaDeDreno(fechadosPeloAgente);
      if (an.anomalia) logImpl(`⚠️  autopilot L1 ANOMALIA DE DRENO: ${an.porque}
`);
    } catch (err) {
      logImpl(`autopilot L1 falhou (a fila fica intacta): ${String(err && err.message).slice(0, 160)}
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
            'X-Moo-Panel-Source': path.relative(raiz, candidate) || candidate,
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

    if (req.method === 'POST' && (route === '/play' || route === '/stop' || route === '/focus' || route === '/triagem' || route === '/autopilot')) {
      if (!originAllowed(req.headers.origin)) {
        return sendJson(res, 403, { erro: 'origem nao local recusada' }, { cors: false });
      }

      // Triagem: a unica escrita do painel que produz VALOR em vez de estado.
      // Guardada pela mesma origem que o kill-switch — decidir sobre os achados
      // do dono e uma accao dele, nao de um site que ele visitou.
      if (route === '/triagem') {
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
      try {
        fs.rmSync(stopFile, { force: true });
      } catch (err) {
        return sendJson(res, 500, { ok: false, running: false, erro: String(err.message) });
      }
      return sendJson(res, 200, { ok: true, running: !fs.existsSync(stopFile) });
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
  });
}
