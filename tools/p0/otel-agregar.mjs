#!/usr/bin/env node
// otel-agregar.mjs — soma tokens/custo dos eventos `api_request` e das métricas `token.usage`
// gravados pelo otel-receptor. Tolerante a nomes (os atributos ainda estão em "Development").
// Uso: node otel-agregar.mjs [--dir ~/.mooter/otel] [--desde AAAA-MM-DD]

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { rotuloSeguro, rotuloModelo, rotuloAgente, dict } from './medir-p0.mjs';

const arr = (x) => (Array.isArray(x) ? x : []);

/** Converte a lista OTLP [{key, value:{stringValue|intValue|doubleValue|boolValue}}] em objecto. */
export function attrs(lista) {
  const o = {};
  for (const a of arr(lista)) {
    const v = a && a.value ? (a.value.stringValue ?? a.value.intValue ?? a.value.doubleValue ?? a.value.boolValue ?? null) : null;
    if (a && a.key) o[a.key] = v;
  }
  return o;
}

const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0; };
const pick = (o, ...ks) => { for (const k of ks) if (o[k] != null) return o[k]; return null; };

export function agregarLogs(payloads) {
  const porModelo = dict(); const porFonte = dict(); const prompts = new Set(); let eventos = 0;
  for (const p of arr(payloads)) {
    for (const rl of arr(p && p.resourceLogs)) for (const sl of arr(rl && rl.scopeLogs)) for (const lr of arr(sl && sl.logRecords)) {
      const a = attrs(lr && lr.attributes);
      const nome = String(pick(a, 'event.name') || (lr && lr.body && lr.body.stringValue) || '');
      if (!/api_request$/.test(nome)) continue;
      eventos++;
      const modelo = rotuloModelo(pick(a, 'model') || 'n/d');
      const fonte = rotuloSeguro(pick(a, 'query_source', 'query_source_safe') || 'n/d');
      if (a['prompt.id']) prompts.add(a['prompt.id']);
      for (const [alvo, k] of [[porModelo, modelo], [porFonte, fonte]]) {
        alvo[k] ??= { pedidos: 0, input: 0, output: 0, cache_read: 0, cache_creation: 0, custo_lista_usd: 0 };
        const x = alvo[k];
        x.pedidos++;
        x.input += num(pick(a, 'input_tokens'));
        x.output += num(pick(a, 'output_tokens'));
        x.cache_read += num(pick(a, 'cache_read_tokens'));
        x.cache_creation += num(pick(a, 'cache_creation_tokens'));
        x.custo_lista_usd += num(pick(a, 'cost_usd'));
      }
    }
  }
  return { eventos_api_request: eventos, prompts_distintos: prompts.size, por_modelo: porModelo, por_query_source: porFonte };
}

export function agregarMetricas(payloads) {
  const tokens = dict(); // `${type}|${model}|${query_source}|${agent}` → soma
  for (const p of arr(payloads)) {
    for (const rm of arr(p && p.resourceMetrics)) for (const sm of arr(rm && rm.scopeMetrics)) for (const m of arr(sm && sm.metrics)) {
      if (!m || !/token\.usage$/.test(String(m.name || ''))) continue;
      for (const dp of arr(m.sum && m.sum.dataPoints)) {
        const a = attrs(dp && dp.attributes);
        const k = [rotuloSeguro(a.type ?? 'n/d'), rotuloModelo(a.model ?? 'n/d'), rotuloSeguro(a.query_source ?? 'n/d'), rotuloAgente(a['agent.name'] ?? 'n/d')].join('|');
        tokens[k] = (tokens[k] || 0) + num(dp.asInt ?? dp.asDouble);
      }
    }
  }
  return { token_usage: tokens, nota: 'somas de pontos exportados; com temporalidade cumulativa isto sobre-conta — preferir os eventos api_request' };
}

function lerJsonl(f) {
  try { return fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).corpo; } catch { return null; } }).filter(Boolean); } catch { return []; }
}

const correDirecto = (() => { try { return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1] || '')); } catch { return false; } })();
if (correDirecto) {
  const argv = process.argv.slice(2);
  const dir = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : path.join(os.homedir(), '.mooter', 'otel');
  const desde = argv.includes('--desde') ? argv[argv.indexOf('--desde') + 1] : '0000';
  const fs_ = (() => { try { return fs.readdirSync(dir); } catch { return []; } })();
  const sel = (p) => fs_.filter((n) => n.startsWith(p) && n.slice(p.length, p.length + 10) >= desde).map((n) => path.join(dir, n));
  try {
    const out = { logs: agregarLogs(sel('logs-').flatMap(lerJsonl)), metricas: agregarMetricas(sel('metrics-').flatMap(lerJsonl)) };
    console.log(JSON.stringify(out, null, 2));
  } catch (e) {
    console.error('falhou:', (e && (e.code || e.name)) || 'erro'); // sem stack nem caminhos
    process.exitCode = 1;
  }
}
