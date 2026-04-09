/**
 * POST /api/waitlist — add a row to the Supabase waitlist table.
 *
 * Request:  { email: string, url?: string, savings_estimate?: number }
 * Response: { ok: true, total } | { error }
 */

import { NextRequest, NextResponse } from 'next/server';
import { insert, count } from '@/app/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Very light email sanity check — the table has its own constraints.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type WaitlistRow = { id: number; email: string };

export async function POST(req: NextRequest) {
  let body: { email?: string; url?: string; savings_estimate?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  const email = (body.email || '').trim().toLowerCase();
  if (!email || !EMAIL_RE.test(email) || email.length > 320) {
    return NextResponse.json({ error: 'invalid_email' }, { status: 400 });
  }

  const url = body.url && typeof body.url === 'string' ? body.url.slice(0, 500) : null;
  const savings = typeof body.savings_estimate === 'number' ? body.savings_estimate : null;

  const row = await insert<WaitlistRow>('waitlist', {
    email,
    url,
    savings_estimate: savings,
    created_at: new Date().toISOString(),
  });

  if (!row) {
    // Most likely cause: Supabase RLS policy blocks anon INSERT on waitlist.
    // Verified during session #4 smoke test — anon role gets PostgREST error
    // 42501 "new row violates row-level security policy for table waitlist".
    // Fix: add an RLS policy in Supabase dashboard →
    //   Table Editor → waitlist → Policies → New policy → "Enable INSERT for
    //   anon role" with USING expression `true` and WITH CHECK `true`.
    return NextResponse.json(
      {
        error: 'persist_failed',
        hint: 'Supabase INSERT failed — check RLS policy on waitlist table (anon role needs INSERT permission)',
      },
      { status: 503 }
    );
  }

  const total = await count('waitlist');
  return NextResponse.json({ ok: true, total });
}

// GET /api/waitlist — returns the current count (for the dynamic counter in
// the footer of the waitlist form). Cheap: HEAD + content-range only.
export async function GET() {
  const total = await count('waitlist');
  return NextResponse.json({ total });
}
