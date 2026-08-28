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
// realmente contém.
//
// ADENDA 2026-08-27 (mais tarde no mesmo dia) — o seed FOI tocado, e a razão é
// que a retirada acima estava incompleta. Ficaram no ficheiro público três
// campos sem fonte: `savings_pct` (o mesmo 89 que aqui deixou de ser desenhado
// continuava a ser servido em /packs-seed.json, e a página de detalhe ainda o
// desenhava), `installs` (247+198+…= 805 instalações, enquanto
// `/api/community/pulse` devolve ao vivo `active_devs: 2` — os dois não podem
// ser verdade) e `trust` (98..73, sem rubrica e sem escritor: nenhum código
// deste repositório escreve este ficheiro).
//
// Os três saíram do seed. Aqui isso custa três controlos que só faziam sentido
// com dados reais por trás: o slider de trust mínimo, a ordenação por trust e o
// selo «most installed». Um controlo sobre um campo que não existe é pior que
// um número errado — parece que alguém está a medir.

interface Pack {
  id: string;
  min_vram_gb: number;
  domain: string;
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
  const [ready, setReady] = useState(false);

  // Load seed + restore filters from URL (acceptance: filter persists in URL params).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const d = sp.get('domain');
    if (d) setDomains(d.split(',').filter(Boolean));
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
    const qs = sp.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [domains, ready]);

  const allDomains = useMemo(
    () => Array.from(new Set(packs.map((p) => p.domain))).sort(),
    [packs],
  );

  // A ordenação era `b.trust - a.trust`, e o selo «most installed» saía do
  // máximo de `installs`. Sem esses campos não há ranking honesto para exibir:
  // ordena-se por id, que é estável, verificável e não finge mérito.
  const filtered = useMemo(
    () =>
      packs
        .filter((p) => domains.length === 0 || domains.includes(p.domain))
        .sort((a, b) => a.id.localeCompare(b.id)),
    [packs, domains],
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
          `allDomains` é derivado dos packs carregados. Era `allDomains` e
          `minTrust`; o segundo deixou de existir a 2026-08-27 com o campo. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          filters
          <b>{ready ? `${allDomains.length} domains` : 'n/d'}</b>
          domain is the only filter with data behind it
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

          {/*
            Aqui vivia um slider «Min trust score» de 0 a 100. O campo que ele
            filtrava saiu do seed a 2026-08-27 por não ter fonte nenhuma, e um
            controlo sem dados por trás é a forma mais convincente de afirmar
            uma medição que não existe. Volta no dia em que houver quem escreva
            o número — com o código que o escreve.
          */}
        </div>
      </div>

      {/* O catálogo. A cota da margem é contada aqui mesmo — filtrados sobre o
          total do seed — e cai para `n/d` enquanto o seed não chega. Nunca zero. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          catalog
          <b>{ready ? `${filtered.length}/${packs.length}` : 'n/d'}</b>
          sorted by id
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
                            ordenada por id, não um adorno. */}
                        <span
                          aria-hidden="true"
                          style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.14em', color: 'var(--moo-faint)', flexShrink: 0 }}
                        >
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, fontFamily: 'var(--mono)' }}>{p.id}</div>
                          {/* Esta linha dizia `trust 98 · 247 installs`. Ambos
                              saíram do seed a 2026-08-27 por não terem fonte —
                              e o `most installed` que vivia à direita saía do
                              máximo de um campo inventado. O domínio fica: é o
                              que o pack declara ser. */}
                          <div className="num" style={{ fontSize: 11, color: 'var(--color-muted)', display: 'flex', gap: 8, fontFamily: 'var(--mono)', marginTop: 3 }}>
                            <span>domain <span style={{ color: 'var(--color-text)' }}>{p.domain}</span></span>
                          </div>
                        </div>
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
          caveat
          <b>metadata</b>
          declared by the pack — not your number
        </div>
        <div style={{ maxWidth: 640 }}>
          <p style={{ fontSize: 13.5, color: 'var(--color-muted)', margin: 0, lineHeight: 1.65 }}>
            A pack declares what it bundles — a domain, a VRAM floor, a set of models — and nothing about your bill:
            your real tier mix depends on the work your day brings. This project logs no tokens, so it has no
            measured cost and publishes no savings percentage per pack. It also publishes no install count and no
            trust score: nothing here writes them, so they were removed rather than guessed. Open source · MIT ·
            v{versionInfo.version}
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
