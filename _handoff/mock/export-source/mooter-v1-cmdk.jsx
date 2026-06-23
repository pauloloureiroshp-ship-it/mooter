/* mooter-v1-cmdk.jsx — global ⌘K command palette.
   Self-mounts on load. Mode from window.MOOTER_CMDK_MODE ('marketing'|'app').
   Marketing = navigation + reference. App = actions + commands + sessions.
   Exposed: CommandPalette (also self-mounts a root). */

const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const IN_APP = typeof location !== 'undefined' && location.pathname.includes('/app/');

function cmdkResolve(route) {
  const table = (typeof window !== 'undefined' && window.MOOTER_ROUTES) || {};
  return table[route] || route;
}
function cmdkGo(route) { const h = cmdkResolve(route); if (h) location.href = h; }
function cmdkCopy(text) { try { navigator.clipboard.writeText(text); } catch (e) {} }

const INSTALL_CMD_K = 'bash <(curl -fsSL https://mooter.ai/install.sh)';

function buildItems(mode, setToast) {
  const nav = (label, route, hint) => ({ group: 'Go to', label, hint: hint || '', kw: label, run: () => cmdkGo(route) });
  if (mode === 'app') {
    return [
      { group: 'Actions', label: 'Train a local adapter', hint: 'forge', kw: 'train adapter forge dora', run: () => setToast('Adapter training queued') },
      { group: 'Actions', label: 'Open digest', hint: '', kw: 'digest savings', run: () => cmdkGo('digest') },
      { group: 'Actions', label: 'Spawn an agent', hint: 'sandboxed', kw: 'spawn agent', run: () => setToast('Spawn — sandboxed by default') },
      { group: 'Navigate', label: 'Dashboard', hint: '', kw: 'dashboard home', run: () => cmdkGo('dashboard') },
      { group: 'Navigate', label: 'Your packs', hint: '', kw: 'packs', run: () => cmdkGo('packs') },
      { group: 'Navigate', label: 'Digest', hint: 'savings', kw: 'digest savings', run: () => cmdkGo('digest') },
      { group: 'Navigate', label: 'Community', hint: '', kw: 'community', run: () => cmdkGo('community') },
      { group: 'Navigate', label: 'Settings', hint: '', kw: 'settings subscriptions', run: () => cmdkGo('settings') },
      ...[
        ['/mooter why', 'explain last route'], ['/mooter status', 'live statusline'],
        ['/mooter override', 'pin a tier'], ['/mooter digest', 'savings digest'],
        ['/mooter pack list', 'installed packs'], ['/mooter forge train', 'train adapter'],
        ['/mooter share', 'toggle telemetry'],
      ].map(([cmd, desc]) => ({ group: 'Copy command', label: cmd, hint: desc, kw: cmd + ' ' + desc, run: () => { cmdkCopy(cmd); setToast('Copied  ' + cmd); } })),
    ];
  }
  // marketing
  return [
    nav('Home', 'home'),
    nav('How it works', 'under-hood', 'quantization · adapters'),
    nav('Packs', 'packs', 'Moo Packs'),
    nav('Compare', 'compare', '11/11'),
    nav('Commands', 'commands', '/mooter'),
    nav('Install', 'install', '30s'),
    nav('Conductor', 'conductor', 'multi-session'),
    nav('Workflow', 'workflow', 'live visibility'),
    nav('Cockpit', 'cockpit', 'VS Code plugin'),
    nav('Methodology', 'methodology', 'cost calculator'),
    nav('Privacy', 'privacy'),
    { group: 'Reference', label: 'Sessions', hint: 'soon', kw: 'sessions', run: () => cmdkGo('sessions') },
    { group: 'Reference', label: 'Security', hint: '4-layer sandbox', kw: 'security sandbox cve', run: () => cmdkGo('security') },
    { group: 'Reference', label: 'Changelog', hint: 'waves', kw: 'changelog waves release', run: () => cmdkGo('changelog') },
    { group: 'Account', label: 'Sign in', hint: 'GitHub', kw: 'sign in login github', run: () => cmdkGo('signin') },
    { group: 'Actions', label: 'Copy install command', hint: INSTALL_CMD_K, kw: 'install copy curl bash', run: (setT) => { cmdkCopy(INSTALL_CMD_K); setToast('Copied install command'); } },
  ];
}

function CommandPalette({ mode = 'marketing' }) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [active, setActive] = React.useState(0);
  const [toast, setToast] = React.useState(null);
  const inputRef = React.useRef(null);
  const listRef = React.useRef(null);

  const items = React.useMemo(() => buildItems(mode, (m) => { setToast(m); setOpen(false); setTimeout(() => setToast(null), 1900); }), [mode]);
  const filtered = React.useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter((it) => it.kw.toLowerCase().includes(s) || it.label.toLowerCase().includes(s));
  }, [q, items]);

  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((o) => !o); return; }
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); const it = filtered[active]; if (it) { it.run(); if (!String(it.label).startsWith('/') && it.group !== 'Copy command' && it.group !== 'Actions') {} setOpen(false); } }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, active]);

  React.useEffect(() => { if (open) { setQ(''); setActive(0); setTimeout(() => inputRef.current && inputRef.current.focus(), 30); } }, [open]);
  React.useEffect(() => { setActive(0); }, [q]);

  // group filtered preserving order
  const groups = [];
  filtered.forEach((it) => { let g = groups.find((x) => x.name === it.group); if (!g) { g = { name: it.group, items: [] }; groups.push(g); } g.items.push(it); });
  let flatIdx = -1;

  return (
    <React.Fragment>
      {/* hint chip — marketing only */}
      {mode === 'marketing' && !open && (
        <button onClick={() => setOpen(true)} style={{
          position: 'fixed', right: 22, bottom: 22, zIndex: 9998, cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          color: 'var(--muted)', fontFamily: 'var(--font-mono)', fontSize: 12.5,
          boxShadow: '0 8px 30px -12px rgba(0,0,0,0.6)',
        }}>
          <span>Press</span>
          <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)', background: 'var(--bg-2)', border: '1px solid var(--border)', borderRadius: 5, padding: '1px 6px' }}>{MOD} K</kbd>
          <span>to search</span>
        </button>
      )}

      {toast && (
        <div style={{ position: 'fixed', right: 22, bottom: 22, zIndex: 9999, padding: '11px 16px', background: 'var(--accent)', color: 'var(--bg)', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 12.5, fontWeight: 600, boxShadow: '0 10px 36px -12px rgba(0,0,0,0.7)' }}>
          ✓ {toast}
        </div>
      )}

      {open && (
        <div onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }} style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(8,7,6,0.62)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
        }}>
          <div style={{ width: 'min(620px, 92vw)', background: 'var(--bg-2)', border: '1px solid var(--border-light, var(--border))', borderRadius: 16, overflow: 'hidden', boxShadow: '0 40px 120px -30px rgba(0,0,0,0.8)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--muted)', fontSize: 16 }}>⌕</span>
              <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === 'app' ? 'Search actions, commands, sessions…' : 'Search pages, docs, actions…'} style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)',
                fontFamily: 'var(--font-sans)', fontSize: 16, letterSpacing: '-0.01em',
              }} />
              <kbd style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, padding: '2px 7px' }}>esc</kbd>
            </div>

            <div ref={listRef} style={{ maxHeight: 'min(54vh, 460px)', overflowY: 'auto', overflowX: 'hidden', padding: '8px 8px 10px' }}>
              {filtered.length === 0 && (
                <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 14 }}>No matches for “{q}”.</div>
              )}
              {groups.map((g) => (
                <div key={g.name} style={{ marginTop: 6 }}>
                  <div style={{ padding: '8px 12px 4px', fontFamily: 'var(--font-mono)', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--muted)' }}>{g.name}</div>
                  {g.items.map((it) => {
                    flatIdx += 1; const idx = flatIdx; const isActive = idx === active;
                    const mono = g.name === 'Copy command';
                    return (
                      <div key={it.label} onMouseEnter={() => setActive(idx)} onMouseDown={(e) => { e.preventDefault(); it.run(); setOpen(false); }} style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                        background: isActive ? 'var(--accent-12)' : 'transparent',
                        border: isActive ? '1px solid var(--accent-25)' : '1px solid transparent',
                      }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: isActive ? 'var(--accent)' : 'var(--border-light, var(--border))', flexShrink: 0 }} />
                        <span style={{ fontSize: 14, color: 'var(--text)', fontFamily: mono ? 'var(--font-mono)' : 'var(--font-sans)', fontWeight: mono ? 600 : 500 }}>{it.label}</span>
                        {it.hint && <span style={{ marginLeft: 'auto', fontSize: 11.5, color: 'var(--muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 240 }}>{it.hint}</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '10px 18px', borderTop: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted)' }}>
              <span><span style={{ color: 'var(--text)' }}>↵</span> open</span>
              <span><span style={{ color: 'var(--text)' }}>↑↓</span> navigate</span>
              <span><span style={{ color: 'var(--text)' }}>esc</span> close</span>
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />mooter {mode}
              </span>
            </div>
          </div>
        </div>
      )}
    </React.Fragment>
  );
}

Object.assign(window, { CommandPalette });

/* self-mount */
(function () {
  function mount() {
    if (document.getElementById('mooter-cmdk-root')) return;
    var el = document.createElement('div');
    el.id = 'mooter-cmdk-root';
    document.body.appendChild(el);
    try { ReactDOM.createRoot(el).render(React.createElement(CommandPalette, { mode: window.MOOTER_CMDK_MODE || 'marketing' })); } catch (e) { console.error('cmdk mount failed', e); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
