'use strict';

const crypto = require('crypto');

// Native Activity Bar companion for Live Preview. It deliberately owns no selection,
// write, Security or Publish state: the existing LivePreviewPanel remains the only
// controller and this view is only a projection + an allowlisted intent surface.
class LivePreviewSidebarProvider {
  constructor(vscode, options) {
    this.vscode = vscode;
    this.options = options || {};
    this.token = 'lps' + crypto.randomBytes(24).toString('hex');
    this._view = null;
    this._viewBindings = new Map();
    this._attached = null;
    this._timer = null;
  }

  resolveWebviewView(view) {
    // VS Code may resolve a replacement document before the previous WebviewView's
    // dispose notification is delivered. Disconnect the superseded document now;
    // its late callback must never tear down the replacement view or shared timer.
    if (this._view && this._view !== view) this._disposeViewBindings(this._view);
    else if (this._viewBindings.has(view)) this._disposeViewBindings(view);
    this._view = view;
    view.webview.options = { enableScripts: true };
    view.webview.html = this.options.getHtml(this.token);

    const receive = view.webview.onDidReceiveMessage(async (message) => {
      if (!message || typeof message !== 'object' || message.__t !== this.token) return;
      if (message.type === 'lp-sidebar-open-cockpit') {
        // Surface navigation is intentionally handled before panel lookup. It never enters the
        // Live Preview controller, so this bridge cannot carry selection identity or mutation data.
        try { await this.vscode.commands.executeCommand('mooter.openCockpit'); } catch { /* best-effort */ }
        return;
      }
      if (message.type === 'lp-sidebar-open') {
        // A resolved/recreated native view normally already has the controller attached. Reusing
        // it avoids panel.reveal(), which would otherwise steal focus and make the preview appear
        // to close/reopen whenever VS Code rebuilt the sidebar document.
        let panel = this._attached || this.options.getPanel();
        if (!panel) panel = await this.options.openPanel();
        if (panel) this.attach(panel);
        // Booting/recreating the webview must not overwrite the tab and draft restored
        // by vscode.getState(). Explicit selection and focus commands still call reveal().
        this.sync(panel);
        return;
      }
      const panel = this._attached || this.options.getPanel();
      if (!panel) {
        this.post({ type: 'lp-sidebar-state', state: { active: false } });
        return;
      }
      if (message.type === 'lp-sidebar-refresh') {
        try { panel._post(); } catch { /* best-effort */ }
        this.sync(panel);
        return;
      }
      if (typeof panel._onSidebarMessage === 'function') panel._onSidebarMessage(message);
    });

    const visibility = view.onDidChangeVisibility(() => {
      if (view.visible) this.sync();
    });
    const binding = { receive, visibility, dispose: null };
    binding.dispose = view.onDidDispose(() => {
      // The callback can arrive after another resolveWebviewView call. Only the
      // binding that is still registered for this exact view may clean it up.
      if (this._viewBindings.get(view) !== binding) return;
      this._disposeViewBindings(view, binding);
      if (this._view === view) {
        this._view = null;
        this._stopTimer();
      }
    });
    this._viewBindings.set(view, binding);
    this._startTimer();
    this.sync();
  }

  _disposeViewBindings(view, expected) {
    const binding = this._viewBindings.get(view);
    if (!binding || (expected && binding !== expected)) return;
    this._viewBindings.delete(view);
    for (const disposable of [binding.receive, binding.visibility, binding.dispose]) {
      try { if (disposable && typeof disposable.dispose === 'function') disposable.dispose(); } catch { /* best-effort */ }
    }
  }

  attach(panel) {
    this._attached = panel || null;
    this.sync(panel);
  }

  detach(panel) {
    if (!panel || this._attached === panel) this._attached = null;
    this.post({ type: 'lp-sidebar-state', state: { active: false } });
  }

  post(payload) {
    const view = this._view;
    if (!view || !view.webview) return false;
    try {
      view.webview.postMessage(Object.assign({}, payload || {}, { __t: this.token }));
      return true;
    } catch { return false; }
  }

  sync(panel) {
    const controller = panel || this._attached || this.options.getPanel();
    let state = { active: false };
    if (controller && typeof controller._sidebarState === 'function') {
      try { state = controller._sidebarState(); } catch { state = { active: true, error: 'state-unavailable' }; }
    }
    // Defence in depth at the projection boundary: even a future controller regression cannot put
    // reference source stamps in the native view. It receives only bounded display labels/count.
    const rawRefs = state && state.refs && typeof state.refs === 'object' ? state.refs : {};
    const labels = Array.isArray(rawRefs.labels) ? rawRefs.labels.filter((label) => typeof label === 'string' && label).map((label) => label.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)).filter(Boolean).slice(0, 8) : [];
    const count = Math.max(0, Math.min(8, Number.isFinite(Number(rawRefs.count)) ? Math.floor(Number(rawRefs.count)) : labels.length));
    state = Object.assign({}, state, { refs: { count, labels } });
    const payload = { type: 'lp-sidebar-state', state };
    if (state && state.securityResult) payload.securityResult = state.securityResult;
    this.post(payload);
  }

  async reveal(tab, focusComposer) {
    try { await this.vscode.commands.executeCommand('setContext', 'mooter.livePreviewMode', true); } catch { /* best-effort */ }
    try { await this.vscode.commands.executeCommand('mooterLivePreviewSidebar.focus'); } catch { /* best-effort */ }
    const message = { type: 'lp-sidebar-reveal', tab: tab || 'edit', focusComposer: !!focusComposer };
    this.post(message);
    // A first reveal resolves the WebviewView asynchronously. One bounded retry covers
    // the creation boundary without a polling loop or focus stealing on later HMR ticks.
    setTimeout(() => { this.post(message); this.sync(); }, 180);
  }

  _startTimer() {
    if (this._timer) return;
    this._timer = setInterval(() => {
      if (this._view && this._view.visible) this.sync();
    }, 500);
  }

  _stopTimer() {
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
  }

  dispose() {
    this._stopTimer();
    for (const view of Array.from(this._viewBindings.keys())) this._disposeViewBindings(view);
    this._view = null;
    this._attached = null;
  }
}

module.exports = { LivePreviewSidebarProvider };
