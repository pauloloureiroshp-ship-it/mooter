import type { Metadata } from 'next';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import Dotgrid from '@/components/Dotgrid';
import versionInfo from '@/app/version.json';
import { REPO, FALLBACK, toEntries, type Entry } from './_lib';

export const metadata: Metadata = {
  title: 'Changelog | Mooter',
  description: 'What shipped, wave by wave — pulled live from GitHub releases.',
};

// ISR: revalidate hourly so the page self-updates as releases ship (Wave 42.B).
// Wave 60 redesign: presentation only — the live-GitHub data layer is unchanged.
export const revalidate = 3600;

async function loadEntries(): Promise<Entry[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=30`, {
      headers: { Accept: 'application/vnd.github+json' },
      next: { revalidate },
    });
    if (!res.ok) return FALLBACK;
    const entries = toEntries(await res.json());
    return entries.length ? entries : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export default async function ChangelogPage() {
  const entries = await loadEntries();
  return (
    <section style={{ position: 'relative', overflow: 'hidden' }}>
      <Dotgrid />
      <div
        className="m-pad"
        style={{ position: 'relative', maxWidth: 820, margin: '0 auto', padding: '72px 40px' }}
      >
        <Eyebrow>Changelog</Eyebrow>
        <h1
          style={{
            fontSize: 'clamp(34px, 5vw, 52px)',
            fontWeight: 700,
            letterSpacing: '-0.035em',
            lineHeight: 1.04,
            margin: '0 0 12px',
          }}
        >
          Every wave, shipped in the open.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 17, lineHeight: 1.6, maxWidth: 640, marginBottom: 24 }}>
          The full history, pulled live from{' '}
          <a
            href={`https://github.com/${REPO}/releases`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-accent)' }}
          >
            GitHub releases
          </a>
          .
        </p>

        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 14px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 999,
            marginBottom: 40,
          }}
        >
          <span
            className="mpulse-dot"
            aria-hidden="true"
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--color-accent)',
              animation: 'mpulse 1.8s ease-in-out infinite',
            }}
          />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--color-muted)' }}>
            current release · <span style={{ color: 'var(--color-text)' }}>v{versionInfo.version}</span>
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {entries.map((e) => (
            <Card key={e.version} padding={22}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.015em', margin: 0 }}>
                  {e.url ? (
                    <a
                      href={e.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: 'var(--color-text)', textDecoration: 'none' }}
                    >
                      {e.version}
                    </a>
                  ) : (
                    e.version
                  )}
                </h2>
                {e.date && (
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--color-muted)' }}>
                    · {e.date}
                  </span>
                )}
              </div>
              {e.headline && (
                <p style={{ color: 'var(--color-text)', fontSize: 14, margin: '8px 0 0' }}>
                  <strong>{e.headline}</strong>
                </p>
              )}
              {e.items.length > 0 && (
                <ul
                  style={{
                    margin: '10px 0 0',
                    padding: 0,
                    listStyle: 'none',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  {e.items.map((it, i) => (
                    <li
                      key={i}
                      style={{
                        display: 'flex',
                        gap: 10,
                        alignItems: 'baseline',
                        fontSize: 13.5,
                        lineHeight: 1.55,
                        color: 'var(--color-muted)',
                      }}
                    >
                      <span style={{ color: 'var(--color-accent)', fontFamily: 'var(--mono)', fontSize: 11 }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
