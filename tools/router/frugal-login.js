#!/usr/bin/env node
/**
 * frugal-login.js — CLI login flow for frugal.
 *
 * Opens the browser to the frugal landing page with ?cli=1.
 * Starts a local HTTP server on 127.0.0.1:7822 to receive the OAuth callback.
 * Saves the access token to ~/.frugal/auth.token.
 *
 * Usage:
 *   node ~/.claude/tools/router/frugal-login.js
 *
 * The token is used by frugal-doctor --sync to associate CLI data with the
 * user's Supabase profile.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const PORT = 7822;
const TIMEOUT_MS = 120_000;
const LANDING_URL = 'https://landing-five-azure-16.vercel.app';
const FRUGAL_DIR = path.join(os.homedir(), '.frugal');
const TOKEN_PATH = path.join(FRUGAL_DIR, 'auth.token');

const C = {
  green: s => `\x1b[38;2;78;201;176m${s}\x1b[0m`,
  red:   s => `\x1b[38;2;244;71;71m${s}\x1b[0m`,
  dim:   s => `\x1b[2m${s}\x1b[0m`,
  bold:  s => `\x1b[1m${s}\x1b[0m`,
};

// Check if already logged in
if (fs.existsSync(TOKEN_PATH)) {
  const existing = fs.readFileSync(TOKEN_PATH, 'utf8').trim();
  if (existing.length > 20) {
    console.log(`  ${C.dim('Already logged in. Token at')} ${TOKEN_PATH}`);
    console.log(`  ${C.dim('Re-running to refresh...')}`);
    console.log('');
  }
}

// Open browser
function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      execSync(`start "" "${url}"`, { windowsHide: true });
    } else if (process.platform === 'darwin') {
      execSync(`open "${url}"`, { windowsHide: true });
    } else {
      execSync(`xdg-open "${url}"`, { windowsHide: true });
    }
  } catch {
    console.log(`  ${C.red('Could not open browser.')} Open manually:`);
    console.log(`  ${url}`);
  }
}

const SUCCESS_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>frugal connected</title>
<style>
  body { font-family: system-ui; display: flex; justify-content: center; align-items: center;
         height: 100vh; margin: 0; background: #0d1117; color: #c9d1d9; }
  .box { text-align: center; }
  .tick { font-size: 3em; color: #4ec9b0; }
  p { margin-top: 1rem; opacity: 0.7; }
</style>
</head>
<body>
<div class="box">
  <div class="tick">✓</div>
  <h2>frugal connected</h2>
  <p>You can close this window.</p>
</div>
</body>
</html>`;

// Start local server
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  if (url.pathname === '/callback') {
    const token = url.searchParams.get('token');

    if (!token) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing token parameter');
      return;
    }

    // Save token
    try {
      fs.mkdirSync(FRUGAL_DIR, { recursive: true });
      fs.writeFileSync(TOKEN_PATH, token, { mode: 0o600 });
    } catch (err) {
      console.error(`  ${C.red('Failed to save token:')} ${err.message}`);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Failed to save token');
      return;
    }

    // Respond to browser
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(SUCCESS_HTML);

    console.log(`  ${C.green('✓')} Logged in. Token saved to ${C.dim(TOKEN_PATH)}`);
    console.log(`  ${C.dim('Run frugal-doctor --sync to sync your setup to the dashboard.')}`);
    console.log('');

    // Cleanup
    clearTimeout(timeout);
    server.close();
    process.exit(0);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`  ${C.red('Port 7822 is already in use.')} Another frugal-login running?`);
  } else {
    console.error(`  ${C.red('Server error:')} ${err.message}`);
  }
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log(C.bold('  frugal login'));
  console.log('');
  console.log(`  Opening browser... waiting for login ${C.dim('(ctrl+c to cancel)')}`);
  console.log('');

  openBrowser(`${LANDING_URL}?cli=1`);
});

// Timeout
const timeout = setTimeout(() => {
  console.error(`  ${C.red('Timeout:')} no callback received after ${TIMEOUT_MS / 1000}s`);
  console.error(`  ${C.dim('Try again or log in manually at')} ${LANDING_URL}`);
  server.close();
  process.exit(1);
}, TIMEOUT_MS);
