// `mooter adapter` (Wave 5 D1 foundation; Wave 5 D2 wires real validation).
//
// list / show <id> / activate <id> / deactivate. The commands read
// ~/.mooter/adapters/<id>/manifest.json and toggle preferences.json
// `active_adapter_id`. Wave 5 D2: `show` now validates the manifest (signature +
// structure) BEFORE displaying any `performance` figure (NIT W5 D1 #1), so an
// unverified manifest can never present a perf number.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { mooterHomeDefault } from "../packs.ts";
import { validateManifest, verifyManifest, type AdapterManifestV1 } from "../../../router/src/adapter/adapter_manifest.ts";
import { getLocalSecret } from "../consent.ts";

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
  const m = listAdapters(home).find((x) => x.adapter_id === id || x.adapter_id.startsWith(id)) as AdapterManifestV1 | undefined;
  if (!m) return { exitCode: 1, output: `adapter not found: ${id}` };

  // NIT W5 D1 #1 — validate BEFORE rendering performance. A perf figure is only
  // shown for a structurally-valid, signature-verified manifest; otherwise we say
  // so rather than display an unverified (possibly forged) accuracy number.
  const secret = getLocalSecret(home);
  const structural = validateManifest(m);
  const sigOk = verifyManifest(m, secret);
  const valid = structural.valid && sigOk;

  const lines = [
    `🔧 Adapter: ${m.name}`,
    `  id: ${m.adapter_id}`,
    `  base_model: ${m.base_model} · ${m.adapter_type}/${m.quantization}`,
    `  signature: ${sigOk ? "✓ valid" : "✗ INVALID — do not trust"}`,
    `  structure: ${structural.valid ? "✓ valid" : "✗ " + structural.errors.join("; ")}`,
  ];
  if (valid && m.performance) {
    lines.push(`  performance: ${(m.performance.accuracy_delta * 100).toFixed(1)}% vs baseline (run ${m.performance.benchmark_run_id})`);
  } else if (!valid) {
    lines.push("  performance: ◌ not shown (manifest not validated)");
  } else {
    lines.push(`  performance: ◌ not benchmarked yet — run \`mooter forge benchmark ${m.adapter_id.slice(0, 8)}\``);
  }
  return { exitCode: 0, output: lines.join("\n") };
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
