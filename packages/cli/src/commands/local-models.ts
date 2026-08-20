// Wave 49 (Phase 2) — `mooter local-models`.
//
// Manage the local Ollama models Mooter can route T0 work to. This command does
// NOT change classify.js routing (the classifier's model map is unchanged in
// Wave 49 by design); `switch-default` persists a preference and prints the env
// export that classify.js already reads (ROUTER_OLLAMA_GENERAL / _REASON / _CODE).
// Everything here is honest about what it does and does not wire.

import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { mooterHomeDefault } from "../packs.ts";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";

export interface CmdResult {
  exitCode: number;
  output: string;
}

/**
 * FUNCAO, e nao constante de topo — de proposito. Uma `const` aqui resolve-se
 * ao CARREGAR o modulo, portanto qualquer `MOOTER_HOME` definido depois do
 * import era ignorado e o comando escrevia na casa verdadeira de quem o corria.
 * E e assim que os testes se isolam: importam primeiro, redireccionam depois.
 */
function configPath(): string {
  return join(mooterHomeDefault(), "local-models.json");
}

// Community / vendor-reported benchmarks. NOT independently measured by Mooter —
// numbers are cited from public model cards / leaderboards (June 2026) and should
// be treated as advisory. VRAM is the approximate Q4 on-disk/runtime footprint.
const RECOMMENDED = [
  { model: "qwen3.6:27b",         role: "general default", vram: "~17GB", note: "77.2% SWE-bench (reported); strong all-round dense model" },
  { model: "qwen2.5-coder:32b",   role: "coding",          vram: "~19GB", note: "92.7% HumanEval (reported); pure-code specialist" },
  { model: "deepseek-r1:32b",     role: "reasoning/debug", vram: "~22GB", note: "72.6% LiveCodeBench (reported); not installed by default" },
  { model: "qwen2.5-vl:7b",       role: "vision (OCR)",    vram: "~6GB",  note: "local vision/OCR; not installed by default" },
  { model: "qwen2.5:3b",          role: "tiny fallback",   vram: "~2GB",  note: "always-installable safe default" },
];

function ollamaList(): { ok: boolean; models: string[]; raw: string } {
  const r = spawnSync("ollama", ["list"], { encoding: "utf8", timeout: 8000 });
  if (r.status !== 0 || typeof r.stdout !== "string") {
    return { ok: false, models: [], raw: (r.stderr || "ollama not available").toString() };
  }
  const models = r.stdout
    .split("\n")
    .slice(1) // header
    .map((l) => l.trim().split(/\s+/)[0])
    .filter((n) => n && n.length > 0);
  return { ok: true, models, raw: r.stdout };
}

function readPref(): { default?: string } {
  try {
    if (existsSync(configPath())) return JSON.parse(readFileSync(configPath(), "utf8"));
  } catch { /* ignore malformed */ }
  return {};
}

function renderList(): CmdResult {
  const { ok, models, raw } = ollamaList();
  if (!ok) {
    return {
      exitCode: 1,
      output: `🐮 mooter local-models — Ollama not reachable.\n  ${raw.trim()}\n\nInstall Ollama (https://ollama.com) then: mooter local-models recommend`,
    };
  }
  const pref = readPref().default;
  const rows = models.length
    ? models.map((m) => `  ${m === pref ? "→" : " "} ${m}${m === pref ? "   (mooter default)" : ""}`).join("\n")
    : "  (none installed)";
  return {
    exitCode: 0,
    output: `🐮 mooter local-models — installed (via Ollama)\n\n${rows}\n\nRecommend more: mooter local-models recommend\nSet default:    mooter local-models switch-default <model>`,
  };
}

function renderRecommend(): CmdResult {
  const installed = new Set(ollamaList().models);
  const rows = RECOMMENDED.map((r) => {
    const have = installed.has(r.model) ? "✓ installed" : "  pull";
    return `  ${r.model.padEnd(22)} ${r.role.padEnd(16)} ${r.vram.padEnd(7)} ${have}\n      ${r.note}`;
  }).join("\n");
  return {
    exitCode: 0,
    output: `🐮 mooter local-models — recommended (community/vendor benchmarks, advisory)\n\n${rows}\n\nNumbers are reported by the model authors, NOT independently benchmarked by Mooter.\nInstall: mooter local-models install <model>`,
  };
}

function installModel(model?: string): CmdResult {
  if (!model) return { exitCode: 1, output: "Usage: mooter local-models install <model>  (e.g. qwen3.6:27b)" };
  const r = spawnSync("ollama", ["pull", model], { stdio: "inherit", timeout: 1000 * 60 * 60 });
  if (r.status !== 0) {
    return { exitCode: 1, output: `pull failed for "${model}" (is the tag correct? see: mooter local-models recommend)` };
  }
  return { exitCode: 0, output: `✓ pulled ${model}. Make it the default: mooter local-models switch-default ${model}` };
}

function switchDefault(model?: string): CmdResult {
  if (!model) return { exitCode: 1, output: "Usage: mooter local-models switch-default <model>" };
  const installed = new Set(ollamaList().models);
  if (installed.size > 0 && !installed.has(model)) {
    return { exitCode: 1, output: `"${model}" is not installed. Pull it first: mooter local-models install ${model}` };
  }
  try {
    mkdirSync(mooterHomeDefault(), { recursive: true });
    writeFileSync(configPath(), JSON.stringify({ default: model }, null, 2));
  } catch (e) {
    return { exitCode: 1, output: `could not write ${configPath()}: ${(e as Error).message}` };
  }
  // Honest: classify.js reads ROUTER_OLLAMA_GENERAL from the environment. We persist
  // the preference and tell the user exactly how to make it take effect — we do not
  // silently rewrite the router.
  return {
    exitCode: 0,
    output: `✓ default set to ${model} (saved to ${configPath()}).

To make the router use it, export it for your shell (classify.js reads this):
  export ROUTER_OLLAMA_GENERAL=${model}

Add that line to ~/.bashrc / ~/.zshrc to persist. Until exported, the router keeps
its built-in default — this command does not edit classify.js.`,
  };
}

const USAGE = `🐮 mooter local-models — manage local Ollama models for T0 routing

  list                      show installed models (marks the mooter default)
  recommend                 show recommended frontier models + reported benchmarks
  install <model>           ollama pull <model>
  switch-default <model>    set the preferred T0 model (prints the env export)

Note: this manages models only; it does not change classify.js routing logic.`;

export async function runLocalModels(args: string[] = []): Promise<CmdResult> {
  const [sub, target] = args;
  switch (sub) {
    case "list":           return renderList();
    case "recommend":      return renderRecommend();
    case "install":        return installModel(target);
    case "switch-default": return switchDefault(target);
    case undefined:
    case "help":
    case "--help":         return { exitCode: 0, output: USAGE };
    default:               return { exitCode: 1, output: `Unknown subcommand "${sub}".\n\n${USAGE}` };
  }
}
