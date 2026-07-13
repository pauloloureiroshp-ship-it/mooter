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
export type LpNodeState = 'selected' | 'working' | 'awaiting' | 'approved' | 'reverted' | 'stale' | 'error';

/** PURE lifecycle coercion shared by the pin overlay and its tests. Unknown input fails safe. */
export function normalizeLpNodeState(state: unknown): LpNodeState {
  const allowed: LpNodeState[] = ['selected', 'working', 'awaiting', 'approved', 'reverted', 'stale', 'error'];
  return typeof state === 'string' && allowed.includes(state as LpNodeState) ? (state as LpNodeState) : 'selected';
}

/** PURE honest label: pink work → yellow approval → green accepted. */
export function lpNodeStateLabel(state: unknown, label?: unknown): string {
  if (typeof label === 'string' && label.trim()) return label.slice(0, 120);
  const next = normalizeLpNodeState(state);
  if (next === 'working') return 'Moo está a alterar';
  if (next === 'awaiting') return 'aguarda OK';
  if (next === 'approved') return 'aprovado localmente';
  return next === 'selected' ? 'selecionado' : next;
}

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

/**
 * buildNavPath — PURE. The route string the tap reports to the cockpit for the address bar / route
 * picker: pathname + search, defaulting to "/". Kept tiny + pure so the MP3.3 sync is unit-provable
 * without a DOM (mirrors why parseOverlay/parseHmrError live here).
 */
export function buildNavPath(pathname?: string | null, search?: string | null): string {
  const p = typeof pathname === 'string' && pathname ? pathname : '/';
  const s = typeof search === 'string' ? search : '';
  const path = (p.charAt(0) === '/' ? p : '/' + p) + s;
  return path.slice(0, 2048);
}

/**
 * parseInspPath — PURE. Split a `data-insp-path` attribute (stamped by code-inspector-plugin in
 * the dev build, MP5.0) into { file, line, col, tag }. The value is `file:line:col:tag`, but on
 * Windows the file path itself contains a drive-letter colon (`C:\…`), so a naive split on ':'
 * breaks. We anchor the trailing `:line:col[:tag]` from the RIGHT (greedy path prefix) so the
 * drive-letter colon stays inside the file path. Fail-soft: returns null for junk, never throws.
 */
export function parseInspPath(
  attr: string | null | undefined,
): { file: string; line: number; col: number; tag?: string } | null {
  if (!attr || typeof attr !== 'string') return null;
  const m = attr.match(/^(.+):(\d+):(\d+)(?::([^:]*))?$/);
  if (!m) return null;
  return { file: m[1], line: parseInt(m[2], 10), col: parseInt(m[3], 10), tag: m[4] || undefined };
}

/**
 * buildBreadcrumbPath — PURE. Turn the chain of `data-insp-path` attribute values collected while
 * climbing from the picked element to the root (leaf→root, as a DOM walk yields them) into the
 * breadcrumb the cockpit renders: root→leaf crumbs { file, line, col, tag, label } (MP5.2a).
 * Consecutive duplicates (a wrapper re-stamped with the same source location) collapse into one
 * crumb. Fail-soft: junk entries are skipped, never thrown; capped so a pathological DOM cannot
 * flood the postMessage payload.
 */
export function buildBreadcrumbPath(
  attrs: Array<string | null | undefined>,
): Array<{ file: string; line: number; col: number; tag?: string; label: string }> {
  const crumbs: Array<{ file: string; line: number; col: number; tag?: string; label: string }> = [];
  if (!Array.isArray(attrs)) return crumbs;
  for (const attr of attrs) {
    const p = parseInspPath(attr);
    if (!p) continue;
    const last = crumbs[crumbs.length - 1];
    if (last && last.file === p.file && last.line === p.line && last.col === p.col) continue;
    crumbs.push({ file: p.file, line: p.line, col: p.col, tag: p.tag, label: p.tag || 'node' });
  }
  const full = crumbs.reverse();
  // Cap keeps the TRUE ROOT + the 11 leaf-most crumbs: the cockpit's shared-component warning
  // compares against full[0], so the root must never be dropped by a pathological chain.
  if (full.length > 12) return [full[0]].concat(full.slice(full.length - 11));
  return full;
}

/**
 * stampMatches — PURE. Does a `data-insp-path` attribute value identify the wanted node?
 * Matching is on the FULL stamp — file+line+col, AND tag when the caller knows it. Used by both
 * the breadcrumb re-select and the LP-4 §5 re-pin after an apply (the byte-splice preserves the
 * node's start, so its stamp survives the write — same file:line:col identifies the same node).
 * Fail-soft: junk on either side → false, never a fabricated match.
 */
export function stampMatches(
  attr: string | null | undefined,
  want: { file?: unknown; line?: unknown; col?: unknown; tag?: unknown },
): boolean {
  const p = parseInspPath(attr);
  if (!p) return false;
  const file = typeof want.file === 'string' ? want.file : '';
  const line = typeof want.line === 'number' ? want.line : NaN;
  const col = typeof want.col === 'number' ? want.col : NaN;
  const tag = typeof want.tag === 'string' ? want.tag : '';
  if (!file || !isFinite(line) || !isFinite(col)) return false;
  return p.file === file && p.line === line && p.col === col && (!tag || (p.tag || '') === tag);
}

/**
 * hmrReconnectDelay — PURE. Bounded backoff for the dev HMR reconnect: attempt 0 → 1s, then doubling,
 * capped at 5s. Keeps the "no reconnect storm" property (FIX-MP-7) provable without a live socket.
 */
export function hmrReconnectDelay(attempt: number): number {
  // NaN / negative → treat as attempt 0 (1s floor); a large or Infinite count backs off to the 5s cap.
  const a = typeof attempt === 'number' && attempt > 0 ? Math.floor(attempt) : 0;
  return Math.min(1000 * Math.pow(2, a), 5000);
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

  // FIX-MP-1 (audit P0-1) — served-tree identity. next.config injects NEXT_PUBLIC_LP_ROOT =
  // realpath(process.cwd()) in DEV ONLY (the dev server's own root). We relay it to the host so it can
  // PROVE the preview it frames comes from the tree it would write to; twin worktrees (same repo,
  // sibling paths) otherwise pass containment and the $0 edit lands in the wrong tree (incident 06:49).
  // Absent in prod (dev-only env key) → null → the host fail-closes. Read once at install time.
  const servedRoot: string | null =
    typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_LP_ROOT
      ? String(process.env.NEXT_PUBLIC_LP_ROOT)
      : null;

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
  // F2 (P1-7): the socket is ALSO our honest liveness signal for hot-reload. A dropped/failed socket
  // means the dev server or the HMR channel is gone — edits stop reflecting while the preview still
  // LOOKS fresh (the "preview fine, published broken" trap). So on close/error we surface lp-hmr-down,
  // attempt a BOUNDED reconnect (hmrReconnectDelay — never a storm), and clear it with lp-hmr-up once
  // the socket re-opens. The old code swallowed both and relied on the page reload; that hid real staleness.
  let hmrDown = false;
  let hmrAttempt = 0;
  const HMR_MAX_ATTEMPTS = 6;
  const markHmrDown = (): void => { if (hmrDown) return; hmrDown = true; post({ type: 'lp-hmr-down' }); };
  const markHmrUp = (): void => { hmrAttempt = 0; if (!hmrDown) return; hmrDown = false; post({ type: 'lp-hmr-up' }); };
  const scheduleHmrReconnect = (): void => {
    if (hmrAttempt >= HMR_MAX_ATTEMPTS) return; // bounded — never a reconnect storm
    const delay = hmrReconnectDelay(hmrAttempt);
    hmrAttempt++;
    try { window.setTimeout(connectHmr, delay); } catch { /* no timer host — give up quietly */ }
  };
  function connectHmr(): void {
    let sock: WebSocket;
    try {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      sock = new WebSocket(proto + '//' + location.host + '/_next/webpack-hmr');
    } catch {
      markHmrDown(); scheduleHmrReconnect(); // WebSocket blocked → treat as down + retry (DOM-overlay + boundary paths still work)
      return;
    }
    let gone = false;
    const onGone = (): void => {
      if (gone) return; gone = true; // 'error' is usually followed by 'close' — collapse to ONE transition
      markHmrDown();
      scheduleHmrReconnect();
    };
    sock.addEventListener('open', () => { markHmrUp(); });
    sock.addEventListener('message', (ev: MessageEvent) => {
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
    sock.addEventListener('close', onGone);
    sock.addEventListener('error', onGone);
  }
  connectHmr();

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

  // ── 5b. Route sync (MP3.3 multi-page nav). Tell the cockpit which route the framed site is on so
  //    its address bar + route picker track reality — on back/forward (popstate) AND on Next <Link>
  //    client navigations, which use history.pushState and do NOT fire popstate. Unlike lp-state
  //    (scroll restore), an initial lp-nav is safe + wanted (the picker shows the landing route at
  //    once), and it carries no scroll, so it can never clobber a restore.
  const emitNav = (): void => post({ type: 'lp-nav', path: buildNavPath(location.pathname, location.search) });
  window.addEventListener('popstate', emitNav);
  (['pushState', 'replaceState'] as const).forEach((k) => {
    const orig = history[k] as (...a: unknown[]) => unknown;
    if (typeof orig !== 'function') return;
    history[k] = function (this: History, ...a: unknown[]) {
      const r = orig.apply(this, a);
      try { emitNav(); } catch { /* diagnostics must never break navigation */ }
      return r;
    } as History[typeof k];
  });
  emitNav(); // initial route

  // ── 6. Select-to-edit mode (MP5.1). The host toggles this via {type:'lp-select-mode', on}. While
  //    on, hovering highlights the source element under the cursor (drawn in a shadow DOM so no CSS
  //    bleeds into the framed site, pointer-events:none so the overlay never eats the click it
  //    draws), and clicking resolves the nearest [data-insp-path] and posts lp-select. The click is
  //    captured + swallowed (preventDefault + stopImmediatePropagation) so the framed site itself
  //    never reacts — no navigation, no button fires. Off by default; enabled only on the host's ask.
  const select = (() => {
    let on = false;
    let shadowHost: HTMLElement | null = null;
    let box: HTMLElement | null = null;
    // MP5.2a select-lock: a SECOND overlay box that stays put once a node is clicked. The hover
    // box keeps tracking the cursor; this one only moves on re-pin (new click / breadcrumb chip),
    // repositions on scroll/resize, and clears on Esc or teardown — the selection can no longer
    // evaporate on mouseout.
    let pinBox: HTMLElement | null = null;
    let pinLabel: HTMLElement | null = null;
    let pinned: Element | null = null;
    let root: ShadowRoot | null = null;
    // LP-4.8 §4 — multi-select attach-as-reference (Lovable's model): Cmd/Ctrl-click pins extra
    // nodes as CONTEXT for one prompt, not a batch edit. Each gets a persistent dashed box so the
    // overlay shows all of them; they never move the primary pin (the edit target).
    const refEls: Element[] = [];
    const refBoxes: HTMLElement[] = [];
    const ensure = (): void => {
      if (shadowHost && shadowHost.isConnected) return;
      // Fast Refresh normally preserves our out-of-tree shadow host, but a document/root repair can
      // detach it while this tap closure survives with `on === true`. Treat a detached host as gone;
      // the parent's idempotent re-arm must be able to reconstruct the visible overlay.
      shadowHost = null; box = null; pinBox = null; pinLabel = null; root = null;
      refEls.length = 0; refBoxes.length = 0;
      shadowHost = document.createElement('div');
      shadowHost.setAttribute('data-lp-select-overlay', '');
      shadowHost.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;margin:0;';
      root = shadowHost.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = `
        @keyframes lpMooWorking { 0%,100% { box-shadow:0 0 0 2px rgba(232,136,138,.28),0 0 10px rgba(232,136,138,.18) } 50% { box-shadow:0 0 0 4px rgba(232,136,138,.52),0 0 22px rgba(232,136,138,.42) } }
        @keyframes lpMooAwaiting { 0%,100% { box-shadow:0 0 0 2px rgba(229,192,123,.26),0 0 8px rgba(229,192,123,.14) } 50% { box-shadow:0 0 0 4px rgba(229,192,123,.48),0 0 18px rgba(229,192,123,.3) } }
        .lp-pin-state { position:fixed;display:none;pointer-events:none;box-sizing:border-box;border:2px solid #7AA2F7;background:rgba(122,162,247,.06);border-radius:4px;box-shadow:0 0 0 2px rgba(122,162,247,.22);transition:border-color .2s ease,background .2s ease,box-shadow .2s ease; }
        .lp-pin-state.lp-state-working { border-color:#E8888A;background:rgba(232,136,138,.08);animation:lpMooWorking 1.05s ease-in-out infinite; }
        .lp-pin-state.lp-state-awaiting { border-color:#E5C07B;background:rgba(229,192,123,.08);animation:lpMooAwaiting 1.45s ease-in-out infinite; }
        .lp-pin-state.lp-state-approved { border-color:#7FB88A;background:rgba(127,184,138,.07);box-shadow:0 0 0 3px rgba(127,184,138,.34); }
        .lp-pin-state.lp-state-reverted { border-color:#7AA2F7;background:rgba(122,162,247,.05);box-shadow:0 0 0 2px rgba(122,162,247,.2); }
        .lp-pin-state.lp-state-error,.lp-pin-state.lp-state-stale { border-color:#D9484B;background:rgba(217,72,75,.07);box-shadow:0 0 0 3px rgba(217,72,75,.28); }
        .lp-state-label { position:absolute;right:-2px;top:-25px;max-width:min(300px,75vw);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 8px;border-radius:999px;background:#171719;color:#fff;border:1px solid currentColor;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:.01em;box-shadow:0 4px 14px rgba(0,0,0,.25); }
        .lp-state-working .lp-state-label { color:#F3A3B5 }.lp-state-awaiting .lp-state-label { color:#E5C07B }.lp-state-approved .lp-state-label { color:#8FD39B }.lp-state-error .lp-state-label,.lp-state-stale .lp-state-label { color:#FF8D91 }
        @media (prefers-reduced-motion:reduce) { .lp-pin-state { animation:none!important;transition:none!important } }
      `;
      root.appendChild(style);
      box = document.createElement('div');
      box.style.cssText =
        'position:fixed;display:none;pointer-events:none;box-sizing:border-box;border:1.5px solid #E8888A;background:rgba(232,136,138,0.12);border-radius:3px;';
      root.appendChild(box);
      pinBox = document.createElement('div');
      pinBox.className = 'lp-pin-state lp-state-selected';
      pinLabel = document.createElement('div');
      pinLabel.className = 'lp-state-label';
      pinLabel.textContent = 'selecionado';
      pinBox.appendChild(pinLabel);
      root.appendChild(pinBox);
      document.documentElement.appendChild(shadowHost);
    };
    const clearRefs = (): void => {
      for (const b of refBoxes) { if (b.parentNode) b.parentNode.removeChild(b); }
      refBoxes.length = 0;
      refEls.length = 0;
    };
    const teardown = (): void => {
      clearPreviewClass(); // restore any hover-preview before we lose the pin
      clearRefs();
      if (shadowHost && shadowHost.parentNode) shadowHost.parentNode.removeChild(shadowHost);
      shadowHost = null;
      box = null;
      pinBox = null;
      pinLabel = null;
      pinned = null;
      root = null;
    };
    const drawPin = (): void => {
      // Fast Refresh may preserve this closure and the selected DOM node while Next removes our
      // out-of-tree shadow host. Rebuild it at every authoritative draw boundary; otherwise the
      // host can truthfully be in `awaiting` while the user sees no yellow box at all.
      if (on && (!shadowHost || !shadowHost.isConnected)) ensure();
      if (!pinBox) return;
      // isConnected: HMR may swap the node out from under the pin — hide instead of lying.
      if (!pinned || !pinned.isConnected) { pinBox.style.display = 'none'; return; }
      const r = pinned.getBoundingClientRect();
      pinBox.style.display = 'block';
      pinBox.style.left = r.left + 'px';
      pinBox.style.top = r.top + 'px';
      pinBox.style.width = r.width + 'px';
      pinBox.style.height = r.height + 'px';
    };
    // LP-4.8 §1 — the cockpit's in-canvas toolbar anchors to the pin, so on every reflow we re-send
    // the pin's box (iframe-viewport coords) alongside redrawing the local overlay. Read-only: a
    // getBoundingClientRect on the already-pinned node, posted on the same origin-locked channel as
    // lp-select — it can only reposition the toolbar, never reach a write path.
    const postPinRect = (): void => {
      if (!pinned || !pinned.isConnected) return;
      const r = pinned.getBoundingClientRect();
      post({ type: 'lp-pin-rect', rect: { x: r.left, y: r.top, w: r.width, h: r.height } });
    };
    const applyPinState = (state: string, label?: string): void => {
      if (on && (!shadowHost || !shadowHost.isConnected)) ensure();
      if (!pinBox) return;
      const next = normalizeLpNodeState(state);
      pinBox.className = 'lp-pin-state lp-state-' + next;
      if (pinLabel) pinLabel.textContent = lpNodeStateLabel(next, label);
    };
    const pin = (el: Element | null): void => { pinned = el; applyPinState('selected', 'selecionado'); drawPin(); postPinRect(); };
    const nodeState = (d: { file?: unknown; line?: unknown; col?: unknown; tag?: unknown; state?: unknown; label?: unknown }): void => {
      if (!pinned || !pinned.isConnected || !stampMatches(pinned.getAttribute('data-insp-path'), d)) return;
      applyPinState(typeof d.state === 'string' ? d.state : 'selected', typeof d.label === 'string' ? d.label.slice(0, 120) : '');
      drawPin();
    };
    // Redraw every attached-reference box (HMR may disconnect a node — hide it, never lie).
    const drawRefs = (): void => {
      for (let i = 0; i < refBoxes.length; i++) {
        const el = refEls[i]; const b = refBoxes[i];
        if (!el || !el.isConnected) { b.style.display = 'none'; continue; }
        const r = el.getBoundingClientRect();
        b.style.display = 'block';
        b.style.left = r.left + 'px'; b.style.top = r.top + 'px';
        b.style.width = r.width + 'px'; b.style.height = r.height + 'px';
      }
    };
    // Add a node as a reference (dashed box + lp-attach). Dedup by identity; capped at 8 so a prompt
    // can never balloon. Posts the stamp so the cockpit can list + send it as agent context.
    const addRef = (el: Element): void => {
      if (!el || refEls.indexOf(el) !== -1 || refEls.length >= 8) return;
      const attr = el.getAttribute('data-insp-path');
      const parsed = parseInspPath(attr);
      if (!parsed || !root) return;
      const b = document.createElement('div');
      b.style.cssText =
        'position:fixed;display:none;pointer-events:none;box-sizing:border-box;border:2px dashed #7FB88A;background:rgba(127,184,138,0.08);border-radius:3px;';
      root.appendChild(b);
      refEls.push(el); refBoxes.push(b);
      drawRefs();
      post({
        type: 'lp-attach',
        file: parsed.file, line: parsed.line, col: parsed.col, tag: parsed.tag,
        label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      });
    };
    // Remove one reference by its stamp (the cockpit's ✕), or all (limpar).
    const removeRef = (want: { file?: unknown; line?: unknown; col?: unknown; tag?: unknown }): void => {
      for (let i = refEls.length - 1; i >= 0; i--) {
        if (stampMatches(refEls[i].getAttribute('data-insp-path'), want)) {
          const b = refBoxes[i]; if (b && b.parentNode) b.parentNode.removeChild(b);
          refEls.splice(i, 1); refBoxes.splice(i, 1);
        }
      }
    };
    // LP-4.9 §5 — hover-preview: the cockpit asks to VISUALLY apply a className to the pinned element
    // (live DOM only — no file write). We save the original once and restore it on clear/new pick, so
    // a preview can never leak into a real edit. Read/writes only the pinned node's class attribute.
    let previewSaved: { el: Element; cls: string | null } | null = null;
    const previewClass = (className: string): void => {
      if (!pinned || !pinned.isConnected) return;
      if (!previewSaved || previewSaved.el !== pinned) previewSaved = { el: pinned, cls: pinned.getAttribute('class') };
      try { pinned.setAttribute('class', className); } catch { /* SVG/edge — best-effort */ }
      drawPin(); postPinRect();
    };
    const clearPreviewClass = (): void => {
      if (!previewSaved) return;
      const saved = previewSaved; previewSaved = null;
      if (saved.el && saved.el.isConnected) {
        try { if (saved.cls == null) saved.el.removeAttribute('class'); else saved.el.setAttribute('class', saved.cls); } catch { /* best-effort */ }
      }
      drawPin(); postPinRect();
    };
    // LP-4.9 §3 — a short green pulse on the pin box after a write landed (visual only; reverts).
    const flash = (): void => {
      if (!pinBox) return;
      const base = pinBox.style.boxShadow;
      pinBox.style.transition = 'box-shadow .18s ease';
      pinBox.style.boxShadow = '0 0 0 3px rgba(127,184,138,.85)';
      setTimeout(() => { if (pinBox) pinBox.style.boxShadow = base; }, 420);
    };
    const onReflow = (): void => { if (on && pinned) { drawPin(); postPinRect(); } if (on) drawRefs(); };
    const resolve = (x: number, y: number): Element | null => {
      // MP5.2a "descend to the node": pick the DEEPEST stamped element under the cursor.
      // elementsFromPoint lists the whole hit stack (deepest painted first), so the first stamped
      // entry is the leaf the user is actually pointing at — an unstamped decorative wrapper can
      // no longer hijack the pick up to its component root. Nearest stamped ancestor of the top
      // element stays as the fallback (the MP5.1 behaviour) for sparsely stamped pages.
      const stack = typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(x, y) : [];
      for (let i = 0; i < stack.length; i++) {
        if (stack[i].hasAttribute('data-insp-path')) return stack[i];
      }
      const el = document.elementFromPoint(x, y);
      return el ? el.closest('[data-insp-path]') : null;
    };
    // Climb from the picked element to the root collecting every stamped ancestor's attribute
    // (leaf→root); buildBreadcrumbPath flips + parses it into the root→leaf crumbs the cockpit
    // renders as clickable chips (`section › CrookOutline › img`).
    const attrChain = (el: Element): Array<string | null> => {
      const chain: Array<string | null> = [];
      let cur: Element | null = el;
      while (cur && chain.length < 24) {
        chain.push(cur.getAttribute('data-insp-path'));
        cur = cur.parentElement ? cur.parentElement.closest('[data-insp-path]') : null;
      }
      return chain;
    };
    const draw = (el: Element | null): void => {
      if (!box) return;
      if (!el) { box.style.display = 'none'; return; }
      const r = el.getBoundingClientRect();
      box.style.display = 'block';
      box.style.left = r.left + 'px';
      box.style.top = r.top + 'px';
      box.style.width = r.width + 'px';
      box.style.height = r.height + 'px';
    };
    const onMove = (ev: MouseEvent): void => { if (on) draw(resolve(ev.clientX, ev.clientY)); };
    // The single select path — used by a real click AND by a breadcrumb re-select from the cockpit
    // (MP5.2a), so both produce the identical lp-select payload and the identical pin.
    const selectEl = (el: Element): void => {
      const attr = el.getAttribute('data-insp-path');
      const parsed = parseInspPath(attr);
      if (!parsed) return;
      clearPreviewClass(); // a fresh pick drops any lingering hover-preview on the old node
      // Honest multi-instance signal: the SAME stamp on several DOM nodes means the source node
      // renders more than once (a .map(), a reused component) — any edit/delete hits the template,
      // i.e. every instance. Counted by attribute equality (not a CSS selector: Windows paths
      // carry backslashes/colons that break attribute selectors).
      let repeated = 0;
      const stamped = document.querySelectorAll('[data-insp-path]');
      for (let i = 0; i < stamped.length; i++) { if (stamped[i].getAttribute('data-insp-path') === attr) repeated++; }
      const r = el.getBoundingClientRect();
      post({
        type: 'lp-select',
        file: parsed.file,
        line: parsed.line,
        col: parsed.col,
        tag: parsed.tag,
        rect: { x: r.left, y: r.top, w: r.width, h: r.height },
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        className: el.getAttribute('class') || '', // prefill the class editor (getAttribute: SVG-safe)
        path: buildBreadcrumbPath(attrChain(el)), // MP5.2a — root→leaf breadcrumb for the cockpit
        repeated: repeated > 1 ? repeated : 0, // 0 = unique on screen; N>1 = N live instances
        servedRoot, // FIX-MP-1 — the tree this dev server serves (dev-only marker; host proves lineage)
      });
      pin(el); // MP5.2a select-lock — the frame stays put until Esc or a new selection
    };
    const onClick = (ev: MouseEvent): void => {
      if (!on) return;
      const el = resolve(ev.clientX, ev.clientY);
      if (!el) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      // LP-4.8 §4 — Cmd/Ctrl-click ATTACHES the node as a reference instead of re-pinning: the
      // primary selection (the edit target) is untouched; the ref just joins the prompt's context.
      if (ev.metaKey || ev.ctrlKey) { addRef(el); return; }
      stopRepin(); // a manual pick wins — never let a pending re-pin watch fight the user
      selectEl(el);
    };
    // Shared stamped-node finder (breadcrumb re-select + LP-4 §5 re-pin). Disambiguation is on
    // the FULL stamp — file+line+col AND tag when given (stampMatches). Several DOM nodes can
    // still share the full stamp (a .map()/reused component): pin the first, and selectEl's
    // `repeated` count tells the cockpit to warn that the edit hits the template.
    const findStamped = (want: { file?: unknown; line?: unknown; col?: unknown; tag?: unknown }): Element | null => {
      const all = document.querySelectorAll('[data-insp-path]');
      for (let i = 0; i < all.length; i++) {
        if (stampMatches(all[i].getAttribute('data-insp-path'), want)) return all[i];
      }
      return null;
    };
    // MP5.2a — a breadcrumb chip in the cockpit asks to re-select an ancestor by its stamped
    // location. Read-only DOM scan; a stale location (HMR moved the code) simply finds nothing —
    // no fabricated selection.
    const reselect = (d: { file?: unknown; line?: unknown; col?: unknown; tag?: unknown }): void => {
      if (!on) return; // only while select mode is armed — no zero-interaction selection oracle
      const el = findStamped(d);
      if (el) selectEl(el);
    };
    // LP-4 §5 — re-pin after an apply. The byte-splice preserved the node's start, so the SAME
    // file:line:col stamp identifies it — but HMR swaps the DOM node a moment later. We watch for
    // ~5.6s and re-emit lp-select on EVERY new DOM identity (first find + each HMR swap), so the
    // panel's pin/stamp is refreshed from post-HMR reality and "agora mais escuro" iterates on the
    // same node with zero re-selection. Only while armed; a manual pick or Esc cancels the watch.
    let repinTimer: ReturnType<typeof setInterval> | null = null;
    const stopRepin = (): void => { if (repinTimer) { clearInterval(repinTimer); repinTimer = null; } };
    const repin = (d: { file?: unknown; line?: unknown; col?: unknown; tag?: unknown }): void => {
      stopRepin();
      if (!on) return;
      let lastEl: Element | null = null;
      let ticks = 0;
      const tick = (): void => {
        ticks++;
        if (!on || ticks > 14) { stopRepin(); return; }
        const el = findStamped(d);
        if (el && el.isConnected && el !== lastEl) {
          lastEl = el;
          selectEl(el); // fresh stamp: text/className/rect re-read from the live DOM
        }
      };
      tick();
      repinTimer = setInterval(tick, 400);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (on && ev.key === 'Escape') { set(false); post({ type: 'lp-select-mode-off' }); }
    };
    const set = (v: boolean): void => {
      if (v === on) {
        if (v) { ensure(); drawPin(); postPinRect(); }
        return;
      }
      on = v;
      if (v) {
        ensure();
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
        // capture-phase scroll catches nested scroll containers, not just the window
        document.addEventListener('scroll', onReflow, true);
        window.addEventListener('resize', onReflow);
        document.documentElement.style.cursor = 'crosshair';
      } else {
        stopRepin(); // leaving select mode cancels any pending re-pin watch
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('scroll', onReflow, true);
        window.removeEventListener('resize', onReflow);
        document.documentElement.style.cursor = '';
        teardown();
      }
    };
    return { set, reselect, repin, state: nodeState, detach: removeRef, detachAll: clearRefs, previewClass, clearPreview: clearPreviewClass, flash };
  })();

  window.addEventListener('message', (ev: MessageEvent) => {
    if (ev.source !== window.parent) return; // only the embedding cockpit may drive us
    const d = ev.data;
    if (!d || typeof d !== 'object') return;
    // MP5.1 — the cockpit toggles select-to-edit mode. Benign: only flips hover/click capture.
    if (d.type === 'lp-select-mode') {
      try { select.set(!!d.on); } catch { /* select mode is best-effort, never breaks the page */ }
      return;
    }
    // LP-4.8 §4 — the cockpit removed a reference chip (✕ or limpar). Benign: removes an overlay
    // box; no DOM read of the page beyond matching the stamp we already drew.
    if (d.type === 'lp-detach') {
      try { select.detach(d); } catch { /* best-effort */ }
      return;
    }
    if (d.type === 'lp-detach-all') {
      try { select.detachAll(); } catch { /* best-effort */ }
      return;
    }
    // LP-4.9 §5 — hover-preview a preset's className on the pinned element (visual only, no write).
    if (d.type === 'lp-preview-class') {
      try { select.previewClass(typeof d.className === 'string' ? d.className : ''); } catch { /* best-effort */ }
      return;
    }
    if (d.type === 'lp-preview-clear') {
      try { select.clearPreview(); } catch { /* best-effort */ }
      return;
    }
    // LP-4.9 §3 — flash the pin box after a write landed, so the eye lands on what changed.
    if (d.type === 'lp-flash') {
      try { select.flash(); } catch { /* best-effort */ }
      return;
    }
    // Selection Journey — host-authoritative lifecycle painted on the exact pinned stamp.
    if (d.type === 'lp-node-state') {
      try { select.state(d); } catch { /* best-effort — stale/mismatched stamps paint nothing */ }
      return;
    }
    // MP5.2a — a breadcrumb chip re-selects an ancestor node (re-pin + fresh lp-select). Benign:
    // read-only DOM lookup, same origin-locked sender as everything else here.
    if (d.type === 'lp-reselect') {
      try { select.reselect(d); } catch { /* best-effort — a stale crumb selects nothing */ }
      return;
    }
    // LP-4 §5 — the host just applied a write to this node: watch through the HMR swap and
    // re-emit lp-select with the fresh stamp (pin never stale; re-prompt without re-selecting).
    // Benign: read-only DOM scans, only while select mode is armed.
    if (d.type === 'lp-repin') {
      try { select.repin(d); } catch { /* best-effort — a vanished node re-pins nothing */ }
      return;
    }
    // MP3.3 — the cockpit's back/forward buttons drive the framed site's OWN history (the parent
    // cannot touch a cross-origin frame's history object directly). Benign: only back()/forward().
    if (d.type === 'lp-history') {
      try { if (d.dir === 'back') history.back(); else if (d.dir === 'forward') history.forward(); } catch { /* best-effort */ }
      return;
    }
    if (d.type !== 'lp-restore') return;
    try {
      const cur = location.pathname + location.search;
      if (typeof d.path === 'string' && d.path && d.path !== cur) history.replaceState(null, '', d.path);
      if (typeof d.scrollY === 'number' && isFinite(d.scrollY)) window.scrollTo(0, d.scrollY);
    } catch {
      /* restore is best-effort */
    }
  });

  // Handshake: tell the host we are live so it can send an initial restore even if it missed our
  // iframe 'load' event (covers the reload race, gate #5). FIX-MP-1 — also carry the served-tree
  // marker so the host can surface an honest tree-mismatch banner BEFORE the first selection.
  post({ type: 'lp-ready', servedRoot });
}
