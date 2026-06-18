import type { Metadata } from 'next';
import { buildRankingsPayload } from '../../lib/rankings-data';
import benchSnapshot from './_rankings/bench-snapshot.json';
import { RankingsView, type BenchSnapshot } from './_rankings/RankingsView';

export const metadata: Metadata = {
  title: 'Mooter Rankings — the cost×quality frontier',
  description:
    'Where each LLM lands on the cost×quality frontier — and where the Mooter router falls by mixing local $0 models with subscriptions. Real data, sources cited per cell, not a community average. Not affiliated with Anthropic.',
};

// ISR — regenerated at most hourly. The page builds the SAME payload as
// /api/rankings via buildRankingsPayload(), so the two never disagree.
export const revalidate = 3600;

export default function RankingsPage() {
  const data = buildRankingsPayload();
  return <RankingsView data={data} bench={benchSnapshot as BenchSnapshot} />;
}
