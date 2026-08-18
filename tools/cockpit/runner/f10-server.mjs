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
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { buildFleetState } from './fleet-state.mjs';
import { sampleGpu } from './gpu-sampler.mjs';
import { buildAlignment } from './alignment.mjs';
import { loadPillars } from './context-pack.mjs';
import { resolveRepoRoot, projectPaths } from './project.mjs';
import { registarTriagem, DECISOES, menuDeMotores } from './triagem.mjs';
import { beaconDir, readBeacons, deviceName } from './fleet-beacon.mjs';

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
export const PORT = 4290;
const OLLAMA = 'http://127.0.0.1:11434';

const HOME = os.homedir();
const MOO_DIR = process.env.MOOTER_HOME || path.join(HOME, '.mooter');
/** A raiz do repo de onde ESTE script corre — o repo canonico deste device. */
const SCRIPT_ROOT = path.resolve(new URL('../../..', import.meta.url).pathname);

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
  const focusFile = paths.FOCUS;
  const triagemFile = path.join(paths.base, "triagem.jsonl");

  return http.createServer(async (req, res) => {
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
        buildAlignment({ repoRoot: raiz }).catch(() => null),
      ]);
      const where = beaconDir();
      const fleet = readBeacons({ ...where, selfDevice: device });
      return sendJson(
        res,
        200,
        buildFleetState({
          device,
          ledgerPath,
          statePath,
          stopFile,
          triagemPath: triagemFile,
          gpu,
          engineAlive: alive,
          loadedModels: models,
          alignment,
          fleet,
        }),
      );
    }

    // Static catalogue, fetched once at boot instead of riding every poll: the
    // pillar names and questions never change while the process is up.
    // Os motores e o custo REAL de mandar um achado a cada um. A tabela vem de
    // tools/router/pricing.js; um modelo fora dela sai `n/d`, nunca estimado.
    if (req.method === 'GET' && route === '/motores.json') {
      return sendJson(res, 200, { motores: menuDeMotores() });
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
      for (const candidate of panelCandidates(raiz)) {
        try {
          const html = fs.readFileSync(candidate);
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
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

    if (req.method === 'POST' && (route === '/play' || route === '/stop' || route === '/focus' || route === '/triagem')) {
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
        try {
          const e = registarTriagem(triagemFile, {
            chave: body.chave, decisao: body.decisao,
            recibo: body.recibo || null, nota: body.nota || null,
          });
          return sendJson(res, 200, { ok: true, registado: e });
        } catch (err) {
          return sendJson(res, 500, { ok: false, erro: String(err.message).slice(0, 200) });
        }
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
}

const invokedDirectly =
  process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (invokedDirectly) {
  const { root, fonte } = resolveRepoRoot({ argv: process.argv.slice(2), scriptRoot: SCRIPT_ROOT });
  createServer({ repoRoot: root }).listen(PORT, HOST, () => {
    process.stdout.write(`F10 vivo em http://${HOST}:${PORT} (repo ${root}, via ${fonte})\n`);
  });
}
