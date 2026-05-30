'use client';

import { useEffect, useMemo, useState } from 'react';
import Card from '@/components/Card';
import Eyebrow from '@/components/Eyebrow';
import ProgressBar from '@/components/ProgressBar';

interface Pack {
  id: string;
  trust: number;
  installs: number;
  min_vram_gb: number;
  domain: string;
  savings_pct: number;
  models: string[];
  summary: string;
}

export default function PacksPage() {
  const [packs, setPacks] = useState<Pack[]>([]);
  const [domains, setDomains] = useState<string[]>([]);
  const [minTrust, setMinTrust] = useState(0);
  const [ready, setReady] = useState(false);

  // Load seed + restore filters from URL (acceptance: filter persists in URL params).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get('domain');
    const t = sp.get('trust');
    if (d) setDomains(d.split(',').filter(Boolean));
    if (t) setMinTrust(Number(t) || 0);
    fetch('/packs-seed.json')
      .then((r) => r.json())
      .then((j) => setPacks(j.packs ?? []))
      .catch(() => setPacks([]))
      .finally(() => setReady(true));
  }, []);

  // Persist filters to URL.
  useEffect(() => {
    if (!ready) return;
    const sp = new URLSearchParams();
    if (domains.length) sp.set('domain', domains.join(','));
    if (minTrust > 0) sp.set('trust', String(minTrust));
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [domains, minTrust, ready]);

  const allDomains = useMemo(() => Array.from(new Set(packs.map((p) => p.domain))), [packs]);

  const filtered = packs.filter(
    (p) => (domains.length === 0 || domains.includes(p.domain)) && p.trust >= minTrust,
  );

  function toggleDomain(d: string) {
    setDomains((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  return (
    <section style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }}>
      <Eyebrow>Pack browser</Eyebrow>
      <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 700, margin: '0 0 8px' }}>Got a Moo Pack?</h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 620, marginBottom: 36 }}>
        Domain bundles of models, skills, MCPs and scaffolds. Share with the herd.
      </p>

      <div className="packs-layout" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 28, alignItems: 'start' }}>
        {/* Filter sidebar */}
        <aside>
          <div style={{ fontWeight: 600, marginBottom: 10 }}>Domain</div>
          {allDomains.map((d) => (
            <label key={d} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '5px 0', fontSize: 14, color: 'var(--color-muted)', cursor: 'pointer' }}>
              <input type="checkbox" checked={domains.includes(d)} onChange={() => toggleDomain(d)} />
              {d}
            </label>
          ))}
          <div style={{ fontWeight: 600, margin: '18px 0 6px' }}>Min trust score</div>
          <input type="range" min={0} max={100} value={minTrust} onChange={(e) => setMinTrust(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
          <div className="num" style={{ fontSize: 13, color: 'var(--color-muted)' }}>≥ {minTrust}</div>
        </aside>

        {/* Card grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 18 }}>
          {!ready ? (
            <div style={{ color: 'var(--color-muted)' }}>Loading packs…</div>
          ) : filtered.length === 0 ? (
            <div style={{ color: 'var(--color-muted)' }}>No packs match your filters.</div>
          ) : (
            filtered.map((p) => (
              <Card key={p.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong>{p.id}</strong>
                  <span className="num" style={{ fontSize: 12, color: 'var(--color-green)' }}>trust {p.trust}</span>
                </div>
                <div className="num" style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 2 }}>{p.installs} installs</div>
                <p style={{ fontSize: 13.5, color: 'var(--color-muted)', marginTop: 12, minHeight: 56 }}>{p.summary}</p>
                <div style={{ fontSize: 12.5, color: 'var(--color-muted)', marginTop: 4 }}>
                  Models: <span className="num" style={{ color: 'var(--color-text)' }}>{p.models[0]}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '12px 0' }}>
                  <ProgressBar pct={p.savings_pct} color="var(--color-green)" />
                  <span className="num" style={{ fontSize: 12, width: 48 }}>{p.savings_pct}%</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={`/packs/${p.id}`} style={{ flex: 1, textAlign: 'center', background: 'var(--color-accent)', color: '#1A0E0E', fontWeight: 600, fontSize: 13, padding: '8px', borderRadius: 8 }}>Install</a>
                  <a href={`/packs/${p.id}`} style={{ flex: 1, textAlign: 'center', border: '1px solid var(--color-border-light)', fontSize: 13, padding: '8px', borderRadius: 8 }}>View detail</a>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
      <style>{`@media (max-width: 768px){ .packs-layout{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
