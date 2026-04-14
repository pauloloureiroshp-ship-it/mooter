#!/usr/bin/env node
/**
 * frugal-mode.js — deprecated alias.
 *
 * The canonical implementation now lives in mooter-mode.js. This shim is
 * kept so legacy skills, scripts, hooks, and user muscle-memory continue
 * to work without change during the frugal → mooter transition window.
 *
 * Prefer: node mooter-mode.js <mode>
 */
require('./mooter-mode.js');
