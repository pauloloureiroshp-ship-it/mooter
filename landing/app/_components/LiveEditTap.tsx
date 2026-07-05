'use client';

// Live Edit · MP5.0/5.1 — the dev-only in-app "select agent".
//
// WHY this exists in the app and not the host: the VS Code webview (vscode-webview://) is a
// DIFFERENT origin from the framed dev server (localhost) and CANNOT read this iframe's DOM. So the
// agent that reads hover/click must live INSIDE the app. It stays dormant until the host toggles
// select-mode (postMessage handshake), then: highlights the `[data-insp-path]` element under the
// cursor (shadow DOM overlay, pointer-events:none — never bleeds CSS, never eats the click it's
// drawing) and, on click, reports the stamped source location (file:line:col:tag) + rect UP to the
// webview, which forwards it to the host for click-to-code / $0 AST edit.
//
// DEAD-CODE IN PROD: the whole body is behind `process.env.NODE_ENV !== 'production'`, so Next
// tree-shakes it out of the production bundle. The `data-insp-path` attribute is likewise only
// stamped by `npm run dev:inspect` (turbopack + code-inspector-plugin), never by `next build`.

import { useEffect } from 'react';

const MARK = 'mooter-liveedit'; // our postMessage tag; the webview validates this + ev.origin.

type Sel = { path: string; file: string; line: number; col: number; tag: string | null };

// Parse the `data-insp-path` value → parts. Handles "file:line:col:tag" AND a tag-less
// "file:line:col", and survives a Windows drive colon (C:\…:12:4:div): a purely-numeric last token
// means "no tag" (JSX tag names are never all digits); whatever remains after popping is the file.
function parseInsp(raw: string | null): Sel | null {
  if (!raw) return null;
  const parts = raw.split(':');
  if (parts.length < 3) return null;
  let tag: string | null = null;
  if (!/^\d+$/.test(parts[parts.length - 1])) tag = parts.pop() as string;
  const col = Number(parts.pop());
  const line = Number(parts.pop());
  const file = parts.join(':');
  if (!file || !Number.isFinite(line) || !Number.isFinite(col)) return null;
  return { path: raw, file, line, col, tag: tag || null };
}

export default function LiveEditTap() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    // Only meaningful when framed by the Live Preview host (an iframe with a parent).
    if (typeof window === 'undefined' || window.parent === window) return;

    let active = false;
    let hostEl: HTMLDivElement | null = null;
    let box: HTMLDivElement | null = null;

    // Shadow-DOM overlay: a highlight box + a tiny mode badge, both inert (pointer-events:none) so
    // they never intercept the pointer and never inherit the app's CSS.
    function ensureOverlay() {
      if (hostEl) return;
      hostEl = document.createElement('div');
      hostEl.setAttribute('data-mooter-liveedit-overlay', '');
      hostEl.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none;';
      const shadow = hostEl.attachShadow({ mode: 'open' });
      box = document.createElement('div');
      box.style.cssText = [
        'position:fixed', 'pointer-events:none', 'box-sizing:border-box',
        'border:2px solid #7C9CF4', 'background:rgba(124,156,244,0.14)',
        'border-radius:4px', 'transition:all 40ms linear', 'display:none',
        'box-shadow:0 0 0 1px rgba(0,0,0,0.25)',
      ].join(';');
      const badge = document.createElement('div');
      badge.textContent = '✏️ Live Edit — clica um elemento';
      badge.style.cssText = [
        'position:fixed', 'top:8px', 'left:50%', 'transform:translateX(-50%)',
        'font:600 11px system-ui,sans-serif', 'color:#fff', 'background:#3B5BDB',
        'padding:3px 10px', 'border-radius:999px', 'pointer-events:none', 'opacity:0.92',
      ].join(';');
      shadow.appendChild(box);
      shadow.appendChild(badge);
      document.body.appendChild(hostEl);
    }
    function removeOverlay() {
      if (hostEl && hostEl.parentNode) hostEl.parentNode.removeChild(hostEl);
      hostEl = null; box = null;
    }
    function hideBox() { if (box) box.style.display = 'none'; }
    function highlight(el: Element) {
      if (!box) return;
      const r = el.getBoundingClientRect();
      box.style.display = 'block';
      box.style.left = r.left + 'px';
      box.style.top = r.top + 'px';
      box.style.width = r.width + 'px';
      box.style.height = r.height + 'px';
    }

    function targetAt(x: number, y: number): Element | null {
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      return el.closest('[data-insp-path]');
    }

    function onMove(e: MouseEvent) {
      if (!active) return;
      const el = targetAt(e.clientX, e.clientY);
      if (el) highlight(el); else hideBox();
    }

    function onClick(e: MouseEvent) {
      if (!active) return;
      const el = targetAt(e.clientX, e.clientY);
      if (!el) return;
      // Swallow the click so the app itself doesn't react (navigation, buttons, etc.).
      e.preventDefault();
      e.stopImmediatePropagation();
      const sel = parseInsp(el.getAttribute('data-insp-path'));
      if (!sel) return;
      const r = el.getBoundingClientRect();
      const text = (el.textContent || '').trim().slice(0, 200);
      window.parent.postMessage({
        source: MARK, type: 'lp-select',
        path: sel.path, file: sel.file, line: sel.line, col: sel.col, tag: sel.tag,
        rect: { x: r.left, y: r.top, width: r.width, height: r.height }, text,
      }, '*');
    }

    function onKey(e: KeyboardEvent) {
      if (active && e.key === 'Escape') { setActive(false); window.parent.postMessage({ source: MARK, type: 'lp-cancel' }, '*'); }
    }

    function setActive(on: boolean) {
      if (on === active) return;
      active = on;
      if (on) {
        ensureOverlay();
        document.addEventListener('mousemove', onMove, true);
        document.addEventListener('click', onClick, true);
        document.addEventListener('keydown', onKey, true);
      } else {
        document.removeEventListener('mousemove', onMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKey, true);
        removeOverlay();
      }
    }

    // Handshake from the host (relayed by the webview). We accept the mode toggle from our parent
    // only; the payload is inert (a boolean), so there is no injection surface here.
    function onHostMsg(e: MessageEvent) {
      const m = e.data;
      if (!m || m.source !== 'mooter-host') return;
      if (m.type === 'liveedit-mode') setActive(!!m.on);
    }
    window.addEventListener('message', onHostMsg);
    // Announce readiness so the host can reflect "source-map on" honestly.
    try {
      window.parent.postMessage({ source: MARK, type: 'lp-ready', hasInsp: !!document.querySelector('[data-insp-path]') }, '*');
    } catch { /* not framed / cross-origin restriction — ignore */ }

    return () => {
      window.removeEventListener('message', onHostMsg);
      setActive(false);
    };
  }, []);

  return null;
}
