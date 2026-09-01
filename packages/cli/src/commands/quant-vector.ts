// `mooter quant status` / `mooter vector status` — Wave 32 (Phase G).
//
// Reads REAL data from the Ollama API (/api/tags): model name, quantization
// level, size, parameter size. Throughput (tok/s) is NOT reported because the
// API does not expose it and we never invent metrics. Each command also writes
// a snapshot to ~/.mooter/cache so the statusline line-3 chips can render
// without a network call on the hot render path.

import { writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ollamaHostFromEnv } from "../ollama-host.ts";
import { mooterHomeDefault } from "../packs.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

interface OllamaModel {
  name: string;
  size?: number;
  details?: { quantization_level?: string; parameter_size?: string; family?: string };
}

const OLLAMA = ollamaHostFromEnv("http://localhost:11434");

// Known embedding dimensions for embed-family models (not in /api/tags).
const EMBED_DIMS: Record<string, number> = {
  "nomic-embed-text": 768,
  "mxbai-embed-large": 1024,
  "all-minilm": 384,
};

function cacheDir(): string {
  return join(mooterHomeDefault(), "cache");
}

function writeSnapshot(name: string, obj: unknown): void {
  try {
    mkdirSync(cacheDir(), { recursive: true });
    writeFileSync(join(cacheDir(), name), JSON.stringify(obj) + "\n");
  } catch { /* cache write is best-effort */ }
}

async function fetchModels(fetchImpl: typeof fetch): Promise<OllamaModel[] | null> {
  try {
    const res = await fetchImpl(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return null;
    const j = (await res.json()) as { models?: OllamaModel[] };
    return j.models ?? [];
  } catch {
    return null;
  }
}

function gb(size?: number): string {
  return typeof size === "number" ? `${(size / 1e9).toFixed(1)} GB` : "? GB";
}

function isEmbed(m: OllamaModel): boolean {
  return /embed/i.test(m.name) || /embed/i.test(m.details?.family ?? "");
}

export async function runQuant(args: string[], deps: { fetchImpl?: typeof fetch } = {}): Promise<CmdResult> {
  const json = args.includes("--json");
  const models = (await fetchModels(deps.fetchImpl ?? fetch))?.filter((m) => !isEmbed(m)) ?? null;
  if (!models) {
    return { exitCode: 1, output: "📦 quant: Ollama not reachable (start it with `ollama serve`)" };
  }
  const rows = models.map((m) => ({
    name: m.name,
    quant: m.details?.quantization_level ?? "?",
    sizeGb: typeof m.size === "number" ? +(m.size / 1e9).toFixed(1) : null,
    params: m.details?.parameter_size ?? "?",
  }));
  writeSnapshot("quant-snapshot.json", { models: rows, ts: 0 });
  if (json) return { exitCode: 0, output: JSON.stringify({ models: rows }, null, 2) };
  if (rows.length === 0) return { exitCode: 0, output: "📦 quant: no local generation models installed" };
  const lines = ["📦 Local model quantization (Ollama)", "───────────────────────────────────"];
  for (const m of models) {
    lines.push(`  ${m.name.padEnd(22)} ${(m.details?.quantization_level ?? "?").padEnd(8)} ${gb(m.size).padStart(8)} · ${m.details?.parameter_size ?? "?"}`);
  }
  return { exitCode: 0, output: lines.join("\n") };
}

export async function runVector(args: string[], deps: { fetchImpl?: typeof fetch } = {}): Promise<CmdResult> {
  const json = args.includes("--json");
  const models = (await fetchModels(deps.fetchImpl ?? fetch))?.filter(isEmbed) ?? null;
  if (!models) {
    return { exitCode: 1, output: "🧭 vector: Ollama not reachable (start it with `ollama serve`)" };
  }
  const rows = models.map((m) => {
    const base = m.name.replace(/:.*/, "");
    return { name: m.name, quant: m.details?.quantization_level ?? "?", dims: EMBED_DIMS[base] ?? null, sizeGb: typeof m.size === "number" ? +(m.size / 1e9).toFixed(1) : null };
  });
  writeSnapshot("vector-snapshot.json", { models: rows, ts: 0 });
  if (json) return { exitCode: 0, output: JSON.stringify({ models: rows }, null, 2) };
  if (rows.length === 0) return { exitCode: 0, output: "🧭 vector: no embedding model installed (try `ollama pull nomic-embed-text`)" };
  const lines = ["🧭 Embedding models (Ollama)", "────────────────────────────"];
  for (const r of rows) {
    lines.push(`  ${r.name.padEnd(24)} ${r.dims ? `${r.dims}d` : "?d"} · ${r.quant} · ${r.sizeGb ?? "?"} GB`);
  }
  return { exitCode: 0, output: lines.join("\n") };
}
