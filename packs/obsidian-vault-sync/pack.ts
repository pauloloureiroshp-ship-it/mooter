// Obsidian vault-sync — pack lifecycle (Wave 31). Bidirectional bridge between the
// Pastor and the user's Obsidian vault:
//   write: Pastor learnings → <vault>/Mooter/learnings-YYYY-MM-DD.md
//   read:  <vault>/Mooter/preferences.md → Pastor priors (~/.mooter/pastor/vault-priors.json)
//
// install/uninstall are NON-DESTRUCTIVE: install seeds <vault>/Mooter/ with a README +
// a starter preferences.md; uninstall never deletes the user's notes.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { detectVaults, primaryVault, type DetectedVault } from "./vault-detector.ts";
import { writeLearnings, type WriteResult } from "./sync-write.ts";
import { readPreferences, type ReadResult } from "./sync-read.ts";

const STARTER_PREFERENCES = `---
tags: [mooter, preferences]
---

# Mooter preferences

Edit the lines below to steer Mooter from your vault. Mooter reads this on \`mooter pack sync\`.

- preferred_lang: pt
- autoswap: false
# - prefer_adapter: coding-frontend
# - avoid_adapter: prose-en
`;

const README = `# Mooter

This folder is managed by the **obsidian-vault-sync** Mooter pack.

- \`learnings-*.md\` — Pastor routing learnings, written by Mooter (features only, no prompts).
- \`preferences.md\` — your priors; edit it to steer Mooter, then run \`mooter pack sync\`.

Nothing here is uploaded anywhere. The bridge is local-only.
`;

export interface InstallResult {
  ok: boolean;
  vault?: string;
  created: string[];
  reason?: string;
}

/** Seed <vault>/Mooter/ with a README + starter preferences (idempotent). */
export function install(vault: DetectedVault | null = primaryVault()): InstallResult {
  if (!vault) {
    return { ok: false, created: [], reason: "no Obsidian vault detected (set MOOTER_VAULT to override)" };
  }
  const dir = join(vault.path, "Mooter");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const created: string[] = [];
  const readme = join(dir, "README.md");
  if (!existsSync(readme)) {
    writeFileSync(readme, README, "utf8");
    created.push(readme);
  }
  const prefs = join(dir, "preferences.md");
  if (!existsSync(prefs)) {
    writeFileSync(prefs, STARTER_PREFERENCES, "utf8");
    created.push(prefs);
  }
  return { ok: true, vault: vault.path, created };
}

export interface UninstallResult {
  ok: boolean;
  note: string;
}

/** Non-destructive: we never delete the user's vault notes. */
export function uninstall(): UninstallResult {
  return {
    ok: true,
    note: "uninstalled the pack; your vault's Mooter/ folder and notes were left intact (delete them manually if you wish)",
  };
}

export interface SyncResult {
  ok: boolean;
  vault?: string;
  write?: WriteResult;
  read?: ReadResult;
  reason?: string;
}

/**
 * Bidirectional sync: write today's learnings, then import preferences. `date` and
 * `vault` are injectable for tests. Returns a structured summary of both directions.
 */
export function sync(opts: { date: string; vault?: DetectedVault | null }): SyncResult {
  const vault = opts.vault ?? primaryVault();
  if (!vault) {
    return { ok: false, reason: "no Obsidian vault detected (set MOOTER_VAULT to override)" };
  }
  const write = writeLearnings(vault.path, opts.date);
  const read = readPreferences(vault.path);
  return { ok: write.ok, vault: vault.path, write, read };
}

export { detectVaults, primaryVault };
