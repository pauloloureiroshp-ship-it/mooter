#!/usr/bin/env node
// exec-hidden.mjs — the ONLY sanctioned way to run an external binary from fleet
// code (flicker fix, 2026-07-10). On Windows, a child spawned from a windowless
// parent (pm2 fork, wscript task) WITHOUT windowsHide opens a visible console
// window that steals focus. Every one-shot spawn in _handoff/fleet goes through
// here so the invariant lives in one place.
//
//   spawnHiddenSync(file, args)  — direct binary, NO shell (preferred).
//   execHiddenSync(command,args) — shell-mediated (cmd shims like pm2.cmd on
//                                  Windows require it since Node's CVE-2024-27980
//                                  fix refuses .cmd/.bat without shell). The
//                                  hidden flag keeps even the shell windowless.

"use strict";

import { spawnSync } from "node:child_process";

const BASE = { encoding: "utf8", windowsHide: true };

/** Run a real binary directly (no shell). Returns the spawnSync result. */
export function spawnHiddenSync(file, args = [], opts = {}) {
  return spawnSync(file, args, { ...BASE, ...opts, windowsHide: true });
}

/** Run a command through the shell (needed for npm/pm2 .cmd shims on Windows). */
export function execHiddenSync(command, args = [], opts = {}) {
  return spawnSync(command, args, { ...BASE, shell: true, ...opts, windowsHide: true });
}
