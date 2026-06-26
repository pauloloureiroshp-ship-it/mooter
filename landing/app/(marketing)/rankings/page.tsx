import type { Metadata } from 'next';
import Eyebrow from '@/components/Eyebrow';
import Dotgrid from '@/components/Dotgrid';
import RankingsExplorer from './RankingsExplorer';

export const metadata: Metadata = {
  title: 'Rankings — the field, through mooter\'s routing lens',
  description:
    'Models ranked per task: quality-per-$, the tier mooter routes to, and the two columns a cloud aggregator does not have — local $0 and subscription $0. Measured or "—", never fabricated.',
};

export default function RankingsPage() {
  return (
    <section
      className="m-pad m-pad-y"
      style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '72px 40px', overflow: 'hidden' }}
    >
      <Dotgrid />
      <div style={{ position: 'relative' }}>
        <Eyebrow>§ rankings · the field, through mooter&apos;s routing lens</Eyebrow>
        <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 700, margin: '0 0 8px' }}>
          Model rankings, per task
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 680, marginBottom: 18 }}>
          An aggregator ranks cloud models by price and speed. Mooter ranks them <em>per task</em> — quality-per-dollar,
          the tier we route to, and the two columns nobody else has: <strong style={{ color: 'var(--color-text)' }}>local
          $0</strong> and <strong style={{ color: 'var(--color-text)' }}>subscription $0</strong>.
        </p>
        <p style={{ color: 'var(--color-muted)', fontSize: 14.5, maxWidth: 700, lineHeight: 1.6, marginBottom: 4 }}>
          Every number is counted from a cited benchmark or a real price. Where we have no measurement we show{' '}
          <strong style={{ color: 'var(--color-text)' }}>—</strong>, never an invented win. The highlighted row is the{' '}
          router&apos;s own pick for that task — not a marketing choice.
        </p>

        <RankingsExplorer />
      </div>
    </section>
  );
}
