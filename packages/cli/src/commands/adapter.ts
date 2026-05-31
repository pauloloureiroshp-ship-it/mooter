// `mooter adapter` (Wave 5 D1 — Adapter Forge foundation).
//
// list / show <id> / activate <id> / deactivate — all HONEST stubs in D1: no
// adapters ship yet and the runtime (`tools/router/adapter_selection.js`) ignores
// `active_adapter_id` until D2's validation pipeline. Every command says so. The
// commands read ~/.mooter/adapters/<id>/manifest.json and toggle
// preferences.json `active_adapter_id`; nothing is fabricated.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mooterHomeDefault } from "../packs.ts";

export interface CmdResult {
  exitCode: number;
  output: string;
}

interface AdapterManifest {
  adapter_id: string;
  name: string;
  domain?: string;
  adapter_type?: string;
  quantization?: string;
  performance?: { accuracy_delta: number };
}

export interface AdapterOptions {
  mooterHome?: string;
}

function adaptersDir(mooterHome: string): string {
  return join(mooterHome, "adapters");
}

export function listAdapters(mooterHome: string = mooterHomeDefault()): AdapterManifest[] {
  const dir = adaptersDir(mooterHome);
  if (!existsSync(dir)) return [];
  const out: AdapterManifest[] = [];
  for (const id of readdirSync(dir, { withFileTypes: true })) {
    if (!id.isDirectory()) continue;
    try {
      out.push(JSON.parse(readFileSync(join(dir, id.name, "manifest.json"), "utf8")));
    } catch {
      /* skip unreadable manifest */
    }
  }
  return out;
}

function activeAdapterId(mooterHome: string): string | null {
  try {
    const prefs = JSON.parse(readFileSync(join(mooterHome, "preferences.json"), "utf8"));
    return typeof prefs.active_adapter_id === "string" ? prefs.active_adapter_id : null;
  } catch {
    return null;
  }
}

export function runAdapterList(opts: AdapterOptions = {}): CmdResult {
  const home = opts.mooterHome ?? mooterHomeDefault();
  const manifests = listAdapters(home);
  const lines: string[] = ["🐮 Mooter adapters", ""];
  if (manifests.length === 0) {
    lines.push("  ◌ No adapters installed yet.");
    lines.push("  ℹ Adapter Forge ships training in Wave 5 D2.");
    lines.push("  ℹ For now you can place a .gguf adapter + manifest.json in:");
    lines.push("    ~/.mooter/adapters/<id>/");
    lines.push("    See docs/adr/020-adapter-forge-approach.md.");
    return { exitCode: 0, output: lines.join("\n") };
  }
  const active = activeAdapterId(home);
  for (const m of manifests) {
    const isActive = active === m.adapter_id;
    lines.push(`  ${isActive ? "✓" : " "} ${m.name} (${m.adapter_type ?? "?"}/${m.quantization ?? "?"})`);
    lines.push(`    id: ${m.adapter_id.slice(0, 12)}… · domain: ${m.domain ?? "general"}`);
    lines.push(
      m.performance
        ? `    perf: ${(m.performance.accuracy_delta * 100).toFixed(1)}% vs baseline`
        : `    perf: ◌ not benchmarked yet`,
    );
  }
  if (active) lines.push("", "⚠ Wave 5 D1: runtime is stubbed — marked adapter is NOT honored until D2.");
  return { exitCode: 0, output: lines.join("\n") };
}

export function runAdapterShow(id: string, opts: AdapterOptions = {}): CmdResult {
  const home = opts.mooterHome ?? mooterHomeDefault();
  const m = listAdapters(home).find((x) => x.adapter_id === id || x.adapter_id.startsWith(id));
  if (!m) return { exitCode: 1, output: `adapter not found: ${id}` };
  return { exitCode: 0, output: JSON.stringify(m, null, 2) };
}

export function runAdapterActivate(id: string, opts: AdapterOptions = {}): CmdResult {
  if (!id) return { exitCode: 1, output: "usage: mooter adapter activate <id>" };
  const home = opts.mooterHome ?? mooterHomeDefault();
  let prefs: Record<string, unknown> = {};
  try {
    prefs = JSON.parse(readFileSync(join(home, "preferences.json"), "utf8"));
  } catch {
    prefs = {};
  }
  prefs.active_adapter_id = id;
  mkdirSync(home, { recursive: true });
  writeFileSync(join(home, "preferences.json"), JSON.stringify(prefs, null, 2) + "\n");
  return {
    exitCode: 0,
    output: [
      `✓ Marked ${id.slice(0, 12)}… as active.`,
      "⚠ Wave 5 D1 disclaimer: runtime selection is stubbed.",
      "   The adapter is honored only when Wave 5 D2 ships the validation pipeline.",
      "   Until then the statusline still shows baseline.",
    ].join("\n"),
  };
}

export function runAdapterDeactivate(opts: AdapterOptions = {}): CmdResult {
  const home = opts.mooterHome ?? mooterHomeDefault();
  try {
    const prefs = JSON.parse(readFileSync(join(home, "preferences.json"), "utf8"));
    delete prefs.active_adapter_id;
    writeFileSync(join(home, "preferences.json"), JSON.stringify(prefs, null, 2) + "\n");
  } catch {
    /* nothing to clear */
  }
  return { exitCode: 0, output: "✓ Adapter deactivated — back to baseline." };
}
