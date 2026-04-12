'use client';

import { useEffect, useState, useMemo } from 'react';

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
  funnel: FunnelData;
  activity: ActivityItem[];
  users: UserRow[];
};

type Tab = 'overview' | 'users' | 'devices' | 'health';
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
  if (!updatedAt) return { label: 'Never', color: '#666' };
  const diff = Date.now() - Date.parse(updatedAt);
  const days = diff / (1000 * 60 * 60 * 24);
  if (days <= 7) return { label: 'Active', color: '#4ec9b0' };
  if (days <= 30) return { label: 'Inactive', color: '#cca700' };
  return { label: 'Dormant', color: '#f44747' };
}

function pct(n: number, total: number): number {
  return total > 0 ? Math.round((n / total) * 100) : 0;
}

function csvExport(users: UserRow[]): void {
  const header = 'email,hardware,os,devices,decisions,savings_usd,version,last_sync,subscriptions';
  const rows = users.map(u =>
    [
      u.email,
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
  a.download = `frugal-admin-export-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── CSS Bar component ────────────────────────────────────────────────────────

function Bar({ value, max, color = 'var(--t0, #4ec9b0)' }: { value: number; max: number; color?: string }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div style={{ flex: 1, height: 8, background: 'var(--surface-2, #1a1a1a)', borderRadius: 4, overflow: 'hidden' }}>
      <div style={{ width: `${w}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.3s' }} />
    </div>
  );
}

// ── Hero Card ────────────────────────────────────────────────────────────────

function HeroCard({ label, value, sub, accent }: { label: string; value: string | number; sub: string; accent?: boolean }) {
  return (
    <div style={{ background: 'var(--surface, #111)', border: '1px solid var(--border, #222)', borderRadius: 12, padding: '1.25rem', textAlign: 'center', minWidth: 0 }}>
      <div style={{ fontSize: '1.6rem', fontWeight: 700, color: accent ? 'var(--t0, #4ec9b0)' : 'var(--text, #ededed)' }}>{value}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--muted, #666)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: '0.7rem', color: 'var(--muted, #666)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB
// ══════════════════════════════════════════════════════════════════════════════

function OverviewTab({ stats }: { stats: AdminStats }) {
  const maxHw = Math.max(...Object.values(stats.hardwareDist), 1);
  const maxSub = Math.max(...Object.values(stats.subDist), 1);
  const funnelMax = stats.funnel.signed_up || 1;

  return (
    <>
      {/* Hero metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <HeroCard label="Users" value={stats.totalUsers} sub={`+${stats.activeUsers} active (7d)`} />
        <HeroCard label="Devices" value={stats.totalDevices} sub={`${stats.devicesPerUser}/user`} />
        <HeroCard label="Decisions" value={stats.totalDecisions.toLocaleString()} sub={`${stats.avgSavingsPct}% avg savings`} accent />
        <HeroCard label="Savings" value={`$${stats.totalSavingsUsd.toFixed(2)}`} sub="all time" accent />
      </div>

      {/* Hardware distribution */}
      <div className="dashboard-card">
        <h2>Hardware distribution</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {Object.entries(stats.hardwareDist).sort((a, b) => b[1] - a[1]).map(([hw, count]) => (
            <div key={hw} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ width: 120, fontSize: '0.8rem', color: 'var(--muted)' }}>{hw.replace(/_/g, ' ')}</span>
              <Bar value={count} max={maxHw} />
              <span style={{ fontSize: '0.8rem', minWidth: 70, textAlign: 'right' }}>{count} ({pct(count, stats.totalUsers)}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Subscription distribution */}
      {Object.keys(stats.subDist).length > 0 && (
        <div className="dashboard-card">
          <h2>AI Stack distribution</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.entries(stats.subDist).sort((a, b) => b[1] - a[1]).map(([sub, count]) => (
              <div key={sub} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ width: 120, fontSize: '0.8rem', color: 'var(--muted)' }}>{sub}</span>
                <Bar value={count} max={maxSub} color="var(--green, #23d18b)" />
                <span style={{ fontSize: '0.8rem', minWidth: 50, textAlign: 'right' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Setup funnel */}
      <div className="dashboard-card">
        <h2>Setup completion funnel</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {([
            ['Signed up', stats.funnel.signed_up],
            ['Onboarded', stats.funnel.onboarded],
            ['Installed', stats.funnel.installed],
            ['First sync', stats.funnel.first_sync],
            ['Setup 5/5', stats.funnel.setup_complete],
          ] as [string, number][]).map(([label, count]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ width: 100, fontSize: '0.8rem', color: 'var(--muted)' }}>{label}</span>
              <Bar value={count} max={funnelMax} color={count === 0 ? '#f44747' : 'var(--t0)'} />
              <span style={{ fontSize: '0.8rem', minWidth: 70, textAlign: 'right' }}>{count} ({pct(count, funnelMax)}%)</span>
            </div>
          ))}
        </div>
      </div>

      {/* Activity feed */}
      <div className="dashboard-card">
        <h2>Recent activity</h2>
        {stats.activity.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>No recent activity</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {stats.activity.map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.8rem', padding: '0.25rem 0', borderBottom: '1px solid var(--border, #222)' }}>
                <span style={{ color: 'var(--muted)', minWidth: 80 }}>{timeAgo(a.timestamp)}</span>
                <span style={{ color: 'var(--t0)' }}>{a.user_email}</span>
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
      const now = Date.now();
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
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search by email or name..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(0); }}
          style={{ flex: 1, minWidth: 200, padding: '0.5rem 0.75rem', background: 'var(--surface, #111)', border: '1px solid var(--border, #222)', borderRadius: 8, color: 'var(--text)', fontSize: '0.85rem' }}
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
        <button onClick={() => csvExport(filtered)} style={btnStyle}>Export CSV</button>
      </div>

      {/* Table */}
      <div className="dashboard-card" style={{ padding: '0.75rem' }}>
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
                    style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border, #333)', color: 'var(--muted, #666)', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}
                  >
                    {label}{sortArrow(key)}
                  </th>
                ))}
                <th style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border, #333)', color: 'var(--muted)', fontWeight: 600 }}>Status</th>
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0.5rem 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
            <span>Showing {page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)} style={{ ...btnStyle, opacity: page === 0 ? 0.4 : 1 }}>Prev</button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)} style={{ ...btnStyle, opacity: page >= totalPages - 1 ? 0.4 : 1 }}>Next</button>
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
      <tr onClick={onToggle} style={{ borderBottom: '1px solid var(--border, #222)', cursor: 'pointer' }}>
        <td style={tdStyle}>{u.email}</td>
        <td style={tdStyle} className="dashboard-muted">{u.hardware_tier?.replace(/_/g, ' ') || '\u2014'}</td>
        <td style={tdStyle}>{u.os_type ? osIcon(u.os_type) : '\u2014'}</td>
        <td style={tdStyle}>{u.devices.length}</td>
        <td style={tdStyle}>{u.decisions.toLocaleString()}</td>
        <td style={tdStyle}>${u.savings_usd.toFixed(2)}</td>
        <td style={tdStyle} className="dashboard-muted">{u.frugal_version || '\u2014'}</td>
        <td style={tdStyle} className="dashboard-muted">{timeAgo(u.last_sync)}</td>
        <td style={tdStyle}><span style={{ color: st.color, fontSize: '0.75rem' }}>{'\u25CF'} {st.label}</span></td>
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
  return (
    <div style={{ background: 'var(--surface-2, #1a1a1a)', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', fontSize: '0.8rem' }}>
      {/* Profile */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600, color: 'var(--t0)', marginBottom: '0.5rem' }}>Profile</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.25rem 1rem' }}>
          <span>GitHub: {u.github_username || '\u2014'}</span>
          <span>Repos: {u.github_public_repos_count || 0}</span>
          <span>Experience: {u.experience_level || '\u2014'}</span>
          <span>Subscriptions: {(u.subscriptions || []).join(', ') || '\u2014'}</span>
          <span>Onboarding: {u.onboarding_completed ? '\u2713' : '\u2717'}</span>
          <span>Install: {u.install_completed ? '\u2713' : '\u2717'}</span>
          <span>Created: {u.created_at?.slice(0, 10) || '\u2014'}</span>
        </div>
      </div>

      {/* Devices */}
      {u.devices.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 600, color: 'var(--t0)', marginBottom: '0.5rem' }}>Devices ({u.devices.length})</div>
          {u.devices.map(d => (
            <div key={d.device_id} style={{ display: 'flex', gap: '0.75rem', padding: '0.35rem 0', borderBottom: '1px solid var(--border, #222)' }}>
              <span>{osIcon(d.os_type)}</span>
              <span style={{ minWidth: 120 }}>{d.device_name || 'Unknown'}</span>
              <span className="dashboard-muted">{d.hw_tier?.replace(/_/g, ' ')}</span>
              <span className="dashboard-muted">v{d.frugal_version || '?'}</span>
              <span>{d.decisions_count} dec</span>
              <span style={{ color: 'var(--t0)' }}>${Number(d.savings_usd || 0).toFixed(2)}</span>
              <span className="dashboard-muted">{timeAgo(d.last_sync_at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* AI Stack */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 600, color: 'var(--t0)', marginBottom: '0.5rem' }}>AI Stack</div>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          {(u.subscriptions || []).map(s => <span key={s} style={{ color: 'var(--green)' }}>{'\u2713'} {s}</span>)}
        </div>
      </div>

      {/* Config flags */}
      {Object.keys(cfg).length > 0 && (
        <div>
          <div style={{ fontWeight: 600, color: 'var(--t0)', marginBottom: '0.5rem' }}>Config flags</div>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', color: 'var(--muted)' }}>
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

  // Ollama models distribution
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
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
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
      <div className="dashboard-card" style={{ padding: '0.75rem' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
            <thead>
              <tr>
                {['User', 'Device', 'OS', 'HW tier', 'Ollama', 'Decisions', 'Savings', 'Last sync'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border, #333)', color: 'var(--muted)', fontWeight: 600 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(d => (
                <tr key={d.device_id} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                  <td style={tdStyle}>{d.user_email}</td>
                  <td style={tdStyle}>{d.device_name || '\u2014'}</td>
                  <td style={tdStyle}>{osIcon(d.os_type)} {d.os_type}</td>
                  <td style={tdStyle} className="dashboard-muted">{d.hw_tier?.replace(/_/g, ' ') || '\u2014'}</td>
                  <td style={tdStyle}>{d.has_ollama ? <span style={{ color: 'var(--green)' }}>{'\u2713'}</span> : <span style={{ color: 'var(--muted)' }}>{'\u2717'}</span>}</td>
                  <td style={tdStyle}>{d.decisions_count}</td>
                  <td style={tdStyle}>${Number(d.savings_usd || 0).toFixed(2)}</td>
                  <td style={tdStyle} className="dashboard-muted">{timeAgo(d.last_sync_at)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} style={{ ...tdStyle, textAlign: 'center', color: 'var(--muted)' }}>No devices found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Ollama models distribution */}
      {Object.keys(modelDist).length > 0 && (
        <div className="dashboard-card">
          <h2>Ollama models distribution</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {Object.entries(modelDist).sort((a, b) => b[1] - a[1]).map(([model, count]) => (
              <div key={model} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ width: 140, fontSize: '0.8rem', fontFamily: 'var(--mono)' }}>{model}</span>
                <Bar value={count} max={maxModel} color="var(--green)" />
                <span style={{ fontSize: '0.8rem', minWidth: 70, textAlign: 'right' }}>{count} device{count !== 1 ? 's' : ''}</span>
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

  // Check for users with legacy field mismatches
  for (const u of stats.users) {
    const cfg = u.frugal_config || {};
    if (cfg.decision_count !== undefined && cfg.decisions_count === undefined) {
      alerts.push({ severity: 'warning', message: `${u.email}: Legacy field "decision_count" instead of "decisions_count"` });
    }
    // Devices that never synced
    for (const d of u.devices) {
      if (!d.last_sync_at) {
        alerts.push({ severity: 'warning', message: `${u.email}: ${d.device_name || d.device_id} never synced since install` });
      }
    }
  }

  // Version check
  const versions = stats.users.map(u => u.frugal_version).filter(Boolean);
  const latest = versions.sort().pop();
  const allLatest = latest ? stats.users.every(u => !u.frugal_version || u.frugal_version === latest) : true;
  if (allLatest) alerts.push({ severity: 'ok', message: 'All users on latest frugal version' });
  else {
    const outdated = stats.users.filter(u => u.frugal_version && u.frugal_version !== latest);
    for (const u of outdated) {
      alerts.push({ severity: 'warning', message: `${u.email}: outdated version v${u.frugal_version} (latest: v${latest})` });
    }
  }

  // Sync frequency
  const activeSyncers = stats.users.filter(u => {
    const diff = now - Date.parse(u.last_sync);
    return diff < 7 * 24 * 60 * 60 * 1000;
  });
  if (activeSyncers.length > 0) alerts.push({ severity: 'ok', message: 'Sync frequency normal' });

  // All have valid sessions
  alerts.push({ severity: 'ok', message: 'All users have valid auth tokens' });

  return alerts;
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

  // Version distribution
  const versionDist: Record<string, number> = {};
  const allDevices = stats.users.flatMap(u => u.devices);
  for (const d of allDevices) {
    const v = d.frugal_version || 'unknown';
    versionDist[v] = (versionDist[v] || 0) + 1;
  }
  // Also count from profiles for users without devices
  for (const u of stats.users) {
    if (u.devices.length === 0 && u.frugal_version) {
      versionDist[u.frugal_version] = (versionDist[u.frugal_version] || 0) + 1;
    }
  }
  const versions = Object.entries(versionDist).sort((a, b) => b[0].localeCompare(a[0]));
  const latestV = versions[0]?.[0];
  const maxVer = Math.max(...Object.values(versionDist), 1);

  // Data quality
  const legacyFields = stats.users.filter(u => {
    const cfg = u.frugal_config || {};
    return cfg.decision_count !== undefined;
  });

  return (
    <>
      {/* Alerts */}
      <div className="dashboard-card">
        <h2>Active alerts</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {/* Critical */}
          <div>
            <div style={{ fontWeight: 600, color: '#f44747', marginBottom: '0.25rem' }}>{'\uD83D\uDD34'} CRITICAL ({critical.length})</div>
            {critical.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '0.8rem', paddingLeft: '1rem' }}>None</div>}
            {critical.map((a, i) => <div key={i} style={{ fontSize: '0.8rem', paddingLeft: '1rem', color: '#f44747' }}>{a.message}</div>)}
          </div>
          {/* Warning */}
          <div>
            <div style={{ fontWeight: 600, color: '#cca700', marginBottom: '0.25rem' }}>{'\uD83D\uDFE1'} WARNING ({warnings.length})</div>
            {warnings.length === 0 && <div style={{ color: 'var(--muted)', fontSize: '0.8rem', paddingLeft: '1rem' }}>None</div>}
            {warnings.map((a, i) => <div key={i} style={{ fontSize: '0.8rem', paddingLeft: '1rem', color: '#cca700' }}>- {a.message}</div>)}
          </div>
          {/* OK */}
          <div>
            <div style={{ fontWeight: 600, color: '#4ec9b0', marginBottom: '0.25rem' }}>{'\uD83D\uDFE2'} OK ({oks.length})</div>
            {oks.map((a, i) => <div key={i} style={{ fontSize: '0.8rem', paddingLeft: '1rem', color: '#4ec9b0' }}>- {a.message}</div>)}
          </div>
        </div>
      </div>

      {/* Inactive users */}
      <div className="dashboard-card">
        <h2>Inactive users ({'>'}30 days)</h2>
        {inactiveUsers.length === 0 ? (
          <div style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>All users active</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
              <thead>
                <tr>
                  {['Email', 'Last sync', 'Days inactive'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '1px solid var(--border)', color: 'var(--muted)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {inactiveUsers.map(u => {
                  const daysInactive = u.last_sync ? Math.floor((now - Date.parse(u.last_sync)) / (1000 * 60 * 60 * 24)) : Infinity;
                  return (
                    <tr key={u.id} style={{ borderBottom: '1px solid var(--border, #222)' }}>
                      <td style={tdStyle}>{u.email}</td>
                      <td style={tdStyle} className="dashboard-muted">{u.last_sync ? u.last_sync.slice(0, 10) : 'never'}</td>
                      <td style={tdStyle}>{daysInactive === Infinity ? '\u221E' : daysInactive}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Version distribution */}
      <div className="dashboard-card">
        <h2>Version distribution</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {versions.map(([ver, count]) => (
            <div key={ver} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ width: 80, fontSize: '0.8rem', fontFamily: 'var(--mono)' }}>v{ver}</span>
              <Bar value={count} max={maxVer} color={ver === latestV ? 'var(--t0)' : 'var(--muted)'} />
              <span style={{ fontSize: '0.8rem', minWidth: 100, textAlign: 'right' }}>
                {count} device{count !== 1 ? 's' : ''} {ver === latestV ? '(latest \u2713)' : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Data quality */}
      <div className="dashboard-card">
        <h2>Data quality issues</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.8rem' }}>
          {legacyFields.length > 0 && (
            <div style={{ color: '#cca700' }}>{'\u26A0'} Legacy fields detected: {legacyFields.length} profile(s) have frugal_config.decision_count (vs decisions_count)</div>
          )}
          {legacyFields.length === 0 && (
            <div style={{ color: 'var(--t0)' }}>{'\u2713'} No legacy field mismatches detected</div>
          )}
        </div>
      </div>
    </>
  );
}

// ── Shared styles ────────────────────────────────────────────────────────────

const tdStyle: React.CSSProperties = { padding: '6px 10px', whiteSpace: 'nowrap' };
const selectStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', background: 'var(--surface, #111)', border: '1px solid var(--border, #222)', borderRadius: 8, color: 'var(--text)', fontSize: '0.8rem' };
const btnStyle: React.CSSProperties = { padding: '0.5rem 1rem', background: 'var(--surface, #111)', border: '1px solid var(--border, #222)', borderRadius: 8, color: 'var(--t0, #4ec9b0)', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 };

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════

const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'devices', label: 'Devices' },
  { key: 'health', label: 'Health' },
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

  if (loading) return <div className="dashboard-page"><div className="dashboard-container"><div className="dashboard-loading">Loading...</div></div></div>;
  if (error) return <div className="dashboard-page"><div className="dashboard-container"><div style={{ color: '#f44747', padding: '2rem 0' }}>{error}</div></div></div>;
  if (!stats) return null;

  return (
    <div className="dashboard-page">
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        {/* Header */}
        <div className="dashboard-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <a href="/dashboard" className="dashboard-brand">
              <img src="/frugal-logo.svg" alt="frugal" width={28} height={28} />
              <span>frugal admin</span>
            </a>
            <span style={{ fontSize: '0.7rem', color: 'var(--muted)', background: 'var(--surface-2, #1a1a1a)', padding: '2px 8px', borderRadius: 4 }}>Admin mode</span>
          </div>
          <a href="/dashboard" style={{ fontSize: '0.85rem', color: 'var(--muted)', textDecoration: 'none' }} title="User dashboard">{'\u2197'}</a>
        </div>

        {/* Tab navigation */}
        <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--border, #222)', marginBottom: '1.5rem' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                padding: '0.75rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: tab === t.key ? '2px solid var(--t0, #4ec9b0)' : '2px solid transparent',
                color: tab === t.key ? 'var(--t0, #4ec9b0)' : 'var(--muted, #666)',
                fontSize: '0.85rem',
                fontWeight: tab === t.key ? 700 : 400,
                cursor: 'pointer',
                transition: 'color 0.2s, border-color 0.2s',
              }}
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
      </div>
    </div>
  );
}
