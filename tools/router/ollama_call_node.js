#!/usr/bin/env node
/**
 * ollama_call_node.js — portable Node.js Ollama caller for Windows hooks.
 *
 * Used by inject_context.js (Option A) — invoked via spawnSync so it must
 * complete and exit. Prints plain-text response to stdout, exit 0 on success.
 *
 * Usage: node ollama_call_node.js "prompt text here"
 * Env:   OLLAMA_HOST                 (default: http://localhost:11434)
 *        OLLAMA_OPTION_A_MODEL       (default: qwen2.5:3b)
 *        MOOTER_OPTION_A_BUDGET_MS   orcamento TOTAL que quem chama concede
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DOIS RELOGIOS QUE DIVERGIRAM, e custou tres dias de silencio.
 *
 * Este ficheiro tinha `req.setTimeout(3500)` com o comentario "outer spawn in
 * inject_context.js has a 4s ceiling". Entretanto o de fora subiu para 8000ms
 * "to accommodate larger models" — e este ficou nos 3,5s, afinados para o
 * `qwen2.5:3b` (1,9 GB).
 *
 * Medido a 2026-08-23, com o router a recomendar `qwen3:30b` (18 GB) em 123 de
 * 127 prompts T0: **toda a chamada morria aos 3636 ms**, sempre, com
 * `status=1` e stderr VAZIO. O registo dizia `option_a_miss` sem motivo, e por
 * isso ninguem podia distinguir "nao instalado" de "timeout" de "resposta
 * vazia". Em 3 dias, 3 acertos.
 *
 * Duas correccoes, e a segunda importa tanto como a primeira:
 *
 *   (a) o prazo passa a DERIVAR do orcamento de quem chama, por variavel de
 *       ambiente. Nao ha dois numeros para manter em acordo — ha um, e este
 *       ficheiro tira a sua margem dele.
 *   (b) o motivo da falha SAI. Um `exit(1)` mudo transforma um defeito
 *       diagnosticavel em ruido de fundo.
 *
 * Nota do que isto NAO corrige: mesmo com o orcamento inteiro, o `qwen3:30b`
 * precisa de ~9,2s E devolve resposta vazia (e um modelo de raciocinio: gasta o
 * orcamento de tokens a pensar). Escolher o modelo por latencia medida em vez
 * de por VRAM e outro trabalho, e fica por fazer.
 */

'use strict';

const http  = require('http');
const https = require('https');

/**
 * Margem entre o prazo desta chamada e o orcamento de quem chama.
 *
 * O processo ainda tem de arrancar o Node, ler o env, montar o pedido e
 * escrever a saida. Sem margem, o pai mata o filho a meio da resposta e o
 * resultado e o mesmo silencio de antes — so que noutro sitio.
 */
const MARGEM_MS = 1500;
/** Sem orcamento declarado, o valor historico. Nunca mais do que o pai aguenta. */
const PRAZO_OMISSAO_MS = 3500;

/** O prazo desta chamada, derivado do orcamento de quem chama. */
function prazoMs(env = process.env) {
  const orcamento = Number(env.MOOTER_OPTION_A_BUDGET_MS);
  if (!Number.isFinite(orcamento) || orcamento <= 0) return PRAZO_OMISSAO_MS;
  // Nunca abaixo de 1s: um prazo minusculo falha sempre e parece uma avaria.
  return Math.max(1000, Math.floor(orcamento - MARGEM_MS));
}

/**
 * Sai com o motivo à vista. `codigo` vai para stderr numa linha propria, para
 * quem chama o poder registar sem ter de adivinhar a partir do status.
 */
function sair(codigo, detalhe) {
  if (codigo) process.stderr.write(`motivo=${codigo}${detalhe ? ` detalhe=${String(detalhe).slice(0, 120)}` : ''}\n`);
  process.exit(codigo ? 1 : 0);
}

const SYSTEM = [
  'És um assistente de software engineering conciso.',
  'Respondes em PT-PT (Portugal). Código e identificadores em inglês.',
  'Respostas curtas e directas — nunca mais de 3 frases para perguntas simples.',
  'Não uses preâmbulo. Não repitas o que o user perguntou.',
].join('\n');

async function main() {
  const prompt = process.argv.slice(2).join(' ').trim();
  if (!prompt) sair('sem_prompt');

  const hostUrl = process.env.OLLAMA_HOST || 'http://localhost:11434';
  const model   = process.env.OLLAMA_OPTION_A_MODEL || 'qwen2.5:3b';

  const body = JSON.stringify({
    model,
    system: SYSTEM,
    prompt,
    stream: false,
    keep_alive: -1, // v0.7: hold model in VRAM between calls (pairs with ollama-warmup.js)
    options: { temperature: 0.2, num_predict: 256 },
    think: false,
  });

  const url = new URL('/api/generate', hostUrl);
  const lib = url.protocol === 'https:' ? https : http;

  await new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: url.hostname,
        port:     url.port || (url.protocol === 'https:' ? 443 : 80),
        path:     url.pathname,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            // 404 = modelo nao instalado. Era indistinguivel de timeout.
            reject(new Error(res.statusCode === 404 ? 'modelo_ausente' : `http_${res.statusCode}`));
            return;
          }
          let corpo;
          try { corpo = JSON.parse(data); } catch { reject(new Error('json_ilegivel')); return; }
          const text = String(corpo.response || '').trim();
          if (!text) {
            // O caso do `qwen3:30b`: responde 200, a tempo, e devolve texto
            // VAZIO — gastou o orcamento de tokens a pensar. Sem este ramo,
            // ficava registado como o mesmo "miss" de um modelo em falta, e a
            // correccao seria a errada.
            reject(new Error('resposta_vazia'));
            return;
          }
          process.stdout.write(text);
          resolve();
        });
      }
    );
    req.on('error', (e) => reject(new Error(`rede: ${e && e.code ? e.code : 'erro'}`)));
    // O prazo DERIVA do orcamento de quem chama (ver o cabecalho). Ficou tres
    // dias cravado em 3500 enquanto o de fora subia para 8000, e toda a chamada
    // morria aos 3636 ms sem dizer porque.
    const prazo = prazoMs();
    req.setTimeout(prazo, () => { req.destroy(); reject(new Error(`timeout_${prazo}ms`)); });
    req.write(body);
    req.end();
  });
}

module.exports = { prazoMs, MARGEM_MS, PRAZO_OMISSAO_MS };

if (require.main === module) {
  main().then(() => sair(null)).catch((e) => sair((e && e.message) || 'desconhecido'));
}


