'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { LivePreviewSidebarProvider } = require('./lp-sidebar-provider.js');

function harness(panel) {
  const posted = [];
  const commands = [];
  let receive = null;
  let visibility = null;
  const disposable = () => ({ dispose() {} });
  const view = {
    visible: true,
    webview: {
      options: null,
      html: '',
      postMessage(message) { posted.push(message); return Promise.resolve(true); },
      onDidReceiveMessage(fn) { receive = fn; return disposable(); },
    },
    onDidChangeVisibility(fn) { visibility = fn; return disposable(); },
    onDidDispose() { return disposable(); },
  };
  const vscode = { commands: { async executeCommand() { commands.push(Array.from(arguments)); } } };
  let openCalls = 0;
  const provider = new LivePreviewSidebarProvider(vscode, {
    getHtml: (token) => '<html data-token="' + token + '"></html>',
    getPanel: () => panel,
    openPanel: async () => { openCalls += 1; return panel; },
  });
  provider.resolveWebviewView(view);
  return { provider, view, posted, commands, openCalls: () => openCalls, receive: (m) => receive(m), visibility: () => visibility() };
}

test('native sidebar is a projection of the one LivePreviewPanel controller', () => {
  const panel = { _sidebarState: () => ({ active: true, selection: { tag: 'p' } }) };
  const h = harness(panel);
  try {
    assert.deepStrictEqual(h.view.webview.options, { enableScripts: true });
    const state = h.posted.find((m) => m.type === 'lp-sidebar-state' && m.state.active);
    assert.ok(state && state.state.selection.tag === 'p');
    assert.strictEqual(state.__t, h.provider.token, 'every host message is authenticated for this view');
  } finally { h.provider.dispose(); }
});

test('provider strips reference identity and forwards only sanitized labels/count', () => {
  const panel = { _sidebarState: () => ({
    active: true,
    refs: {
      count: 2,
      labels: ['  Hero\u0000 title  ', 'Card summary'],
      files: ['secret/page.tsx'],
      path: 'C:/secret',
    },
  }) };
  const h = harness(panel);
  try {
    const message = h.posted.find((row) => row.type === 'lp-sidebar-state' && row.state.active);
    assert.deepStrictEqual(message.state.refs, { count: 2, labels: ['Hero title', 'Card summary'] });
    assert.ok(!JSON.stringify(message.state.refs).includes('secret'), 'no source path crosses the provider boundary');
  } finally { h.provider.dispose(); }
});

test('forged sidebar messages are ignored; authenticated intents reach the existing controller', async () => {
  const seen = [];
  const panel = {
    _sidebarState: () => ({ active: true }),
    _onSidebarMessage: (m) => seen.push(m),
  };
  const h = harness(panel);
  try {
    await h.receive({ type: 'lp-sidebar-submit', instruction: 'x', __t: 'forged' });
    assert.strictEqual(seen.length, 0, 'a page cannot forge a sidebar intent');
    await h.receive({ type: 'lp-sidebar-submit', instruction: 'x', __t: h.provider.token });
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].instruction, 'x');
  } finally { h.provider.dispose(); }
});

test('authenticated Cockpit navigation bypasses the Live Preview mutation controller', async () => {
  const seen = [];
  const panel = {
    _sidebarState: () => ({ active: true }),
    _onSidebarMessage: (message) => seen.push(message),
  };
  const h = harness(panel);
  try {
    await h.receive({ type: 'lp-sidebar-open-cockpit', __t: 'forged' });
    assert.ok(!h.commands.some((args) => args[0] === 'mooter.openCockpit'), 'forged navigation is ignored');
    await h.receive({ type: 'lp-sidebar-open-cockpit', file: 'evil.tsx', __t: h.provider.token });
    assert.ok(h.commands.some((args) => args[0] === 'mooter.openCockpit'), 'the authenticated bridge opens Cockpit');
    assert.deepStrictEqual(seen, [], 'surface navigation never reaches the selection/write controller');
  } finally { h.provider.dispose(); }
});

test('webview recreation attaches and syncs without forcing the persisted tab back to Edit', async () => {
  const panel = { _sidebarState: () => ({ active: true, selection: { tag: 'p' } }) };
  const h = harness(panel);
  try {
    h.posted.length = 0;
    await h.receive({ type: 'lp-sidebar-open', __t: h.provider.token });
    assert.ok(h.posted.some((message) => message.type === 'lp-sidebar-state' && message.state.active));
    assert.ok(!h.posted.some((message) => message.type === 'lp-sidebar-reveal'), 'getState owns boot tab restoration');
    assert.strictEqual(h.openCalls(), 0, 'an existing controller is reused without re-revealing the editor panel');
  } finally { h.provider.dispose(); }
});

test('reveal focuses the contributed view and asks for composer focus once', async () => {
  const panel = { _sidebarState: () => ({ active: true }) };
  const h = harness(panel);
  try {
    await h.provider.reveal('edit', true);
    assert.ok(h.commands.some((args) => args[0] === 'mooterLivePreviewSidebar.focus'));
    assert.ok(h.commands.some((args) => args[0] === 'setContext' && args[1] === 'mooter.livePreviewMode' && args[2] === true));
    const message = h.posted.find((m) => m.type === 'lp-sidebar-reveal');
    assert.ok(message && message.tab === 'edit' && message.focusComposer === true);
  } finally { h.provider.dispose(); }
});

test('a superseded view cannot clear the replacement view or stop its timer', () => {
  const panel = { _sidebarState: () => ({ active: true }) };
  const provider = new LivePreviewSidebarProvider(
    { commands: { async executeCommand() {} } },
    {
      getHtml: () => '<html></html>',
      getPanel: () => panel,
      openPanel: async () => panel,
    },
  );

  function lifecycleView() {
    const callbacks = {};
    const disposed = { receive: 0, visibility: 0, view: 0 };
    function subscription(kind, fn) {
      callbacks[kind] = fn;
      return { dispose() { disposed[kind] += 1; } };
    }
    const view = {
      visible: true,
      webview: {
        postMessage() { return Promise.resolve(true); },
        onDidReceiveMessage(fn) { return subscription('receive', fn); },
      },
      onDidChangeVisibility(fn) { return subscription('visibility', fn); },
      onDidDispose(fn) { return subscription('view', fn); },
    };
    return { view, callbacks, disposed };
  }

  const first = lifecycleView();
  const second = lifecycleView();
  try {
    provider.resolveWebviewView(first.view);
    const lateFirstDispose = first.callbacks.view;
    provider.resolveWebviewView(second.view);

    assert.deepStrictEqual(first.disposed, { receive: 1, visibility: 1, view: 1 }, 'superseded subscriptions are released per view');
    assert.strictEqual(provider._view, second.view);
    assert.ok(provider._timer, 'the replacement owns the live shared timer');

    lateFirstDispose();
    assert.strictEqual(provider._view, second.view, 'a queued old dispose cannot clear the replacement');
    assert.ok(provider._timer, 'a queued old dispose cannot stop the replacement timer');

    second.callbacks.view();
    assert.strictEqual(provider._view, null, 'disposing the current view still clears it');
    assert.strictEqual(provider._timer, null, 'disposing the current view still stops its timer');
    assert.deepStrictEqual(second.disposed, { receive: 1, visibility: 1, view: 1 });
  } finally {
    provider.dispose();
  }
});
