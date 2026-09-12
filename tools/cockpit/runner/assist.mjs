/**
 * assist.mjs — o Moo responde, na GPU do dono, a $0.
 *
 * O Ledger tem uma doca onde o dono escreve uma pergunta sobre o que esta a
 * ver. Ate aqui a doca nao existia porque o endpoint nao existia, e um campo de
 * texto que nao fala e pior do que nenhum.
 *
 * TRES RECUSAS DELIBERADAS, e nenhuma delas e uma limitacao temporaria:
 *
 *  1. **Sem tool-calls.** O modelo devolve TEXTO. Nao ha `tools`, nao ha
 *     `format:json`, nao ha nada que o painel possa interpretar como uma ordem.
 *     Um assistente local com ferramentas seria um segundo escritor sobre o
 *     mesmo estado — e este projecto ja decidiu que a triagem tem um escritor
 *     so, e que o git tem custodia unica. Falar e gratis; agir nao.
 *  2. **Sem escalada.** `assertLocalEngine` recusa qualquer motor que nao seja
 *     o Ollama de loopback. Se o motor local estiver em baixo, a doca DIZ que
 *     esta em baixo — nunca cai para um motor pago em silencio. A promessa de
 *     $0 vale por ser estrutural.
 *  3. **Sem memoria.** Cada pergunta e um pedido isolado. Guardar a conversa
 *     seria guardar o que o dono escreveu sobre o proprio codigo num ficheiro
 *     que ninguem declarou — e o unico registo que este sistema mantem e o
 *     ledger, que e append-only e auditavel.
 *
 * Zero-LLM para escolher o modelo: e uma escada de tres degraus lida do disco.
 */

import { assertLocalEngine, DEFAULT_OLLAMA } from './runner-core.mjs';

/** Quanto texto o dono pode mandar de uma vez. Acima disto, 400 com o numero. */
export const MAX_MENSAGEM = 2000;

/** Tecto de saida. Uma doca nao e um ensaio: cabe no ecra ou nao serve. */
export const NUM_PREDICT = 400;

/** Um modelo local frio pode demorar. 45 s e o limite antes de dizer que demorou. */
export const TIMEOUT_MS = 45_000;

/**
 * O que o Moo e, e o que ele NAO pode fazer.
 *
 * A ultima frase nao e cortesia — e a regra que impede a doca de virar uma
 * fabrica de numeros. Um modelo local que nao sabe o valor de um campo inventa
 * um com toda a confianca, e um painel que se vende por nao mentir nao pode ter
 * uma caixa de texto que mente.
 */
export const SISTEMA = [
  'You are the Moo: the local assistant inside the Mooter cockpit, running on the owner\'s own GPU.',
  'Answer in plain prose. No markdown headers, no code fences, no lists longer than three items.',
  'Be short: three sentences unless the question needs more.',
  'You can only see what is quoted to you in the question. You cannot read files, run commands, or change anything.',
  'If you do not know a number or a fact, say "n/d" and say what would have to be measured. Never invent a figure.',
].join(' ');

/**
 * O modelo que responde, por ordem de quem esta MAIS PRONTO.
 *
 * O residente primeiro porque ja esta em VRAM: responde em segundos em vez de
 * dezenas. Depois o que o loop usou da ultima vez (esta no `runner-state`), que
 * ao menos ja foi descarregado. Depois o configurado a mao. Se nada disto
 * existir devolve `null` — e a doca diz "sem modelo", em vez de tentar um nome
 * inventado e devolver um 404 do Ollama que ninguem sabe ler.
 */
export function escolherModelo({ residentes = null, state = null, env = process.env } = {}) {
  const forcado = env && env.MOO_ASSIST_MODELO;
  if (forcado && String(forcado).trim()) {
    return { modelo: String(forcado).trim(), fonte: 'MOO_ASSIST_MODELO' };
  }
  const vivo = Array.isArray(residentes) && residentes.length ? residentes[0] : null;
  const nome = vivo && (typeof vivo === 'string' ? vivo : vivo.name);
  if (nome) return { modelo: String(nome), fonte: 'residente' };
  if (state && typeof state.modelo === 'string' && state.modelo.trim()) {
    return { modelo: state.modelo.trim(), fonte: 'ultima-ronda' };
  }
  return { modelo: null, fonte: null };
}

/**
 * Valida a mensagem ANTES de gastar um segundo de GPU.
 *
 * @returns {{ok: true, mensagem: string} | {ok: false, erro: string, porque: string}}
 */
export function validarMensagem(bruto) {
  if (typeof bruto !== 'string' || !bruto.trim()) {
    return { ok: false, erro: 'assist precisa de { mensagem }', porque: 'o corpo veio vazio' };
  }
  const m = bruto.trim();
  if (m.length > MAX_MENSAGEM) {
    return {
      ok: false,
      erro: 'mensagem grande demais',
      porque: `${m.length} caracteres, o tecto e ${MAX_MENSAGEM}`,
    };
  }
  return { ok: true, mensagem: m };
}

/**
 * Uma pergunta, uma resposta em texto puro.
 *
 * NUNCA lanca por uma falha esperada: um motor em baixo, um timeout ou um 500
 * do Ollama saem como `{ok:false, porque}` para a doca poder dizer o que se
 * passou. Lanca so quando o ENDPOINT nao e local — porque isso e um defeito de
 * configuracao que tem de ser barulhento, nao uma resposta em falta.
 */
export async function perguntar({
  mensagem,
  modelo,
  endpoint = DEFAULT_OLLAMA,
  fetchImpl = fetch,
  timeoutMs = TIMEOUT_MS,
  numPredict = NUM_PREDICT,
  agora = () => Date.now(),
} = {}) {
  const base = assertLocalEngine(endpoint);
  if (!modelo) {
    return {
      ok: false,
      modelo: null,
      porque: 'nenhum modelo local disponivel — nem residente, nem na ultima ronda, nem configurado',
    };
  }
  const t0 = agora();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        prompt: mensagem,
        system: SISTEMA,
        stream: false,
        // Mesma medicao de 2026-08-29 do `runner-core`: um modelo de raciocinio
        // gasta o `num_predict` inteiro dentro do traco e devolve resposta
        // vazia. Aqui isso apareceria como uma doca muda.
        think: false,
        keep_alive: '10m',
        options: { num_predict: numPredict, temperature: 0.3 },
      }),
      signal: controller.signal,
      // Um redirect e a unica forma de um pedido que comeca no loopback acabar
      // fora dele. `error` fecha-a; a verificacao abaixo prova que fechou.
      redirect: 'error',
    });
    if (res && res.url) assertLocalEngine(new URL(res.url).origin);
    if (!res || !res.ok) {
      return { ok: false, modelo, porque: `o motor local respondeu ${res ? res.status : 'n/d'}` };
    }
    const body = await res.json();
    const texto = String((body && body.response) || '').trim();
    if (!texto) {
      return { ok: false, modelo, porque: 'o motor respondeu sem texto — modelo a pensar mais do que a escrever?' };
    }
    return {
      ok: true,
      modelo,
      texto,
      tokens_out: Number.isFinite(body && body.eval_count) ? body.eval_count : null,
      dur_s: Math.round(((agora() - t0) / 1000) * 10) / 10,
      // $0 nao e uma estimativa: `assertLocalEngine` acima recusa qualquer
      // motor que nao seja o Ollama desta maquina.
      usd: 0,
    };
  } catch (err) {
    const msg = String((err && err.message) || err);
    return {
      ok: false,
      modelo,
      porque: /abort/i.test(msg) ? `sem resposta em ${Math.round(timeoutMs / 1000)}s` : msg.slice(0, 160),
    };
  } finally {
    clearTimeout(t);
  }
}
