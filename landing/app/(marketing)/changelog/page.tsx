import type { Metadata } from 'next';
import { REPO, FALLBACK, toEntries, type Entry } from './_lib';

export const metadata: Metadata = {
  title: 'Changelog | Mooter',
  description: 'What shipped, wave by wave — pulled live from GitHub releases.',
};

// ISR: revalidate hourly so the page self-updates as releases ship (Wave 42.B).
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
    <main className="mx-auto max-w-3xl px-6 py-16 prose">
      <h1>Changelog</h1>
      <p style={{ opacity: 0.7 }}>
        Every release, pulled live from{' '}
        <a href={`https://github.com/${REPO}/releases`} target="_blank" rel="noopener noreferrer">
          GitHub
        </a>
        .
      </p>
      {entries.map((e) => (
        <section key={e.version}>
          <h2>
            {e.url ? (
              <a href={e.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                {e.version}
              </a>
            ) : (
              e.version
            )}{' '}
            {e.date && <span style={{ opacity: 0.6, fontWeight: 400 }}>· {e.date}</span>}
          </h2>
          {e.headline && (
            <p>
              <strong>{e.headline}</strong>
            </p>
          )}
          {e.items.length > 0 && (
            <ul>
              {e.items.map((it, i) => (
                <li key={i}>{it}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </main>
  );
}
