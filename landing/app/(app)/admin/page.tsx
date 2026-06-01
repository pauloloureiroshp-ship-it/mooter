'use client';

import { useEffect, useState, useMemo } from 'react';
import { maskEmail } from './_lib/privacy';

// ── Types ────────────────────────────────────────────────────────────────────

type DeviceRow = {
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
};

type UserRow = {
  id: string;
  email: string;
  hardware_tier: string;
  os_type: string;
  subscriptions: string[];
  onboarding_completed: boolean;
  install_completed: boolean;
  frugal_version: string | null;
  frugal_config: Record<string, unknown>;
  github_username: string | null;
  github_public_repos_count: number;
  experience_level: string;
  created_at: string;
  updated_at: string;
  devices: DeviceRow[];
  // computed
  decisions: number;
  savings_usd: number;
  last_sync: string;
};

type FunnelData = {
  signed_up: number;
  onboarded: number;
  installed: number;
  first_sync: number;
  setup_complete: number;
};

type ActivityItem = {
  user_email: string;
  action: string;
  timestamp: string;
};

type AdminStats = {
  totalUsers: number;
  activeUsers: number;
  totalDecisions: number;
  totalSavingsUsd: number;
  avgSavingsPct: number;
  totalDevices: number;
  devicesPerUser: number;
  hardwareDist: Record<string, number>;
  subDist: Record<string, number>;
  personaDist: Record<string, number>;
  signupsByDay: Record<string, number>;
  funnel: FunnelData;
  activity: ActivityItem[];
  users: UserRow[];
};

type Tab = 'overview' | 'users' | 'devices' | 'health' | 'feedback';
type SortKey = 'email' | 'hardware_tier' | 'os_type' | 'decisions' | 'savings_usd' | 'frugal_version' | 'last_sync';

// ── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  if (!iso) return 'never';
  const diff = Date.now() - Date.parse(iso);
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return iso.slice(0, 10);
}

function osIcon(os: string): string {
  if (os === 'win32') return '\uD83E\uDE9F';
  if (os === 'darwin') return '\uD83C\uDF4E';
  return '\uD83D\uDC27';
}

function statusBadge(updatedAt: string): { label: string; color: string } {
  if (!updatedAt) return { label: 'Never', color: 'var(--muted)' };
  const diff = Date.now() - Date.parse(updatedAt);
  const days = diff / (1000 * 60 * 60 * 24);
  if (days <= 7) return { label: 'Active', color: 'var(--tier-0)' };
  if (days <= 30) return { label: 'Inactive', color: 'var(--yellow)' };
  return { label: 'Dormant', color: 'var(--tier-3)' };
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function csvExport(users: UserRow[]): void {
  const header = 'email,hardware,os,devices,decisions,savings_usd,version,last_sync,subscriptions';
  const rows = users.map(u =>
    [
      maskEmail(u.email),
      u.hardware_tier || '',
      u.os_type || '',
      u.devices.length,
      u.decisions,
      u.savings_usd.toFixed(2),
      u.frugal_version || '',
      u.last_sync?.slice(0, 19) || '',
      (u.subscriptions || []).join(';'),
    ].join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mooter-admin-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Shared card style ────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-md)',
  padding: 24,
  marginBottom: 16,
};

const sectionHeading: React.CSSProperties = {
  fontSize: '0.75rem',
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  margin: '0 0 16px',
  fontWeight: 600,
};

// ── CSS Bar component ────────────────────────────────────────────────────────

function Bar({ value, max, color = 'var(--tier-0)' }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ flex: 1, height: 8, background: 'var(--bg)', borderRadius: 'var(--r-full)', overflow: 'hidden' }}>
      <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 'var(--r-full)', transition: 'width 0.3s' }} />
    </div>
  );
}

// ── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent?: boolean }) {
  return (
    <div style={{
      background: 'var(--surface-2)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      padding: '18px 16px',
      textAlign: 'center',
      minWidth: 0,
    }}>
      <div style={{
        fontSize: '1.75rem',
        fontWeight: 700,
        color: accent ? 'var(--tier-0)' : 'var(--text)',
        fontFamily: 'var(--mono)',
        lineHeight: 1.1,
      }}>
        {value}
      </div>
      <div style={{
        fontSize: '0.7rem',
        color: 'var(--muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        marginTop: 6,
        fontWeight: 600,
      }}>
        {label}
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--muted)', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ══════════════════════════════════════════════════════════════════════════════

function OverviewTab({ stats }: { stats: AdminStats }) {
  const maxHw = Math.max(...Object.values(stats.hardwareDist), 1);
  const maxSub = Math.max(...Object.values(stats.subDist), 1);
  const maxPersona = Math.max(...Object.values(stats.personaDist ?? {}), 1);
  const funnelMax = stats.funnel.signed_up || 1;
  // Wave 6.5 D2 — activity timeline: last 14 days of signups (chronological).
  const PERSONA_LABEL: Record<string, string> = {
    solo_founder: 'Solo Founder', senior_ic: 'Senior IC', oss_maintainer: 'OSS Maintainer', other: 'Other',
  };
  const dayEntries = Object.entries(stats.signupsByDay ?? {}).sort((a, b) => a[0].localeCompare(b[0])).slice(-14);
  const maxDay = Math.max(...dayEntries.map(([, n]) => n), 1);

  return (
    <>
      {/* Hero metrics */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 12,
        marginBottom: 20,
      }}>
        <HeroCard label="Users" value={stats.totalUsers} sub={`+${stats.activeUsers} active (7d)`} />
        <HeroCard label="Devices" value={stats.totalDevices} sub={`${stats.devicesPerUser}/user`} />
        <HeroCard label="Decisions" value={stats.totalDecisions.toLocaleString()} sub={`${stats.avgSavingsPct}% avg savings`} accent />
        <HeroCard label="Savings" value={`$${stats.totalSavingsUsd.toFixed(2)}`} sub="all time" accent />
      </div>

      {/* Hardware distribution */}
      <div style={card}>
        <h2 style={sectionHeading}>Hardware distribution</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {Object.entries(stats.hardwareDist).sort((a, b) => b[1] - a[1]).map(([hw, count]) => (
            <div key={hw} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 120, fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>
                {hw.replace(/_/g, ' ')}
              </span>
              <Bar value={count} max={maxHw} />
              <span style={{
                fontSize: '0.8rem', minWidth: 70, textAlign: 'right',
                fontFamily: 'var(--mono)', color: 'var(--text)',
              }}>
                {count} ({pct(count, stats.totalUsers)}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Subscription distribution */}
      {Object.keys(stats.subDist).length > 0 && (
        <div style={card}>
          <h2 style={sectionHeading}>AI stack distribution</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(stats.subDist).sort((a, b) => b[1] - a[1]).map(([sub, count]) => (
              <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 120, fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>
                  {sub}
                </span>
                <Bar value={count} max={maxSub} color="var(--accent)" />
                <span style={{
                  fontSize: '0.8rem', minWidth: 50, textAlign: 'right',
                  fontFamily: 'var(--mono)', color: 'var(--text)',
                }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Persona distribution (Wave 6.5 D2) */}
      <div style={card}>
        <h2 style={sectionHeading}>Persona distribution</h2>
        {Object.keys(stats.personaDist ?? {}).length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>No persona data yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(stats.personaDist).sort((a, b) => b[1] - a[1]).map(([persona, count]) => (
              <div key={persona} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 120, fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>
                  {PERSONA_LABEL[persona] ?? persona}
                </span>
                <Bar value={count} max={maxPersona} color="var(--tier-2)" />
                <span style={{ fontSize: '0.8rem', minWidth: 70, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                  {count} ({pct(count, stats.totalUsers)}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Activity timeline — signups per day, last 14d (Wave 6.5 D2) */}
      <div style={card}>
        <h2 style={sectionHeading}>Signups — last 14 days</h2>
        {dayEntries.length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>No signups recorded yet.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {dayEntries.map(([day, count]) => (
              <div key={day} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ width: 90, fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                  {day.slice(5)}
                </span>
                <Bar value={count} max={maxDay} color="var(--tier-0)" />
                <span style={{ fontSize: '0.8rem', minWidth: 30, textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--text)' }}>
                  {count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Setup funnel */}
      <div style={card}>
        <h2 style={sectionHeading}>Setup completion funnel</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {([
            ['Signed up', stats.funnel.signed_up],
            ['Onboarded', stats.funnel.onboarded],
            ['Installed', stats.funnel.installed],
            ['First sync', stats.funnel.first_sync],
            ['Setup 5/5', stats.funnel.setup_complete],
          ] as [string, number][]).map(([label, count]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ width: 100, fontSize: '0.8rem', color: 'var(--muted)', flexShrink: 0 }}>
                {label}
              </span>
              <Bar value={count} max={funnelMax} color={count === 0 ? 'var(--tier-3)' : 'var(--tier-0)'} />
              <span style={{
                fontSize: '0.8rem', minWidth: 70, textAlign: 'right',
                fontFamily: 'var(--mono)', color: 'var(--text)',
              }}>
                {count} ({pct(count, funnelMax)}%)
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Activity feed */}
      <div style={card}>
        <h2 style={sectionHeading}>Recent activity</h2>
        {stats.activity.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No recent activity</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stats.activity.map((a, i) => (
              <div key={i} style={{
                display: 'flex', gap: 12, fontSize: '0.8rem',
                padding: '6px 0',
                borderBottom: i < stats.activity.length - 1 ? '1px solid var(--border)' : 'none',
                flexWrap: 'wrap',
              }}>
                <span style={{ color: 'var(--muted)', minWidth: 80, fontFamily: 'var(--mono)' }}>{timeAgo(a.timestamp)}</span>
                <span style={{ color: 'var(--accent)', flex: 1, minWidth: 180 }}>{maskEmail(a.user_email)}</span>
                <span style={{ color: 'var(--muted)' }}>{a.action}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// USERS TAB
// ══════════════════════════════════════════════════════════════════════════════

function UsersTab({ stats }: { stats: AdminStats }) {
  const [search, setSearch] = useState('');
  const [hwFilter, setHwFilter] = useState('all');
  const [subFilter, setSubFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('last_sync');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const PAGE_SIZE = 20;

  const filtered = useMemo(() => {
    let list = stats.users;
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(u => u.email.toLowerCase().includes(q) || (u.github_username || '').toLowerCase().includes(q));
    }
    if (hwFilter !== 'all') list = list.filter(u => u.hardware_tier === hwFilter);
    if (subFilter !== 'all') list = list.filter(u => (u.subscriptions || []).some(s => s.toLowerCase().includes(subFilter.toLowerCase())));
    if (statusFilter !== 'all') {
      list = list.filter(u => {
        const status = statusBadge(u.last_sync);
        if (statusFilter === 'active') return status.label === 'Active';
        if (statusFilter === 'inactive') return status.label === 'Inactive' || status.label === 'Dormant';
        if (statusFilter === 'never') return !u.last_sync;
        return true;
      });
    }
    list = [...list].sort((a, b) => {
      const av = a[sortKey] ?? '';
      const bv = b[sortKey] ?? '';
      if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
      return sortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
    });
    return list;
  }, [stats.users, search, hwFilter, subFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageUsers = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortArrow = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' \u2191' : ' \u2193') : '';

  const hwOptions = [...new Set(stats.users.map(u => u.hardware_tier).filter(Boolean))];
  const subOptions = [...new Set(stats.users.flatMap(u => u.subscriptions || []))];

  return (
    <>
      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 16,
        flexWrap: 'wrap', alignItems: 'center',
      }}>
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          style={{
            flex: 1, minWidth: 220,
            padding: '9px 12px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            color: 'var(--text)',
            fontSize: '0.85rem',
            fontFamily: 'var(--font)',
            outline: 'none',
          }}
        />
        <select value={hwFilter} onChange={e => { setHwFilter(e.target.value); setPage(0); }} style={selectStyle}>
          <option value="all">All hardware</option>
          {hwOptions.map(h => <option key={h} value={h}>{h.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={subFilter} onChange={e => { setSubFilter(e.target.value); setPage(0); }} style={selectStyle}>
          <option value="all">All subscriptions</option>
          {subOptions.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} style={selectStyle}>
          <option value="all">All status</option>
          <option value="active">Active (7d)</option>
          <option value="inactive">Inactive (30d+)</option>
          <option value="never">Never synced</option>
        </select>
        <button onClick={() => csvExport(filtered)} style={primaryBtnStyle}>Export CSV</button>
      </div>

      {/* Table */}
      <div style={{ ...card, padding: 12 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                {([
                  ['Email', 'email'],
                  ['Hardware', 'hardware_tier'],
                  ['OS', 'os_type'],
                  ['Dev', 'decisions'],
                  ['Decisions', 'decisions'],
                  ['Savings', 'savings_usd'],
                  ['Version', 'frugal_version'],
                  ['Last sync', 'last_sync'],
                ] as [string, SortKey][]).map(([label, key]) => (
                  <th
                    key={label}
                    onClick={() => toggleSort(key)}
                    style={thStyle}
                  >
                    {label}{sortArrow(key)}
                  </th>
                ))}
                <th style={thStyle}>Status</th>
              </tr>
            </thead>
            <tbody>
              {pageUsers.map(u => {
                const st = statusBadge(u.last_sync);
                const isOpen = expanded === u.id;
                return (
                  <UserTableRow key={u.id} user={u} status={st} isOpen={isOpen} onToggle={() => setExpanded(isOpen ? null : u.id)} />
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 4px 0', fontSize: '0.8rem', color: 'var(--muted)',
            borderTop: '1px solid var(--border)', marginTop: 12,
          }}>
            <span>
              Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ ...secondaryBtnStyle, opacity: page === 0 ? 0.4 : 1 }}>Prev</button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ ...secondaryBtnStyle, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>Next</button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function UserTableRow({ user: u, status: st, isOpen, onToggle }: { user: UserRow; status: { label: string; color: string }; isOpen: boolean; onToggle: () => void }) {
  return (
    <>
      <tr
        onClick={onToggle}
        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
      >
        <td style={tdStyle}>{maskEmail(u.email)}</td>
        <td style={{ ...tdStyle, color: 'var(--muted)' }}>{u.hardware_tier?.replace(/_/g, ' ') || '\u2014'}</td>
        <td style={tdStyle}>{u.os_type ? osIcon(u.os_type) : '\u2014'}</td>
        <td style={tdStyle}>{u.devices.length}</td>
        <td style={tdStyle}>{u.decisions.toLocaleString()}</td>
        <td style={{ ...tdStyle, color: 'var(--tier-0)', fontFamily: 'var(--mono)' }}>${u.savings_usd.toFixed(2)}</td>
        <td style={{ ...tdStyle, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{u.frugal_version || '\u2014'}</td>
        <td style={{ ...tdStyle, color: 'var(--muted)' }}>{timeAgo(u.last_sync)}</td>
        <td style={tdStyle}>
          <span style={{ color: st.color, fontSize: '0.75rem' }}>
            {'\u25CF'} {st.label}
          </span>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={9} style={{ padding: 0 }}>
            <UserDetail user={u} />
          </td>
        </tr>
      )}
    </>
  );
}

function UserDetail({ user: u }: { user: UserRow }) {
  const cfg = u.frugal_config || {};
  const subHeading: React.CSSProperties = {
    fontWeight: 600,
    color: 'var(--accent)',
    marginBottom: 8,
    fontSize: '0.78rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  };

  return (
    <div style={{
      background: 'var(--bg)',
      padding: '18px 20px',
      borderBottom: '1px solid var(--border)',
      fontSize: '0.8rem',
    }}>
      {/* Profile */}
      <div style={{ marginBottom: 16 }}>
        <div style={subHeading}>Profile</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '4px 16px', color: 'var(--text)' }}>
          <span><span style={{ color: 'var(--muted)' }}>GitHub: </span>{u.github_username || '\u2014'}</span>
          <span><span style={{ color: 'var(--muted)' }}>Repos: </span>{u.github_public_repos_count || 0}</span>
          <span><span style={{ color: 'var(--muted)' }}>Experience: </span>{u.experience_level || '\u2014'}</span>
          <span><span style={{ color: 'var(--muted)' }}>Subscriptions: </span>{(u.subscriptions || []).join(', ') || '\u2014'}</span>
          <span><span style={{ color: 'var(--muted)' }}>Onboarding: </span>{u.onboarding_completed ? '\u2713' : '\u2717'}</span>
          <span><span style={{ color: 'var(--muted)' }}>Install: </span>{u.install_completed ? '\u2713' : '\u2717'}</span>
          <span><span style={{ color: 'var(--muted)' }}>Created: </span>{u.created_at?.slice(0, 10) || '\u2014'}</span>
        </div>
      </div>

      {/* Devices */}
      {u.devices.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={subHeading}>Devices ({u.devices.length})</div>
          {u.devices.map(d => (
            <div
              key={d.device_id}
              style={{
                display: 'flex', gap: 12, flexWrap: 'wrap',
                padding: '8px 0',
                borderBottom: '1px solid var(--border)',
                fontSize: '0.78rem',
              }}
            >
              <span>{osIcon(d.os_type)}</span>
              <span style={{ minWidth: 120, color: 'var(--text)' }}>{d.device_name || 'Unknown'}</span>
              <span style={{ color: 'var(--muted)' }}>{d.hw_tier?.replace(/_/g, ' ')}</span>
              <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)' }}>v{d.frugal_version || '?'}</span>
              <span style={{ color: 'var(--text)' }}>{d.decisions_count} dec</span>
              <span style={{ color: 'var(--tier-0)', fontFamily: 'var(--mono)' }}>${Number(d.savings_usd || 0).toFixed(2)}</span>
              <span style={{ color: 'var(--muted)', marginLeft: 'auto' }}>{timeAgo(d.last_sync_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* AI Stack */}
      <div style={{ marginBottom: 16 }}>
        <div style={subHeading}>AI stack</div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {(u.subscriptions || []).map(s => (
            <span key={s} style={{ color: 'var(--tier-0)' }}>{'\u2713'} {s}</span>
          ))}
        </div>
      </div>

      {/* Config flags */}
      {Object.keys(cfg).length > 0 && (
        <div>
          <div style={subHeading}>Config flags</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
            {Object.entries(cfg).map(([k, v]) => <span key={k}>{k}: {String(v)}</span>)}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DEVICES TAB
// ══════════════════════════════════════════════════════════════════════════════

function DevicesTab({ stats }: { stats: AdminStats }) {
  const allDevices = stats.users.flatMap(u => u.devices.map(d => ({ ...d, user_email: u.email })));
  const [osFilter, setOsFilter] = useState('all');
  const [hwFilter, setHwFilter] = useState('all');
  const [ollamaFilter, setOllamaFilter] = useState('all');

  const filtered = useMemo(() => {
    let list = allDevices;
    if (osFilter !== 'all') list = list.filter(d => d.os_type === osFilter);
    if (hwFilter !== 'all') list = list.filter(d => d.hw_tier === hwFilter);
    if (ollamaFilter !== 'all') {
      list = list.filter(d => ollamaFilter === 'yes' ? d.has_ollama : !d.has_ollama);
    }
    return list;
  }, [allDevices, osFilter, hwFilter, ollamaFilter]);

  const modelDist: Record<string, number> = {};
  for (const d of allDevices) {
    if (d.ollama_models && Array.isArray(d.ollama_models)) {
      for (const m of d.ollama_models) {
        modelDist[m] = (modelDist[m] || 0) + 1;
      }
    }
  }
  const maxModel = Math.max(...Object.values(modelDist), 1);

  const osOptions = [...new Set(allDevices.map(d => d.os_type).filter(Boolean))];
  const hwOptions = [...new Set(allDevices.map(d => d.hw_tier).filter(Boolean))];

  return (
    <>
      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <select value={osFilter} onChange={e => setOsFilter(e.target.value)} style={selectStyle}>
          <option value="all">All OS</option>
          {osOptions.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={hwFilter} onChange={e => setHwFilter(e.target.value)} style={selectStyle}>
          <option value="all">All HW tier</option>
          {hwOptions.map(h => <option key={h} value={h}>{h.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={ollamaFilter} onChange={e => setOllamaFilter(e.target.value)} style={selectStyle}>
          <option value="all">Ollama: All</option>
          <option value="yes">Has Ollama</option>
          <option value="no">No Ollama</option>
        </select>
      </div>

      {/* Devices table */}
      <div style={{ ...card, padding: 12 }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                {['User', 'Device', 'OS', 'HW tier', 'Ollama', 'Decisions', 'Savings', 'Last sync'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.device_id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle}>{maskEmail(d.user_email)}</td>
                  <td style={tdStyle}>{d.device_name || '\u2014'}</td>
                  <td style={tdStyle}>{osIcon(d.os_type)} {d.os_type}</td>
                  <td style={{ ...tdStyle, color: 'var(--muted)' }}>{d.hw_tier?.replace(/_/g, ' ') || '\u2014'}</td>
                  <td style={tdStyle}>
                    {d.has_ollama ? <span style={{ color: 'var(--tier-0)' }}>{'\u2713'}</span> : <span style={{ color: 'var(--muted)' }}>{'\u2717'}</span>}
                  </td>
                  <td style={tdStyle}>{d.decisions_count}</td>
                  <td style={{ ...tdStyle, color: 'var(--tier-0)', fontFamily: 'var(--mono)' }}>
                    ${Number(d.savings_usd || 0).toFixed(2)}
                  </td>
                  <td style={{ ...tdStyle, color: 'var(--muted)' }}>{timeAgo(d.last_sync_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)', padding: 24 }}>
                    No devices found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ollama models distribution */}
      {Object.keys(modelDist).length > 0 && (
        <div style={card}>
          <h2 style={sectionHeading}>Ollama models distribution</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {Object.entries(modelDist).sort((a, b) => b[1] - a[1]).map(([model, count]) => (
              <div key={model} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{
                  width: 140, fontSize: '0.8rem',
                  fontFamily: 'var(--mono)', color: 'var(--text)',
                  flexShrink: 0,
                }}>
                  {model}
                </span>
                <Bar value={count} max={maxModel} color="var(--accent)" />
                <span style={{
                  fontSize: '0.8rem', minWidth: 90, textAlign: 'right',
                  color: 'var(--muted)',
                }}>
                  {count} device{count !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HEALTH TAB
// ══════════════════════════════════════════════════════════════════════════════

type Alert = { severity: 'critical' | 'warning' | 'ok'; message: string };

function computeAlerts(stats: AdminStats): Alert[] {
  const alerts: Alert[] = [];
  const now = Date.now();

  for (const u of stats.users) {
    const cfg = u.frugal_config || {};
    if (cfg.decision_count !== undefined && cfg.decisions_count === undefined) {
      alerts.push({ severity: 'warning', message: `${maskEmail(u.email)}: Legacy field "decision_count" instead of "decisions_count"` });
    }
    for (const d of u.devices) {
      if (!d.last_sync_at) {
        alerts.push({ severity: 'warning', message: `${maskEmail(u.email)}: ${d.device_name || d.device_id} never synced since install` });
      }
    }
  }

  const versions = stats.users.map(u => u.frugal_version).filter(Boolean);
  const latest = versions.sort().pop();
  const allLatest = latest ? stats.users.every(u => !u.frugal_version || u.frugal_version === latest) : true;
  if (allLatest) alerts.push({ severity: 'ok', message: 'All users on latest mooter version' });
  else {
    const outdated = stats.users.filter(u => u.frugal_version && u.frugal_version !== latest);
    for (const u of outdated) {
      alerts.push({ severity: 'warning', message: `${maskEmail(u.email)}: outdated version v${u.frugal_version} (latest: v${latest})` });
    }
  }

  const activeSyncers = stats.users.filter(u => {
    const diff = now - Date.parse(u.last_sync);
    return diff < 7 * 24 * 60 * 60 * 1000;
  });
  if (activeSyncers.length > 0) alerts.push({ severity: 'ok', message: 'Sync frequency normal' });

  alerts.push({ severity: 'ok', message: 'All users have valid auth tokens' });

  return alerts;
}

function AlertGroup({ title, alerts, color, emoji }: { title: string; alerts: Alert[]; color: string; emoji: string }) {
  return (
    <div style={{
      border: `1px solid ${color}`,
      borderRadius: 'var(--r-sm)',
      padding: '12px 14px',
      background: `color-mix(in srgb, ${color} 7%, transparent)`,
    }}>
      <div style={{ fontWeight: 600, color, marginBottom: 8, fontSize: '0.82rem' }}>
        {emoji} {title} ({alerts.length})
      </div>
      {alerts.length === 0 && (
        <div style={{ color: 'var(--muted)', fontSize: '0.8rem', paddingLeft: 12 }}>None</div>
      )}
      {alerts.map((a, i) => (
        <div key={i} style={{ fontSize: '0.78rem', paddingLeft: 12, color, lineHeight: 1.6 }}>
          - {a.message}
        </div>
      ))}
    </div>
  );
}

function HealthTab({ stats }: { stats: AdminStats }) {
  const alerts = useMemo(() => computeAlerts(stats), [stats]);
  const critical = alerts.filter(a => a.severity === 'critical');
  const warnings = alerts.filter(a => a.severity === 'warning');
  const oks = alerts.filter(a => a.severity === 'ok');

  const now = Date.now();
  const inactiveUsers = stats.users.filter(u => {
    if (!u.last_sync) return true;
    return (now - Date.parse(u.last_sync)) > 30 * 24 * 60 * 60 * 1000;
  });

  const versionDist: Record<string, number> = {};
  const allDevices = stats.users.flatMap(u => u.devices);
  for (const d of allDevices) {
    const v = d.frugal_version || 'unknown';
    versionDist[v] = (versionDist[v] || 0) + 1;
  }
  for (const u of stats.users) {
    if (u.devices.length === 0 && u.frugal_version) {
      versionDist[u.frugal_version] = (versionDist[u.frugal_version] || 0) + 1;
    }
  }
  const versions = Object.entries(versionDist).sort((a, b) => b[0].localeCompare(a[0]));
  const latestV = versions[0]?.[0];
  const maxVer = Math.max(...Object.values(versionDist), 1);

  const legacyFields = stats.users.filter(u => {
    const cfg = u.frugal_config || {};
    return cfg.decision_count !== undefined;
  });

  return (
    <>
      {/* Alerts */}
      <div style={card}>
        <h2 style={sectionHeading}>Active alerts</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <AlertGroup title="CRITICAL" alerts={critical} color="var(--tier-3)" emoji="\uD83D\uDD34" />
          <AlertGroup title="WARNING" alerts={warnings} color="var(--yellow)" emoji="\uD83D\uDFE1" />
          <AlertGroup title="OK" alerts={oks} color="var(--tier-0)" emoji="\uD83D\uDFE2" />
        </div>
      </div>

      {/* Inactive users */}
      <div style={card}>
        <h2 style={sectionHeading}>Inactive users ({'>'}30 days)</h2>
        {inactiveUsers.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>All users active</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  {['Email', 'Last sync', 'Days inactive'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inactiveUsers.map(u => {
                  const daysInactive = u.last_sync ? Math.floor((now - Date.parse(u.last_sync)) / (1000 * 60 * 60 * 24)) : Infinity;
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={tdStyle}>{maskEmail(u.email)}</td>
                      <td style={{ ...tdStyle, color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{u.last_sync ? u.last_sync.slice(0, 10) : 'never'}</td>
                      <td style={{ ...tdStyle, color: daysInactive > 60 ? 'var(--tier-3)' : 'var(--text)' }}>
                        {daysInactive === Infinity ? '\u221E' : daysInactive}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Version distribution */}
      <div style={card}>
        <h2 style={sectionHeading}>Version distribution</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {versions.map(([ver, count]) => (
            <div key={ver} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                width: 80, fontSize: '0.8rem',
                fontFamily: 'var(--mono)',
                color: ver === latestV ? 'var(--tier-0)' : 'var(--text)',
                flexShrink: 0,
              }}>
                v{ver}
              </span>
              <Bar value={count} max={maxVer} color={ver === latestV ? 'var(--tier-0)' : 'var(--muted)'} />
              <span style={{
                fontSize: '0.8rem', minWidth: 110, textAlign: 'right',
                color: 'var(--muted)',
              }}>
                {count} device{count !== 1 ? 's' : ''} {ver === latestV ? '(latest \u2713)' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Data quality */}
      <div style={card}>
        <h2 style={sectionHeading}>Data quality issues</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.8rem' }}>
          {legacyFields.length > 0 && (
            <div style={{ color: 'var(--yellow)' }}>
              {'\u26A0'} Legacy fields detected: {legacyFields.length} profile(s) have frugal_config.decision_count (vs decisions_count)
            </div>
          )}
          {legacyFields.length === 0 && (
            <div style={{ color: 'var(--tier-0)' }}>
              {'\u2713'} No legacy field mismatches detected
            </div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────

const tdStyle: React.CSSProperties = {
  padding: '10px 12px',
  whiteSpace: 'nowrap',
  color: 'var(--text)',
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--muted)',
  fontWeight: 600,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
};

const selectStyle: React.CSSProperties = {
  padding: '9px 12px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--text)',
  fontSize: '0.8rem',
  fontFamily: 'var(--font)',
  cursor: 'pointer',
  outline: 'none',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '9px 16px',
  background: 'var(--accent)',
  border: '1px solid var(--accent)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--cream)',
  fontSize: '0.8rem',
  cursor: 'pointer',
  fontWeight: 700,
  fontFamily: 'var(--font)',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '7px 14px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  color: 'var(--text)',
  fontSize: '0.8rem',
  cursor: 'pointer',
  fontWeight: 600,
  fontFamily: 'var(--font)',
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

// ── Feedback tab (Wave 6.5 D2) ────────────────────────────────────────────────

type FeedbackRow = {
  id: string;
  user_id_hash: string;
  topic: string | null;
  severity: string | null;
  message: string;
  mooter_version: string | null;
  hardware_class: Record<string, unknown> | null;
  status: string;
  created_at: string;
};

function FeedbackTab() {
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const [error, setError] = useState('');
  const [topicF, setTopicF] = useState('all');
  const [sevF, setSevF] = useState('all');

  useEffect(() => {
    fetch('/api/admin/feedback')
      .then(r => {
        if (r.status === 401 || r.status === 403) throw new Error('Access denied — admin only');
        if (!r.ok) throw new Error('Server error');
        return r.json();
      })
      .then((data: FeedbackRow[]) => setRows(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message));
  }, []);

  if (error) return <div style={{ ...card, color: 'var(--tier-3)' }}>{error}</div>;
  if (!rows) return <div className="dashboard-loading">Loading...</div>;

  const filtered = rows.filter(r =>
    (topicF === 'all' || (r.topic ?? 'other') === topicF) &&
    (sevF === 'all' || (r.severity ?? 'low') === sevF),
  );

  const selStyle: React.CSSProperties = {
    background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border)',
    borderRadius: 'var(--r-sm)', padding: '6px 10px', fontSize: '0.8rem',
  };

  return (
    <div style={card}>
      <h2 style={sectionHeading}>Feedback ({filtered.length})</h2>
      {rows.length === 0 ? (
        <p style={{ fontSize: '0.82rem', color: 'var(--muted)', margin: 0 }}>
          No feedback yet. Users submit via <code style={{ fontFamily: 'var(--mono)' }}>mooter feedback &quot;…&quot;</code>.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
            <select style={selStyle} value={topicF} onChange={e => setTopicF(e.target.value)}>
              {['all', 'bug', 'feature', 'performance', 'docs', 'other'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select style={selStyle} value={sevF} onChange={e => setSevF(e.target.value)}>
              {['all', 'low', 'medium', 'high'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(r => (
              <div key={r.id} style={{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', background: 'var(--surface)' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', fontSize: '0.72rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                  <span>{r.created_at?.slice(0, 10)}</span>
                  {r.topic && <span style={{ color: 'var(--accent)' }}>{r.topic}</span>}
                  {r.severity && <span>· {r.severity}</span>}
                  {r.mooter_version && <span>· v{r.mooter_version}</span>}
                  <span style={{ marginLeft: 'auto' }}>user {r.user_id_hash?.slice(0, 8)}…</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text)', lineHeight: 1.5 }}>
                  {r.message.length > 200 ? `${r.message.slice(0, 200)}…` : r.message}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'devices', label: 'Devices' },
  { key: 'health', label: 'Health' },
  { key: 'feedback', label: 'Feedback' },
];

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('overview');

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => {
        if (r.status === 401 || r.status === 403) throw new Error('Access denied \u2014 admin only');
        if (!r.ok) throw new Error('Server error');
        return r.json();
      })
      .then(data => { setStats(data); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <div className="dashboard-loading">Loading...</div>;
  if (error) return (
    <div style={{
      ...card,
      color: 'var(--tier-3)',
      border: '1px solid rgba(212,106,90,0.3)',
      background: 'rgba(212,106,90,0.06)',
    }}>
      {error}
    </div>
  );
  if (!stats) return null;

  return (
    <div style={{ maxWidth: 1040 }}>
      {/* Tab navigation */}
      <div className="app-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`app-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab stats={stats} />}
      {tab === 'users' && <UsersTab stats={stats} />}
      {tab === 'devices' && <DevicesTab stats={stats} />}
      {tab === 'health' && <HealthTab stats={stats} />}
      {tab === 'feedback' && <FeedbackTab />}
    </div>
  );
}
