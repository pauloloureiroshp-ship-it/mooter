#!/usr/bin/env node
// otel-receptor.mjs — Mooter P0-1b · receptor OTLP/HTTP (JSON) local, zero dependências.
//
// Recebe métricas/logs/traces do OpenTelemetry nativo do Claude Code em 127.0.0.1:4318 e grava
// cada payload, reconstruído só com os atributos da allowlist (ATRIBUTOS_OK), em
// ~/.mooter/otel/<sinal>-AAAA-MM-DD.jsonl. Não reenvia nada para fora (egress 0). Só aceita
// http/json — protobuf recebe 415 e conta no /health. O tecto (--tecto-mb) é por sinal e por dia.
//
// Activação (NÃO antes de 05/10 — ver PLANO_P0): no ~/.claude/settings.json (utilizador), bloco env:
//   CLAUDE_CODE_ENABLE_TELEMETRY=1  OTEL_METRICS_EXPORTER=otlp  OTEL_LOGS_EXPORTER=otlp
//   OTEL_EXPORTER_OTLP_PROTOCOL=http/json  OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:4318
//   (OTEL_LOG_USER_PROMPTS fica DESLIGADO; OTEL_LOG_TOOL_DETAILS fica desligado por defeito.)
//
// Uso: node otel-receptor.mjs [--porta 4318] [--dir ~/.mooter/otel] [--tecto-mb 200]

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { RE_MODELO, AGENTES_CONHECIDOS } from './medir-p0.mjs';

export const ROTAS = Object.freeze({ '/v1/metrics': 'metrics', '/v1/logs': 'logs', '/v1/traces': 'traces' });
export const MAX_CORPO = 20 * 1024 * 1024;
const MAX_ITENS = 10_000; // por lista OTLP; o resto é descartado e contado

/**
 * Allowlist de atributos que podem ficar no disco. Tudo o resto (texto de prompt, comandos, caminhos,
 * cwd, email, ids de conta, mensagens de erro) é descartado ANTES de gravar. Uma blacklist não garante
 * isto: o esquema do Claude Code está em "Development" e cada chave nova passaria.
 */
/**
 * A chave estar na lista não chega: cada chave tem o SEU normalizador de valor de texto, que devolve o
 * valor (quando é conhecido), `outro` (quando só a dimensão importa), ou undefined (descarta). A forma
 * de um token não prova que ele não é privado — `cliente-secreto.txt` e `whoami` têm forma de token.
 * Chaves só numéricas (tokens, custo, duração) aceitam só números. Não há fallback genérico.
 */
const soSe = (re) => (s) => (re.test(s) ? s : undefined);
const ouOutro = (ok) => (s) => (ok(s) ? s : 'outro');
const SEMVER = /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:[.-][A-Za-z0-9.]{1,20})?$/;
const NUMERICO = null; // marca: só intValue/doubleValue
export const ATRIBUTOS_OK = Object.freeze({
  // recurso / sessão
  'service.name': soSe(/^claude-code$/),
  'service.version': soSe(SEMVER), 'app.version': soSe(SEMVER),
  'os.type': soSe(/^(?:windows|linux|darwin)$/i),
  'os.version': soSe(/^\d{1,5}(?:\.\d{1,6}){0,3}$/),
  'host.arch': soSe(/^(?:x64|x86_64|amd64|arm64|aarch64|ia32|x86)$/i),
  'session.id': soSe(/^[0-9A-Fa-f-]{8,64}$/), 'prompt.id': soSe(/^[0-9A-Fa-f-]{8,64}$/),
  // eventos
  'event.name': soSe(/^(?:claude_code\.)?[a-z_]{1,40}$/),
  'event.timestamp': soSe(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/),
  model: ouOutro((s) => RE_MODELO.test(s)),
  // residual declarado: um nome interno em snake_case minúsculo passa (é assim que o CC os escreve)
  query_source: ouOutro((s) => /^[a-z][a-z0-9_]{0,40}(?::[a-z][a-z0-9_-]{0,40})?$/.test(s)),
  query_source_safe: ouOutro((s) => /^[a-z][a-z0-9_]{0,40}$/.test(s)),
  // métricas
  type: soSe(/^(?:input|output|cacheRead|cacheCreation)$/),
  'agent.name': ouOutro((s) => AGENTES_CONHECIDOS.has(s)),
  // só números
  'event.sequence': NUMERICO, prompt_length: NUMERICO, input_tokens: NUMERICO, output_tokens: NUMERICO,
  cache_read_tokens: NUMERICO, cache_creation_tokens: NUMERICO, cost_usd: NUMERICO, duration_ms: NUMERICO,
  status_code: NUMERICO, attempt: NUMERICO, success: NUMERICO,
});

function lista(v) { return Array.isArray(v) ? v.slice(0, MAX_ITENS) : []; }

/** Filtra uma lista OTLP [{key, value}]: só chaves de ATRIBUTOS_OK, e cada valor pelo normalizador da chave. */
export function filtrarAtributos(v, conta) {
  const out = [];
  for (const a of lista(v)) {
    if (!a || typeof a.key !== 'string' || !Object.hasOwn(ATRIBUTOS_OK, a.key)) { conta.descartados++; continue; }
    const norm = ATRIBUTOS_OK[a.key];
    const x = a.value && typeof a.value === 'object' ? a.value : {};
    let val = null;
    if (typeof x.stringValue === 'string') {
      const s = norm ? norm(x.stringValue) : /^-?\d{1,20}(?:\.\d{1,12})?$/.test(x.stringValue) ? x.stringValue : undefined;
      if (s !== undefined) val = { stringValue: s };
    } else if (x.intValue != null && /^-?\d{1,20}$/.test(String(x.intValue))) val = { intValue: String(x.intValue) };
    else if (typeof x.doubleValue === 'number' && Number.isFinite(x.doubleValue)) val = { doubleValue: x.doubleValue };
    else if (typeof x.boolValue === 'boolean') val = { boolValue: x.boolValue };
    if (val) out.push({ key: a.key, value: val }); else conta.descartados++;
  }
  return out;
}

const hex = (min, max) => (s) => (typeof s === 'string' && new RegExp(`^[0-9A-Fa-f]{${min},${max}}$`).test(s) ? s : undefined);
const idTraco = hex(32, 32); const idSpan = hex(16, 16);
const unidade = (s) => (typeof s === 'string' && /^(?:[A-Za-z]{1,12}|\{[a-z_]{1,20}\})$/.test(s) ? s : undefined); // tokens, USD, s, By, {count}
// nomes fixados pelo exportador do Claude Code: evento/métrica `claude_code.*`, âmbito `com.anthropic.claude_code*`
const nomeCC = (s) => (typeof s === 'string' && /^claude_code\.[a-z0-9_.]{1,80}$/.test(s) ? s : undefined);
const ambitoCC = (s) => (typeof s === 'string' && /^com\.anthropic\.claude_code[a-z0-9_.]{0,60}$/.test(s) ? s : undefined);
const versaoSemver = (s) => (typeof s === 'string' && /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:[.-][A-Za-z0-9.]{1,20})?$/.test(s) ? s : undefined);
const tempo = (s) => (s != null && /^\d{1,20}$/.test(String(s)) ? String(s) : undefined);
const numero = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : typeof n === 'string' && /^-?\d{1,20}$/.test(n) ? n : undefined);

function pontos(dps, conta) {
  return lista(dps).map((p) => ({
    attributes: filtrarAtributos(p && p.attributes, conta),
    startTimeUnixNano: tempo(p && p.startTimeUnixNano), timeUnixNano: tempo(p && p.timeUnixNano),
    asInt: numero(p && p.asInt), asDouble: numero(p && p.asDouble),
    count: numero(p && p.count), sum: numero(p && p.sum),
    bucketCounts: p && Array.isArray(p.bucketCounts) ? lista(p.bucketCounts).map(numero) : undefined,
    explicitBounds: p && Array.isArray(p.explicitBounds) ? lista(p.explicitBounds).map(numero) : undefined,
  }));
}

/**
 * Reconstrói o payload OTLP só com a forma conhecida e atributos da allowlist. Iterativo e de
 * profundidade fixa: um JSON aninhado a fundo não chega a ser percorrido (nada de recursão).
 */
export function sanear(corpo, sinal) {
  const conta = { descartados: 0 };
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  const recurso = (r) => ({ attributes: filtrarAtributos(r && r.resource && r.resource.attributes, conta) });
  const ambito = (s) => ({ name: ambitoCC(s && s.scope && s.scope.name), version: versaoSemver(s && s.scope && s.scope.version) });
  let out;
  if (sinal === 'logs') {
    out = { resourceLogs: lista(c.resourceLogs).map((r) => ({ resource: recurso(r), scopeLogs: lista(r && r.scopeLogs).map((s) => ({ scope: ambito(s), logRecords: lista(s && s.logRecords).map((l) => ({
      timeUnixNano: tempo(l && l.timeUnixNano), observedTimeUnixNano: tempo(l && l.observedTimeUnixNano),
      severityNumber: numero(l && l.severityNumber),
      body: l && l.body && nomeCC(l.body.stringValue) ? { stringValue: l.body.stringValue } : undefined, // o body do CC é o nome do evento
      attributes: filtrarAtributos(l && l.attributes, conta),
    })) })) })) };
  } else if (sinal === 'metrics') {
    const serie = (x) => (x && typeof x === 'object' ? { aggregationTemporality: numero(x.aggregationTemporality), isMonotonic: typeof x.isMonotonic === 'boolean' ? x.isMonotonic : undefined, dataPoints: pontos(x.dataPoints, conta) } : undefined);
    out = { resourceMetrics: lista(c.resourceMetrics).map((r) => ({ resource: recurso(r), scopeMetrics: lista(r && r.scopeMetrics).map((s) => ({ scope: ambito(s), metrics: lista(s && s.metrics).map((m) => ({
      name: nomeCC(m && m.name), unit: unidade(m && m.unit),
      sum: serie(m && m.sum), gauge: serie(m && m.gauge), histogram: serie(m && m.histogram),
    })) })) })) };
  } else {
    out = { resourceSpans: lista(c.resourceSpans).map((r) => ({ resource: recurso(r), scopeSpans: lista(r && r.scopeSpans).map((s) => ({ scope: ambito(s), spans: lista(s && s.spans).map((sp) => ({
      name: nomeCC(sp && sp.name), kind: numero(sp && sp.kind),
      traceId: idTraco(sp && sp.traceId), spanId: idSpan(sp && sp.spanId), parentSpanId: idSpan(sp && sp.parentSpanId),
      startTimeUnixNano: tempo(sp && sp.startTimeUnixNano), endTimeUnixNano: tempo(sp && sp.endTimeUnixNano),
      attributes: filtrarAtributos(sp && sp.attributes, conta),
    })) })) })) };
  }
  return { corpo: out, descartados: conta.descartados };
}

/** Host aceite: só nomes de loopback (fecha o DNS rebinding para 127.0.0.1). */
function hostLoopback(host) {
  const h = String(host || '').toLowerCase().replace(/:\d+$/, '');
  return h === '127.0.0.1' || h === 'localhost' || h === '[::1]';
}

export function criarReceptor({ dir, tectoBytesDia = 200 * 1024 * 1024, agora = () => new Date() } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  const estado = { recebidos: { metrics: 0, logs: 0, traces: 0 }, rejeitados_protobuf: 0, rejeitados_tecto: 0, recusados_origem: 0, recusados_host: 0, demasiado_grandes: 0, invalidos: 0, erros_escrita: 0, atributos_descartados: 0, desde: agora().toISOString() };

  const servidor = http.createServer((req, res) => {
    const responder = (code, obj) => { if (!res.headersSent) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); } };
    // Antes de tudo, /health incluído: Host só de loopback e nenhum Origin (presente, mesmo vazio).
    // Browsers mandam Origin nos POST; o exportador do Claude Code não. Fecha CSRF e DNS rebinding.
    if (!hostLoopback(req.headers.host)) { estado.recusados_host++; req.resume(); return responder(403, { erro: 'host' }); }
    if ('origin' in req.headers) { estado.recusados_origem++; req.resume(); return responder(403, { erro: 'origem' }); }
    if (req.method === 'GET' && req.url === '/health') return responder(200, estado);
    const sinal = ROTAS[(req.url || '').split('?')[0]];
    if (req.method !== 'POST' || !sinal) { req.resume(); return responder(404, { erro: 'rota' }); }
    const ct = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (ct !== 'application/json') { estado.rejeitados_protobuf++; req.resume(); return responder(415, { erro: 'só application/json (http/json)' }); }
    const partes = []; let tamanho = 0; let cortado = false;
    req.on('data', (c) => {
      if (cortado) return;
      tamanho += c.length;
      if (tamanho > MAX_CORPO) { cortado = true; estado.demasiado_grandes++; responder(413, { erro: 'corpo > 20 MB' }); req.destroy(); return; }
      partes.push(c);
    });
    req.on('end', () => {
      if (cortado) return;
      try {
        let corpo;
        try { corpo = JSON.parse(Buffer.concat(partes).toString('utf8')); } catch { estado.invalidos++; return responder(400, { erro: 'json' }); }
        const limpo = sanear(corpo, sinal);
        estado.atributos_descartados += limpo.descartados;
        const dia = agora().toISOString().slice(0, 10);
        const f = path.join(dir, `${sinal}-${dia}.jsonl`);
        let atual = 0; try { atual = fs.statSync(f).size; } catch { /* novo */ }
        const linha = JSON.stringify({ recebido_em: agora().toISOString(), corpo: limpo.corpo }) + '\n';
        // tecto por sinal e por dia, em bytes UTF-8 (não em caracteres)
        if (atual + Buffer.byteLength(linha) > tectoBytesDia) { estado.rejeitados_tecto++; return responder(200, {}); } // aceita e descarta: nunca travar o CC
        try { fs.appendFileSync(f, linha); } catch { estado.erros_escrita++; return responder(200, {}); }
        estado.recebidos[sinal]++;
        responder(200, {});
      } catch {
        estado.invalidos++; responder(400, { erro: 'corpo' }); // nunca derrubar o processo nem imprimir stack
      }
    });
    req.on('error', () => responder(400, { erro: 'pedido' }));
  });
  servidor.requestTimeout = 30_000;
  servidor.headersTimeout = 10_000;
  return { servidor, estado };
}

function args(argv) {
  const o = { porta: 4318, dir: path.join(os.homedir(), '.mooter', 'otel'), tectoMb: 200 };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--porta') o.porta = Number(argv[++i]);
    else if (argv[i] === '--dir') o.dir = argv[++i];
    else if (argv[i] === '--tecto-mb') o.tectoMb = Number(argv[++i]);
  }
  return o;
}

const correDirecto = (() => { try { return fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1] || '')); } catch { return false; } })();
if (correDirecto) {
  const o = args(process.argv.slice(2));
  if (!Number.isInteger(o.porta) || o.porta < 0 || o.porta > 65535) { console.error('--porta tem de ser um inteiro entre 0 e 65535'); process.exit(2); }
  if (!Number.isFinite(o.tectoMb) || o.tectoMb <= 0) { console.error('--tecto-mb tem de ser um número positivo'); process.exit(2); }
  let servidor;
  try { ({ servidor } = criarReceptor({ dir: o.dir, tectoBytesDia: o.tectoMb * 1024 * 1024 })); } catch (e) { console.error('falhou a preparar o dir:', (e && e.code) || 'erro'); process.exit(1); }
  servidor.on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `porta ${o.porta} ocupada (receptor já a correr?)` : `falhou: ${e.code || 'erro'}`); process.exit(1); });
  // sem caminhos no stdout: só se diz se o dir é o de omissão
  const destino = o.dir === path.join(os.homedir(), '.mooter', 'otel') ? '~/.mooter/otel' : 'dir de --dir';
  try { servidor.listen(o.porta, '127.0.0.1', () => console.log(`receptor OTel em http://127.0.0.1:${o.porta} → ${destino} (só loopback, só http/json, tecto por sinal e por dia)`)); } catch (e) { console.error(`falhou: ${(e && e.code) || 'erro'}`); process.exit(1); }
}
