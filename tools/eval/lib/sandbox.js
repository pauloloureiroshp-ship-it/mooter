'use strict';
/**
 * sandbox.js — a CLEAN, isolated environment for one trial.
 *
 * "Each trial in a clean isolated environment" (Demystifying-evals). For every trial we make a fresh
 * OS temp dir and copy the frozen fixture into it. All writes the harness performs land ONLY inside
 * this dir, so a task can never leak into another task's state — and the tool_calls grader can prove
 * the write was path-constrained to the sandbox. Nothing here ever touches the real fixture or the
 * product tree.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const FIXTURES_DIR = path.resolve(__dirname, '..', 'golden', 'fixtures');

// Convert LF → CRLF for the byte-fidelity task (le-crlf-preserve). We synthesize CRLF at runtime
// rather than committing a CRLF file, because git autocrlf on Windows would normalize a committed
// fixture and silently defeat the very thing the task checks.
function toCRLF(s) {
  return s.replace(/\r\n/g, '\n').replace(/\n/g, '\r\n');
}

function createSandbox(task) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cca-eval-'));
  const src = path.join(FIXTURES_DIR, task.fixture);
  let content = fs.readFileSync(src, 'utf8');
  if (task.crlf) content = toCRLF(content);
  const filePath = path.join(root, task.fixture);
  fs.writeFileSync(filePath, content, 'utf8');
  return { root, filePath, before: content };
}

function readFinal(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function destroySandbox(sandbox) {
  try { fs.rmSync(sandbox.root, { recursive: true, force: true }); } catch { /* best effort */ }
}

module.exports = { createSandbox, readFinal, destroySandbox, FIXTURES_DIR, toCRLF };
