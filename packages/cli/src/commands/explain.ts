// `mooter explain` (Wave 5 D3) — educational mode that describes each statusline
// chip and what it means. Pure: returns the guide text (no I/O), so it's trivially
// testable and never fabricates live data.

export interface CmdResult {
  exitCode: number;
  output: string;
}

const STATUSLINE_GUIDE = `🐮 Mooter statusline guide

Line 1 (macro · cumulative session info):
  🐮 mooter saved $X (Y%)
     ↳ cumulative session savings vs an all-T3 (Opus) baseline
  T2 sonnet 0.65
     ↳ current tier (T0/T1/T2/T3) · model · confidence (0-1)

Line 2 (current state · wide terminals only, COLUMNS ≥ 120):
  🐂 ☁ / 🐄 🏠 …
     ↳ glyph by tier + provider (🏠 local · ☁ cloud · ⚡ max)
  🏠 local ×4
     ↳ 4 turns this session ran on a local Ollama Moo (free)
  🐄 last10: T0:1 T1:1 T2:3 T3:5
     ↳ tier distribution of the last 10 prompts
  🎮 RTX 4090 (12.1GB / 24GB)
     ↳ GPU + live VRAM used/total (nvidia-smi; omitted if unavailable)
  ctx [██░░░░░░░░] 23%
     ↳ context window used in the current Claude Code session
  100% 5h
     ↳ Anthropic quota remaining (5h window)
  quant Q4_K_M (-72% size · ~99% quality vs FP16)
     ↳ local model quantization (smaller file, ~same quality)
  adapter ◌ baseline
     ↳ no LoRA adapter active (run \`mooter forge install\` to add one)

To hide any chip:  mooter quiet --hide-<chip>
Available:         --hide-vram · --hide-quant · --hide-ctx · --hide-adapter
Re-enable all:     mooter quiet --show-all`;

export function runExplain(opts: { topic?: string } = {}): CmdResult {
  if (opts.topic && opts.topic !== "statusline") {
    return { exitCode: 1, output: `Unknown topic "${opts.topic}". Available topics: statusline` };
  }
  return { exitCode: 0, output: STATUSLINE_GUIDE };
}
