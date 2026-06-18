import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { buildRankingsPayload } from '../../lib/rankings-data';

// ── Public rankings API (R0 #5) ──────────────────────────────────────────────
//
// Un-gated, no auth, no user data — serves ONLY the frozen specialization matrix
// (17×24), the ported TES, and the pricing snapshot. Powers mooter.ai/rankings
// (the page builds the same payload server-side via buildRankingsPayload, so the
// JSON API and the page never disagree). ISR: regenerated at most hourly.
export const revalidate = 3600;

export async function GET() {
  try {
    return NextResponse.json(buildRankingsPayload(), {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400' },
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { route: 'api/rankings' } });
    return NextResponse.json({ error: 'internal' }, { status: 500 });
  }
}
