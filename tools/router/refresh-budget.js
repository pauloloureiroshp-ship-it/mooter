#!/usr/bin/env node
/**
 * refresh-budget.js — background Anthropic OAuth /usage fetcher.
 *
 * Spawned (detached) by inject_context.js when the on-disk budget cache is
 * stale (≥2h). Writes the fresh response to .budget-cache.json and removes
 * the refresh lock. Any hook invocation after this completes will see the
 * fresh cache on the fast path and skip sync fetch entirely.
 *
 * Design:
 *  - Fully detached — stdout/stderr discarded, never blocks caller
 *  - Lock file removed on exit (success or failure)
 *  - Auth-error responses cached WITH an `error: true` sentinel so the
 *    savings-tracker /real endpoint can surface the dead token
 *  - 3s hard cap on the HTTPS request (matches legacy sync behaviour)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');
const BUDGET_CACHE_PATH = path.join(ROUTER_DIR, '.budget-cache.json');
const BUDGET_REFRESH_LOCK = path.join(ROUTER_DIR, '.budget-refresh.lock');
const CREDS_PATH = path.join(os.homedir(), '.claude', '.credentials.json');

// UMA definição do congelamento, partilhada com o `inject_context.js`. Quatro
// ficheiros já definiam o caminho do cache cada um por si; o sentinela não vai
// repetir o erro.
const congelamento = require('./budget-freeze.js');

function cleanup() {
  try { fs.unlinkSync(BUDGET_REFRESH_LOCK); } catch { /* non-fatal */ }
}

function finish(code) {
  cleanup();
  process.exit(code);
}

/**
 * D15 — o congelamento do orçamento, e porque é um FICHEIRO e não uma variável
 * de ambiente.
 *
 * `.budget-cache.json` entra na definição do tratamento de qualquer A/B nesta
 * máquina (`estado_vivo_sha`): muda o tecto de tier, portanto muda o sujeito da
 * experiência. Este processo reescreve-o a cada ~2 h, e o hook que o lança corre
 * a cada mensagem do dono. Resultado medido a 2026-09-10: a corrida 3 do R-24
 * morreu a meio, morta pela guarda de integridade do próprio executor, porque o
 * dono continuou a usar o Claude Code enquanto a experiência corria. Qualquer
 * A/B com mais de duas horas tinha o mesmo destino.
 *
 * Um sentinela em disco, e não `process.env`, porque este processo é lançado
 * DESTACADO pelo `inject_context.js` na sessão do dono: não herda o ambiente de
 * quem está a correr a experiência noutra shell. O disco é a única coisa que os
 * dois lados vêem.
 *
 * A verificação vem ANTES da leitura das credenciais de propósito. Se viesse
 * depois, um teste com o sentinela posto passaria na mesma numa máquina sem
 * credenciais — e passaria pela razão errada, que é como um controlo se torna
 * inútil sem ninguém dar por isso.
 *
 * Desligado por omissão: sem o ficheiro, o comportamento é byte-idêntico ao de
 * antes. Quem congela é responsável por descongelar; o cache fica stale, o que
 * é exactamente o que uma experiência quer e o que a vida normal não quer.
 */
if (congelamento.congelado()) {
  process.stderr.write(`refresh-budget: ${congelamento.linhaDeAviso()} — nada escrito\n`);
  finish(0);
}

let token;
try {
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  token = creds && creds.claudeAiOauth && creds.claudeAiOauth.accessToken;
} catch {
  finish(1);
}

if (!token) finish(1);

const req = https.request(
  {
    hostname: 'api.anthropic.com',
    path: '/api/oauth/usage',
    method: 'GET',
    headers: { Authorization: 'Bearer ' + token },
  },
  (res) => {
    let body = '';
    res.on('data', (d) => (body += d));
    res.on('end', () => {
      let data;
      try { data = JSON.parse(body); } catch { return finish(2); }

      // Auth error — cache with sentinel so /real endpoint surfaces it.
      if (data && data.type === 'error') {
        try {
          fs.writeFileSync(
            BUDGET_CACHE_PATH,
            JSON.stringify({ ts: Date.now(), data, error: true })
          );
        } catch { /* non-fatal */ }
        return finish(0);
      }

      try {
        fs.writeFileSync(BUDGET_CACHE_PATH, JSON.stringify({ ts: Date.now(), data }));
      } catch { /* non-fatal */ }
      finish(0);
    });
  }
);

req.on('error', () => finish(1));
req.setTimeout(3000, () => { req.destroy(); finish(1); });
req.end();
