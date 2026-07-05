// lp-error-tap.test.ts — Live Preview · MP4 · the DEV-ONLY tap's pure parse layer.
// These three helpers are gate-critical (they decide whether the strip shows the right message +
// file:line and whether an error is build vs runtime) yet run inside a cross-origin iframe the host
// cannot see — so unit-proving them here is the only CI signal that guards gates #1/#4 against a
// regression. DOM-free by construction, so a node-env vitest exercises them directly.
import { describe, it, expect } from 'vitest';
import {
  parseStackForSource,
  classifyOverlay,
  parseOverlay,
  parseHmrError,
  buildBoundaryErrorPayload,
  reportBoundaryError,
} from './lp-error-tap';

describe('parseStackForSource', () => {
  it('picks the first user-source frame (path + line:col), skipping framework noise', () => {
    const stack = [
      'Error: boom @ hero',
      '    at Home (webpack-internal:///(app-pages-browser)/./app/page.tsx:7:9)',
      '    at renderWithHooks (webpack-internal:///node_modules/react-dom/cjs/react-dom.dev.js:15486:18)',
    ].join('\n');
    const r = parseStackForSource(stack);
    expect(r.file).toContain('app/page.tsx');
    expect(r.line).toBe(7);
    expect(r.col).toBe(9);
  });

  it('skips node_modules and _next runtime frames', () => {
    const stack = [
      'Error: x',
      '    at http://localhost:7819/_next/static/chunks/webpack.js:1:1',
      '    at Comp (app/components/Widget.tsx:12:3)',
    ].join('\n');
    expect(parseStackForSource(stack).file).toContain('Widget.tsx');
    expect(parseStackForSource(stack).line).toBe(12);
  });

  it('returns {} for an empty / undefined stack (never throws)', () => {
    expect(parseStackForSource(undefined)).toEqual({});
    expect(parseStackForSource('')).toEqual({});
  });
});

describe('classifyOverlay', () => {
  it('build/compile overlays → build', () => {
    expect(classifyOverlay('Build Error Failed to compile ./app/page.tsx')).toBe('build');
    expect(classifyOverlay('Module not found: Can\'t resolve "foo"')).toBe('build');
    expect(classifyOverlay('Parsing ecmascript source code failed')).toBe('build');
  });

  it('unhandled runtime overlays → runtime', () => {
    expect(classifyOverlay('Unhandled Runtime Error Error: boom @ hero')).toBe('runtime');
    expect(classifyOverlay('Error: something blew up at Home')).toBe('runtime');
  });
});

describe('parseOverlay', () => {
  it('extracts a BARE Error message (the canonical throw new Error) + file:line (gate #1)', () => {
    const text = 'Unhandled Runtime Error Error: boom @ hero Source app/page.tsx (7:9) @ Home';
    const r = parseOverlay(text);
    expect(r.message).toContain('boom @ hero');
    expect(r.message.startsWith('Error:')).toBe(true);
    expect(r.file).toBe('app/page.tsx');
    expect(r.line).toBe(7);
    expect(r.col).toBe(9);
  });

  it('extracts a typed error (TypeError) + colon-delimited location', () => {
    const r = parseOverlay('TypeError: x is not a function at app/lib/util.ts:42:11');
    expect(r.message.startsWith('TypeError:')).toBe(true);
    expect(r.file).toBe('app/lib/util.ts');
    expect(r.line).toBe(42);
  });

  it('extracts a build "Failed to compile" message', () => {
    const r = parseOverlay('Build Error Failed to compile ./app/page.tsx Syntax Error');
    expect(r.message).toContain('Failed to compile');
  });

  it('never throws; falls back to a truncated snippet when nothing matches', () => {
    expect(() => parseOverlay('')).not.toThrow();
    const r = parseOverlay('some overlay chrome with no error shape');
    expect(typeof r.message).toBe('string');
  });
});

// ── parseHmrError — the MP4.1 second path: a Next dev HMR `errors[]` entry (compile error) → strip row.
describe('parseHmrError', () => {
  it('object with moduleName + explicit loc → message + file + line:col', () => {
    const r = parseHmrError({
      message: "Module not found: Can't resolve './missing'",
      moduleName: './app/page.tsx',
      loc: '7:9',
    });
    expect(r.message).toContain('Module not found');
    expect(r.file).toBe('app/page.tsx');
    expect(r.line).toBe(7);
    expect(r.col).toBe(9);
  });

  it('webpack loc range "111:39-60" → line 111, col 39 (start col wins)', () => {
    const r = parseHmrError({ message: 'Critical dependency', moduleName: './app/lib/x.ts', loc: '111:39-60' });
    expect(r.line).toBe(111);
    expect(r.col).toBe(39);
  });

  it('bare string with an inline file:line is parsed too', () => {
    const r = parseHmrError('./app/lib/util.ts:42:11 — Type error: x is not assignable');
    expect(typeof r.message).toBe('string');
    expect(r.file).toBe('app/lib/util.ts');
    expect(r.line).toBe(42);
  });

  it('junk → { message: "" } so the caller DROPS it (never a fabricated red row); never throws', () => {
    expect(parseHmrError(null).message).toBe('');
    expect(parseHmrError({}).message).toBe('');
    expect(parseHmrError(42 as unknown).message).toBe('');
    expect(() => parseHmrError(undefined)).not.toThrow();
  });
});

// ── buildBoundaryErrorPayload — the MP4.1 PRIMARY path: the payload a React error boundary relays for a
// Server Component throw. This is the gate-critical mapping (server throw → red strip WITH file:line); it
// runs inside a cross-origin iframe the host cannot see, so unit-proving it here is the only CI signal.
describe('buildBoundaryErrorPayload (server-component throw → lp-error payload)', () => {
  it('maps a caught server-render Error to a runtime lp-error with message + file:line from the stack', () => {
    // A realistic Next 15 dev stack for a throw inside a Server Component render (see 2026-07-05 capture).
    const err = new Error('MP41_SERVER_BOOM at mp41lab');
    err.stack = [
      'Error: MP41_SERVER_BOOM at mp41lab',
      '    at Mp41Lab (webpack-internal:///(app-pages-browser)/./app/mp41lab/page.tsx:5:9)',
      '    at renderWithHooks (webpack-internal:///node_modules/react-dom/cjs/react-dom.dev.js:15486:18)',
    ].join('\n');
    const p = buildBoundaryErrorPayload(err);
    expect(p.type).toBe('lp-error');
    expect(p.kind).toBe('runtime'); // a caught render throw is a RED runtime failure, not amber build
    expect(p.message).toContain('MP41_SERVER_BOOM');
    expect(p.file).toContain('app/mp41lab/page.tsx'); // file:line survives → the strip can open it
    expect(p.line).toBe(5);
    expect(p.col).toBe(9);
  });

  it('a non-Error (string) still relays; a nullish error uses the honest "server error" fallback', () => {
    expect(buildBoundaryErrorPayload('boom from a thrown string').message).toBe('boom from a thrown string');
    expect(buildBoundaryErrorPayload(null).message).toBe('server error');
    expect(buildBoundaryErrorPayload(undefined).kind).toBe('runtime');
  });

  it('accepts an explicit kind override and never throws on garbage input', () => {
    expect(buildBoundaryErrorPayload(new Error('x'), 'build').kind).toBe('build');
    expect(() => buildBoundaryErrorPayload({ not: 'an error' })).not.toThrow();
  });
});

// ── reportBoundaryError — the RUNTIME emit path (window.parent.postMessage). Node has no `window`, so
// we stub the minimal surface the function touches. Proves the boundary actually RELAYS a server throw
// when embedded, and is an honest NO-OP on a normally-browsed dev page (window.parent === window).
describe('reportBoundaryError (runtime relay to the embedding cockpit)', () => {
  const withWindow = (win: unknown, fn: () => void): void => {
    const g = globalThis as unknown as { window?: unknown };
    const prev = 'window' in g ? g.window : undefined;
    g.window = win;
    try { fn(); } finally { g.window = prev; }
  };

  it('embedded → posts the exact lp-error payload to window.parent with targetOrigin "*"', () => {
    const posts: Array<{ msg: Record<string, unknown>; origin: string }> = [];
    const parent = { postMessage: (msg: Record<string, unknown>, origin: string) => posts.push({ msg, origin }) };
    withWindow({ parent }, () => {
      const err = new Error('MP41_SERVER_BOOM at mp41lab');
      err.stack =
        'Error: MP41_SERVER_BOOM at mp41lab\n    at Mp41Lab (webpack-internal:///(app-pages-browser)/./app/mp41lab/page.tsx:5:9)';
      reportBoundaryError(err);
    });
    expect(posts).toHaveLength(1);
    expect(posts[0].origin).toBe('*'); // parent's vscode-webview:// origin is opaque; the host re-validates
    const m = posts[0].msg;
    expect(m.type).toBe('lp-error');
    expect(m.kind).toBe('runtime');
    expect(String(m.message)).toContain('MP41_SERVER_BOOM');
    expect(String(m.file)).toContain('app/mp41lab/page.tsx');
    expect(m.line).toBe(5);
  });

  it('NOT embedded (window.parent === window) → no post; a normally-browsed dev page is untouched', () => {
    const posts: unknown[] = [];
    const w: Record<string, unknown> = { postMessage: (msg: unknown) => posts.push(msg) };
    w.parent = w; // top-level window: parent is itself
    withWindow(w, () => reportBoundaryError(new Error('x')));
    expect(posts).toHaveLength(0);
  });
});
