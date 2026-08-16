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
  if (!origin || origin === 'null') return true;
  try {
    const { hostname } = new URL(origin);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1';
  } catch {
    return false;
  }
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
  device = 'mac-mini',
  fetchImpl = fetch,
} = {}) {
  const stopFile = path.join(mooDir, 'STOP');
  const ledgerPath = path.join(mooDir, 'runner-ledger.jsonl');
  const statePath = path.join(mooDir, 'runner-state.json');

  return http.createServer(async (req, res) => {
    const route = (req.url || '/').split('?')[0];

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
        }),
      );
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

    if (req.method === 'POST' && (route === '/play' || route === '/stop')) {
      if (!originAllowed(req.headers.origin)) {
        return sendJson(res, 403, { erro: 'origem nao local recusada' }, { cors: false });
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
