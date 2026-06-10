// Observability config (Wave Mega 50-51 Phase 1.A) — ~/.mooter/observability.json
//
// Opt-in OTLP export of routing decisions. Disabled by default; nothing is
// ever sent anywhere until the user runs `mooter observability enable` AND
// `mooter observability export`. Pure node:fs — zero dependencies.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export interface ObservabilityConfig {
  enabled: boolean;
  otlp_endpoint: string;
  service_name: string;
}

export const DEFAULT_OTLP_ENDPOINT = "http://127.0.0.1:4318";
export const DEFAULT_SERVICE_NAME = "mooter-router";

export function defaultConfig(): ObservabilityConfig {
  return {
    enabled: false,
    otlp_endpoint: DEFAULT_OTLP_ENDPOINT,
    service_name: DEFAULT_SERVICE_NAME,
  };
}

export function configPath(home: string = homedir()): string {
  return join(home, ".mooter", "observability.json");
}

/** Read config, merging over defaults; corrupt/missing file → defaults. */
export function readConfig(home: string = homedir()): ObservabilityConfig {
  const base = defaultConfig();
  try {
    const raw = JSON.parse(readFileSync(configPath(home), "utf8")) as Record<string, unknown>;
    if (raw && typeof raw === "object") {
      if (typeof raw.enabled === "boolean") base.enabled = raw.enabled;
      if (typeof raw.otlp_endpoint === "string" && raw.otlp_endpoint.trim()) base.otlp_endpoint = raw.otlp_endpoint.trim();
      if (typeof raw.service_name === "string" && raw.service_name.trim()) base.service_name = raw.service_name.trim();
    }
  } catch {
    /* missing or corrupt → defaults */
  }
  return base;
}

export function writeConfig(cfg: ObservabilityConfig, home: string = homedir()): void {
  const path = configPath(home);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}
