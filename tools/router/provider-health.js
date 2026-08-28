// provider-health.js — a escada de fallback deixa de ter amnésia.
//
// ─────────────────────────────────────────────────────────────────────────────
// PORQUE ESTE FICHEIRO EXISTE
//
// `router-execute.js:136` tem `resolveFallbackChain(classification, providerState)`
// e `filterDegraded(chain, providerState)`. A lógica de contornar um fornecedor
// morto está escrita, testada, e é boa. Só que `execute()` faz
//
//     resolveFallbackChain(classification, deps.providerState || {})
//
// e **nada, em lado nenhum, alguma vez preencheu `deps.providerState`**. Não
// existia um único ficheiro de estado de fornecedores em `~/.mooter/`. Cada
// sessão começava cega, redescobria os mesmos motores mortos, e gastava a mesma
// quota a aprender o que a sessão anterior já sabia.
//
// Medido numa sessão real de 2026-08-28 — quatro falhas, quatro causas
// distintas, zero registadas:
//
//   · Opus (subagentes) — «You've hit your weekly limit · resets 10pm». Três
//     frentes de trabalho paralelas morreram de uma vez. Nada guardou a hora de
//     reposição, por isso a tentativa seguinte teria falhado exactamente igual.
//   · Kimi — o id `kimi-k2-0905-preview` já não existe. A API responde
//     `resource_not_found_error` com a mensagem **«Not found the model X or
//     Permission denied»**, que se lê como problema de CHAVE. Diagnosticar isto
//     como autenticação é o erro natural, e custa a sessão inteira.
//   · Kimi — `kimi-k2.6` é um modelo de RACIOCÍNIO. Com `max_tokens: 1400`
//     devolveu **HTTP 200**, `content: ""` e `reasoning_tokens: 1399`: gastou o
//     orçamento todo a pensar e não sobrou nada para responder. Um adaptador que
//     trate 200 como sucesso reporta verde tendo produzido nada — que é a
//     entrada `guarda sem teste de mordida` da memória do dono, outra vez.
//   · Gemini — `IneligibleTierError`: o tier individual foi descontinuado. É
//     permanente, e mesmo assim era retentado a cada sessão.
//
// ─────────────────────────────────────────────────────────────────────────────
// AS DUAS DECISÕES QUE GOVERNAM ESTE FICHEIRO
//
// 1 · O ESTADO DECAI. Um fornecedor marcado como esgotado às 10:00 com reposição
//     às 22:00 volta sozinho às 22:00. Sem decaimento, a memória vira lápide: o
//     Kimi que falhou uma vez ficava morto para sempre, e isso é PIOR do que a
//     amnésia — a amnésia pelo menos tenta.
//
// 2 · O DEFEITO É «DISPONÍVEL», NÃO «MORTO». Um fornecedor sem registo nenhum
//     conta como utilizável. A memória do dono tem a regra `viés do default
//     barato`: «num sistema que mede poupança, o default de um heurístico nunca
//     pode ser o motor mais barato; em dúvida null». Aqui o eixo é outro e a
//     conclusão inverte-se, por isso vale a pena escrevê-lo:
//
//       default «disponível» → tenta-se um motor morto. Desperdício, recuperável.
//       default «morto»      → uma máquina fresca não roteia para lado nenhum.
//
//     O custo dos dois erros não é simétrico, logo o default não pode ser
//     simétrico. Só um FRACASSO OBSERVADO degrada um fornecedor.
//
// Zero dependências, nunca lança. Se este ficheiro falhar, o router tem de
// continuar a funcionar exactamente como funcionava antes de ele existir.

'use strict';

const fs   = require('fs');
const os   = require('os');
const path = require('path');

/** Onde o estado vive. `~/.mooter/`, ao lado dos outros ficheiros de runtime. */
function healthPath(home) {
  return path.join(home || os.homedir(), '.mooter', 'provider-health.json');
}

// ── A GUARDA CONTRA A PRÓPRIA SUITE ─────────────────────────────────────────
//
// Escrito depois de este ficheiro ter corrompido o estado real do dono, na
// primeira vez que correu.
//
// `router-execute.test.js` exercita o caminho de falha com wrappers que
// devolvem `null` de propósito. Ligado ao executor sem esta guarda, cada
// `npm test` gravava essas falhas SIMULADAS em `~/.mooter/provider-health.json`
// — e o resultado é pior do que ruído: a sessão seguinte do dono acordava a
// achar que o Codex e o Ollama estavam degradados, e roteava à volta deles.
// Uma suite de testes a degradar os motores de produção.
//
// É a terceira vez que isto acontece neste repositório. A memória do dono já
// tem `npm test do CLI apagava o ~/.mooter` registado **duas** vezes (05/08 e
// 20/08). Um ficheiro novo que escreve em `~/.mooter` sem guarda é a mesma
// armadilha com outra roupa.
//
// Regra: um `home` EXPLÍCITO é sempre honrado (é hermético por construção, e é
// como os testes deste módulo trabalham). Sem `home` explícito, e sob um
// corredor de testes, não se lê nem se escreve o estado real — devolve-se
// vazio, que é o comportamento correcto de uma máquina sem histórico.
function emTeste() {
  return Boolean(
    process.env.NODE_TEST_CONTEXT ||        // node --test
    process.env.VITEST ||                   // vitest
    process.env.JEST_WORKER_ID ||           // jest
    process.env.MOOTER_PROVIDER_HEALTH === 'off'
  );
}

/**
 * `true` quando é seguro tocar no ficheiro. Sem `home` explícito e em teste,
 * não é.
 */
function podeTocar(home) {
  return Boolean(home) || !emTeste();
}

// ── A taxonomia ─────────────────────────────────────────────────────────────
//
// FECHADA de propósito. Uma causa livre em texto vira lixo em três semanas e
// não se consegue roteirizar por cima dela. Cada entrada traz a sua política de
// recuperação, porque «quando voltar a tentar» é parte da causa, não um extra.
//
// `estado` usa o vocabulário que `filterDegraded` JÁ entende
// (`exhausted`/`unavailable`/`down`/`off`/`degraded`) — este ficheiro alimenta
// a escada que existe, não inventa outra.
const CAUSAS = Object.freeze({
  quota_exhausted: {
    estado: 'exhausted',
    // Sem hora explícita, 1h. A hora verdadeira vem quase sempre na mensagem
    // («resets 10pm»), e `lerReposicao` abaixo tenta lê-la.
    recuperaEmMs: 60 * 60 * 1000,
    porque: 'quota/limite do fornecedor atingido — volta sozinho quando repuser',
  },
  rate_limited: {
    estado: 'degraded',
    recuperaEmMs: 60 * 1000,
    porque: 'demasiados pedidos por unidade de tempo — é transitório por desenho',
  },
  model_not_found: {
    estado: 'unavailable',
    // 24h: um id de modelo que desapareceu não volta por si. Precisa de alguém
    // que corrija a configuração. Retentar de minuto a minuto é só ruído.
    recuperaEmMs: 24 * 60 * 60 * 1000,
    porque: 'o id do modelo não existe neste fornecedor — é config, não rede',
  },
  empty_completion: {
    estado: 'degraded',
    recuperaEmMs: 10 * 60 * 1000,
    porque: 'HTTP 200 com conteúdo vazio — tipicamente orçamento consumido no raciocínio',
  },
  tier_ineligible: {
    estado: 'off',
    // 7 dias. `IneligibleTierError` é uma decisão comercial do fornecedor, não
    // uma avaria. Só muda se o dono mudar de plano.
    recuperaEmMs: 7 * 24 * 60 * 60 * 1000,
    porque: 'o plano/tier da conta não dá acesso a este motor',
  },
  auth_failed: {
    estado: 'unavailable',
    recuperaEmMs: 60 * 60 * 1000,
    porque: 'credencial ausente, expirada ou rejeitada',
  },
  network: {
    estado: 'down',
    recuperaEmMs: 5 * 60 * 1000,
    porque: 'não se chegou ao fornecedor — timeout, DNS, ligação recusada',
  },
  unknown: {
    estado: 'degraded',
    recuperaEmMs: 15 * 60 * 1000,
    porque: 'falhou e não foi possível classificar — degrada pouco e por pouco tempo',
  },
});

/**
 * Classifica uma falha na taxonomia fechada.
 *
 * A ordem importa e não é alfabética: os padrões mais específicos vêm primeiro
 * porque as mensagens reais sobrepõem-se. O caso que obriga a isto é o Kimi:
 *
 *     "Not found the model kimi-k2-0905-preview or Permission denied"
 *
 * contém «Permission denied». Testado por `auth` primeiro, um id de modelo
 * errado seria eternamente diagnosticado como problema de chave — exactamente o
 * erro que se cometeu a 2026-08-28. Por isso `model_not_found` é testado ANTES
 * de `auth_failed`, e o teste de mordida planta esta string literal.
 *
 * @param {Error|{message?:string,status?:number,code?:string}|string} erro
 * @param {{status?:number, body?:string}} [ctx]
 * @returns {string} uma chave de CAUSAS
 */
function classificarFalha(erro, ctx = {}) {
  let msg = '';
  if (erro && typeof erro === 'object') {
    msg = erro.message || (erro.error && erro.error.message) || '';
  } else if (erro) {
    msg = String(erro);
  }
  const body   = String(ctx.body || '');
  const texto  = `${msg} ${body}`.toLowerCase();
  const status = Number(ctx.status || (erro && (erro.status || erro.statusCode)) || 0);

  // 1 · id de modelo — ANTES de auth. Ver o comentário acima.
  if (/not found the model|model_not_found|resource_not_found|unknown model|no such model|does not exist/.test(texto)) {
    return 'model_not_found';
  }
  // 2 · plano/tier da conta. `IneligibleTierError` é a do Gemini.
  if (/ineligibletier|ineligible_tier|tier is not eligible|not available on your plan|plan does not include/.test(texto)) {
    return 'tier_ineligible';
  }
  // 3 · quota. «weekly limit» é a do Claude Code; distinta de rate-limit.
  if (/weekly limit|usage limit|quota exceeded|insufficient_quota|out of credits|credit balance|billing hard limit/.test(texto)) {
    return 'quota_exhausted';
  }
  // 4 · ritmo. 429 sem sinal de quota é ritmo, não saldo.
  if (status === 429 || /rate.?limit|too many requests|overloaded/.test(texto)) {
    return 'rate_limited';
  }
  // 5 · autenticação, agora que os falsos positivos acima já saíram.
  if (status === 401 || status === 403 ||
      /invalid.?api.?key|unauthorized|authentication|permission denied|no authorization/.test(texto)) {
    return 'auth_failed';
  }
  // 6 · rede.
  if (/etimedout|econnrefused|enotfound|econnreset|socket hang up|network|fetch failed|abort/.test(texto)) {
    return 'network';
  }
  return 'unknown';
}

/**
 * Tenta extrair uma hora de reposição explícita da mensagem do fornecedor.
 *
 * Vale a pena porque a informação verdadeira costuma lá estar e é muito melhor
 * do que o `recuperaEmMs` genérico: «resets 10pm» é uma hora, não um palpite.
 *
 * @returns {number|null} epoch ms, ou null se não houver nada de fiável.
 */
function lerReposicao(texto, agoraMs) {
  const t = String(texto || '').toLowerCase();
  const agora = agoraMs || Date.now();

  // "retry-after: 120" / "retry after 120 seconds"
  const secs = t.match(/retry[- ]after[:\s]+(\d+)/);
  if (secs) return agora + Number(secs[1]) * 1000;

  // "resets 10pm" / "resets at 10 pm" — a forma que o Claude Code usa.
  const ampm = t.match(/reset[s]?\s*(?:at\s*)?(\d{1,2})\s*(am|pm)/);
  if (ampm) {
    let h = Number(ampm[1]) % 12;
    if (ampm[2] === 'pm') h += 12;
    const d = new Date(agora);
    const alvo = new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, 0, 0, 0);
    let ms = alvo.getTime();
    if (ms <= agora) ms += 24 * 60 * 60 * 1000;   // já passou hoje → é amanhã
    return ms;
  }
  return null;
}

/** Lê o ficheiro. Nunca lança: sem ficheiro, sem registos. */
function lerRegisto(home) {
  if (!podeTocar(home)) return { versao: 1, providers: {} };
  try {
    const raw = fs.readFileSync(healthPath(home), 'utf8');
    const j = JSON.parse(raw);
    return (j && typeof j.providers === 'object' && j.providers) ? j : { versao: 1, providers: {} };
  } catch {
    return { versao: 1, providers: {} };
  }
}

/** Escreve. Nunca lança — o router não pode partir por não conseguir gravar. */
function escreverRegisto(home, reg) {
  if (!podeTocar(home)) return false;   // ver `emTeste` — nunca o estado real
  try {
    const p = healthPath(home);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(reg, null, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}

/**
 * Regista o RESULTADO de uma tentativa contra um fornecedor.
 *
 * O sucesso limpa a degradação imediatamente — se o motor respondeu, está vivo,
 * e qualquer registo anterior deixou de descrever a realidade.
 *
 * @param {string} providerKey  'codex_cli' | 'ollama' | 'kimi' | 'gemini' | ...
 * @param {'ok'|'fail'} resultado
 * @param {{erro?:any, status?:number, body?:string, home?:string, agoraMs?:number, detalhe?:string, causa?:string}} [opts]
 */
function registar(providerKey, resultado, opts = {}) {
  const key = String(providerKey || '').toLowerCase();
  if (!key) return null;
  const agora = opts.agoraMs || Date.now();
  const reg = lerRegisto(opts.home);

  if (resultado === 'ok') {
    reg.providers[key] = { estado: 'ok', ultimo_ok: agora, causa: null, recupera_em: null };
    escreverRegisto(opts.home, reg);
    return reg.providers[key];
  }

  // `opts.causa` permite ao chamador declarar a causa quando ela não está na
  // mensagem. É o caso do `empty_completion`: um HTTP 200 com `content: ""` não
  // traz erro nenhum para classificar — só o adaptador sabe que aquilo foi vazio.
  const causa = (opts.causa && CAUSAS[opts.causa])
    ? opts.causa
    : classificarFalha(opts.erro, { status: opts.status, body: opts.body });
  const def   = CAUSAS[causa];
  const bruto = (opts.erro && (opts.erro.message || opts.erro)) || '';
  const texto = `${bruto} ${opts.body || ''}`;
  const explicita = lerReposicao(texto, agora);

  const anterior = reg.providers[key] || {};
  reg.providers[key] = {
    estado: def.estado,
    causa,
    porque: def.porque,
    ultimo_ok: anterior.ultimo_ok || null,
    ultima_falha: agora,
    recupera_em: explicita || (agora + def.recuperaEmMs),
    // Guardado truncado: é para um humano perceber, não para voltar a parsear.
    // E truncar evita que uma mensagem de erro enorme inche o ficheiro.
    detalhe: String(opts.detalhe || texto).trim().slice(0, 200) || null,
  };
  escreverRegisto(opts.home, reg);
  return reg.providers[key];
}

/**
 * O `providerState` que `resolveFallbackChain`/`filterDegraded` esperam.
 *
 * Aplica o decaimento aqui, na LEITURA, e não numa tarefa de limpeza: um
 * fornecedor cuja hora de reposição passou volta a ser `ok` sem precisar que
 * alguém tenha corrido nada entretanto. É o que torna o registo uma memória e
 * não uma lápide.
 *
 * Um fornecedor sem registo NÃO aparece no objecto — e `filterDegraded` só
 * remove o que está explicitamente degradado, portanto ausência = utilizável.
 * É a decisão 2 do cabeçalho.
 *
 * @param {{home?:string, agoraMs?:number}} [opts]
 * @returns {Record<string,string>}
 */
function estadoActual(opts = {}) {
  const agora = opts.agoraMs || Date.now();
  const reg = lerRegisto(opts.home);
  const out = {};
  for (const [k, v] of Object.entries(reg.providers || {})) {
    if (!v || !v.estado) continue;
    if (v.estado === 'ok') { out[k] = 'ok'; continue; }
    if (v.recupera_em && agora >= v.recupera_em) { out[k] = 'ok'; continue; }  // decaiu
    out[k] = v.estado;
  }
  return out;
}

/**
 * Relatório para humanos — o que está degradado, porquê, e até quando.
 *
 * É isto que a statusline e o `mooter doctor` devem mostrar, em vez de deixarem
 * o dono descobrir sozinho, a meio de uma onda, que o motor morreu ontem.
 */
function relatorio(opts = {}) {
  const agora = opts.agoraMs || Date.now();
  const reg = lerRegisto(opts.home);
  const linhas = [];
  for (const [k, v] of Object.entries(reg.providers || {})) {
    if (!v || v.estado === 'ok') continue;
    const restaMs = (v.recupera_em || 0) - agora;
    if (restaMs <= 0) continue;
    linhas.push({
      provider: k,
      estado: v.estado,
      causa: v.causa,
      porque: v.porque,
      restaMin: Math.ceil(restaMs / 60000),
      detalhe: v.detalhe,
    });
  }
  return linhas.sort((a, b) => b.restaMin - a.restaMin);
}

module.exports = {
  CAUSAS,
  emTeste,
  podeTocar,
  classificarFalha,
  lerReposicao,
  registar,
  estadoActual,
  relatorio,
  healthPath,
  __lerRegisto: lerRegisto,
};
