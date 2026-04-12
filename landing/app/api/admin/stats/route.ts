import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '../../../lib/supabase';

const ADMIN_EMAIL = 'paulo.loureiro.shp@gmail.com';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

interface ProfileRow {
  id: string;
  email: string;
  hardware_tier: string;
  frugal_version: string | null;
  frugal_config: Record<string, unknown> | null;
  subscriptions: string[] | null;
  created_at: string;
  updated_at: string;
}

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value;
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=*&order=created_at.desc`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(8000),
    },
  );

  if (!res.ok) {
    return NextResponse.json({ error: 'supabase_error' }, { status: 500 });
  }

  const profiles = (await res.json()) as ProfileRow[];
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const activeCount = profiles.filter(p =>
    p.updated_at && Date.parse(p.updated_at) > sevenDaysAgo
  ).length;

  let totalDecisions = 0;
  let totalSavings = 0;
  let savingsUsers = 0;
  const hardwareDist: Record<string, number> = {};
  const subDist: Record<string, number> = {};

  for (const p of profiles) {
    const cfg = p.frugal_config || {};
    const dc = Number(cfg.decisions_count || cfg.decision_count || 0);
    const su = Number(cfg.savings_usd || cfg.total_savings || 0);
    totalDecisions += dc;
    if (dc > 0) {
      const allOpus = dc * 0.015;
      const pct = allOpus > 0 ? (su / allOpus) * 100 : 0;
      totalSavings += pct;
      savingsUsers++;
    }
    if (p.hardware_tier && p.hardware_tier !== 'unknown') {
      hardwareDist[p.hardware_tier] = (hardwareDist[p.hardware_tier] || 0) + 1;
    }
    if (p.subscriptions) {
      for (const s of p.subscriptions) {
        subDist[s] = (subDist[s] || 0) + 1;
      }
    }
  }

  const avgSavingsPct = savingsUsers > 0 ? Math.round(totalSavings / savingsUsers) : 0;

  return NextResponse.json({
    totalUsers: profiles.length,
    activeUsers: activeCount,
    totalDecisions,
    avgSavingsPct,
    hardwareDist,
    subDist,
    users: profiles.map(p => ({
      email: p.email,
      hardware: p.hardware_tier,
      version: p.frugal_version,
      decisions: Number((p.frugal_config || {}).decisions_count || (p.frugal_config || {}).decision_count || 0),
      lastSync: p.updated_at,
    })),
  });
}
