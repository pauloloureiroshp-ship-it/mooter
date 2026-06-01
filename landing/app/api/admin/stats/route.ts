import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '../../../lib/supabase';
import { isAdminEmail, buildAuditEntry } from '../../../(app)/admin/_lib/privacy';
import { getAdminAllowList, ADMIN_EMAIL_FALLBACK, writeAudit } from '../../../(app)/admin/_lib/audit.server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

interface ProfileRow {
  id: string;
  email: string;
  hardware_tier: string;
  os_type: string;
  frugal_version: string | null;
  frugal_config: Record<string, unknown> | null;
  subscriptions: string[] | null;
  onboarding_completed: boolean;
  install_completed: boolean;
  github_username: string | null;
  github_public_repos_count: number;
  experience_level: string;
  created_at: string;
  updated_at: string;
}

interface DeviceRow {
  device_id: string;
  user_id: string;
  device_name: string;
  os_type: string;
  hw_tier: string;
  has_ollama: boolean;
  has_anthropic_key: boolean;
  ollama_models: string[];
  frugal_version: string;
  decisions_count: number;
  savings_usd: number;
  last_sync_at: string;
}

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('sb-access-token')?.value;
  if (!accessToken) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const user = await getUser(accessToken);
  if (!user || !isAdminEmail(user.email, getAdminAllowList(), ADMIN_EMAIL_FALLBACK)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Best-effort audit (never blocks the response).
  void writeAudit(accessToken, user.id, buildAuditEntry('view_stats'));

  const [profilesRes, devicesRes] = await Promise.all([
    fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=*&order=created_at.desc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(8000),
      },
    ),
    fetch(
      `${SUPABASE_URL}/rest/v1/devices?select=*&order=last_sync_at.desc`,
      {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(8000),
      },
    ),
  ]);

  if (!profilesRes.ok) {
    return NextResponse.json({ error: 'supabase_error' }, { status: 500 });
  }

  const profiles = (await profilesRes.json()) as ProfileRow[];
  const devices: DeviceRow[] = devicesRes.ok ? await devicesRes.json() : [];
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const activeCount = profiles.filter(p =>
    p.updated_at && Date.parse(p.updated_at) > sevenDaysAgo
  ).length;

  // Build device lookup
  const devicesByUser: Record<string, DeviceRow[]> = {};
  for (const d of devices) {
    if (!devicesByUser[d.user_id]) devicesByUser[d.user_id] = [];
    devicesByUser[d.user_id].push(d);
  }

  let totalDecisions = 0;
  let totalSavingsUsd = 0;
  let totalSavingsPct = 0;
  let savingsUsers = 0;
  const hardwareDist: Record<string, number> = {};
  const subDist: Record<string, number> = {};

  // Funnel counters
  let onboarded = 0;
  let installed = 0;
  let firstSync = 0;
  let setupComplete = 0;

  for (const p of profiles) {
    const userDevices = devicesByUser[p.id] || [];
    const cfg = p.frugal_config || {};

    // Aggregate decisions/savings from devices first, fallback to profile config
    let dc = 0;
    let su = 0;
    if (userDevices.length > 0) {
      dc = userDevices.reduce((sum, d) => sum + (d.decisions_count || 0), 0);
      su = userDevices.reduce((sum, d) => sum + (Number(d.savings_usd) || 0), 0);
    } else {
      dc = Number(cfg.decisions_count || cfg.decision_count || 0);
      su = Number(cfg.savings_usd || cfg.total_savings || 0);
    }

    totalDecisions += dc;
    totalSavingsUsd += su;

    if (dc > 0) {
      const allOpus = dc * 0.015;
      const pctSaved = allOpus > 0 ? (su / allOpus) * 100 : 0;
      totalSavingsPct += pctSaved;
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

    // Funnel
    if (p.onboarding_completed) onboarded++;
    if (p.install_completed || dc > 0) installed++;
    if (dc > 0) firstSync++;
    // setup_complete: has onboarding + install + >=5 decisions + ollama or anthropic key
    const hasOllama = cfg.has_ollama === true || userDevices.some(d => d.has_ollama);
    const hasKey = cfg.has_anthropic_key === true || userDevices.some(d => d.has_anthropic_key);
    if (p.onboarding_completed && dc >= 5 && (hasOllama || hasKey)) setupComplete++;
  }

  const avgSavingsPct = savingsUsers > 0 ? Math.round(totalSavingsPct / savingsUsers) : 0;
  const usersWithDevices = Object.keys(devicesByUser).length;
  const devicesPerUser = usersWithDevices > 0 ? +(devices.length / usersWithDevices).toFixed(1) : 0;

  // Activity feed: construct from profiles + devices updated_at
  const activity: { user_email: string; action: string; timestamp: string }[] = [];
  for (const p of profiles) {
    const userDevices = devicesByUser[p.id] || [];
    for (const d of userDevices) {
      if (d.last_sync_at) {
        const dec = d.decisions_count || 0;
        activity.push({
          user_email: p.email,
          action: `sync from ${d.os_type === 'win32' ? 'Windows' : d.os_type === 'darwin' ? 'Mac' : d.os_type} ${d.device_name || ''} \u2014 ${dec} decisions`,
          timestamp: d.last_sync_at,
        });
      }
    }
    if (p.updated_at) {
      activity.push({
        user_email: p.email,
        action: p.onboarding_completed ? 'profile updated' : 'signed up',
        timestamp: p.updated_at,
      });
    }
  }
  activity.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const recentActivity = activity.slice(0, 10);

  return NextResponse.json({
    totalUsers: profiles.length,
    activeUsers: activeCount,
    totalDecisions,
    totalSavingsUsd,
    avgSavingsPct,
    totalDevices: devices.length,
    devicesPerUser,
    hardwareDist,
    subDist,
    funnel: {
      signed_up: profiles.length,
      onboarded,
      installed,
      first_sync: firstSync,
      setup_complete: setupComplete,
    },
    activity: recentActivity,
    users: profiles.map(p => {
      const userDevices = devicesByUser[p.id] || [];
      const cfg = p.frugal_config || {};
      let dc = 0;
      let su = 0;
      if (userDevices.length > 0) {
        dc = userDevices.reduce((sum, d) => sum + (d.decisions_count || 0), 0);
        su = userDevices.reduce((sum, d) => sum + (Number(d.savings_usd) || 0), 0);
      } else {
        dc = Number(cfg.decisions_count || cfg.decision_count || 0);
        su = Number(cfg.savings_usd || cfg.total_savings || 0);
      }
      // Last sync: latest device sync or profile updated_at
      const deviceSyncs = userDevices.filter(d => d.last_sync_at).map(d => d.last_sync_at);
      const lastSync = deviceSyncs.length > 0
        ? deviceSyncs.sort().pop()!
        : p.updated_at;

      return {
        id: p.id,
        email: p.email,
        hardware_tier: p.hardware_tier,
        os_type: p.os_type,
        subscriptions: p.subscriptions || [],
        onboarding_completed: p.onboarding_completed || false,
        install_completed: p.install_completed || dc > 0,
        frugal_version: p.frugal_version,
        frugal_config: cfg,
        github_username: p.github_username || null,
        github_public_repos_count: p.github_public_repos_count || 0,
        experience_level: p.experience_level || '',
        created_at: p.created_at,
        updated_at: p.updated_at,
        devices: userDevices.map(d => ({
          device_id: d.device_id,
          device_name: d.device_name,
          os_type: d.os_type,
          hw_tier: d.hw_tier,
          has_ollama: d.has_ollama || false,
          has_anthropic_key: d.has_anthropic_key || false,
          ollama_models: d.ollama_models || [],
          frugal_version: d.frugal_version,
          decisions_count: d.decisions_count || 0,
          savings_usd: Number(d.savings_usd) || 0,
          last_sync_at: d.last_sync_at,
        })),
        decisions: dc,
        savings_usd: su,
        last_sync: lastSync,
      };
    }),
  });
}
