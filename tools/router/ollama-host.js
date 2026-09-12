// ollama-host.js — uma só resposta a «qual é o URL do Ollama?».
//
// ─────────────────────────────────────────────────────────────────────────────
// PORQUE ESTE FICHEIRO EXISTE
//
// `OLLAMA_HOST=127.0.0.1:11434` — sem esquema — é o formato CANÓNICO: é assim
// que o próprio Ollama o documenta e o imprime. Sete sítios deste repo assumiam
// que vinha sempre com `http://`, cada um à sua maneira, e todos partiam com o
// valor que esta máquina tem definido:
//
//   · `providers/ollama-api.js`  — concatenava. `fetch('127.0.0.1:11434/api/chat')`
//     → `Failed to parse URL`, engolido pelo catch → **`callOllama()` devolvia
//     `null` sem razão nenhuma**. O motor $0 falhava MUDO e o trabalho de
//     leitura caía para um motor pago sem sinal.
//   · os outros seis — `new URL('/api/…', HOST)`, que com base sem esquema
//     lança `TypeError: Invalid URL`. Falham alto, o que é melhor, mas falham
//     na mesma.
//
// Corrigir cada um no seu canto criava sete verdades sobre a mesma pergunta —
// e a oitava nasceria partida outra vez. `tools/audit/` e `tools/cockpit/` já
// importam de `../router/` (`pricing.js`, `env`, `assinatura.js`), por isso o
// sítio partilhado não é uma invenção: é onde a casa já os põe.
//
// Zero dependências, nunca lança. Um normalizador que rebenta é pior do que o
// bug que corrige.

'use strict';

/** O que o Ollama serve por omissão numa instalação local. */
const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';

/**
 * Devolve sempre uma origem absoluta, pronta para `new URL(path, origem)` ou
 * para concatenação directa.
 *
 *   normalizeHost('127.0.0.1:11434')      → 'http://127.0.0.1:11434'
 *   normalizeHost('http://gpu:11434/')    → 'http://gpu:11434'
 *   normalizeHost('https://gpu:11434')    → 'https://gpu:11434'   (não força http)
 *   normalizeHost('')                     → o default recebido, ou o local
 *
 * @param {string} [raw]      valor cru (env, flag, opção)
 * @param {string} [fallback] o que usar quando `raw` é vazio; também normalizado
 */
function normalizeHost(raw, fallback = DEFAULT_OLLAMA_HOST) {
  const limpo = String(raw == null ? '' : raw).trim().replace(/\/+$/, '');
  if (!limpo) {
    // O fallback de cada chamador é diferente (`host.docker.internal` no audit,
    // `127.0.0.1` no cockpit). Normaliza-se também: um default mal escrito
    // partia exactamente como a env partia.
    return fallback === DEFAULT_OLLAMA_HOST
      ? DEFAULT_OLLAMA_HOST
      : normalizeHost(fallback, DEFAULT_OLLAMA_HOST);
  }
  // `https` fica `https`. Forçar `http` aqui quebraria qualquer Ollama atrás de
  // TLS — e seria um downgrade de transporte feito por um utilitário de URLs.
  return /^https?:\/\//i.test(limpo) ? limpo : `http://${limpo}`;
}

/**
 * Lê `OLLAMA_HOST` do ambiente já normalizado. Açúcar para o padrão que os
 * sete sítios repetiam à mão.
 */
function ollamaHostFromEnv(fallback = DEFAULT_OLLAMA_HOST, env = process.env) {
  return normalizeHost(env && env.OLLAMA_HOST, fallback);
}

module.exports = { normalizeHost, ollamaHostFromEnv, DEFAULT_OLLAMA_HOST };
