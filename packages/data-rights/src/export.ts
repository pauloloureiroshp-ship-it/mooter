// Wave 32 (Phase NEW3) — `mooter data export`. Produces a portable JSON dump of
// the user's local Mooter data. Credentials/secrets are REDACTED (listed as
// present, value withheld) — they are auth material, not portable personal data,
// and exporting them would be a leak. The result must pass the privacy audit.

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { auditExport, type AuditViolation } from "./privacy-audit.ts";

/** Files whose VALUES must never be exported (credentials / HMAC secret). */
const REDACT = new Set([".telemetry_secret", "auth.json", "credentials.json"]);

/** Config/state files we DO export (parsed when JSON, raw text otherwise). */
const INCLUDE = [
  "preferences.json",
  "effort.json",
  "profile.json",
  "setup_profile.json",
  "consent.json",
  "limits.toml",
  "state.json",
  "dogfood.jsonl",
];

export interface ExportResult {
  json: string;
  audit: AuditViolation[];
  clean: boolean;
}

function mooterDir(home: string): string {
  return join(home, ".mooter");
}

function readMaybe(p: string): string | null {
  try {
    return readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function parseMaybe(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Build the export object + serialized JSON, audited. `home` and `knownSecrets`
 * are injectable so tests run against a fixture without touching the real home.
 */
export function buildExport(opts: { home?: string; knownSecrets?: string[] } = {}): ExportResult {
  // Same isolation contract as delete.ts: MOOTER_HOME wins over homedir(),
  // because on Windows homedir() ignores HOME and reads the real USERPROFILE.
  const dir = opts.home ? mooterDir(opts.home) : (process.env.MOOTER_HOME || mooterDir(homedir()));

  const data: Record<string, unknown> = {};
  for (const name of INCLUDE) {
    const text = readMaybe(join(dir, name));
    if (text !== null) data[name] = parseMaybe(text);
  }

  // Redacted inventory — prove the files exist without leaking their contents.
  const redacted: string[] = [];
  for (const name of REDACT) {
    if (existsSync(join(dir, name))) redacted.push(name);
  }

  // Pastor sub-directory (per-task state), if present — JSON only.
  const pastor: Record<string, unknown> = {};
  const pastorDir = join(dir, "pastor");
  try {
    if (statSync(pastorDir).isDirectory()) {
      for (const f of readdirSync(pastorDir)) {
        if (f.endsWith(".json")) {
          const t = readMaybe(join(pastorDir, f));
          if (t !== null) pastor[f] = parseMaybe(t);
        }
      }
    }
  } catch { /* no pastor dir */ }

  const out = {
    schema: "mooter-data-export/v1",
    generated_by: "mooter data export",
    note: "Your local Mooter data. Credentials and the telemetry secret are intentionally redacted.",
    config: data,
    pastor,
    redacted_present: redacted,
  };

  const json = JSON.stringify(out, null, 2);
  const audit = auditExport(json, opts.knownSecrets ?? []);
  return { json, audit, clean: audit.length === 0 };
}
