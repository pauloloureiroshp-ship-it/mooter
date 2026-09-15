'use strict';

/** VS-W1 seam: call runWithReceipt({ vscode, terminal or terminalOptions }, command).
 * It measures the full call through Terminal shell integration and reports the real end event.
 * If integration is unavailable after ~3s it uses sendText and returns an explicit n/d receipt. */

const DEFAULT_SHELL_INTEGRATION_TIMEOUT_MS = 3000;
const NO_INTEGRATION_RECEIPT = 'n/d — shell integration indisponível';
const UNKNOWN_EXIT_RECEIPT = 'n/d — shell integration não reportou exit code';

function durationSince(startedAt, now) {
  const elapsed = Number(now()) - Number(startedAt);
  return Number.isFinite(elapsed) ? Math.max(0, Math.round(elapsed)) : 0;
}

function waitForShellIntegration(vscode, terminal, timeoutMs, timers) {
  if (terminal.shellIntegration) return Promise.resolve(terminal.shellIntegration);
  return new Promise((resolve) => {
    let settled = false;
    let timeout = null;
    let listener = null;
    const finish = (integration) => {
      if (settled) return;
      settled = true;
      if (timeout !== null) timers.clearTimeout(timeout);
      if (listener && typeof listener.dispose === 'function') listener.dispose();
      resolve(integration || null);
    };

    if (vscode.window && typeof vscode.window.onDidChangeTerminalShellIntegration === 'function') {
      listener = vscode.window.onDidChangeTerminalShellIntegration((event) => {
        if (event && event.terminal === terminal) finish(event.shellIntegration);
      });
    }
    timeout = timers.setTimeout(() => finish(null), timeoutMs);
  });
}

async function readExecutionOutput(execution) {
  if (!execution || typeof execution.read !== 'function') return undefined;
  try {
    let output = '';
    for await (const chunk of execution.read()) output += String(chunk);
    return output;
  } catch {
    return undefined;
  }
}

async function runWithReceipt(terminalOpts, cmd) {
  const opts = terminalOpts || {};
  const vscode = opts.vscode || require('vscode');
  const terminal = opts.terminal || vscode.window.createTerminal(opts.terminalOptions || {});
  const now = typeof opts.now === 'function' ? opts.now : Date.now;
  const timers = {
    setTimeout: opts.setTimeout || setTimeout,
    clearTimeout: opts.clearTimeout || clearTimeout,
  };
  const configuredTimeout = Number(opts.shellIntegrationTimeoutMs);
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(0, configuredTimeout)
    : DEFAULT_SHELL_INTEGRATION_TIMEOUT_MS;
  const startedAt = now();
  const integration = await waitForShellIntegration(vscode, terminal, timeoutMs, timers);

  if (!integration) {
    terminal.sendText(String(cmd), true);
    return {
      exitCode: null,
      durationMs: durationSince(startedAt, now),
      receipt: NO_INTEGRATION_RECEIPT,
    };
  }

  return new Promise((resolve, reject) => {
    let execution = null;
    let outputPromise = Promise.resolve(undefined);
    let listener = null;
    const dispose = () => {
      if (listener && typeof listener.dispose === 'function') listener.dispose();
    };

    try {
      listener = vscode.window.onDidEndTerminalShellExecution(async (event) => {
        if (!execution || !event || event.terminal !== terminal || event.execution !== execution) return;
        dispose();
        const output = await outputPromise;
        const result = {
          exitCode: Number.isInteger(event.exitCode) ? event.exitCode : null,
          durationMs: durationSince(startedAt, now),
        };
        if (typeof output === 'string') result.output = output;
        if (result.exitCode === null) result.receipt = UNKNOWN_EXIT_RECEIPT;
        resolve(result);
      });
      execution = integration.executeCommand(String(cmd));
      outputPromise = readExecutionOutput(execution);
    } catch (error) {
      dispose();
      reject(error);
    }
  });
}

module.exports = {
  DEFAULT_SHELL_INTEGRATION_TIMEOUT_MS,
  NO_INTEGRATION_RECEIPT,
  UNKNOWN_EXIT_RECEIPT,
  durationSince,
  waitForShellIntegration,
  readExecutionOutput,
  runWithReceipt,
};
