'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Command } from 'cmdk';

// CmdKPalette — global ⌘K / Ctrl+K command palette (Wave 33.9, carried from
// landing-v12-deploy/mooter-v1-cmdk.jsx). Built on the `cmdk` library for
// accessible listbox semantics + filtering; styled with the existing hand-rolled
// --color-* tokens. Mode is derived from the route: /dashboard|/settings|/admin
// → "app" (actions + commands), everything else → "marketing" (navigation + docs).

const INSTALL_CMD = 'bash <(curl -fsSL https://mooter.ai/install.sh)';

type Item = {
  group: string;
  label: string;
  hint?: string;
  keywords: string[];
  mono?: boolean;
  run: () => void;
};

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
}

export default function CmdKPalette() {
  const router = useRouter();
  const pathname = usePathname() || '/';
  const mode: 'app' | 'marketing' =
    /^\/(dashboard|settings|admin)(\/|$)/.test(pathname) ? 'app' : 'marketing';

  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mod, setMod] = useState('Ctrl');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMod(isMac() ? '⌘' : 'Ctrl');
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const flash = useCallback((msg: string) => {
    setToast(msg);
    setOpen(false);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 1900);
  }, []);

  const copy = useCallback(
    (text: string, msg: string) => {
      try {
        void navigator.clipboard?.writeText(text);
      } catch {
        /* clipboard unavailable — fail silently */
      }
      flash(msg);
    },
    [flash],
  );

  const items = useMemo<Item[]>(() => {
    if (mode === 'app') {
      const cmds: [string, string][] = [
        ['/mooter why', 'explain last route'],
        ['/mooter status', 'live statusline'],
        ['/mooter override', 'pin a tier'],
        ['/mooter digest', 'savings digest'],
        ['/mooter pack list', 'installed packs'],
      ];
      return [
        { group: 'Navigate', label: 'Dashboard', keywords: ['dashboard', 'home', 'savings'], run: () => go('/dashboard') },
        { group: 'Navigate', label: 'Settings', keywords: ['settings', 'subscriptions', 'account'], run: () => go('/settings') },
        { group: 'Navigate', label: 'Packs', keywords: ['packs', 'moo'], run: () => go('/packs') },
        { group: 'Navigate', label: 'Compare', hint: '11/11', keywords: ['compare', 'field'], run: () => go('/compare') },
        ...cmds.map<Item>(([cmd, desc]) => ({
          group: 'Copy command',
          label: cmd,
          hint: desc,
          keywords: [cmd, desc],
          mono: true,
          run: () => copy(cmd, `Copied  ${cmd}`),
        })),
      ];
    }
    // marketing
    return [
      { group: 'Go to', label: 'Home', keywords: ['home', 'mooter'], run: () => go('/') },
      { group: 'Go to', label: 'How it works', hint: 'quantization · adapters', keywords: ['how', 'under the hood', 'routing'], run: () => go('/under-the-hood') },
      { group: 'Go to', label: 'Packs', hint: 'Moo Packs', keywords: ['packs', 'moo'], run: () => go('/packs') },
      { group: 'Go to', label: 'Compare', hint: '11/11', keywords: ['compare', 'field', 'agents'], run: () => go('/compare') },
      { group: 'Go to', label: 'Conductor', hint: 'multi-session', keywords: ['conductor', 'locks', 'git', 'sessions'], run: () => go('/conductor') },
      { group: 'Go to', label: 'Workflow', hint: 'live visibility', keywords: ['workflow', 'agents', 'chip'], run: () => go('/workflow') },
      { group: 'Go to', label: 'Methodology', hint: 'cost calculator', keywords: ['methodology', 'benchmark', 'estimate'], run: () => go('/methodology') },
      { group: 'Reference', label: 'Security', hint: '4-layer sandbox', keywords: ['security', 'sandbox', 'cve'], run: () => go('/security') },
      { group: 'Reference', label: 'Privacy', keywords: ['privacy', 'data', 'telemetry'], run: () => go('/privacy') },
      { group: 'Reference', label: 'Changelog', hint: 'waves', keywords: ['changelog', 'waves', 'release'], run: () => go('/changelog') },
      { group: 'Account', label: 'Sign in', hint: 'GitHub', keywords: ['sign in', 'login', 'github'], run: () => go('/dashboard') },
      { group: 'Actions', label: 'Copy install command', hint: INSTALL_CMD, keywords: ['install', 'copy', 'curl', 'bash'], mono: true, run: () => copy(INSTALL_CMD, 'Copied install command') },
    ];
  }, [mode, go, copy]);

  // Global ⌘K / Ctrl+K toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus the input on open; restore focus to the trigger on close.
  useEffect(() => {
    if (open) {
      lastFocused.current = (document.activeElement as HTMLElement) ?? null;
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    lastFocused.current?.focus?.();
  }, [open]);

  // Group items in declaration order (cmdk preserves DOM order for nav).
  const groups = useMemo(() => {
    const out: { name: string; items: Item[] }[] = [];
    for (const it of items) {
      let g = out.find((x) => x.name === it.group);
      if (!g) { g = { name: it.group, items: [] }; out.push(g); }
      g.items.push(it);
    }
    return out;
  }, [items]);

  return (
    <>
      {/* Hint chip — marketing only, hidden while open */}
      {mode === 'marketing' && !open && (
        <button
          type="button"
          aria-label={`Open command palette (${mod} K)`}
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed', right: 22, bottom: 22, zIndex: 60, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px',
            background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10,
            color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', fontSize: 12.5,
            boxShadow: '0 8px 30px -12px rgba(0,0,0,0.6)',
          }}
        >
          <span>Press</span>
          <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-text)', background: 'var(--color-bg-2)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '1px 6px' }}>{mod} K</kbd>
          <span>to search</span>
        </button>
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: 'fixed', right: 22, bottom: 22, zIndex: 70, padding: '11px 16px',
            background: 'var(--color-accent)', color: 'var(--color-bg)', borderRadius: 10,
            fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600,
            boxShadow: '0 10px 36px -12px rgba(0,0,0,0.7)',
          }}
        >
          ✓ {toast}
        </div>
      )}

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(8,7,6,0.62)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
          }}
        >
          <Command
            label="Command palette"
            shouldFilter
            onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } }}
            style={{
              width: 'min(620px, 92vw)', background: 'var(--color-bg-2)',
              border: '1px solid var(--color-border-light)', borderRadius: 16, overflow: 'hidden',
              boxShadow: '0 40px 120px -30px rgba(0,0,0,0.8)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--color-border)' }}>
              <span aria-hidden style={{ color: 'var(--color-muted)', fontSize: 16 }}>⌕</span>
              <Command.Input
                ref={inputRef}
                placeholder={mode === 'app' ? 'Search actions, commands…' : 'Search pages, docs, actions…'}
                style={{
                  flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--color-text)',
                  fontFamily: 'var(--font-sans)', fontSize: 16, letterSpacing: '-0.01em',
                }}
              />
              <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)', background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 4, padding: '2px 7px' }}>esc</kbd>
            </div>

            <Command.List style={{ maxHeight: 'min(54vh, 460px)', overflowY: 'auto', overflowX: 'hidden', padding: '8px 8px 10px' }}>
              <Command.Empty style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--color-muted)', fontSize: 14 }}>
                No matches.
              </Command.Empty>
              {groups.map((g) => (
                <Command.Group
                  key={g.name}
                  heading={g.name}
                  style={{ marginTop: 6 }}
                >
                  {g.items.map((it) => (
                    <Command.Item
                      key={it.label}
                      value={it.label}
                      keywords={it.keywords}
                      onSelect={it.run}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 8, cursor: 'pointer',
                      }}
                    >
                      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-border-light)', flexShrink: 0 }} />
                      <span style={{ fontSize: 14, color: 'var(--color-text)', fontFamily: it.mono ? 'var(--font-mono)' : 'var(--font-sans)', fontWeight: it.mono ? 600 : 500 }}>{it.label}</span>
                      {it.hint && (
                        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{it.hint}</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}
            </Command.List>

            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '10px 18px', borderTop: '1px solid var(--color-border)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--color-muted)' }}>
              <span><span style={{ color: 'var(--color-text)' }}>↵</span> open</span>
              <span><span style={{ color: 'var(--color-text)' }}>↑↓</span> navigate</span>
              <span><span style={{ color: 'var(--color-text)' }}>esc</span> close</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--color-accent)' }} />mooter {mode}
              </span>
            </div>
          </Command>
        </div>
      )}

      {/* cmdk active-item highlight via the data attribute it sets */}
      <style>{`
        [cmdk-group-heading] { padding: 8px 12px 4px; font-family: var(--font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-muted); }
        [cmdk-item][data-selected="true"] { background: var(--color-accent-12); outline: 1px solid var(--color-accent-25); }
        [cmdk-item][data-selected="true"] > span:first-child { background: var(--color-accent) !important; }
      `}</style>
    </>
  );
}
