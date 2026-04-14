#!/usr/bin/env node
/**
 * env.js — unified env var reader with backward-compat for frugal→mooter rebrand.
 *
 * Prefers MOOTER_* env vars, falls back to FRUGAL_* if not set.
 * Backward-compat window: 30 days from 2026-04-13.
 */

'use strict';

const DEFAULT_HUB_URL = 'https://mooter-hub.frugal-hub.workers.dev';
const DEFAULT_LANDING_URL = 'https://mooter.ai';

function getHubUrl() {
  return process.env.MOOTER_HUB_URL
      || process.env.FRUGAL_HUB_URL
      || DEFAULT_HUB_URL;
}

function getLandingUrl() {
  return process.env.MOOTER_LANDING_URL
      || process.env.FRUGAL_LANDING_URL
      || DEFAULT_LANDING_URL;
}

module.exports = { getHubUrl, getLandingUrl };
