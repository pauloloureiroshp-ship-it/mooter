#!/usr/bin/env node
/**
 * frugal-turn-header.js — deprecated alias (Kill Frugal, 2026-06-11).
 *
 * The canonical implementation now lives in mooter-turn-header.js. This shim keeps
 * legacy hooks, scripts and muscle-memory working during the transition
 * window. It will be removed two releases after v1.36.
 *
 * Prefer: node mooter-turn-header.js
 */
require('./mooter-turn-header.js');
