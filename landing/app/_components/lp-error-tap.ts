/**
 * lp-error-tap.ts — Live Preview · MP4 (Honest Diagnostics) · DEV-ONLY tap.
 *
 * The Mooter cockpit's App Stage frames this dev server in a VS Code webview <iframe>. That
 * iframe is CROSS-ORIGIN (vscode-webview:// ↔ http://localhost:PORT), so the host cannot read
 * this page's console or DOM (same-origin policy). This module runs INSIDE the page, captures
 * runtime + build errors locally, and relays them to the host via `window.parent.postMessage`
 * — the honest, $0, LLM-free channel the cockpit's strip renders (no DevTools needed).
 *
 * SECURITY / PRIVACY:
 *   • We post to `window.parent` with targetOrigin '*' because the parent's origin
 *     (vscode-webview://<guid>) is opaque and unknown to this iframe. The payload carries only
 *     error text — no secrets — and the host re-validates `event.origin` + `event.source` before
 *     trusting it (see lp-diagnostics.acceptTapOrigin). Nothing is ever eval'd here.
 *   • The restore listener accepts a message ONLY when `event.source === window.parent` (the
 *     embedding cockpit) and only ever does history.replaceState + window.scrollTo — benign.
 *
 * DEV-ONLY: this file is reached solely through a dynamic import guarded by
 * `process.env.NODE_ENV === 'development'` in <LpErrorTap/>, so the bundler tree-shakes the
 * import out of the production build entirely. It never ships to a mooter.ai visitor.
 */

type TapKind = 'runtime' | 'build' | 'console' | 'promise';

interface TapError {
  type: 'lp-error';
  kind: TapKind;
  message: string;
  stack?: string;
  file?: string;
  line?: number | null;
  col?: number | null;
  ts: number;
}

const INSTALL_FLAG = '__lpErrorTapInstalled';

/** Best-effort: pull the first user-source frame (path + line:col) out of an error stack. */
export function parseStackForSource(stack?: string): { file?: string; line?: number; col?: number } {
  if (!stack) return {};
  const lines = String(stack).split('\n');
  for (const raw of lines) {
    // Prefer real source files; skip framework/runtime noise.
    if (/node_modules|webpack\/runtime|\/_next\/static\/chunks\/(webpack|main|framework)/.test(raw)) continue;
    const m = raw.match(/([^\s()]+\.(?:tsx?|jsx?|mjs|cjs))(?::(\d+))?(?::(\d+))?/);
    if (m) {
      return {
        file: m[1],
        line: m[2] ? parseInt(m[2], 10) : undefined,
        col: m[3] ? parseInt(m[3], 10) : undefined,
      };
    }
  }
  return {};
}

/** Classify a Next dev overlay's text as a build (compile) error vs an unhandled runtime error. */
export function classifyOverlay(text: string): TapKind {
  return /build error|failed to compile|module not found|syntax error|parsing ecmascript|cannot find module|type error/i.test(
    text,
  )
    ? 'build'
    : 'runtime';
}

/** Best-effort message + file:line extraction from a Next dev overlay's shadow text. */
export function parseOverlay(text: string): { message: string; file?: string; line?: number; col?: number } {
  const clean = text.replace(/\s+/g, ' ').trim();
  let message = '';
  // `(?:[A-Z][a-zA-Z]*)?Error` matches a BARE `Error:` (the canonical `throw new Error(...)`) as
  // well as `TypeError:` / `ReferenceError:` — the old `[A-Z][a-zA-Z]*Error` missed a plain Error.
  const errMatch = clean.match(/((?:[A-Z][a-zA-Z]*)?Error|Failed to compile|Module not found)[:\s]+(.{1,300})/);
  if (errMatch) message = (errMatch[1].endsWith('Error') ? errMatch[1] + ': ' : errMatch[1] + ' ') + errMatch[2];
  if (!message) message = clean.slice(0, 200);
  // `app/page.tsx (7:9)` or `app/page.tsx:7:9`
  const loc = clean.match(/([\w./@-]+\.(?:tsx?|jsx?|mjs|cjs))[\s(:]+(\d+)(?::(\d+))?/);
  return {
    message: message.trim(),
    file: loc ? loc[1] : undefined,
    line: loc && loc[2] ? parseInt(loc[2], 10) : undefined,
    col: loc && loc[3] ? parseInt(loc[3], 10) : undefined,
  };
}

/**
 * parseHmrError — PURE. Coerce a single Next dev HMR `errors[]` entry (a webpack stats error: a bare
 * string, or an object with `message` / `moduleName` / `loc`) into { message, file?, line?, col? }.
 * Fail-soft: never throws; returns { message: '' } for junk so the caller drops it (no fabricated row).
 */
export function parseHmrError(entry: unknown): { message: string; file?: string; line?: number; col?: number } {
  let raw = '';
  let moduleName = '';
  let loc = '';
  if (typeof entry === 'string') raw = entry;
  else if (entry && typeof entry === 'object') {
    const o = entry as Record<string, unknown>;
    raw = typeof o.message === 'string' ? o.message : '';
    moduleName = typeof o.moduleName === 'string' ? o.moduleName : '';
    loc = typeof o.loc === 'string' ? o.loc : '';
  }
  // Strip ANSI colour codes webpack sometimes embeds, then take the first non-empty line as the message.
  const clean = String(raw).replace(/\[[0-9;]*m/g, '').replace(/\r/g, '').trim();
  if (!clean) return { message: '' };
  const firstLine = clean.split('\n').map((l) => l.trim()).find(Boolean) || clean;
  const message = firstLine.slice(0, 300);
  let file: string | undefined;
  let line: number | undefined;
  let col: number | undefined;
  // A `file.tsx:7:9` or `file.tsx (7:9)` in the moduleName (preferred) or anywhere in the message text.
  const fileMatch = (moduleName || clean).match(/([\w./@-]+\.(?:tsx?|jsx?|mjs|cjs))(?:[\s(:]+(\d+)(?::(\d+))?)?/);
  if (fileMatch) {
    file = fileMatch[1].replace(/^\.\//, '');
    if (fileMatch[2]) line = parseInt(fileMatch[2], 10);
    if (fileMatch[3]) col = parseInt(fileMatch[3], 10);
  }
  // An explicit webpack `loc` ("7:9" or "7:9-20") is the most reliable location — it wins.
  if (loc) {
    const lm = loc.match(/(\d+)(?::(\d+))?/);
    if (lm) { line = parseInt(lm[1], 10); if (lm[2]) col = parseInt(lm[2], 10); }
  }
  return { message, file, line, col };
}

/** Post to the embedding cockpit. Safe: no-op when not embedded, never throws. targetOrigin '*'
 * because the parent's vscode-webview:// origin is opaque here — the host re-validates event.origin. */
function postToParent(msg: unknown): void {
  try {
    if (typeof window === 'undefined' || window.parent === window) return;
    window.parent.postMessage(msg, '*');
  } catch {
    /* the parent may be gone (panel closed) — never throw */
  }
}

/**
 * buildBoundaryErrorPayload — PURE. Shape the `lp-error` payload a React error boundary relays for the
 * error it caught. Extracted from reportBoundaryError so the message + file:line mapping is unit-provable
 * without a DOM. Kind defaults to 'runtime' (the red strip) — a caught render throw is a runtime failure.
 */
export function buildBoundaryErrorPayload(error: unknown, kind: TapKind = 'runtime'): TapError {
  const err = error instanceof Error ? error : null;
  const rawMsg = err ? err.message : typeof error === 'string' ? error : '';
  const stack = err && typeof err.stack === 'string' ? err.stack : undefined;
  const fromStack = parseStackForSource(stack);
  return {
    type: 'lp-error',
    kind,
    message: (rawMsg && String(rawMsg).trim()) || 'server error',
    stack,
    file: fromStack.file,
    line: fromStack.line ?? null,
    col: fromStack.col ?? null,
    ts: Date.now(),
  };
}

/**
 * reportBoundaryError — called from a React error boundary (app/error.tsx, app/global-error.tsx) with
 * the error it caught. This is the ONLY reliable channel for a SERVER COMPONENT throw: Next hard-reloads
 * the framed dev server into its global-error page, where the root layout — and the MutationObserver tap
 * mounted in it — never render, and the HMR websocket carries only a bare `serverComponentChanges` signal
 * (no error text). The boundary that caught the throw is the one place the message + stack still exist, so
 * it relays them. DEV-ONLY + embedded-only (postToParent no-ops when not framed). Never throws.
 */
export function reportBoundaryError(error: unknown, kind: TapKind = 'runtime'): void {
  try {
    postToParent(buildBoundaryErrorPayload(error, kind));
  } catch {
    /* diagnostics must never break the error page the user is already looking at */
  }
}

export function installLpErrorTap(): void {
  if (typeof window === 'undefined') return;
  // Embedded-only + idempotent. The <LpErrorTap/> wrapper already gates NODE_ENV + parent check;
  // we re-assert both here so a stray import can never affect a normally-browsed dev page.
  if (window.parent === window) return;
  const w = window as unknown as Record<string, unknown>;
  if (w[INSTALL_FLAG]) return;
  w[INSTALL_FLAG] = true;

  const post = (msg: Record<string, unknown>): void => {
    try {
      window.parent.postMessage(msg, '*');
    } catch {
      /* the parent may be gone (panel closed) — never throw into the app */
    }
  };
  const emit = (e: Omit<TapError, 'type' | 'ts'>): void => post({ type: 'lp-error', ts: Date.now(), ...e });

  // True while the Next dev overlay is showing an error — declared up here so console.error can
  // suppress the duplicate it logs for the same failure the overlay already displays.
  let overlayActive = false;

  // ── 1. Uncaught runtime errors ────────────────────────────────────────────────────────────
  window.addEventListener('error', (ev: ErrorEvent) => {
    // Ignore resource-load errors (img/script 404) — they are not JS exceptions and would be noisy.
    if (!ev.message && !ev.error) return;
    const fromStack = parseStackForSource(ev.error && ev.error.stack);
    emit({
      kind: 'runtime',
      message: (ev.error && ev.error.message) || ev.message || 'runtime error',
      stack: ev.error && ev.error.stack,
      file: fromStack.file || ev.filename || undefined,
      line: fromStack.line ?? (ev.lineno || undefined),
      col: fromStack.col ?? (ev.colno || undefined),
    });
  });

  // ── 2. Unhandled promise rejections ───────────────────────────────────────────────────────
  window.addEventListener('unhandledrejection', (ev: PromiseRejectionEvent) => {
    const reason = ev.reason;
    const isErr = reason instanceof Error;
    const fromStack = parseStackForSource(isErr ? reason.stack : undefined);
    emit({
      kind: 'promise',
      message: isErr ? reason.message : 'Unhandled rejection: ' + String(reason),
      stack: isErr ? reason.stack : undefined,
      file: fromStack.file,
      line: fromStack.line ?? null,
      col: fromStack.col ?? null,
    });
  });

  // ── 3. console.error — relay ONLY when an actual Error object is logged (skip formatted React
  //    dev warnings so the strip stays honest and quiet). Never breaks the original console. ──
  const origConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]): void => {
    try {
      // While the Next dev overlay is showing an error it is the authoritative display — don't also
      // relay React's internal console.error for the SAME failure (would be a duplicate strip row).
      if (!overlayActive) {
        const err = args.find((a) => a instanceof Error) as Error | undefined;
        if (err) {
          const fromStack = parseStackForSource(err.stack);
          emit({ kind: 'console', message: err.message, stack: err.stack, file: fromStack.file, line: fromStack.line ?? null, col: fromStack.col ?? null });
        }
      }
    } catch {
      /* never let the tap break logging */
    }
    origConsoleError(...args);
  };

  // ── 4. Next dev error overlay (build + unhandled render errors) via a MutationObserver. When
  //    the overlay appears we classify + parse it; when it disappears (error fixed) we tell the
  //    host to clear the strip — honest self-healing, gate #5. ─────────────────────────────────
  let lastOverlayKind: TapKind = 'build';
  let lastSig = '';
  let debounce: ReturnType<typeof setTimeout> | null = null;
  // Next renders SEVERAL things through <nextjs-portal> (the dev-tools indicator, the build-activity
  // pip, AND the error dialog). A bare `querySelector('nextjs-portal')` grabs whichever is first and
  // an `|| [data-...]` fallback is dead once any portal exists — so we scan them ALL and accept only
  // text that actually looks like an error. This kills both the false-negative (reading the wrong
  // portal) and the false-positive (classifying the idle indicator as a red runtime row → gate #6).
  const ERROR_MARKERS = /unhandled|runtime error|build error|failed to compile|module not found|syntax error|parsing ecmascript|\b[A-Za-z]*error\b\s*:/i;
  const readPortalText = (el: Element): string => {
    const host = (el as HTMLElement & { shadowRoot?: ShadowRoot | null }).shadowRoot;
    return ((host ? host.textContent : el.textContent) || '').trim();
  };
  const findErrorOverlayText = (): string | null => {
    const nodes = document.querySelectorAll('nextjs-portal, [data-nextjs-dialog-overlay], [data-nextjs-dialog]');
    for (let i = 0; i < nodes.length; i++) {
      const text = readPortalText(nodes[i]);
      if (text && ERROR_MARKERS.test(text)) return text;
    }
    return null;
  };
  const scanOverlay = (): void => {
    const text = findErrorOverlayText();
    if (text) {
      const kind = classifyOverlay(text);
      const parsed = parseOverlay(text);
      const sig = kind + '|' + parsed.message + '|' + (parsed.file || '') + '|' + (parsed.line || '');
      if (sig !== lastSig) {
        lastSig = sig;
        lastOverlayKind = kind;
        emit({ kind, message: parsed.message, file: parsed.file, line: parsed.line ?? null, col: parsed.col ?? null });
      }
      overlayActive = true;
    } else if (overlayActive) {
      // Overlay gone → recovered. A BUILD fix triggers a full recompile+reload (all prior errors are
      // stale → clear all); a runtime overlay dismissed without a reload clears only its own kind, so
      // unrelated console/promise rows are not silently wiped.
      overlayActive = false;
      lastSig = '';
      post({ type: 'lp-error-clear', kind: lastOverlayKind === 'build' ? 'all' : lastOverlayKind });
    }
  };
  const observer = new MutationObserver(() => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(scanOverlay, 200);
  });
  const startObserver = (): void => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver);
  else startObserver();

  // ── 4b. Next dev HMR websocket — a DOM-INDEPENDENT second path for COMPILE errors. The overlay
  //    observer above only sees an error once Next paints its portal; a build error is already on the
  //    dev socket (the `errors[]` of a `built`/`sync` frame) before that, and can be missed if the
  //    portal renders outside <body>. We open our OWN read-only client and relay ONLY real compile
  //    errors. We NEVER synthesise a row from a bare `serverComponentChanges`/`building` frame — that
  //    would fabricate a red strip on a HEALTHY edit (honest-copy). A Server Component RUNTIME throw is
  //    NOT carried here (Next sends only `serverComponentChanges`, no error text) — that path is covered
  //    by reportBoundaryError() from app/error.tsx + app/global-error.tsx. Fully fail-soft.
  try {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hmr = new WebSocket(proto + '//' + location.host + '/_next/webpack-hmr');
    hmr.addEventListener('message', (ev: MessageEvent) => {
      try {
        const data = typeof ev.data === 'string' ? JSON.parse(ev.data) : null;
        if (!data || typeof data !== 'object') return;
        if (data.action !== 'built' && data.action !== 'sync') return;
        const errs = Array.isArray(data.errors) ? data.errors : [];
        for (let i = 0; i < errs.length && i < 20; i++) {
          const p = parseHmrError(errs[i]);
          if (!p.message) continue; // junk entry → drop it (never a fabricated row)
          emit({ kind: 'build', message: p.message, file: p.file, line: p.line ?? null, col: p.col ?? null });
        }
      } catch {
        /* a malformed frame is not our problem — ignore it */
      }
    });
    // A dropped socket is not an error condition (Next restarts its own); we just stop relaying. No
    // reconnect storm — one connection for the page's lifetime is enough, and the boundary path covers
    // the reload case. Swallow socket errors so a hiccup never surfaces as a strip row.
    hmr.addEventListener('error', () => {});
  } catch {
    /* WebSocket unavailable / blocked — the DOM-overlay and boundary paths still work */
  }

  // ── 5. State-preserving reload — report route + scroll (throttled); restore on the host's ask.
  let lastEmit = 0;
  const emitState = (): void => {
    const now = Date.now();
    if (now - lastEmit < 400) return;
    lastEmit = now;
    post({ type: 'lp-state', path: location.pathname + location.search, scrollY: window.scrollY || 0 });
  };
  window.addEventListener('scroll', emitState, { passive: true });
  window.addEventListener('popstate', emitState);
  // NOTE: we deliberately do NOT emit an initial state here. On a reload the fresh page would report
  // scrollY:0 and clobber the host's retained pre-reload position before the restore is delivered.
  // The host restores from what it already holds (see lpSendRestore); the first real scroll re-syncs.

  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.source !== window.parent) return; // only the embedding cockpit may drive a restore
    const d = ev.data;
    if (!d || typeof d !== 'object' || d.type !== 'lp-restore') return;
    try {
      const cur = location.pathname + location.search;
      if (typeof d.path === 'string' && d.path && d.path !== cur) history.replaceState(null, '', d.path);
      if (typeof d.scrollY === 'number' && isFinite(d.scrollY)) window.scrollTo(0, d.scrollY);
    } catch {
      /* restore is best-effort */
    }
  });

  // Handshake: tell the host we are live so it can send an initial restore even if it missed our
  // iframe 'load' event (covers the reload race, gate #5).
  post({ type: 'lp-ready' });
}
