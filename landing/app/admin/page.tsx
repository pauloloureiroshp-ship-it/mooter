'use client';

import { useEffect, useState } from 'react';

/* ── Types ───────────────────────────────────────────────────────────────── */

interface Device {
  device_name: string;
  os_type: string;
  hw_tier: string;
  decisions_count: number;
  savings_usd: number;
  last_sync_at: string;
}

interface User {
  id: string;
  email: string;
  hardware_tier: string;
  os_type: string;
  subscriptions: string[];
  onboarding_completed: boolean;
  install_completed: boolean;
  frugal_version: string;
  github_username: string;
  experience_level: string;
  created_at: string;
  devices: Device[];
  decisions: number;
  savings_usd: number;
  last_sync: string;
}

interface ActivityItem {
  user_email: string;
  action: string;
  timestamp: string;
}

interface Stats {
  totalUsers: number;
  activeUsers: number;
  totalDecisions: number;
  totalSavingsUsd: number;
  avgSavingsPct: number;
  totalDevices: number;
  devicesPerUser: number;
  hardwareDist: Record<string, number>;
  subDist: Record<string, number>;
  funnel: {
    signed_up: number;
    onboarded: number;
    installed: number;
    first_sync: number;
    setup_complete: number;
  };
  activity: ActivityItem[];
  users: User[];
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function fmtUsd(n: number) {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(n: number) {
  return n.toFixed(1) + '%';
}

function fmtNum(n: number) {
  return n.toLocaleString('en-US');
}

function relativeTime(iso: string) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
      <p className="text-zinc-400 text-xs uppercase tracking-wider mb-1">{label}</p>
      <p className="text-zinc-100 text-2xl font-semibold">{value}</p>
      {sub && <p className="text-zinc-500 text-xs mt-1">{sub}</p>}
    </div>
  );
}

function FunnelBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-zinc-400 text-xs w-28 shrink-0 text-right">{label}</span>
      <div className="flex-1 bg-zinc-800 rounded h-5 overflow-hidden">
        <div
          className="h-full bg-indigo-600 rounded transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-zinc-300 text-xs w-14 shrink-0">{fmtNum(value)}</span>
      <span className="text-zinc-500 text-xs w-10 shrink-0">{fmtPct(pct)}</span>
    </div>
  );
}

function DistBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="text-zinc-400 text-xs w-24 shrink-0 truncate">{label}</span>
      <div className="flex-1 bg-zinc-800 rounded h-4 overflow-hidden">
        <div className={`h-full rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-zinc-300 text-xs w-8 shrink-0 text-right">{value}</span>
    </div>
  );
}

const HW_COLORS: Record<string, string> = {
  high: 'bg-emerald-600',
  medium: 'bg-yellow-500',
  low: 'bg-rose-600',
};

const SUB_COLORS = [
  'bg-indigo-500',
  'bg-violet-500',
  'bg-sky-500',
  'bg-teal-500',
  'bg-pink-500',
  'bg-orange-500',
];

/* ── Main Page ───────────────────────────────────────────────────────────── */

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userFilter, setUserFilter] = useState('');
  const [sortCol, setSortCol] = useState<'decisions' | 'savings_usd' | 'created_at'>('created_at');

  useEffect(() => {
    fetch('/api/admin/stats', { credentials: 'include' })
      .then(async (res) => {
        if (res.status === 401 || res.status === 403) throw new Error('access_denied');
        if (!res.ok) throw new Error('fetch_error');
        return res.json();
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  /* Loading */
  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400 text-sm animate-pulse">Loading admin dashboard…</div>
      </div>
    );
  }

  /* Error */
  if (error) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center max-w-sm">
          <p className="text-rose-400 text-lg font-semibold mb-2">
            {error === 'access_denied' ? 'Access denied' : 'Error loading data'}
          </p>
          <p className="text-zinc-500 text-sm">
            {error === 'access_denied'
              ? 'You are not authorised to view this page.'
              : 'Could not reach /api/admin/stats. Check the server.'}
          </p>
        </div>
      </div>
    );
  }

  if (!stats) return null;

  const funnelMax = stats.funnel.signed_up || 1;
  const funnelSteps: [string, number][] = [
    ['Signed up', stats.funnel.signed_up],
    ['Onboarded', stats.funnel.onboarded],
    ['Installed', stats.funnel.installed],
    ['First sync', stats.funnel.first_sync],
    ['Setup complete', stats.funnel.setup_complete],
  ];

  const hwTotal = Object.values(stats.hardwareDist).reduce((a, b) => a + b, 0) || 1;
  const subTotal = Object.values(stats.subDist).reduce((a, b) => a + b, 0) || 1;

  const filteredUsers = stats.users
    .filter(
      (u) =>
        u.email.toLowerCase().includes(userFilter.toLowerCase()) ||
        (u.github_username || '').toLowerCase().includes(userFilter.toLowerCase()),
    )
    .sort((a, b) => {
      if (sortCol === 'created_at') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return (b[sortCol] as number) - (a[sortCol] as number);
    });

  const recentActivity = (stats.activity || []).slice(0, 10);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Frugal Admin</h1>
          <p className="text-zinc-500 text-xs mt-0.5">Internal dashboard · read-only</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-zinc-400 text-xs">{stats.totalUsers} users total</span>
        </div>
      </div>

      <div className="px-6 py-6 space-y-6 max-w-screen-2xl mx-auto">
        {/* ── Row 1: Stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Users" value={fmtNum(stats.totalUsers)} />
          <StatCard
            label="Active Users (7d)"
            value={fmtNum(stats.activeUsers)}
            sub={`${fmtPct((stats.activeUsers / (stats.totalUsers || 1)) * 100)} of total`}
          />
          <StatCard label="Total Decisions" value={fmtNum(stats.totalDecisions)} />
          <StatCard
            label="Total Savings"
            value={fmtUsd(stats.totalSavingsUsd)}
            sub={`avg ${fmtPct(stats.avgSavingsPct)} per user`}
          />
        </div>

        {/* ── Row 1b: secondary cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label="Total Devices" value={fmtNum(stats.totalDevices)} sub={`${stats.devicesPerUser.toFixed(1)} per user`} />
          <StatCard label="Avg Savings %" value={fmtPct(stats.avgSavingsPct)} />
          <StatCard label="Decisions / User" value={fmtNum(Math.round(stats.totalDecisions / (stats.totalUsers || 1)))} />
        </div>

        {/* ── Row 2: Funnel ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <h2 className="text-zinc-300 text-sm font-medium mb-4">Activation Funnel</h2>
          <div className="space-y-3">
            {funnelSteps.map(([label, value]) => (
              <FunnelBar key={label} label={label} value={value} max={funnelMax} />
            ))}
          </div>
        </div>

        {/* ── Row 3: Distributions ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Hardware */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
            <h2 className="text-zinc-300 text-sm font-medium mb-4">Hardware Distribution</h2>
            {Object.entries(stats.hardwareDist).map(([key, val]) => (
              <DistBar
                key={key}
                label={key}
                value={val}
                total={hwTotal}
                color={HW_COLORS[key] ?? 'bg-zinc-500'}
              />
            ))}
          </div>

          {/* Subscriptions */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
            <h2 className="text-zinc-300 text-sm font-medium mb-4">Subscription Distribution</h2>
            {Object.entries(stats.subDist).map(([key, val], i) => (
              <DistBar
                key={key}
                label={key.replace(/_/g, ' ')}
                value={val}
                total={subTotal}
                color={SUB_COLORS[i % SUB_COLORS.length]}
              />
            ))}
          </div>
        </div>

        {/* ── Row 4: Users table ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-5 py-4 flex items-center justify-between border-b border-zinc-800 flex-wrap gap-3">
            <h2 className="text-zinc-300 text-sm font-medium">Users ({filteredUsers.length})</h2>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Filter by email or GitHub…"
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-3 py-1.5 w-52 placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              <select
                value={sortCol}
                onChange={(e) => setSortCol(e.target.value as typeof sortCol)}
                className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded px-2 py-1.5 focus:outline-none"
              >
                <option value="created_at">Sort: Newest</option>
                <option value="decisions">Sort: Decisions</option>
                <option value="savings_usd">Sort: Savings</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
                  <th className="text-left px-4 py-2 font-medium">Email</th>
                  <th className="text-left px-4 py-2 font-medium">HW</th>
                  <th className="text-left px-4 py-2 font-medium">OS</th>
                  <th className="text-left px-4 py-2 font-medium">Version</th>
                  <th className="text-right px-4 py-2 font-medium">Decisions</th>
                  <th className="text-right px-4 py-2 font-medium">Savings</th>
                  <th className="text-left px-4 py-2 font-medium">Last Sync</th>
                  <th className="text-right px-4 py-2 font-medium">Devices</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors">
                    <td className="px-4 py-2.5 text-zinc-200 max-w-[200px] truncate">
                      <span title={u.email}>{u.email}</span>
                      {u.github_username && (
                        <span className="text-zinc-500 ml-1">@{u.github_username}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          u.hardware_tier === 'high'
                            ? 'bg-emerald-900/60 text-emerald-300'
                            : u.hardware_tier === 'medium'
                            ? 'bg-yellow-900/60 text-yellow-300'
                            : 'bg-rose-900/60 text-rose-300'
                        }`}
                      >
                        {u.hardware_tier || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400">{u.os_type || '—'}</td>
                    <td className="px-4 py-2.5 text-zinc-400">{u.frugal_version || '—'}</td>
                    <td className="px-4 py-2.5 text-zinc-300 text-right">{fmtNum(u.decisions || 0)}</td>
                    <td className="px-4 py-2.5 text-emerald-400 text-right">{fmtUsd(u.savings_usd || 0)}</td>
                    <td className="px-4 py-2.5 text-zinc-500">{relativeTime(u.last_sync)}</td>
                    <td className="px-4 py-2.5 text-zinc-400 text-right">{(u.devices || []).length}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        {u.onboarding_completed && (
                          <span className="px-1 py-0.5 rounded text-[10px] bg-indigo-900/50 text-indigo-300">onb</span>
                        )}
                        {u.install_completed && (
                          <span className="px-1 py-0.5 rounded text-[10px] bg-teal-900/50 text-teal-300">inst</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-zinc-600">
                      No users match the filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Row 5: Recent Activity ── */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <h2 className="text-zinc-300 text-sm font-medium mb-4">Recent Activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-zinc-600 text-xs">No recent activity.</p>
          ) : (
            <div className="space-y-2">
              {recentActivity.map((item, i) => (
                <div key={i} className="flex items-start gap-3 text-xs">
                  <span className="text-zinc-600 w-16 shrink-0 text-right">{relativeTime(item.timestamp)}</span>
                  <span className="text-zinc-400 shrink-0">{item.user_email}</span>
                  <span className="text-zinc-300">{item.action}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
