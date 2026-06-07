// `mooter compression` — L12 LLMLingua compression (Wave 29, opt-in).
//
//   mooter compression test [--file <p>] [--ratio N] [--no-preserve] [--json]
//   mooter compression status
//
// Pure delegator to @mooter/synthesis. Synthesis has zero native deps so it is
// imported directly (unlike the workflow engine). The CLI thin shell owns stdout.

import { readFileSync } from "node:fs";
import type { CmdResult } from "./trail.ts";
import {
  compressPrompt,
  llmlinguaAvailable,
  loadBudgetConfig,
} from "../../../synthesis/src/index.ts";

export const COMPRESSION_USAGE = `mooter compression — L12 prompt compression (opt-in)

  mooter compression test [--file <path>] [--ratio N] [--no-preserve] [--json]
                                  compress a sample (or a file) and report savings
  mooter compression status       show whether compression is enabled + backend

Compression is OFF by default. Enable via ~/.mooter/preferences.json:
  { "compression": { "enabled": true, "target_ratio": 4 } }`;

const SAMPLE = `Please note that in order to fix the bug you should really just simply look at the file src/router/classify.js and verify that the function classifyPrompt actually returns the correct tier. It is very important that you basically check the TypeError: cannot read property 'tier' of undefined error is gone. The full docs are at https://mooter.ai/docs and version 1.2.3 is affected by this regression.`;

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

export function runCompression(args: string[]): CmdResult {
  const [sub, ...rest] = args;

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: COMPRESSION_USAGE };
  }

  if (sub === "status") {
    const cfg = loadBudgetConfig();
    const backend = llmlinguaAvailable() ? "llmlingua (python)" : "heuristic (built-in)";
    const json = rest.includes("--json");
    if (json) {
      return { exitCode: 0, output: JSON.stringify({ ...cfg, active_backend: backend }, null, 2) };
    }
    const lines = [
      "🐮 Compression (L12) status",
      "─────────────────────────────",
      `enabled:        ${cfg.enabled ? "yes" : "no (opt-in, default off)"}`,
      `target ratio:   ${cfg.target_ratio}×`,
      `min tokens:     ${cfg.min_tokens_to_compress} (skip smaller prompts)`,
      `preserve:       ${cfg.preserve_entities ? "entities kept (paths/code/URLs/errors)" : "off"}`,
      `backend:        ${backend}`,
      cfg.enabled ? "" : "→ enable in ~/.mooter/preferences.json: { \"compression\": { \"enabled\": true } }",
    ].filter(Boolean);
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "test") {
    const filePath = flagValue(rest, "--file");
    const ratio = Number(flagValue(rest, "--ratio") ?? "4");
    const preserve = !rest.includes("--no-preserve");
    const json = rest.includes("--json");

    let prompt = SAMPLE;
    if (filePath) {
      try {
        prompt = readFileSync(filePath, "utf8");
      } catch (e) {
        return { exitCode: 1, output: `mooter compression: cannot read ${filePath}: ${(e as Error).message}` };
      }
    }
    if (!Number.isFinite(ratio) || ratio <= 1) {
      return { exitCode: 1, output: "mooter compression: --ratio must be a number > 1" };
    }

    const r = compressPrompt(prompt, {
      target_ratio: ratio,
      preserve_entities: preserve,
      budget_min_tokens: 32,
      backend: "auto",
    });

    if (json) {
      return {
        exitCode: 0,
        output: JSON.stringify(
          {
            backend: r.backend,
            original_tokens: r.original_tokens,
            compressed_tokens: r.compressed_tokens,
            ratio: Number(r.ratio.toFixed(2)),
            saved_tokens: r.original_tokens - r.compressed_tokens,
            preserved_entities: r.preserved_entities,
            compressed: r.compressed,
          },
          null,
          2,
        ),
      };
    }

    const saved = r.original_tokens - r.compressed_tokens;
    const preview = r.compressed.length > 280 ? r.compressed.slice(0, 280) + " …" : r.compressed;
    const lines = [
      "🐮 Compression test (L12)",
      "─────────────────────────────",
      `backend:    ${r.backend}`,
      `original:   ${r.original_tokens} tokens`,
      `compressed: ${r.compressed_tokens} tokens`,
      `ratio:      ${r.ratio.toFixed(2)}× (saved ${saved} tokens)`,
      `entities:   ${r.preserved_entities} protected span(s) kept intact`,
      "",
      "─── compressed preview ───",
      preview,
    ];
    return { exitCode: 0, output: lines.join("\n") };
  }

  return { exitCode: 1, output: `mooter compression: unknown subcommand '${sub}'\n\n${COMPRESSION_USAGE}` };
}
