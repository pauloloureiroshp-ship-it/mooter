// Cost-cap limits config (Wave 30 Phase J).
//
// Reads ~/.mooter/limits.toml (override via MOOTER_HOME). To keep the
// validation package dependency-free we parse the small TOML subset we use
// (sections, key = number|bool|"string", # comments) rather than pull a parser.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { mooterPath } from "../../../synthesis/src/config.ts";

export interface Limits {
  max_workflow_cost_usd: number;
  max_session_cost_usd: number;
  max_t3_calls_per_5min: number;
  max_concurrent_workflows: number;
}

export interface Anomalies {
  detect_unusual_spend: boolean;
  detect_lora_regression: boolean;
  detect_provider_outage: boolean;
}

export interface LimitsConfig {
  limits: Limits;
  anomalies: Anomalies;
}

export const DEFAULT_LIMITS_CONFIG: LimitsConfig = {
  limits: {
    max_workflow_cost_usd: 5.0,
    max_session_cost_usd: 50.0,
    max_t3_calls_per_5min: 30,
    max_concurrent_workflows: 3,
  },
  anomalies: {
    detect_unusual_spend: true,
    detect_lora_regression: true,
    detect_provider_outage: true,
  },
};

export const DEFAULT_LIMITS_TOML = `# Mooter cost-cap limits (Wave 30 Phase J). Edit to taste.
[limits]
max_workflow_cost_usd = 5.00
max_session_cost_usd = 50.00
max_t3_calls_per_5min = 30
max_concurrent_workflows = 3

[anomalies]
detect_unusual_spend = true
detect_lora_regression = true
detect_provider_outage = true
`;

type TomlValue = number | boolean | string;
type TomlTable = Record<string, Record<string, TomlValue>>;

/** Parse the small TOML subset Mooter uses. Unknown lines are ignored. */
export function parseToml(text: string): TomlTable {
  const out: TomlTable = {};
  let section = "";
  for (const rawLine of text.split("\n")) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const sec = line.match(/^\[([A-Za-z0-9_.-]+)\]$/);
    if (sec) {
      section = sec[1];
      out[section] ??= {};
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+)\s*=\s*(.+)$/);
    if (!kv) continue;
    const key = kv[1];
    const raw = kv[2].trim();
    let value: TomlValue;
    if (raw === "true") value = true;
    else if (raw === "false") value = false;
    else if (/^-?\d+(\.\d+)?$/.test(raw)) value = Number(raw);
    else value = raw.replace(/^["']|["']$/g, "");
    (out[section] ??= {})[key] = value;
  }
  return out;
}

function numOr(v: TomlValue | undefined, dflt: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : dflt;
}
function boolOr(v: TomlValue | undefined, dflt: boolean): boolean {
  return typeof v === "boolean" ? v : dflt;
}

export function coerceConfig(table: TomlTable): LimitsConfig {
  const l = table.limits ?? {};
  const a = table.anomalies ?? {};
  const d = DEFAULT_LIMITS_CONFIG;
  return {
    limits: {
      max_workflow_cost_usd: numOr(l.max_workflow_cost_usd, d.limits.max_workflow_cost_usd),
      max_session_cost_usd: numOr(l.max_session_cost_usd, d.limits.max_session_cost_usd),
      max_t3_calls_per_5min: numOr(l.max_t3_calls_per_5min, d.limits.max_t3_calls_per_5min),
      max_concurrent_workflows: numOr(l.max_concurrent_workflows, d.limits.max_concurrent_workflows),
    },
    anomalies: {
      detect_unusual_spend: boolOr(a.detect_unusual_spend, d.anomalies.detect_unusual_spend),
      detect_lora_regression: boolOr(a.detect_lora_regression, d.anomalies.detect_lora_regression),
      detect_provider_outage: boolOr(a.detect_provider_outage, d.anomalies.detect_provider_outage),
    },
  };
}

export function limitsPath(): string {
  return mooterPath("limits.toml");
}

/** Load limits.toml, falling back to defaults (never throws). */
export function loadLimits(path: string = limitsPath()): LimitsConfig {
  if (!existsSync(path)) return DEFAULT_LIMITS_CONFIG;
  try {
    return coerceConfig(parseToml(readFileSync(path, "utf8")));
  } catch {
    return DEFAULT_LIMITS_CONFIG;
  }
}

/** Write the default limits.toml if absent. Returns true if it created the file. */
export function ensureDefaultLimits(path: string = limitsPath()): boolean {
  if (existsSync(path)) return false;
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, DEFAULT_LIMITS_TOML, "utf8");
  return true;
}
