'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const vm = require('node:vm');

const { getLivePreviewSidebarHtml } = require('./lp-sidebar-view.js');

function scriptOf(html) {
  const match = html.match(/<script nonce="([^"]+)">([\s\S]*?)<\/script>/);
  assert.ok(match, 'a single nonce-bearing inline script exists');
  return { nonce: match[1], source: match[2] };
}

function bootSidebar(savedState) {
  const source = scriptOf(getLivePreviewSidebarHtml('runtime-token')).source;
  const posted = [];
  const persisted = [];
  const windowListeners = {};

  class FakeElement {
    constructor(id, options) {
      const opts = options || {};
      this.id = id || '';
      this.tagName = String(opts.tagName || 'div').toUpperCase();
      this.dataset = Object.assign({}, opts.dataset || {});
      this.attributes = Object.assign({}, opts.attributes || {});
      this.listeners = {};
      this.classes = new Set(String(opts.className || '').split(/\s+/).filter(Boolean));
      this.classList = {
        toggle: (name, on) => { if (on) this.classes.add(name); else this.classes.delete(name); },
      };
      this.innerHTML = '';
      this.textContent = '';
      this.className = opts.className || '';
      this.value = '';
      this.hidden = !!opts.hidden;
      this.disabled = false;
      this.tabIndex = opts.tabIndex == null ? 0 : opts.tabIndex;
      this.focused = false;
    }
    addEventListener(type, handler) { (this.listeners[type] || (this.listeners[type] = [])).push(handler); }
    dispatch(type, init) {
      const event = Object.assign({
        type,
        target: this,
        key: '',
        ctrlKey: false,
        metaKey: false,
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; },
      }, init || {});
      for (const handler of this.listeners[type] || []) handler(event);
      return event;
    }
    click() { return this.dispatch('click'); }
    focus() { this.focused = true; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) {
      if (name === 'data-tab') return this.dataset.tab || null;
      if (name === 'data-panel') return this.dataset.panel || null;
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    }
    hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
    closest(selector) {
      if (selector === 'button') return this.tagName === 'BUTTON' ? this : null;
      if (selector.includes('[role="tab"]') && this.dataset.tab) return this;
      return null;
    }
    querySelectorAll() { return []; }
  }

  const elements = new Map();
  function element(id, options) {
    if (!elements.has(id)) elements.set(id, new FakeElement(id, options));
    return elements.get(id);
  }
  const tabs = ['edit', 'security', 'publish', 'meo'].map((name, index) => element('tab-' + name, {
    tagName: 'button', dataset: { tab: name }, attributes: { role: 'tab', 'aria-selected': index === 0 ? 'true' : 'false' }, tabIndex: index === 0 ? 0 : -1,
  }));
  const panels = ['edit', 'security', 'publish', 'meo'].map((name, index) => element('panel-' + name, {
    dataset: { panel: name }, attributes: { role: 'tabpanel' }, hidden: index !== 0,
  }));
  const intents = ['edit', 'ask'].map((name) => new FakeElement('intent-' + name, { tagName: 'button', dataset: { intent: name } }));
  const modes = ['auto', 'local', 't1', 't2', 't3', 'fable'].map((name) => new FakeElement('mode-' + name, { tagName: 'button', dataset: { mode: name } }));
  const lenses = ['control', 'stream', 'sessions', 'day', 'model', 'fleet'].map((name) => new FakeElement('lens-' + name, { tagName: 'button', dataset: { meoLens: name } }));
  const tablist = new FakeElement('tabs', { attributes: { role: 'tablist' } });
  const documentListeners = {};
  const document = {
    getElementById(id) { return element(id, { tagName: /^(submit|cancel-|security-scan|publish-refresh)/.test(id) ? 'button' : 'div' }); },
    querySelector(selector) { return selector === '[role="tablist"]' ? tablist : null; },
    querySelectorAll(selector) {
      if (selector === '[role="tab"][data-tab]') return tabs;
      if (selector === '[role="tabpanel"][data-panel]') return panels;
      if (selector === '[data-intent]') return intents;
      if (selector === '[data-mode]') return modes;
      if (selector === '[data-meo-lens]') return lenses;
      return [];
    },
    addEventListener(type, handler) { (documentListeners[type] || (documentListeners[type] = [])).push(handler); },
  };
  const vscode = {
    postMessage(message) { posted.push(message); },
    getState() { return savedState || null; },
    setState(value) { persisted.push(JSON.parse(JSON.stringify(value))); },
  };
  const context = {
    acquireVsCodeApi() { return vscode; },
    document,
    window: { addEventListener(type, handler) { windowListeners[type] = handler; } },
    requestAnimationFrame(callback) { callback(); },
    URL,
    console,
  };
  vm.runInNewContext(source, context, { filename: 'lp-sidebar-runtime.js' });
  return {
    posted,
    persisted,
    elements,
    tabs,
    panels,
    modes,
    intents,
    tablist,
    click(button) {
      for (const handler of documentListeners.click || []) handler({ target: button });
    },
    fire(message) { windowListeners.message({ data: Object.assign({ __t: 'runtime-token' }, message) }); },
  };
}

test('returns a native prompt-first four-tab sidebar with fixed navigation and exactly one composer', () => {
  const html = getLivePreviewSidebarHtml('sidebar-secret');
  assert.strictEqual((html.match(/<textarea\b/g) || []).length, 1, 'one textarea is the only prompt composer');
  for (const tab of ['edit', 'security', 'publish', 'meo']) {
    assert.ok(html.includes('data-tab="' + tab + '"'), tab + ' tab is present');
    assert.ok(html.includes('data-panel="' + tab + '"'), tab + ' panel is present');
  }
  for (const label of ['Editar', 'Security', 'Publish', 'MEO']) assert.ok(html.includes('aria-label="' + label + '"'), label + ' keeps an accessible name when narrow rails hide its text');
  assert.ok(html.includes('data-intent="edit"') && html.includes('data-intent="ask"'), 'Edit and Ask share the same composer');
  for (const mode of ['auto', 'local', 't1', 't2', 't3', 'fable']) assert.ok(html.includes('data-mode="' + mode + '"'), mode + ' mode is explicit');
  assert.ok(html.includes('⚡ Haiku') && html.includes('🌟 @fable'), 'Haiku is restored and Fable is an explicit choice');
  assert.ok(html.includes('T5 · opt-in explícito; nunca escolhido pelo Auto'), 'the UI states the T5 invariant');
  assert.ok(html.includes('width: 100%; max-width: 100%') && html.includes('height: 100%; margin: 0; overflow: hidden'), 'the root delegates scrolling to the bounded main region');
  assert.ok(html.includes('main { flex: 1 1 auto') && html.includes('overflow-y: auto'), 'content scrolls beneath the fixed first row and tabs');
  assert.ok(html.includes('.badge[hidden] { display: none; }'), 'a zero-finding Security badge stays visually absent');
  assert.ok(html.includes('--moo-action: #c7386a;') && html.includes('background: var(--moo-action)'), 'pink action surfaces preserve AA contrast with white text');
  assert.ok(html.includes('#panel-edit { display: flex; flex-direction: column; min-height: 100%; }'), 'the Edit workspace fills the available rail height');
  assert.ok(html.includes('margin: auto -8px -8px'), 'a short thread still anchors the one composer to the bottom');
  assert.ok(html.includes('class="surface-switch"') && html.includes('🧭 Cockpit') && html.includes('⚡ Live Preview'), 'the two product surfaces have an explicit animated switch');
  assert.ok(html.includes('class="composer-dock"') && html.includes('class="composer-box"'), 'the element conversation ends in one prompt-first composer');
  assert.ok(html.includes('.submit-icon {') && html.includes('margin-left: auto;'), 'the submit action remains right-aligned when narrow rails hide helper copy');
  assert.ok(html.includes('id="model-summary"') && html.includes('🧭 Auto · Moo decide'), 'Auto is honest and does not fabricate the routed model');
  assert.ok(html.includes('@media (prefers-reduced-motion: reduce)'), 'motion respects the OS accessibility preference');
});

test('inline program parses and CSP nonce matches the script', () => {
  const html = getLivePreviewSidebarHtml('token-parse');
  const script = scriptOf(html);
  assert.ok(html.includes("script-src 'nonce-" + script.nonce + "'"), 'CSP authorises only this generated script nonce');
  assert.doesNotThrow(function () { new vm.Script(script.source, { filename: 'lp-sidebar-inline.js' }); });
});

test('token is embedded safely, checked inbound and attached to every outbound message', () => {
  const hostile = 'secret</script><script>alert(1)</script>&';
  const html = getLivePreviewSidebarHtml(hostile);
  const script = scriptOf(html).source;
  assert.ok(!html.includes('const SIDEBAR_TOKEN = "' + hostile), 'hostile token cannot break out of the script');
  assert.ok(script.includes('const SIDEBAR_TOKEN = "secret\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e\\u0026"'));
  assert.ok(script.includes('message.__t !== SIDEBAR_TOKEN'), 'host-to-view messages fail closed on the token');
  assert.ok(script.includes("Object.assign({}, payload || {}, { type: type, __t: SIDEBAR_TOKEN })"), 'the single outbound gateway adds an unoverrideable token');
  assert.strictEqual((script.match(/vscode\.postMessage\(/g) || []).length, 1, 'all commands go through the tokenised gateway');
});

test('state and all canonical runtime events are accepted', () => {
  const script = scriptOf(getLivePreviewSidebarHtml('events')).source;
  const events = [
    'lp-sidebar-state',
    'lp-sidebar-reveal',
    'lp-task-status', 'lp-task-result', 'lp-task-keep-result', 'lp-task-revert-result',
    'lp-edit-diff', 'lp-delete-diff', 'lp-edit-result',
    'lp-security-status', 'lp-security-result',
    'lp-publish-status-result', 'lp-publish-result',
    'lp-journey-update',
  ];
  for (const event of events) assert.ok(script.includes("message.type === '" + event + "'"), event + ' is handled');
  for (const key of ['active', 'selection', 'journey', 'taskStatus', 'taskResult', 'editDiff', 'deleteDiff', 'refs', 'security', 'securityResult', 'securityTaskStatus', 'securityTaskResult', 'publish', 'meo', 'readiness', 'stage']) {
    assert.match(script, new RegExp('\\b' + key + ': (?:false|null)'), key + ' belongs to the projected sidebar state');
  }
  assert.ok(script.includes("hasOwnProperty.call(projection, 'editDiff')") && script.includes('editDiff = object(projection.editDiff)'), 'an edit proposal survives view recreation');
  assert.ok(script.includes("hasOwnProperty.call(projection, 'deleteDiff')") && script.includes('deleteDiff = object(projection.deleteDiff)'), 'a delete proposal survives view recreation');
  assert.ok(script.includes("hasOwnProperty.call(projection, 'taskStatus')") && script.includes('restoreProjectedTasks('), 'task progress is reconstructed from host state');
  assert.ok(script.includes("hasOwnProperty.call(projection, 'securityResult')") && script.includes('securityResult = object(projection.securityResult)'), 'an explicit null clears obsolete scan findings');
});

test('tabs implement automatic roving focus with arrows, Home and End', () => {
  const html = getLivePreviewSidebarHtml('tabs');
  const script = scriptOf(html).source;
  assert.match(html, /id="tab-edit"[^>]+tabindex="0"/);
  for (const tab of ['security', 'publish', 'meo']) assert.match(html, new RegExp('id="tab-' + tab + '"[^>]+tabindex="-1"'));
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.ok(script.includes("event.key === '" + key + "'"), key + ' is handled');
  assert.ok(script.includes('setTab(tabs[nextIndex].dataset.tab, true)'));

  const view = bootSidebar({ activeTab: 'security', mode: 't3', drafts: {} });
  assert.strictEqual(view.tabs[1].getAttribute('aria-selected'), 'true', 'persisted tab is restored instead of forcing Edit');
  assert.strictEqual(view.tabs[1].tabIndex, 0);
  assert.ok(view.modes.find((item) => item.dataset.mode === 't3').classes.has('active'), 'persisted model mode is restored');
  const right = view.tablist.dispatch('keydown', { target: view.tabs[1], key: 'ArrowRight' });
  assert.strictEqual(right.defaultPrevented, true);
  assert.strictEqual(view.tabs[2].getAttribute('aria-selected'), 'true');
  assert.strictEqual(view.tabs[2].focused, true, 'selection and DOM focus move together');
  view.tablist.dispatch('keydown', { target: view.tabs[2], key: 'End' });
  assert.strictEqual(view.tabs[3].getAttribute('aria-selected'), 'true');
  view.tablist.dispatch('keydown', { target: view.tabs[3], key: 'Home' });
  assert.strictEqual(view.tabs[0].getAttribute('aria-selected'), 'true');
  view.tablist.dispatch('keydown', { target: view.tabs[0], key: 'ArrowLeft' });
  assert.strictEqual(view.tabs[3].getAttribute('aria-selected'), 'true', 'ArrowLeft wraps to the last tab');
});

test('Ask cannot promise local $0 while the host may route through an agent', () => {
  const view = bootSidebar({ activeTab: 'edit', mode: 'local', drafts: {} });
  const local = view.modes.find((item) => item.dataset.mode === 'local');
  const auto = view.modes.find((item) => item.dataset.mode === 'auto');
  assert.ok(local.classes.has('active'), 'local remains an explicit Edit choice');
  view.click(view.intents.find((item) => item.dataset.intent === 'ask'));
  assert.strictEqual(local.disabled, true, 'Ask disables the misleading local chip');
  assert.ok(auto.classes.has('active') && !local.classes.has('active'), 'Ask visibly moves local to Auto');
  assert.match(view.elements.get('submit-hint').textContent, /Auto\/agente.*local \$0.*Editar/);
  view.click(view.intents.find((item) => item.dataset.intent === 'edit'));
  assert.strictEqual(local.disabled, false, 'Edit restores the real local $0 path');
});

test('composer drafts are persisted per journey and never leak across nodes', () => {
  const view = bootSidebar({ activeTab: 'edit', mode: 'auto', drafts: {} });
  const composer = view.elements.get('instruction');
  const selection = { label: 'page.tsx:10 · <p>', tag: 'p', text: 'A' };
  view.fire({ type: 'lp-sidebar-state', state: { active: true, selection, journey: { id: 'journey-a', rev: 1 } } });
  composer.value = 'draft only for A';
  composer.dispatch('input');
  view.fire({ type: 'lp-journey-update', journey: { id: 'journey-a', rev: 2 } });
  assert.strictEqual(composer.value, 'draft only for A', 'same-journey updates and repins preserve the composer');

  view.fire({ type: 'lp-sidebar-state', state: { active: true, selection: Object.assign({}, selection, { text: 'B' }), journey: { id: 'journey-b', rev: 1 } } });
  assert.strictEqual(composer.value, '', 'a new node starts with an empty composer');
  composer.value = 'draft only for B';
  composer.dispatch('input');
  view.fire({ type: 'lp-sidebar-state', state: { active: true, selection, journey: { id: 'journey-a', rev: 3 } } });
  assert.strictEqual(composer.value, 'draft only for A', 'returning to A restores only A draft');
  const saved = view.persisted.at(-1);
  assert.strictEqual(saved.drafts['journey-a'], 'draft only for A');
  assert.strictEqual(saved.drafts['journey-b'], 'draft only for B');

  view.fire({ type: 'lp-sidebar-state', state: { active: false } });
  assert.strictEqual(composer.value, '', 'inactive/detached state cannot retain a stale node draft on screen');
});

test('task events stay in their journey and security remediation stays in Security', () => {
  const html = getLivePreviewSidebarHtml('tasks');
  assert.ok(html.includes('id="security-task-progress"') && html.includes('id="security-task-result"'));
  const view = bootSidebar();
  const selection = { label: 'page.tsx:10 · <p>', tag: 'p', text: 'A' };
  view.fire({ type: 'lp-sidebar-state', state: { active: true, selection, journey: { id: 'journey-a' }, taskStatus: null, taskResult: null, securityTaskStatus: null, securityTaskResult: null } });

  view.fire({ type: 'lp-task-status', journeyId: 'journey-b', phase: 'thinking', mode: 't2' });
  assert.strictEqual(view.elements.get('progress').className, 'progress', 'late B status is ignored while A is selected');
  view.fire({ type: 'lp-task-status', journeyId: 'journey-a', phase: 'thinking', mode: 't2' });
  assert.strictEqual(view.elements.get('progress').className, 'progress on');

  view.fire({ type: 'lp-task-status', context: 'security', phase: 'tool', tool: 'Edit' });
  assert.strictEqual(view.elements.get('progress').className, 'progress', 'security work never occupies the Edit progress slot');
  assert.strictEqual(view.elements.get('security-task-progress').className, 'progress on');
  view.fire({ type: 'lp-task-result', context: 'security', ok: true, taskId: 'security-1', text: 'corrigi o finding', edits: [{ diff: ['- unsafe', '+ safe'] }] });
  assert.ok(view.elements.get('security-task-result').innerHTML.includes('corrigi o finding'));
  assert.ok(view.elements.get('security-task-result').innerHTML.includes('data-task-keep="security-1"'));
  assert.ok(!view.elements.get('edit-result').innerHTML.includes('corrigi o finding'));

  view.fire({ type: 'lp-task-result', journeyId: 'journey-b', ok: true, taskId: 'b', text: 'late B', edits: [] });
  assert.ok(!view.elements.get('edit-result').innerHTML.includes('late B'));
  view.fire({ type: 'lp-task-result', journeyId: 'journey-a', ok: true, taskId: 'a', text: 'answer A', edits: [] });
  assert.ok(view.elements.get('edit-result').innerHTML.includes('answer A'));

  view.fire({ type: 'lp-sidebar-state', state: { active: true, selection, journey: { id: 'journey-a' }, taskStatus: null, securityTaskStatus: { context: 'security', phase: 'thinking', mode: 't3' }, securityTaskResult: { context: 'security', ok: true, taskId: 'security-2', text: 'restored after recreate', edits: [] } } });
  assert.strictEqual(view.elements.get('security-task-progress').className, 'progress on', 'host-projected security progress is reconstructed');
  assert.ok(view.elements.get('security-task-result').innerHTML.includes('restored after recreate'));
  view.fire({ type: 'lp-sidebar-state', state: { active: false } });
  assert.strictEqual(view.elements.get('security-task-progress').className, 'progress');
  assert.strictEqual(view.elements.get('security-task-result').innerHTML, '', 'detaching cannot retain a stale remediation');
});

test('an explicit null securityResult removes findings from the prior scan', () => {
  const view = bootSidebar();
  const selection = { label: 'page.tsx:10 · <p>', tag: 'p', text: 'A' };
  view.fire({ type: 'lp-sidebar-state', state: { active: true, selection, journey: { id: 'journey-a' } } });
  view.fire({
    type: 'lp-security-result',
    counts: { critical: 1, warning: 0, info: 0, total: 1 },
    secrets: [{ severity: 'critical', type: 'UNIQUE_OLD_FINDING', path: 'page.tsx', line: 1, preview: '[redacted]' }],
    audit: { ok: false, reason: 'offline' },
    coverage: { complete: true },
  });
  assert.ok(view.elements.get('security-result').innerHTML.includes('UNIQUE_OLD_FINDING'));
  view.fire({ type: 'lp-sidebar-state', state: { active: true, selection, journey: { id: 'journey-a' }, securityResult: null } });
  assert.ok(!view.elements.get('security-result').innerHTML.includes('UNIQUE_OLD_FINDING'));
  assert.ok(view.elements.get('security-result').innerHTML.includes('sem dados — corre o scan'));
});

test('emits intent-only composer contract and never emits canvas or source identity', () => {
  const html = getLivePreviewSidebarHtml('boundary');
  const script = scriptOf(html).source;
  assert.ok(script.includes("post('lp-sidebar-open')"));
  assert.ok(script.includes("post('lp-sidebar-open-cockpit')"), 'surface navigation uses its own payload-free bridge');
  assert.ok(script.includes("post('lp-sidebar-submit', { intent: intent, instruction: instruction, mode: mode })"));
  assert.ok(!html.includes('lp-' + 'pin'), 'the sidebar never claims or refreshes canvas identity');
  assert.ok(!html.includes('lp-' + 'tree'), 'the sidebar never reports a served tree');
  const submit = script.match(/post\('lp-sidebar-submit',[^;]+;/);
  assert.ok(submit, 'submit command exists');
  assert.ok(!/\b(file|path|line|col|tag|lease|epoch)\s*:/.test(submit[0]), 'submit carries no source identity');
  assert.ok(!/\brefs\s*:/.test(submit[0]), 'submit cannot forge reference context');
});

test('reference projection renders only host-issued labels/count and never emits reference identity', () => {
  const html = getLivePreviewSidebarHtml('refs');
  const script = scriptOf(html).source;
  assert.ok(html.includes('id="selection-refs"') && html.includes('contexto revalidado pelo host'), 'the native sidebar has an honest read-only reference summary');
  assert.ok(script.includes('const projection = object(state.refs) || {}'));
  assert.ok(script.includes('projection.count') && script.includes('projection.labels'));
  assert.ok(script.includes("esc(label)"), 'host labels are still escaped before rendering');
  assert.ok(!script.includes("post('lp-refs-sync'"), 'only the editor panel can synchronize source references');
});

test('security, publish and approval controls use canonical host actions', () => {
  const html = getLivePreviewSidebarHtml('actions');
  const script = scriptOf(html).source;
  const actions = [
    'lp-task-keep', 'lp-task-revert', 'lp-task-cancel', 'lp-ask-apply',
    'lp-security-scan', 'lp-security-open', 'lp-security-fix',
    'lp-publish-status', 'lp-publish-commit', 'lp-publish-deploy', 'lp-open-external',
  ];
  for (const action of actions) assert.ok(script.includes("post('" + action + "'"), action + ' is wired');
  assert.ok(script.includes('Security Review completo, atual e sem Critical aberto'), 'publish explains its fail-closed security gate');
  assert.ok(script.includes('Confirma o projeto para publicar esse commit imutável, nunca o working tree.'), 'deploy confirmation names the immutable source');
  assert.ok(script.includes("button.dataset.deployReady !== 'true'") && script.includes('input.value.trim() !== expected'), 'deploy stays disabled until the exact host-projected project name is typed');
  assert.ok(html.includes('aria-describedby="deploy-confirm-hint"') && html.includes('data-deploy-ready="'), 'the two-factor deploy gate is visible and screen-reader described');
  assert.ok(script.includes("reason === 'git-publish-required'") && script.includes('Faz Commit + push antes do deploy.'), 'deploy explains the immutable-commit prerequisite instead of exposing an inert button');
  assert.ok(script.includes("post('lp-publish-commit', { message:"), 'commit asks the host to use its approved snapshot');
  assert.ok(!script.includes("post('lp-publish-commit', { files:"), 'the sidebar never round-trips file identity');
  assert.ok(script.includes("projectName: document.getElementById('deploy-confirm').value.trim(), vercelIdentityKey:"), 'deploy sends the host-issued destination lease');
  assert.ok(script.includes('renderSecurityFindings(result, esc)'), 'security keeps the canonical report and thread renderer');
});

test('progressive quick adjustments reuse presets and keep one safe write boundary', () => {
  const html = getLivePreviewSidebarHtml('quick');
  const script = scriptOf(html).source;
  assert.ok(html.includes('<summary>✦ Texto · Cor · Espaço</summary>'), 'advanced controls are progressively disclosed inside the composer');
  assert.ok(script.includes('function renderPresetsBarHTML(') && script.includes('renderPresetsBarHTML(esc)'), 'the canonical preset renderer is serialised and reused');
  for (const marker of ['data-group="text-color"', 'data-group="bg-color"', 'data-group="text-size"', 'data-group="pad"']) {
    assert.ok(script.includes(marker), marker + ' is supplied by the canonical catalog');
  }
  assert.ok(script.includes("post('lp-sidebar-preset', { cls: cls, group: group })"), 'preset emits only class and group');
  assert.ok(script.includes("post('lp-sidebar-preview-edit', { kind: kind, value: input.value })"), 'text/class controls request a host-owned preview');
  assert.ok(html.includes('data-preview-kind="text"') && html.includes('data-preview-kind="class"'), 'both quick proposal inputs are wired');
  assert.strictEqual((html.match(/<textarea\b/g) || []).length, 1, 'quick adjustments do not create a second composer');
});

test('proposal confirmations and source actions are payload-free and raw mutation actions are absent', () => {
  const script = scriptOf(getLivePreviewSidebarHtml('proposal-boundary')).source;
  for (const action of ['lp-open-source', 'lp-sidebar-delete-preview', 'lp-sidebar-edit-apply', 'lp-sidebar-delete-apply', 'lp-sidebar-proposal-dismiss']) {
    assert.ok(script.includes("post('" + action + "');"), action + ' is an intent-only action');
  }
  assert.ok(!script.includes("post('lp-edit'"), 'the sidebar never invokes the raw edit mutation');
  assert.ok(!script.includes("post('lp-delete'"), 'the sidebar never invokes the raw delete mutation');
  assert.ok(script.includes('diffLines(proposal.removed)') && script.includes('diffLines(proposal.added)'), 'canonical removed/added host diffs remain visible');
  assert.ok(script.includes("text(local.path, text(local.folder"), 'Publish shows the exact local folder path, not only its basename');
  const posts = script.match(/post\([^;]+;/g) || [];
  for (const call of posts) {
    assert.ok(!/\b(file|files|path|line|col|tag|lease|epoch)\s*:/.test(call), 'no outbound call carries source identity: ' + call);
  }
});

test('contextual skills depend only on the selected tag and seed the existing composer/model', () => {
  const script = scriptOf(getLivePreviewSidebarHtml('skills')).source;
  const fn = script.slice(script.indexOf('function contextualSkills('), script.indexOf('function renderContextSkills('));
  assert.ok(fn.includes('selection && selection.tag'), 'tag is the sole selection signal');
  for (const forbidden of ['selection.text', 'selection.label', 'selection.summary', 'selection.file', 'selection.path']) {
    assert.ok(!fn.includes(forbidden), forbidden + ' is not consulted');
  }
  for (const skill of ['/icon', '/copy', '/restyle', '/a11y', '/section']) assert.ok(fn.includes(skill), skill + ' can be suggested');
  assert.ok(script.includes("composer.value = button.dataset.skillSeed"), 'a suggestion reuses the only textarea');
  assert.ok(script.includes("selectMode(button.dataset.skillMode || 'auto')"), 'the suggestion seeds an explicit model mode');
});

test('MEO exposes executive summary and every requested lens', () => {
  const html = getLivePreviewSidebarHtml('meo');
  for (const lens of ['control', 'stream', 'sessions', 'day', 'model', 'fleet']) {
    assert.ok(html.includes('data-meo-lens="' + lens + '"'), lens + ' lens is present');
  }
  for (const renderer of ['renderBrain', 'renderExecutiveOverview', 'renderExecutiveTimeline', 'renderSessionBreakdown', 'renderDayBreakdown', 'renderModelBreakdown', 'renderFleetLanes']) {
    assert.ok(html.includes(renderer + '('), renderer + ' is used');
  }
});
