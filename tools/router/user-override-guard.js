'use strict';
// user-override-guard.js — mata o "USER_OVERRIDE fantasma" (P0, PRIME-0 2026-08-01)
//
// PORQUÊ AQUI E NÃO NO classify.js: classify.js é FROZEN (sha256 CI-enforced
// 427d8c0b…). A causa-raiz está lá — POSITIVE_INTENT_RE aceita as preposições
// NUAS `com` / `with` / `via` antes de qualquer chave de USER_OVERRIDE_MODELS,
// e `local` / `claude` são palavras correntes em PT-BR e neste repo. Medido:
//   "compara a nuvem com local"     → pin em qwen2.5:3b
//   "sessao fresca com claude code" → pin em opus
//
// O DISCRIMINADOR CERTO É A CHAVE, NÃO A PREPOSIÇÃO (corrigido após G4).
// A primeira versão deste guard baniu `com|with|via` para todas as chaves. Um
// cross-check em motor diferente derrubou-a em três linhas: "responde com
// sonnet" e "run via gemini" são pins genuínos, e eram apagados. `sonnet` só
// significa uma coisa aqui; `local` significa dez. Logo:
//
//   AMBIGUAS_ESTRITAS (`local`, `claude`) — palavras demasiado carregadas. Só
//     contam com forma explícita: `@local`, `model: local`, ou verbo-de-uso.
//   TODAS AS OUTRAS — qualquer forma que o classify aceite conta, incluindo a
//     preposição nua. "com sonnet" é intenção.
//
// E, para qualquer chave, um uso como SUBSTANTIVO COMUM veta: "local storage",
// "o local da reunião", "a haiku structure", "claude code".
//
// ASSIMETRIA DE CUSTO: falso positivo (pinar sem pedido) é invisível e caro —
// resposta errada num 3B, ou Opus queimado. Falso negativo é visível e barato —
// o utilizador escreve "@local". Perante dúvida GENUÍNA, não pinar; mas "dúvida
// genuína" não é desculpa para apagar um pedido claro.

// Espelho das chaves de classify.js:212 (USER_OVERRIDE_MODELS). Se lá crescer
// uma chave, cresce aqui — PINS_GENUINOS no teste cobre todas para apanhar a
// divergência em vez de a deixar passar em silêncio.
const MODEL_KEYS = [
  'opus', 'sonnet', 'haiku', 'ollama', 'local', 'qwen', 'gemini',
  'gpt', 'gpt-4', 'gpt-4o', 'claude', 'fable', 'fable5',
];

// Chaves cuja ocorrência numa frase quase nunca é o modelo.
const AMBIGUAS_ESTRITAS = new Set(['local', 'claude']);

// Verbos que exprimem escolha de motor. Inclui `força-me` (o classify aceita-o
// em FORCED_INTENT_RE e a primeira versão deste guard não o reconhecia).
const USE_VERB =
  '(?:usa|use|usar|usando|por\\s+favor\\s+usa|run\\s+with|rodar\\s+com|run\\s+on|' +
  'for[çc]a(?:-?me)?|for[çc]ar|force|imp[oõ]e|impor)';

// Preposições nuas — suficientes para as chaves não-estritas.
const WEAK_CONN = '(?:com|with|via)';

// Negativos: "sem opus", "não uses haiku". O `no` inglês nu fica DE FORA:
// "no local changes" / "no claude" são frases correntes.
const NEG_VERB = "(?:sem|n[aã]o\\s+(?:uses|use|usar)|don'?t\\s+use|do\\s+not\\s+use)";

const ART = '(?:o|a|os|as|the|um|uma|an)?';

// Palavras que, logo a seguir à chave, provam que a chave é substantivo comum.
// NOTA: `only` e `first` saíram de propósito — "use local only" e "use local
// first" são pedidos genuínos de preferir o local (achado do G4).
const SEGUE_SUBSTANTIVO = {
  local: /^[\s-]*(?:storage|host|hosts|hosting|network|file|files|machine|disk|dev|time|state|var|variable|scope|branch|repo|repos|copy|backup|path|dir|directory|cache|db|database|server|port|tunnel|build|env|changes|da|do|de|das|dos|onde)\b/i,
  claude: /^\s*(?:code|desktop|api|app|md|cli|agent|sdk|ai|\.md)\b/i,
  haiku: /^\s*(?:structure|form|poem|poems|style|format|verse|verses)\b/i,
  sonnet: /^\s*(?:structure|form|poem|poems|style|format|verse|verses)\b/i,
  fable: /^\s*(?:about|story|stories|structure|form)\b/i,
  opus: /^\s*(?:number|no\.|magnum)\b/i,
  gemini: /^\s*(?:cli|code|api|horoscope)\b/i,
  gpt: /^\s*(?:store|zero)\b/i,
};

// Chaves que também são formas literárias — "a haiku", "um sonnet", "a fable"
// é o objecto, não o modelo. Só se aplica a estas (achado do G4: "Use a haiku
// structure for this poem" continuava a pinar Haiku).
const FORMAS_LITERARIAS = new Set(['haiku', 'sonnet', 'fable', 'opus']);
const ARTIGO_ANTES = /(?:^|\s)(?:a|an|um|uma)\s+$/i;

/** @param {string} s */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/**
 * Nesta ocorrência, a chave está a ser usada como substantivo comum?
 * @param {string} antes  texto até ao início da ocorrência
 * @param {string} depois texto a partir do fim da ocorrência
 * @param {string} key
 */
function usoDeSubstantivo(antes, depois, key) {
  const segue = SEGUE_SUBSTANTIVO[key];
  if (segue && segue.test(depois)) return true;
  if (FORMAS_LITERARIAS.has(key) && ARTIGO_ANTES.test(antes)) return true;
  return false;
}

/**
 * Percorre TODAS as ocorrências da chave. Basta UMA ser pedido legítimo para o
 * override valer — "usa o local storage e depois usa local para responder" tem
 * as duas coisas, e a primeira versão deste guard só olhava para a primeira.
 * @param {string} prompt
 * @param {string} key
 * @param {'pin'|'neg'} modo
 */
function temPedidoExplicito(prompt, key, modo) {
  const k = escapeRe(key);
  const estrita = AMBIGUAS_ESTRITAS.has(key);

  const gatilhos = modo === 'neg'
    ? [new RegExp('\\b' + NEG_VERB + '\\s+' + ART + '\\s*$', 'i')]
    : [
      /@$/,
      new RegExp('\\bmodel(?:o)?\\s*[:=]\\s*$', 'i'),
      new RegExp('\\b' + USE_VERB + '\\s+' + ART + '\\s*$', 'i'),
      // preposição nua: só vale para chaves não-ambíguas
      ...(estrita ? [] : [new RegExp('\\b' + WEAK_CONN + '\\s+' + ART + '\\s*$', 'i')]),
    ];

  const ocorrencias = new RegExp('\\b' + k + '\\b', 'gi');
  let m;
  while ((m = ocorrencias.exec(prompt)) !== null) {
    const antes = prompt.slice(0, m.index);
    const depois = prompt.slice(m.index + m[0].length);
    if (usoDeSubstantivo(antes, depois, key)) continue;
    if (gatilhos.some((re) => re.test(antes))) return true;
  }
  return false;
}

// Perfil por tier — espelho das linhas 1034-1039 do classify.js. O modelo T0 é
// injectado porque só o inject_context sabe que Ollama está instalado
// (bestOllamaT0); nunca o inventamos aqui. T5 entra porque sem ele um
// original_tier=T5 devolvia null e o guard apagava o override deixando o tier
// pinado de pé — meio-veto é pior que nenhum (achado do G4).
// `suggested_providers` TEM de vir junto. Sem ele o veto ficava meio feito e o
// P0 sobrevivia por outra porta: `router-execute.js` começa a cadeia de
// despacho por `classification.suggested_providers` VERBATIM (§6.1). Medido:
// "faz o diff com claude" → o guard repunha tier T0/ollama e deixava
// providers=["opus"] → despacho em Opus para uma decisão T0. Ou seja, corrigia
// o texto do hint e continuava a queimar dinheiro. (Achado do G4 de fecho.)
//
// Espelho de DEFAULT_PROVIDERS_BY_TIER (classify.js:1193). Perde-se a
// consciência de quota que o `getSuggestedProviders` tem — é interno ao
// ficheiro congelado. Trocamos "ordenado por quota" por "certo para o tier",
// que é exactamente o fallback ultra-seguro que o próprio classify usa quando
// a leitura de quota falha (classify.js:1179).
const TIER_PROFILE = {
  T0: { recommended_backend: 'ollama',          suggested_subagent: 'local-summarizer', suggested_providers: ['ollama'] },
  T1: { recommended_backend: 'anthropic_api',   recommended_model: 'claude-haiku-4-5-20251001', suggested_subagent: 'cheap-triage',    suggested_providers: ['haiku'] },
  T2: { recommended_backend: 'claude_subagent', recommended_model: 'claude-sonnet-4-6',         suggested_subagent: 'model-reasoner',  suggested_providers: ['sonnet'] },
  T3: { recommended_backend: 'claude_subagent', recommended_model: 'claude-opus-4-6',           suggested_subagent: 'model-architect', suggested_providers: ['opus'] },
  T5: { recommended_backend: 'claude_subagent', recommended_model: 'claude-fable-5',            suggested_subagent: 'model-architect', suggested_providers: ['fable'] },
};

// classify.js põe confidence a 0.99 POR CAUSA do override. Deixá-la lá depois
// do veto não é neutro: o arbiter exige < 0.75 para correr (inject_context.js
// ~843) e a Option A fica elegível — ou seja, o número inflado MUDA a execução.
// 0.6 é o piso a que o hint ainda é emitido (doutrina) e fica abaixo do corte
// do arbiter, devolvendo o prompt ao caminho normal de ambiguidade. O valor
// original vai declarado em override_vetoed, não desaparece.
const CONFIANCA_APOS_VETO = 0.6;

/**
 * @param {Record<string, any>} decision
 * @param {Record<string, any>} uo
 * @param {{ t0Model?: string }} opts
 * @returns {string|null}
 */
function restoreTier(decision, uo, opts) {
  const t = uo.original_tier;
  if (!t || !TIER_PROFILE[t]) return null;
  const profile = Object.assign({}, TIER_PROFILE[t]);
  if (t === 'T0') profile.recommended_model = opts.t0Model || 'qwen3:30b';
  decision.tier = t;
  Object.assign(decision, profile);
  decision.escalation_rule = 'user_override_vetoed';
  return t;
}

/**
 * Aplica o guard sobre uma decisão do classify. Muta `decision` no sítio.
 * @param {Record<string, any>} decision  saída do classify.js
 * @param {string} prompt                 o prompt ORIGINAL do utilizador
 * @param {{ t0Model?: string }} [opts]
 * @returns {{ vetoed: boolean, reason: string|null, restored_tier?: string|null }}
 */
function applyOverrideGuard(decision, prompt, opts) {
  const options = opts || {};
  const noop = { vetoed: false, reason: null };
  if (!decision || !decision.user_override || typeof prompt !== 'string') return noop;

  const uo = decision.user_override;
  const key = String(uo.requested || uo.blocked || '').toLowerCase();
  // Chave que não conhecemos: o espelho divergiu do classify. Não vetamos às
  // cegas — deixamos passar e declaramos, para o teste apanhar a divergência.
  if (!key || !MODEL_KEYS.includes(key)) return noop;

  if (temPedidoExplicito(prompt, key, uo.kind === 'negative' ? 'neg' : 'pin')) return noop;

  // Se o override foi honrado mas não sabemos repor o tier, meio-veto deixaria
  // o tier pinado sem o bloco que o explica. Preferimos não tocar.
  if (uo.honored && !TIER_PROFILE[uo.original_tier]) {
    decision.override_suspeito = {
      requested: key,
      porque: 'sem tier original reponivel — veto abortado para nao deixar meio-estado',
      original_tier: uo.original_tier || 'n/d',
    };
    return { vetoed: false, reason: 'sem_tier_original_reponivel' };
  }

  const confiancaAntes = decision.confidence;
  const restored = uo.honored ? restoreTier(decision, uo, options) : null;
  if (uo.honored) decision.confidence = CONFIANCA_APOS_VETO;

  decision.override_vetoed = {
    kind: uo.kind,
    requested: key,
    honored_was: Boolean(uo.honored),
    restored_tier: restored,
    confidence_antes: confiancaAntes,
    confidence_depois: uo.honored ? CONFIANCA_APOS_VETO : confiancaAntes,
    reason: 'no_explicit_model_intent_in_prompt',
  };
  delete decision.user_override;
  if (typeof decision.reasoning === 'string') {
    decision.reasoning += `; user_override VETOED (fantasma: "${key}" sem intenção explícita)`;
  }
  return { vetoed: true, reason: 'no_explicit_model_intent_in_prompt', restored_tier: restored };
}

module.exports = {
  applyOverrideGuard,
  temPedidoExplicito,
  MODEL_KEYS,
  AMBIGUAS_ESTRITAS,
  SEGUE_SUBSTANTIVO,
  TIER_PROFILE,
  CONFIANCA_APOS_VETO,
};
