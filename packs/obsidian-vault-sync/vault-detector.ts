// Obsidian vault detector (Wave 31). Finds the user's Obsidian vault(s) by scanning
// a bounded set of candidate roots for a directory containing `.obsidian/`. Works on
// native Linux/macOS AND WSL (where the real vault lives under /mnt/c/Users/*/Documents).
// Self-contained: node builtins only, so the pack stays decoupled + bundle-safe.

import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface DetectedVault {
  path: string;
  name: string;
  johnny_decimal: boolean; // Johnny-Decimal top-level structure (e.g. 00-core, 10-projects)
}

/** Candidate ROOT dirs whose immediate children we check for `.obsidian/`. */
export function candidateRoots(): string[] {
  const home = homedir();
  const roots = [
    join(home, "Documents"),
    home,
  ];
  // WSL: the Windows-side Documents folder(s).
  try {
    const winUsers = "/mnt/c/Users";
    if (existsSync(winUsers)) {
      for (const u of readdirSync(winUsers)) {
        roots.push(join(winUsers, u, "Documents"));
      }
    }
  } catch {
    /* not WSL / no access */
  }
  return roots;
}

function isJohnnyDecimal(dir: string): boolean {
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.some((e) => e.isDirectory() && /^\d0?-/.test(e.name));
  } catch {
    return false;
  }
}

function looksLikeVault(dir: string): boolean {
  return existsSync(join(dir, ".obsidian"));
}

/**
 * Detect Obsidian vaults. An explicit MOOTER_VAULT (if it has `.obsidian/`) is
 * returned first; then any vault found under the candidate roots, de-duplicated and
 * path-sorted for determinism.
 */
export function detectVaults(): DetectedVault[] {
  const found = new Map<string, DetectedVault>();

  const add = (path: string) => {
    if (found.has(path)) return;
    if (!looksLikeVault(path)) return;
    found.set(path, {
      path,
      name: path.split("/").filter(Boolean).pop() ?? path,
      johnny_decimal: isJohnnyDecimal(path),
    });
  };

  const explicit = process.env.MOOTER_VAULT;
  if (explicit && looksLikeVault(explicit)) add(explicit);

  for (const root of candidateRoots()) {
    try {
      if (!existsSync(root)) continue;
      for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const dir = join(root, entry.name);
        try {
          if (statSync(dir).isDirectory()) add(dir);
        } catch {
          /* skip unreadable */
        }
      }
    } catch {
      /* skip unreadable root */
    }
  }

  const explicitFirst = explicit && found.has(explicit) ? [found.get(explicit)!] : [];
  const rest = [...found.values()]
    .filter((v) => v.path !== explicit)
    .sort((a, b) => a.path.localeCompare(b.path));
  return [...explicitFirst, ...rest];
}

/** The primary vault to sync with (explicit env, else the first detected). Null if none. */
export function primaryVault(): DetectedVault | null {
  return detectVaults()[0] ?? null;
}
