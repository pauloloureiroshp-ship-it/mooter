// Shared model-resolution helpers — loaded by both PostToolUse.js and
// exec-logger.js so the emoji (user-facing) and execution.log (audit)
// always agree on what model did what.
//
// Extracted in AUDIT-MOOTER-2026-04-19 F3.2 to remove ~100 lines of
// duplicated code. Keep this file lean: no I/O, no globals. Both hooks
// require it synchronously inside PostToolUse — a slow require here
// becomes latency on every Bash call.
//
// Runtime location: ~/.claude/hooks/_model-resolver.js (wired by
// settings.json hooks that require it). This frugal copy is the
// versioned mirror — see .claude/rules/router-logic.md canonical table.

'use strict';

function subagentTypeToModel(subagentType) {
  if (!subagentType) return null;
  const t = String(subagentType).toLowerCase();
  if (t === 'local-summarizer' || t === 'local-transformer') return 'qwen3:30b';
  if (t === 'cheap-triage') return 'claude-haiku-4-5-20251001';
  if (t === 'model-reasoner') return 'claude-sonnet-4-6';
  if (t === 'model-architect' || t === 'final-reviewer') return 'claude-opus-4-6';
  if (t === 'explore' || t === 'plan' || t === 'general-purpose') return 'claude-sonnet-4-6';
  if (t.startsWith('gsd-')) return 'claude-sonnet-4-6';
  return null;
}

const { ehInvocacao, segmentoQueInvoca, modeloDaFlag, segmentar, nomeBase } = require('./_model-resolver-core.js');

/**
 * Que motor EXTERNO este comando invoca — ou `null` se nenhum, ou se nao se
 * consegue saber qual.
 *
 * A REGRA que governa cada ramo: **em duvida, `null`.** Nunca o motor mais
 * barato. Um heuristico que erra sempre para o mesmo lado nao e ruido, e vies —
 * e neste sistema o vies barato inflaciona a poupanca declarada, que e
 * exactamente o defeito que este ficheiro veio corrigir.
 */
function detectExternalModel(command) {
  if (!command) return null;
  const cmd = String(command);

  // O script do harness. Nome proprio, sem ambiguidade.
  if (ehInvocacao(cmd, 'ollama_call')) return 'qwen3:30b';

  // OLLAMA — so `ollama run <modelo>` e uma execucao.
  //
  // A primeira versao desta correccao aceitava QUALQUER subcomando e devolvia
  // 'qwen3:30b' cravado: `ollama list`, `ollama ps` e `ollama pull` viravam
  // execucoes locais, e o `bucketFor` conta local como trabalho GRATIS. O
  // `onboarding.js:145`, o `mooter-doctor.js:264` e o `hardware-matcher.js:106`
  // imprimem `ollama pull ...` para o dono colar no terminal — nao era um caso
  // de fronteira, era o caminho normal. Sem `run`, devolve-se `null`.
  const ollama = segmentoQueInvoca(cmd, 'ollama');
  if (ollama) {
    const i = ollama.indexOf('run');
    const modelo = i >= 0 ? ollama[i + 1] : null;
    return modelo && !String(modelo).startsWith('-') ? String(modelo) : null;
  }

  // Nos restantes, a flag `--model` e lida SO nos tokens do segmento que
  // invoca. Lida do comando inteiro, um motor roubava a flag de outro:
  // `codex exec "a" ; gemini --model gemini-3-pro "b"` registava a chamada do
  // Codex como gemini-3-pro.
  const codex = segmentoQueInvoca(cmd, 'codex');
  if (codex) return modeloDaFlag(codex) || 'gpt-5-codex';

  const gemini = segmentoQueInvoca(cmd, 'gemini') || segmentoQueInvoca(cmd, 'gemini-cli');
  if (gemini) return modeloDaFlag(gemini) || 'gemini-2.5-flash';

  const aider = segmentoQueInvoca(cmd, 'aider');
  if (aider) return modeloDaFlag(aider) || 'gpt-5';

  return null;
}

function getRole(model) {
  if (!model) return 'unknown';
  const m = String(model).toLowerCase();
  if (m.includes('opus')) return 'architect';
  if (m.includes('sonnet')) return 'reasoning';
  if (m.includes('haiku')) return 'reflex';
  if (m.includes('qwen') || m.includes('ollama') || m.includes('local')) return 'local';
  if (m.includes('codex') || m.includes('openai') || m.includes('gpt')) return 'generalist';
  if (m.includes('gemini') || m.includes('google')) return 'multimodal';
  return 'unknown';
}

module.exports = {
  subagentTypeToModel,
  detectExternalModel,
  getRole,
  // Reexportados para os testes. O parser vive no .
  ehInvocacao,
  segmentoQueInvoca,
  modeloDaFlag,
  segmentar,
  nomeBase,
};
