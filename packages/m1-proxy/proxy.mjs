/**
 * proxy.mjs — M1 v0. O proxy loopback, atras de flag, DESLIGADO por omissao.
 *
 * ── porque e que isto existe ────────────────────────────────────────────────
 *
 * Obediencia a rota recomendada pelo hook: **0,23%** (7 em 3 026, medido
 * 2026-08-24). O hook aconselha e quase ninguem obedece — um router que nao
 * roteia e um conselheiro. O ADR assinado a 2026-08-25 («DECISAO: B · Paulo»)
 * escolhe o proxy loopback opt-in, faseado, atras de flag.
 *
 * Isto reverte, declaradamente, o canone de 2026-07-16 «hook, not proxy». A
 * reversao e estreita e vale a pena escreve-la: o que foi recusado em Julho era
 * um proxy de NUVEM — que nao usa as assinaturas pagas nem a GPU do dono. Este
 * e loopback e roteia PARA elas. A tese economica fica de pe.
 *
 * ── o que este ficheiro NAO pode ser (e os testes provam-no) ────────────────
 *
 * (a) NAO ouve na rede. `fleet-beacon.mjs` ja escreveu o argumento por inteiro:
 *     um endpoint de controlo alcancavel da rede e um kill-switch remoto, e
 *     nenhuma verificacao de Origin corrige um socket a escuta numa wifi
 *     partilhada. Bind explicito em 127.0.0.1.
 *
 * (b) NAO se liga sozinho. Sem `MOOTER_M1_PROXY=1`, `criarProxy()` recusa-se a
 *     CONSTRUIR — nao e um `if` a volta do `listen`. Um servidor construido e
 *     um servidor que alguem pode arrancar por engano.
 *
 * (c) NAO tem degrau de nuvem. O produto promete nao proxiar prompts; o M1 muda
 *     isso e a mudanca tem de ser visivel, nao implicita. O v0 so serve o que
 *     cabe no local. O que nao cabe e RECUSADO com o motivo escrito — escalar
 *     em silencio seria exactamente o defeito que este desenho existe para nao
 *     ter.
 *
 * (d) NAO reclassifica. `classify.js` e FROZEN (sha CI-enforced) e aqui ele e
 *     CHAMADO, nunca tocado nem reimplementado.
 *
 * (e) NAO grava o conteudo do prompt. O recibo prova que a porta roteou; guardar
 *     o prompt tornava o proxy aquilo que o produto promete nao ser.
 *
 * Zero dependencias, so builtins.
 */

import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** A flag. Ausente = desligado, e desligado e o estado normal. */
export const FLAG = 'MOOTER_M1_PROXY';

/** Loopback, e so loopback. Nao ha aqui um caminho para `0.0.0.0`. */
export const HOST = '127.0.0.1';
export const PORTA_OMISSAO = 4310;

/** Hosts que um pedido pode declarar. Qualquer outro e recusado. */
const HOSTS_ACEITES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * A flag esta ligada?
 *
 * `'1'` e `'true'` ligam; tudo o resto — incluindo `'0'`, `''` e ausente — nao.
 * Uma flag que aceita qualquer valor truthy liga-se com um `MOOTER_M1_PROXY=0`
 * mal lido, e isso ja aconteceu em projectos que se lembram disso tarde.
 */
export function ligado(env = process.env) {
  const v = String(env[FLAG] ?? '').trim().toLowerCase();
  return v === '1' || v === 'true';
}

/** Onde os recibos da porta se acumulam. Append-only, uma linha por chamada. */
export function caminhoDoRecibo({ home = os.homedir() } = {}) {
  return path.join(home, '.mooter', 'm1-proxy.jsonl');
}

/**
 * As DUAS contagens, e porque nao e uma.
 *
 * A obediencia do hook (7/3026) e a obediencia da porta tem denominadores
 * diferentes: uma e sobre todos os prompts da maquina, a outra so sobre os que
 * entram por aqui. Publicar as duas com o mesmo nome era o "denominador
 * trocado" que o mapa proibe — por isso viajam separadas desde a primeira
 * chamada, e nao a partir do dia em que alguem desenhar o grafico.
 */
export function contagensVazias() {
  return { pela_porta: 0, servidas_local: 0, recusadas_sem_degrau: 0, recusadas_guarda: 0 };
}

/**
 * Escreve UM recibo. Nunca lanca: um recibo e telemetria, nao trabalho.
 * O `prompt` nao entra aqui, e nao ha parametro por onde ele possa entrar.
 */
export function escreverRecibo(recibo, { ficheiro = null, appendImpl = fs.appendFileSync,
  mkdirImpl = fs.mkdirSync, home = os.homedir() } = {}) {
  const alvo = ficheiro || caminhoDoRecibo({ home });
  const linha = {
    ts: new Date().toISOString(),
    tier: recibo && typeof recibo.tier === 'string' ? recibo.tier : null,
    modelo: recibo && typeof recibo.modelo === 'string' ? recibo.modelo : null,
    ok: Boolean(recibo && recibo.ok),
    ms: recibo && Number.isFinite(recibo.ms) ? recibo.ms : null,
    porque: recibo && typeof recibo.porque === 'string' ? recibo.porque : null,
  };
  try {
    mkdirImpl(path.dirname(alvo), { recursive: true });
    appendImpl(alvo, JSON.stringify(linha) + '\n');
    return { ok: true, linha };
  } catch (err) {
    return { ok: false, erro: String((err && err.message) || err).slice(0, 120), linha };
  }
}

/**
 * O guarda de origem.
 *
 * Verifica o que da para verificar: a socket e local e o `Host` declarado e
 * loopback. Limite HONESTO, escrito aqui para nao se perder: outro processo NA
 * MESMA MAQUINA passa por isto. Para um endpoint que gasta a quota do dono,
 * isso pode nao chegar — e uma das perguntas que o desenho manda o adversario
 * responder (§6.3), nao uma coisa resolvida.
 */
export function guardaDeOrigem(req) {
  const remoto = req && req.socket ? req.socket.remoteAddress : null;
  const local = typeof remoto === 'string'
    && (remoto === '127.0.0.1' || remoto === '::1' || remoto === '::ffff:127.0.0.1');
  if (!local) return { ok: false, porque: `pedido de ${remoto || 'origem desconhecida'} — esta porta e so do proprio computador` };
  const host = String((req.headers && req.headers.host) || '').split(':')[0];
  if (!HOSTS_ACEITES.has(host)) return { ok: false, porque: `Host "${host}" nao e loopback` };
  return { ok: true };
}

/** Extrai o ultimo prompt do corpo OpenAI-compatible. `null` se nao houver. */
export function promptDoCorpo(corpo) {
  const msgs = corpo && Array.isArray(corpo.messages) ? corpo.messages : null;
  if (!msgs || !msgs.length) return null;
  for (let i = msgs.length - 1; i >= 0; i -= 1) {
    const m = msgs[i];
    if (m && m.role === 'user' && typeof m.content === 'string' && m.content.trim()) return m.content;
  }
  return null;
}

/**
 * O v0 serve este tier?
 *
 * So T0 e T1. Nao e um numero escolhido a gosto: o v0 nao tem degrau de nuvem
 * (§2c do desenho), portanto so pode honrar o que o motor local aguenta. T2+
 * e RECUSADO com o motivo — e a recusa e a funcionalidade, nao a falha.
 */
export const TIERS_LOCAIS = Object.freeze(['T0', 'T1']);

export function cabeNoLocal(tier) {
  return TIERS_LOCAIS.includes(String(tier || '').toUpperCase());
}

/**
 * Constroi o proxy — ou recusa-se, se a flag nao estiver la.
 *
 * @returns {{ok:false, porque:string} | {ok:true, servidor, escutar, fechar, contagens}}
 */
export function criarProxy({
  env = process.env,
  porta = PORTA_OMISSAO,
  classifyImpl = null,
  ollamaImpl = null,
  reciboImpl = escreverRecibo,
  agora = () => Date.now(),
} = {}) {
  if (!ligado(env)) {
    // NAO se constroi servidor nenhum. Devolver um servidor parado deixava um
    // `listen()` a uma linha de distancia de quem lesse o codigo com pressa.
    return {
      ok: false,
      porque: `${FLAG} nao esta ligada — o M1 v0 e opt-in e nao arranca por omissao. `
        + `Liga com ${FLAG}=1 (decisao do dono: ADR M1, 2026-08-25).`,
    };
  }

  const contagens = contagensVazias();
  // O classificador CONGELADO. Carregado tarde, para que importar este modulo
  // com a flag desligada nao toque sequer no motor.
  const classify = classifyImpl
    || ((p) => require('../../tools/router/classify.js').classify(p));
  const ollama = ollamaImpl
    || ((p, o) => require('../../tools/router/providers/ollama-api.js').callOllama(p, o));

  const servidor = http.createServer(async (req, res) => {
    const responder = (codigo, corpo) => {
      const texto = JSON.stringify(corpo);
      res.writeHead(codigo, { 'content-type': 'application/json; charset=utf-8',
        'content-length': Buffer.byteLength(texto) });
      res.end(texto);
    };

    const g = guardaDeOrigem(req);
    if (!g.ok) {
      contagens.recusadas_guarda += 1;
      return responder(403, { error: { message: g.porque, type: 'mooter_m1_guard' } });
    }

    if (req.method === 'GET' && req.url === '/v1/models') {
      // So os modelos que o local declara. Um modelo listado aqui e uma promessa
      // de que ele responde; inventar a lista era prometer por conta de outrem.
      let modelos = [];
      try {
        const mod = require('../../tools/router/providers/ollama-api.js');
        const disp = await mod.isAvailable();
        modelos = disp && Array.isArray(disp.models) ? disp.models : [];
      } catch { modelos = []; }
      return responder(200, { object: 'list',
        data: modelos.map((id) => ({ id: String(id), object: 'model', owned_by: 'ollama-local' })) });
    }

    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      contagens.pela_porta += 1;
      const t0 = agora();
      let corpo = null;
      try {
        const partes = [];
        for await (const c of req) partes.push(c);
        corpo = JSON.parse(Buffer.concat(partes).toString('utf8'));
      } catch {
        return responder(400, { error: { message: 'corpo nao e JSON', type: 'mooter_m1_bad_request' } });
      }
      const prompt = promptDoCorpo(corpo);
      if (!prompt) {
        return responder(400, { error: { message: 'sem mensagem de utilizador', type: 'mooter_m1_bad_request' } });
      }

      let tier = null;
      try { tier = (classify(prompt) || {}).tier || null; } catch { tier = null; }

      if (!cabeNoLocal(tier)) {
        contagens.recusadas_sem_degrau += 1;
        const porque = `tier ${tier || 'n/d'} pede nuvem e o v0 nao tem esse degrau — `
          + 'recusar e a funcionalidade: escalar em silencio seria proxiar o teu prompt sem to dizer';
        reciboImpl({ tier, modelo: null, ok: false, ms: agora() - t0, porque });
        return responder(501, { error: { message: porque, type: 'mooter_m1_no_cloud_step' } });
      }

      let r = null;
      try { r = await ollama(prompt, {}); } catch { r = null; }
      const ms = agora() - t0;
      if (!r || !r.ok) {
        const porque = 'o motor local nao respondeu';
        reciboImpl({ tier, modelo: (r && r.model) || null, ok: false, ms, porque });
        return responder(502, { error: { message: porque, type: 'mooter_m1_local_engine' } });
      }
      contagens.servidas_local += 1;
      reciboImpl({ tier, modelo: r.model || null, ok: true, ms, porque: 'servido pelo motor local' });
      return responder(200, {
        object: 'chat.completion',
        model: r.model || 'ollama-local',
        choices: [{ index: 0, message: { role: 'assistant', content: r.text }, finish_reason: 'stop' }],
        // A porta diz sempre o que fez. Um proxy que roteia em silencio e
        // indistinguivel de um proxy que nao roteia.
        mooter: { tier, servido_por: 'ollama-local', ms, contagens: { ...contagens } },
      });
    }

    return responder(404, { error: {
      message: `${req.method} ${req.url} nao existe no M1 v0 — so /v1/models e /v1/chat/completions`,
      type: 'mooter_m1_not_found' } });
  });

  return {
    ok: true,
    servidor,
    contagens,
    escutar: () => new Promise((resolve) => servidor.listen(porta, HOST, () => resolve({
      host: HOST, porta: servidor.address().port,
    }))),
    fechar: () => new Promise((resolve) => servidor.close(() => resolve())),
  };
}
