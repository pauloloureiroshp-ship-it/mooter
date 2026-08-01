'use strict';
// user-override-guard.js — mata o "USER_OVERRIDE fantasma" (P0, PRIME-0 2026-08-01)
//
// PORQUÊ AQUI E NÃO NO classify.js: classify.js é FROZEN (sha256 CI-enforced
// 427d8c0b…). A causa-raiz está lá — POSITIVE_INTENT_RE aceita as preposições
// NUAS `com` / `with` / `via` antes de qualquer chave de USER_OVERRIDE_MODELS,
// e `local` / `claude` / `qwen` são palavras correntes em PT-BR e neste repo.
// Resultado medido: "compara a nuvem com local" → pin em qwen2.5:3b, e
// "sessao fresca com claude code" → pin em opus. Trabalho a sério num 3B num
// sentido, dinheiro queimado no outro.
//
// O guard corre DEPOIS do classify (inject_context.js) e só sabe fazer uma
// coisa: perguntar ao PROMPT se houve mesmo intenção explícita de escolher
// motor. Se não houve, apaga o override e repõe o tier que o classificador
// tinha antes de o aplicar (classify grava-o em user_override.original_tier).
//
// ASSIMETRIA DE CUSTO (a razão do desenho ser conservador):
//   falso positivo — pina sem pedido → resposta errada ou Opus queimado, invisível.
//   falso negativo — não pina quando pediram → o utilizador escreve "@local", visível.
// Perante dúvida, NÃO pinar. Por isso as preposições nuas deixam de contar.

// Espelho das chaves de classify.js:212 (USER_OVERRIDE_MODELS). Se lá crescer
// uma chave, cresce aqui — o teste de pins genuínos apanha a divergência.
const MODEL_KEYS = [
  'opus', 'sonnet', 'haiku', 'ollama', 'local', 'qwen', 'gemini',
  'gpt', 'gpt-4', 'gpt-4o', 'claude', 'fable', 'fable5',
];

// Verbos que EXPRIMEM escolha de motor. Repare no que NÃO está aqui:
// `com`, `with`, `via` — as preposições nuas são exactamente o buraco do P0.
const USE_VERB =
  '(?:usa|use|usar|usando|por\\s+favor\\s+usa|run\\s+with|rodar\\s+com|run\\s+on|' +
  'for[çc]a|for[çc]ar|force|imp[oõ]e|impor)';

// Negativos: "sem opus", "não uses haiku". O `no` inglês nu ficou DE FORA de
// propósito — "no local changes" / "no claude" são frases correntes.
const NEG_VERB = "(?:sem|n[aã]o\\s+(?:uses|use|usar)|don'?t\\s+use|do\\s+not\\s+use)";

// Palavras que, logo a seguir à chave, provam que a chave era substantivo
// comum e não nome de modelo. "usa o local storage" fala do browser.
const COMMON_NOUN_FOLLOW = {
  local: /^\s*(?:storage|host|hosts?|hosting|network|file|files|machine|disk|dev|time|state|var|variable|scope|branch|repo|repos|copy|backup|path|dir|directory|first|only|cache|db|database|server|port|tunnel|build|env|changes)\b/i,
  claude: /^\s*(?:code|desktop|api|app|md|\.md|cli|agent|sdk|ai)\b/i,
  gpt: /^\s*(?:store|zero)\b/i,
  gemini: /^\s*(?:cli|code|api)\b/i,
  ollama: /^\s*(?:serve|pull|list|ps)\b/i,
};

/** @param {string} s */
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
}

/**
 * A chave aparece seguida de palavra que a torna substantivo comum?
 * @param {string} rest  texto imediatamente a seguir à ocorrência
 * @param {string} key
 */
function isCommonNounUse(rest, key) {
  const deny = COMMON_NOUN_FOLLOW[key];
  return Boolean(deny && deny.test(rest));
}

/**
 * Houve intenção EXPLÍCITA de pinar este modelo? Só três formas contam:
 * `@key`, `model: key`, e verbo-de-uso + key. Preposição nua não conta.
 * @param {string} prompt
 * @param {string} key
 */
function hasExplicitPin(prompt, key) {
  const k = escapeRe(key);
  const forms = [
    new RegExp('@' + k + '\\b', 'i'),
    new RegExp('\\bmodel(?:o)?\\s*[:=]\\s*' + k + '\\b', 'i'),
    new RegExp('\\b' + USE_VERB + '\\s+(?:o|a|the|um|uma)?\\s*' + k + '\\b', 'i'),
  ];
  for (const re of forms) {
    const m = prompt.match(re);
    if (!m || m.index === undefined) continue;
    if (isCommonNounUse(prompt.slice(m.index + m[0].length), key)) continue;
    return true;
  }
  return false;
}

/**
 * Houve intenção EXPLÍCITA de excluir este modelo?
 * @param {string} prompt
 * @param {string} key
 */
function hasExplicitNegative(prompt, key) {
  const k = escapeRe(key);
  const re = new RegExp('\\b' + NEG_VERB + '\\s+(?:o|a|the|um|uma)?\\s*' + k + '\\b', 'i');
  const m = prompt.match(re);
  if (!m || m.index === undefined) return false;
  return !isCommonNounUse(prompt.slice(m.index + m[0].length), key);
}

// Perfil por tier — espelho das linhas 1034-1039 do classify.js. O modelo T0 é
// injectado porque só o inject_context sabe que Ollama está instalado
// (bestOllamaT0); nunca o inventamos aqui.
const TIER_PROFILE = {
  T0: { recommended_backend: 'ollama',          suggested_subagent: 'local-summarizer' },
  T1: { recommended_backend: 'anthropic_api',   recommended_model: 'claude-haiku-4-5-20251001', suggested_subagent: 'cheap-triage' },
  T2: { recommended_backend: 'claude_subagent', recommended_model: 'claude-sonnet-4-6',         suggested_subagent: 'model-reasoner' },
  T3: { recommended_backend: 'claude_subagent', recommended_model: 'claude-opus-4-6',           suggested_subagent: 'model-architect' },
};

/**
 * @param {Record<string, any>} decision
 * @param {Record<string, any>} uo
 * @param {{ t0Model?: string }} opts
 * @returns {string|null} tier reposto, ou null se não havia por onde repor
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
  if (!key || !MODEL_KEYS.includes(key)) return noop;

  const explicito = uo.kind === 'negative'
    ? hasExplicitNegative(prompt, key)
    : hasExplicitPin(prompt, key);
  if (explicito) return noop;

  // Fantasma confirmado: a palavra do modelo estava lá por acaso.
  const restored = uo.honored ? restoreTier(decision, uo, options) : null;
  decision.override_vetoed = {
    kind: uo.kind,
    requested: key,
    honored_was: Boolean(uo.honored),
    restored_tier: restored,
    reason: 'no_explicit_model_intent_in_prompt',
    // classify põe confidence a 0.99 POR CAUSA do override; ao vetá-lo o número
    // deixa de significar o que dizia. Declaramos em vez de inventar outro.
    confidence_inflated_by_vetoed_override: true,
  };
  delete decision.user_override;
  if (typeof decision.reasoning === 'string') {
    decision.reasoning += `; user_override VETOED (fantasma: "${key}" sem intenção explícita)`;
  }
  return { vetoed: true, reason: 'no_explicit_model_intent_in_prompt', restored_tier: restored };
}

module.exports = {
  applyOverrideGuard,
  hasExplicitPin,
  hasExplicitNegative,
  MODEL_KEYS,
  COMMON_NOUN_FOLLOW,
};
