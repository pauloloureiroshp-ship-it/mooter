'use client';

import { useEffect, useMemo, useState } from 'react';
import Cartucho from '@/components/Cartucho';
import RevealOnView from '../compare/RevealOnView';
import versionInfo from '../../version.json';

// DES. 003 — o catálogo dos packs, na gramática de papel milimétrico fixada a
// 2026-08-27. Era um browser de CAIXAS: `<Card>` com fundo próprio e raio 14,
// uma sidebar com um bloco rosa, e um eyebrow rosa por cima do título. A regra
// é o inverso: hairline separa, a anotação vive na MARGEM, e o rosa fica só
// para o `?` do wordmark, para as cotas e para o CTA (aqui, o botão Install).
//
// O que saiu além do desenho — e importa mais: cada cartão publicava
// `{savings_pct}% saved vs all-Opus`, entre 65% e 89%, lido de
// `public/packs-seed.json`. Esse campo não tem medição por trás — este projecto
// não regista tokens, portanto não tem custo medido de que derivar poupança —
// e a decisão do dono de 2026-08-24 bane exactamente esse claim. A percentagem
// foi retirada (aqui e na barra que a desenhava); o resto da metadata do pack
// — trust, installs, VRAM, composição de modelos — fica, porque é o que o seed
// realmente contém. O ficheiro de seed não foi tocado.

interface Pack {
  id: string;
  trust: number;
  installs: number;
  min_vram_gb: number;
  domain: string;
  /** Existe no seed, NÃO é renderizado — ver o cabeçalho desta folha. */
  savings_pct: number;
  models: string[];
  summary: string;
}

// Derived, honest composition counts: how many models a pack bundles, split into
// local (skills run on local models) vs cloud. No invented data — purely a view
// over the real `models` array already in the seed.
function composition(p: Pack) {
  const local = p.models.filter((m) => !m.startsWith('claude-')).length;
  const cloud = p.models.filter((m) => m.startsWith('claude-')).length;
  return { models: p.models.length, local, cloud };
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

  const allDomains = useMemo(
    () => Array.from(new Set(packs.map((p) => p.domain))).sort(),
    [packs],
  );

  // Highest-install pack is the only one flagged "trending" — derived from real
  // data, not a hand-set flag.
  const topInstalls = useMemo(
    () => packs.reduce((max, p) => Math.max(max, p.installs), 0),
    [packs],
  );

  const filtered = useMemo(
    () =>
      packs
        .filter(
          (p) =>
            (domains.length === 0 || domains.includes(p.domain)) && p.trust >= minTrust,
        )
        .sort((a, b) => b.trust - a.trust),
    [packs, domains, minTrust],
  );

  function toggleDomain(d: string) {
    setDomains((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));
  }

  return (
    <section className="m-pad m-pad-y" style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid — a direcção fixada a
          2026-08-27 é papel milimétrico, e um desenho técnico assenta numa
          grelha, não num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />

      {/* O cartucho identifica a folha antes de qualquer conteúdo. A revisão vem
          de version.json, escrito pelo version-sync a partir da tag. */}
      <Cartucho o_que="OS PACKS" desenho="003" revisao={`v${versionInfo.version}`} data="2026-08-27" />

      {/* O ÚNICO momento extremo da folha (regra 10). Um. */}
      <div style={{ position: 'relative', padding: '48px 0 0' }}>
        <h1 className="moo-h1" style={{ margin: '0 0 12px', maxWidth: 900 }}>
          Mooter picks. <span style={{ color: 'var(--color-muted)' }}>Packs deliver.</span>
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 660, lineHeight: 1.55, margin: 0 }}>
          Tired of picking which skill, repo, or agent? Domain bundles of models, skills, MCPs and scaffolds, so each
          prompt lands on the model best suited to that kind of work. Share with the herd.
        </p>
      </div>

      {/* Filtros. A margem conta o que está de facto no seed — não é decoração:
          `allDomains` e `minTrust` são estado real desta página. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          filtros
          <b>{ready ? `${allDomains.length} domínios` : 'n/d'}</b>
          trust ≥ {minTrust}
        </div>
        <div>
          <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>Domain</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 22px', marginTop: 10 }}>
            {ready && allDomains.length === 0 ? (
              <span style={{ fontSize: 13, color: 'var(--color-muted)' }}>n/d</span>
            ) : null}
            {allDomains.map((d) => {
              const on = domains.includes(d);
              return (
                <label
                  key={d}
                  style={{
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    padding: '5px 0',
                    fontSize: 13.5,
                    color: on ? 'var(--color-text)' : 'var(--color-muted)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleDomain(d)}
                    style={{ accentColor: 'var(--color-accent)' }}
                  />
                  {d}
                </label>
              );
            })}
          </div>

          <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 18, paddingTop: 16, maxWidth: 320 }}>
            <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>Min trust score</div>
            <input
              type="range"
              min={0}
              max={100}
              value={minTrust}
              onChange={(e) => setMinTrust(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-accent)', marginTop: 8 }}
              aria-label="Minimum trust score"
            />
            <div className="num" style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--mono)' }}>
              ≥ <span style={{ color: 'var(--color-text)' }}>{minTrust}</span>
            </div>
          </div>
        </div>
      </div>

      {/* O catálogo. A cota da margem é contada aqui mesmo — filtrados sobre o
          total do seed — e cai para `n/d` enquanto o seed não chega. Nunca zero. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          catálogo
          <b>{ready ? `${filtered.length}/${packs.length}` : 'n/d'}</b>
          ordenado por trust
        </div>
        <div>
          <div className="packs-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0 32px' }}>
            {!ready ? (
              <div style={{ color: 'var(--color-muted)', fontSize: 13.5 }}>Loading packs…</div>
            ) : filtered.length === 0 ? (
              <div style={{ color: 'var(--color-muted)', fontSize: 13.5 }}>No packs match your filters.</div>
            ) : (
              filtered.map((p, i) => {
                const comp = composition(p);
                const fits = p.min_vram_gb <= 8;
                const trending = p.installs === topInstalls && topInstalls > 0;
                return (
                  <RevealOnView key={p.id} delay={Math.min(i, 6) * 50}>
                    {/* Era um <Card>: fundo próprio + raio 14, ou seja uma CAIXA.
                        O que separa passa a ser a hairline. */}
                    <div
                      style={{
                        position: 'relative',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 10,
                        height: '100%',
                        borderTop: '1px solid var(--color-border)',
                        padding: '18px 0 24px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        {/* O número da peça no conjunto — posição real na lista
                            ordenada por trust, não um adorno. */}
                        <span
                          aria-hidden="true"
                          style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.14em', color: 'var(--moo-faint)', flexShrink: 0 }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, fontFamily: 'var(--mono)' }}>{p.id}</div>
                          <div className="num" style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', gap: 8, fontFamily: 'var(--mono)', marginTop: 3 }}>
                            <span>trust <span style={{ color: 'var(--color-text)' }}>{p.trust}</span></span>
                            <span>·</span>
                            <span>{p.installs} installs</span>
                          </div>
                        </div>
                        {trending && (
                          <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: 9.5, color: 'var(--moo-faint)', textTransform: 'uppercase', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>
                            most installed
                          </span>
                        )}
                      </div>

                      <p style={{ fontSize: 12.5, color: 'var(--color-muted)', lineHeight: 1.55, margin: '2px 0 0', minHeight: 54 }}>{p.summary}</p>

                      <div className="num" style={{ display: 'flex', gap: 10, fontFamily: 'var(--mono)', fontSize: 10.5, color: 'var(--color-muted)', flexWrap: 'wrap' }}>
                        <span>models <span style={{ color: 'var(--color-text)' }}>{comp.models}</span></span>
                        <span>local <span style={{ color: 'var(--color-text)' }}>{comp.local}</span></span>
                        <span>cloud <span style={{ color: 'var(--color-text)' }}>{comp.cloud}</span></span>
                      </div>

                      {/*
                        Aqui vivia `<ProgressBar pct={p.savings_pct}/>` +
                        `{p.savings_pct}% saved vs all-Opus`. Retirado a
                        2026-08-27: o campo existe no seed mas não tem medição
                        por trás, e a decisão de 2026-08-24 bane "% saved".
                        Não foi substituído por outra percentagem — inventar um
                        número honesto para tapar um desonesto seria o mesmo erro.
                      */}
                      <div style={{ fontSize: 11.5, color: fits ? 'var(--color-green)' : 'var(--color-yellow)', fontFamily: 'var(--mono)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {fits ? '✓ Runs local' : `⚠ Needs ${p.min_vram_gb}GB VRAM`} · {comp.cloud > 0 ? 'cloud fallback when it earns it' : 'local-only'}
                      </div>

                      <div style={{ display: 'flex', gap: 10, marginTop: 'auto', paddingTop: 8, alignItems: 'center' }}>
                        {/* O CTA é um dos três sítios onde o rosa é permitido. */}
                        <a
                          href={`/packs/${p.id}`}
                          style={{ background: 'var(--color-accent)', color: '#1A0E0E', fontWeight: 600, fontSize: 13, padding: '8px 16px', borderRadius: 6, textDecoration: 'none' }}
                        >
                          Install
                        </a>
                        <a
                          href={`/packs/${p.id}`}
                          style={{ color: 'var(--color-muted)', fontSize: 13, textDecoration: 'underline', textUnderlineOffset: 3 }}
                        >
                          View detail
                        </a>
                      </div>
                    </div>
                  </RevealOnView>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* A ressalva. Sem cota: não há aqui número honesto para pôr na margem —
          e a regra é rótulo só, nunca um número inventado para encher. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          ressalva
          <b>metadata</b>
          do pack — não é o teu número
        </div>
        <div style={{ maxWidth: 640 }}>
          <p style={{ fontSize: 13.5, color: 'var(--color-muted)', margin: 0, lineHeight: 1.65 }}>
            Trust and installs are pack metadata, not a guarantee for your prompts — your real tier mix depends on the
            work your day brings. This project logs no tokens, so it has no measured cost and publishes no savings
            percentage per pack. Open source · MIT · v{versionInfo.version}
          </p>

          <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 18, paddingTop: 14 }}>
            <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>Example stack</div>
            <div style={{ fontSize: 12, color: 'var(--color-muted)', lineHeight: 1.7, fontFamily: 'var(--mono)', marginTop: 8 }}>
              RTX 4090 · 24GB
              <br />
              Claude Max + local Ollama
              <br />
              8 local models
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-muted)', marginTop: 8, lineHeight: 1.5 }}>
              Illustrative — mooter detects your real setup at install time.
            </div>
          </div>
        </div>
      </div>

      <style>{`@media (max-width: 768px){ .packs-grid{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
