'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const receipts = require('./terminal-receipts.js');

function createHarness(options = {}) {
  const changeListeners = new Set();
  const endListeners = new Set();
  const sent = [];
  const terminal = {
    shellIntegration: options.integration || undefined,
    sendText(command, execute) { sent.push({ command, execute }); },
  };
  const disposable = (listeners, listener) => ({ dispose() { listeners.delete(listener); } });
  const vscode = {
    window: {
      createTerminal() { return terminal; },
      onDidChangeTerminalShellIntegration(listener) {
        changeListeners.add(listener);
        return disposable(changeListeners, listener);
      },
      onDidEndTerminalShellExecution(listener) {
        endListeners.add(listener);
        return disposable(endListeners, listener);
      },
    },
  };
  return {
    vscode,
    terminal,
    sent,
    changeListeners,
    endListeners,
    activate(integration) {
      terminal.shellIntegration = integration;
      for (const listener of [...changeListeners]) listener({ terminal, shellIntegration: integration });
    },
    end(execution, exitCode) {
      for (const listener of [...endListeners]) listener({ terminal, execution, exitCode });
    },
  };
}

function executionWithOutput(...chunks) {
  return {
    async *read() {
      for (const chunk of chunks) yield chunk;
    },
  };
}

test('runWithReceipt returns the real successful exit code, duration and output', async () => {
  const execution = executionWithOutput('hello', '\n');
  const harness = createHarness({
    integration: {
      executeCommand(command) {
        assert.strictEqual(command, 'printf hello');
        queueMicrotask(() => harness.end(execution, 0));
        return execution;
      },
    },
  });
  const clock = [100, 145];
  const result = await receipts.runWithReceipt({
    vscode: harness.vscode,
    terminal: harness.terminal,
    now: () => clock.shift(),
  }, 'printf hello');
  assert.deepStrictEqual(result, { exitCode: 0, durationMs: 45, output: 'hello\n' });
  assert.strictEqual(harness.endListeners.size, 0, 'end listener is disposed');
});

test('runWithReceipt preserves a real non-zero exit code', async () => {
  const execution = executionWithOutput('failed\n');
  const harness = createHarness({
    integration: {
      executeCommand() {
        queueMicrotask(() => harness.end(execution, 7));
        return execution;
      },
    },
  });
  const result = await receipts.runWithReceipt({
    vscode: harness.vscode,
    terminal: harness.terminal,
  }, 'false');
  assert.strictEqual(result.exitCode, 7);
  assert.strictEqual(result.output, 'failed\n');
  assert.ok(result.durationMs >= 0);
  assert.ok(!('receipt' in result), 'a measured failure is not degraded to n/d');
});

test('runWithReceipt waits for shell integration activation before the timeout', async () => {
  const execution = executionWithOutput();
  const integration = {
    executeCommand(command) {
      assert.strictEqual(command, 'echo ready');
      queueMicrotask(() => harness.end(execution, 0));
      return execution;
    },
  };
  const harness = createHarness();
  const pending = receipts.runWithReceipt({
    vscode: harness.vscode,
    terminal: harness.terminal,
    shellIntegrationTimeoutMs: 50,
  }, 'echo ready');
  setTimeout(() => harness.activate(integration), 2);
  const result = await pending;
  assert.strictEqual(result.exitCode, 0);
  assert.deepStrictEqual(harness.sent, [], 'sendText fallback was not used');
  assert.strictEqual(harness.changeListeners.size, 0, 'activation listener is disposed');
});

test('shell integration timeout disposes its listener and uses sendText once', async () => {
  const harness = createHarness();
  const result = await receipts.runWithReceipt({
    vscode: harness.vscode,
    terminal: harness.terminal,
    shellIntegrationTimeoutMs: 5,
  }, 'npm test');
  assert.deepStrictEqual(harness.sent, [{ command: 'npm test', execute: true }]);
  assert.strictEqual(harness.changeListeners.size, 0, 'timeout listener is disposed');
  assert.strictEqual(result.exitCode, null);
});

test('sendText fallback returns the exact n/d receipt and never invents an exit code', async () => {
  const harness = createHarness();
  const result = await receipts.runWithReceipt({
    vscode: harness.vscode,
    terminal: harness.terminal,
    shellIntegrationTimeoutMs: 0,
  }, 'npm test');
  assert.deepStrictEqual(result, {
    exitCode: null,
    durationMs: result.durationMs,
    receipt: 'n/d — shell integration indisponível',
  });
  assert.ok(result.durationMs >= 0);
});
