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

// Interpretadores: quando um destes e o executavel, quem interessa e o ARGUMENTO
// seguinte (o script), nao o interpretador.
const INTERPRETES = new Set(['bash', 'sh', 'zsh', 'node', 'python', 'python3', 'pwsh', 'powershell']);
// Prefixos que envolvem o comando real sem serem o comando.
const PREFIXOS = new Set(['sudo', 'env', 'exec', 'nohup', 'time', 'command', 'nice']);

/** Os segmentos de um comando composto: `a && b | c ; d` -> ['a','b','c','d']. */
function segmentos(cmd) {
  return String(cmd)
    .split(/\s*(?:&&|\|\||[;|\n])\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** O nome do executavel de um segmento, sem caminho nem extensao. */
function executavel(segmento) {
  const toks = String(segmento).split(/\s+/).filter(Boolean);
  for (let i = 0; i < toks.length; i += 1) {
    let t = toks[i].replace(/^["']|["']$/g, '');
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue; // VAR=valor a prefixar
    let base = t.split(/[\\/]/).pop().replace(/\.(exe|cmd|bat|ps1|sh)$/i, '');
    if (PREFIXOS.has(base)) continue;
    if (INTERPRETES.has(base) && toks[i + 1]) {
      // `bash .../ollama_call.sh --text x` -> o que conta e o script.
      const arg = toks[i + 1].replace(/^["']|["']$/g, '');
      if (arg.startsWith('-')) return base;
      base = arg.split(/[\\/]/).pop().replace(/\.(mjs|cjs|js|py|ps1|sh)$/i, '');
    }
    return base;
  }
  return null;
}

/**
 * O comando INVOCA este programa? (nao: "menciona-o algures no texto")
 *
 * O ANTIGO testava `/\bcodex\b/` contra o comando INTEIRO. Medido a 2026-08-23 no
 * `execution.log`: 279 linhas com `model=gpt-5-codex`, das quais **12 eram
 * invocacoes reais**. 267 fabricadas — 96%. Entre elas:
 *
 *   which codex 2>/dev/null
 *   where codex 2>&1
 *   cd "..." && git add tools/router/
 *
 * Nao e um erro cosmetico de contagem. O `exec-logger.js:174` nao ANOTA o modelo,
 * SUBSTITUI-O — e o `bucketFor()` manda essas linhas para baldes baratos. Ou
 * seja: **procurar pelo nome de um motor inflacionava a poupanca declarada**. Foi
 * assim que esta propria sessao de auditoria fabricou ~10 execucoes de Codex, so
 * por eu ter pesquisado a palavra.
 */
function ehInvocacao(cmd, nome) {
  for (const seg of segmentos(cmd)) {
    if (executavel(seg) === nome) return true;
  }
  return false;
}

function detectExternalModel(command) {
  if (!command) return null;
  const cmd = String(command);
  // `--model=x` so vale se ESTE comando for a invocacao; senao um `echo --model=y`
  // dentro de um comando qualquer roubava o nome ao motor verdadeiro.
  const flagModelo = () => {
    const m = cmd.match(/--model[= ]([^\s"']+)/);
    return m ? m[1] : null;
  };
  if (ehInvocacao(cmd, 'ollama_call')) return 'qwen3:30b';
  if (ehInvocacao(cmd, 'ollama')) {
    const ollamaRun = cmd.match(/\bollama\s+run\s+(\S+)/);
    return ollamaRun ? ollamaRun[1] : 'qwen3:30b';
  }
  if (ehInvocacao(cmd, 'codex')) return flagModelo() || 'gpt-5-codex';
  if (ehInvocacao(cmd, 'gemini') || ehInvocacao(cmd, 'gemini-cli')) return flagModelo() || 'gemini-2.5-flash';
  if (ehInvocacao(cmd, 'aider')) return flagModelo() || 'gpt-5';
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
  ehInvocacao,
  executavel,
  detectExternalModel,
  getRole,
};
