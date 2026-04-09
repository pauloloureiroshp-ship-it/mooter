/**
 * GET /api/metrics — proxy to savings-tracker :7821/metrics.
 *
 * The dashboard never talks to the savings-tracker directly from the browser:
 * that would require the browser to bind to localhost, which is fine but
 * complicates CORS and dev-tunnel setups. The Next.js API route forwards the
 * request server-side and returns the JSON untouched.
 */

import { NextResponse } from 'next/server';
import { TRACKER_URL } from '@/app/lib/paths';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const res = await fetch(`${TRACKER_URL}/metrics`, {
      // Short timeout — the tracker is local, 250ms is generous.
      signal: AbortSignal.timeout(500),
      cache: 'no-store',
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'tracker_unreachable', status: res.status },
        { status: 502 }
      );
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error: 'tracker_offline',
        hint: 'Start the tracker: `node ~/.claude/tools/router/savings-tracker.js`',
        message: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }
}
