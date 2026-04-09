/**
 * paths.ts — resolves frugal runtime file locations.
 *
 * Priority:
 *   1. FRUGAL_ROOT env var (overrides everything — used by .vscode/settings.json)
 *   2. ~/.claude/tools/router/ (standard install location)
 *
 * All API routes use this to locate decisions.log, router-tuning.json, etc.
 * No paths are sent to the client; the dashboard only receives parsed
 * structured data.
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

export function frugalRoot(): string {
  if (process.env.FRUGAL_ROOT) return process.env.FRUGAL_ROOT;
  return join(homedir(), '.claude', 'tools', 'router');
}

export function decisionsLogPath(): string {
  return join(frugalRoot(), 'decisions.log');
}

export function tuningPath(): string {
  return join(frugalRoot(), 'router-tuning.json');
}

export function classifyJsPath(): string {
  return join(frugalRoot(), 'classify.js');
}

export function updateRouterPath(): string {
  return join(frugalRoot(), 'update-router.js');
}

// The local savings-tracker HTTP server. Always 127.0.0.1:7821.
export const TRACKER_URL = 'http://127.0.0.1:7821';
