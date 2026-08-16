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
import { PILLAR_IDS, PILLARS } from './context-pack.mjs';
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
const MOO_DIR = path.join(HOME, '.mooter');

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

function sendJson(res, code, obj, { cors = true } = {}) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...(cors ? { 'Access-Control-Allow-Origin': '*' } : {}),
  });
  res.end(body);
}

export function createServer({
  repoRoot = path.resolve(new URL('../../..', import.meta.url).pathname),
  mooDir = MOO_DIR,
  device = deviceName(),
  fetchImpl = fetch,
} = {}) {
  const stopFile = path.join(mooDir, 'STOP');
  const ledgerPath = path.join(mooDir, 'runner-ledger.jsonl');
  const statePath = path.join(mooDir, 'runner-state.json');
  const focusFile = path.join(mooDir, 'runner-focus.json');

  return http.createServer(async (req, res) => {
    const route = (req.url || '/').split('?')[0];

    if (!hostAllowed(req.headers.host)) {
      return sendJson(res, 403, { erro: 'Host nao local recusado' }, { cors: false });
    }

    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
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
        buildAlignment({ repoRoot }).catch(() => null),
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
    if (req.method === 'GET' && route === '/pilares.json') {
      return sendJson(res, 200, {
        pilares: PILLAR_IDS.map((id) => ({
          id,
          label: PILLARS[id].label,
          pergunta: PILLARS[id].ask,
          ancoras: PILLARS[id].files,
        })),
      });
    }

    if (req.method === 'GET' && ['/', '/panel', '/index.html'].includes(route)) {
      for (const candidate of panelCandidates(repoRoot)) {
        try {
          const html = fs.readFileSync(candidate);
          res.writeHead(200, {
            'Content-Type': 'text/html; charset=utf-8',
            'Content-Length': html.length,
            'Cache-Control': 'no-store',
            'X-Moo-Panel-Source': path.relative(repoRoot, candidate) || candidate,
          });
          return res.end(html);
        } catch {
          /* try the next candidate */
        }
      }
      return sendJson(res, 503, {
        erro: 'painel nao encontrado',
        procurado: panelCandidates(repoRoot),
      });
    }

    if (req.method === 'POST' && (route === '/play' || route === '/stop' || route === '/focus')) {
      if (!originAllowed(req.headers.origin)) {
        return sendJson(res, 403, { erro: 'origem nao local recusada' }, { cors: false });
      }

      // Per-pillar focus. The cockpit must never show a control that does
      // nothing, so the button writes a preference the loop actually reads.
      if (route === '/focus') {
        const body = await readBody(req);
        const pilar = body && body.pilar;
        if (pilar !== null && !PILLAR_IDS.includes(pilar)) {
          return sendJson(res, 400, { erro: 'pilar desconhecido', aceites: PILLAR_IDS });
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
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
  createServer({ repoRoot }).listen(PORT, HOST, () => {
    process.stdout.write(`F10 vivo em http://${HOST}:${PORT} (repo ${repoRoot})\n`);
  });
}
