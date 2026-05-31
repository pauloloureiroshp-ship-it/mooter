'use strict';

// Quantization detection (Wave 2.8). The Moos run quantized locally — this is
// the SSoT for the quant label shown in the statusline + Moo card.
//
// Honesty: Q4_K_M is the real Ollama default for qwen3 / llama3 / most models
// (4-bit K-quant, medium). We report it as the BASELINE and do NOT spawn
// `ollama show` on the statusline hot path (too slow). A best-effort live probe
// (`detectQuantizationLive`) is available for on-demand callers but is never
// invoked during a render. The "~73% smaller than FP16" figure is the standard
// Q4_K_M size reduction (4-bit weights vs 16-bit) — a verifiable, not invented,
// claim; labelled "approx" so we never overstate precision.

const BASELINE = { format: 'Q4_K_M', reduction_vs_fp16: 73 };

/**
 * Quant for a model, fast path. Returns the documented Ollama baseline without
 * spawning anything. Cloud models (sonnet/opus/haiku/gpt) are not locally
 * quantized → returns null so the caller omits the chip.
 * @param {string} model
 * @returns {{ format: string, reduction_vs_fp16: number } | null}
 */
function detectQuantization(model) {
  const m = String(model || '').toLowerCase();
  if (!m) return null;
  // Cloud-hosted models are not quantized on the user's machine.
  if (/opus|sonnet|haiku|gpt|gemini|claude/.test(m)) return null;
  // Local Ollama models: Q4_K_M is the default baseline.
  return { ...BASELINE };
}

/**
 * Best-effort live probe via `ollama show <model>` — NOT for the render hot
 * path. Falls back to the baseline on any failure (missing ollama, timeout).
 * @param {string} model
 * @param {(cmd:string,args:string[],opts:object)=>{stdout?:string}} [spawn]
 * @returns {{ format: string, reduction_vs_fp16: number }}
 */
function detectQuantizationLive(model, spawn) {
  try {
    const sp = spawn || require('child_process').spawnSync;
    const r = sp('ollama', ['show', String(model)], { encoding: 'utf8', timeout: 800, windowsHide: true });
    const out = (r && r.stdout) || '';
    const match = out.match(/quantization\s+([A-Za-z0-9_]+)/i);
    if (match) return { format: match[1], reduction_vs_fp16: /q4/i.test(match[1]) ? 73 : BASELINE.reduction_vs_fp16 };
  } catch {
    /* fall through to baseline */
  }
  return { ...BASELINE };
}

module.exports = { BASELINE, detectQuantization, detectQuantizationLive };
