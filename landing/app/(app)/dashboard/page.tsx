'use client';

import { useEffect, useState } from 'react';

interface Device {
  device_id: string;
  device_name: string;
  os_type: string;
  hw_tier: string;
  gpu_name?: string | null;
  gpu_vram_mb?: number | null;
  has_ollama: boolean;
  has_anthropic_key: boolean;
  frugal_version: string;
  decisions_count: number;
  savings_usd: number;
  last_sync_at: string;
}

interface Profile {
  id: string;
  email: string;
  hardware_tier: string;
  os_type: string;
  subscriptions: string[];
  prompts_per_day_estimate: number;
  onboarding_completed: boolean;
  github_username: string | null;
  github_primary_language: string | null;
  github_public_repos_count: number;
  experience_level: string;
  frugal_config: Record<string, unknown>;
  install_completed: boolean;
  frugal_version: string | null;
  devices?: Device[];
}

// ── Legacy field helpers ────────────────────────────────────────────────
function cfgVal(cfg: Record<string, unknown>): {
  hasOllama: boolean;
  hasAnthropicKey: boolean;
  decisionsCount: number;
  savingsUsd: number;
  installDone: boolean;
} {
  const hasOllama = cfg.has_ollama === true || cfg.ollama_enabled === true;
  const hasAnthropicKey = cfg.has_anthropic_key === true || cfg.anthropic_key === true;
  const decisionsCount = Number(cfg.decisions_count || cfg.decision_count || 0);
  const savingsUsd = Number(cfg.savings_usd || cfg.total_savings || 0);
  return { hasOllama, hasAnthropicKey, decisionsCount, savingsUsd, installDone: decisionsCount > 0 };
}

function isInstalled(profile: Profile): boolean {
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  return profile.install_completed === true || cfgVal(cfg).decisionsCount > 0;
}

// ── Shared copy-to-clipboard hook ────────────────────────────────────────
function useCopyButton(): [Record<string, boolean>, (id: string, text: string) => void] {
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const copy = (id: string, text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(prev => ({ ...prev, [id]: true }));
    setTimeout(() => setCopied(prev => ({ ...prev, [id]: false })), 2000);
  };
  return [copied, copy];
}

function CopyBtn({ id, text, copied, onCopy }: { id: string; text: string; copied: Record<string, boolean>; onCopy: (id: string, text: string) => void }) {
  return (
    <button
      onClick={() => onCopy(id, text)}
      style={{ background: 'none', border: '1px solid var(--border, #333)', borderRadius: 6, padding: '2px 10px', color: copied[id] ? 'var(--success, #4ec9b0)' : 'inherit', cursor: 'pointer', fontSize: '0.8em', marginLeft: 8 }}
    >
      {copied[id] ? '\u2713' : 'Copy'}
    </button>
  );
}

// ── SVG Logos (inline, no external deps) ─────────────────────────────────
function AnthropicLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M13.827 3.52L20.785 20.48h-3.562l-1.378-3.42H9.546L8.17 20.48H4.608L11.566 3.52h2.261zm-.689 4.132l-2.466 6.108h4.932l-2.466-6.108z" fill="#D97757"/>
    </svg>
  );
}

function OpenAILogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M22.282 9.821a5.985 5.985 0 00-.516-4.91 6.046 6.046 0 00-6.51-2.9A6.065 6.065 0 0011.688.5a6.074 6.074 0 00-5.804 4.292 5.99 5.99 0 00-3.993 2.9 6.05 6.05 0 00.742 7.129 5.98 5.98 0 00.516 4.911 6.05 6.05 0 006.51 2.9A6.07 6.07 0 0013.22 23.5a6.077 6.077 0 005.804-4.293 5.99 5.99 0 003.993-2.9 6.034 6.034 0 00-.742-7.129" fill="#10A37F" fillOpacity="0.85"/>
    </svg>
  );
}

function GeminiLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3.14.69 4.22 1.78L12 11l-4.22-4.22A5.96 5.96 0 0112 5zm-7 7c0-1.66.69-3.14 1.78-4.22L11 12l-4.22 4.22A5.96 5.96 0 015 12zm7 7c-1.66 0-3.14-.69-4.22-1.78L12 13l4.22 4.22A5.96 5.96 0 0112 19zm5.22-2.78L13 12l4.22-4.22A5.96 5.96 0 0119 12a5.96 5.96 0 01-1.78 4.22z" fill="#4285F4"/>
    </svg>
  );
}

function OllamaLogo() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
      <path d="M12 2C8 2 6 6 6 10c0 2 .5 3.5 1.5 5C9 17 10 20 12 22c2-2 3-5 4.5-7 1-1.5 1.5-3 1.5-5 0-4-2-8-6-8zm0 3c1.5 0 3 2 3 5s-1 4-3 5c-2-1-3-2-3-5s1.5-5 3-5z" fill="#FF6B35"/>
    </svg>
  );
}

// ── MP-12: Aggregate device data helper ─────────────────────────────────
function aggregateDevices(profile: Profile): { decisionsCount: number; savingsUsd: number } {
  const devices = profile.devices || [];
  if (devices.length > 0) {
    return {
      decisionsCount: devices.reduce((sum, d) => sum + (d.decisions_count || 0), 0),
      savingsUsd: devices.reduce((sum, d) => sum + (Number(d.savings_usd) || 0), 0),
    };
  }
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  return cfgVal(cfg);
}

// ── Helpers ──────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - Date.parse(iso);
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function osIcon(os: string): string {
  if (os === 'win32') return '\uD83E\uDE9F';
  if (os === 'darwin') return '\uD83C\uDF4E';
  return '\uD83D\uDC27';
}

// ── MP-14: DevicesTab content ───────────────────────────────────────────
function DevicesTab({ profile }: { profile: Profile }) {
  const devices = profile.devices || [];
  if (devices.length === 0) return <p className="dashboard-muted">No devices synced yet. Run <code>frugal-doctor --sync</code> to register this device.</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {devices.map(d => (
        <div key={d.device_id} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', background: 'var(--surface-2, #1a1a1a)', borderRadius: 8, border: '1px solid var(--border)' }}>
          <span style={{ fontSize: '1.2rem' }}>{osIcon(d.os_type)}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 500 }}>{d.device_name || 'Unknown device'}</div>
            <div className="dashboard-muted" style={{ fontSize: '0.8rem' }}>
              {d.hw_tier?.replace(/_/g, ' ')} {d.frugal_version && `· v${d.frugal_version}`}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem' }}>{d.decisions_count || 0} prompts · ${Number(d.savings_usd || 0).toFixed(2)}</div>
            <div className="dashboard-muted" style={{ fontSize: '0.75rem' }}>{d.last_sync_at ? timeAgo(d.last_sync_at) : 'never'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── MP-14: Terminal mockup ──────────────────────────────────────────────
function TerminalBlock({ lines }: { lines: string[] }) {
  return (
    <div style={{
      background: '#0d0d0d',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 16px',
      fontFamily: 'var(--mono)',
      fontSize: '0.8rem',
      lineHeight: 1.6,
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f47373', display: 'inline-block' }}/>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dcdcaa', display: 'inline-block' }}/>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#23d18b', display: 'inline-block' }}/>
      </div>
      {lines.map((line, i) => (
        <div key={i} style={{ color: line.startsWith('\u2713') ? '#23d18b' : line.startsWith('\u276F') ? '#4ec9b0' : '#ccc' }}>
          {line}
        </div>
      ))}
    </div>
  );
}

// ── MP-14: Setup Guide tab ──────────────────────────────────────────────
function SetupGuideTab({ profile }: { profile: Profile }) {
  const latestDevice = (profile.devices || [])[0];
  const config = (profile.frugal_config || {}) as Record<string, unknown>;
  const legacyCfg = cfgVal(config);
  const hasOllama = latestDevice ? latestDevice.has_ollama : legacyCfg.hasOllama;
  const { decisionsCount } = aggregateDevices(profile);

  const steps = [
    {
      label: 'Install frugal',
      done: profile.install_completed || decisionsCount > 0,
      terminal: [
        '\u276F bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)',
        '  Downloading frugal...',
        '  \u2713 Installed to ~/.claude/tools/router/',
        '  \u2713 Hook configured',
      ],
    },
    {
      label: 'First sync',
      done: decisionsCount > 0,
      terminal: [
        '\u276F frugal-doctor --sync',
        '  frugal doctor \u2014 health check',
        '  win32 \u00b7 x64 \u00b7 Node v24',
        '  \u2713 Core Files         10/10',
        '  \u2713 Hook               active',
        '  \u2713 Savings %          69%',
        '  \u2713 profile updated',
      ],
    },
    {
      label: 'Configure Ollama',
      done: hasOllama,
      terminal: [
        '\u276F ollama pull qwen2.5:3b',
        '  pulling manifest...',
        '  pulling layers...',
        '  \u2713 qwen2.5:3b ready for T0 routing',
      ],
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {steps.map((step, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <span style={{
              width: 24, height: 24, borderRadius: '50%',
              background: step.done ? 'var(--accent)' : 'var(--surface-2)',
              color: step.done ? '#000' : 'var(--muted)',
              display: 'grid', placeItems: 'center',
              fontSize: '0.75rem', fontWeight: 700,
            }}>
              {step.done ? '\u2713' : i + 1}
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: 500, color: step.done ? 'var(--text)' : 'var(--muted)' }}>
              {step.label}
            </span>
            {step.done && <span className="status-pill ok">Done</span>}
          </div>
          {!step.done && <TerminalBlock lines={step.terminal} />}
        </div>
      ))}
    </div>
  );
}

// ── PEÇA 2a: Savings Hero Card ───────────────────────────────────────────
function SavingsHeroCard({ profile }: { profile: Profile }) {
  const { decisionsCount, savingsUsd } = aggregateDevices(profile);

  if (decisionsCount === 0) return null;

  const allOpusCost = decisionsCount * 0.015;
  const savingsPct = allOpusCost > 0 ? Math.min(100, Math.round((savingsUsd / allOpusCost) * 100)) : 0;
  const timeSavedHrs = (decisionsCount * 0.025).toFixed(1); // ~1.5min saved per routed prompt

  return (
    <div className="dashboard-card" style={{ background: 'linear-gradient(135deg, rgba(78,201,176,0.08) 0%, rgba(78,201,176,0.02) 100%)', border: '1px solid rgba(78,201,176,0.25)' }}>
      <h2 style={{ color: 'var(--t0, #4ec9b0)' }}>Your savings</h2>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', margin: '1rem 0' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--t0, #4ec9b0)' }}>${savingsUsd.toFixed(2)}</div>
          <div className="dashboard-label">SAVED</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 700 }}>{decisionsCount}</div>
          <div className="dashboard-label">PROMPTS</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--t0, #4ec9b0)' }}>{savingsPct}%</div>
          <div className="dashboard-label">AVG SAVINGS</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 8, height: 8, overflow: 'hidden', marginBottom: '0.75rem' }}>
        <div style={{ width: `${savingsPct}%`, height: '100%', background: 'var(--t0, #4ec9b0)', borderRadius: 8, transition: 'width 0.6s ease' }} />
      </div>

      <div className="dashboard-muted" style={{ fontSize: '0.85em' }}>
        vs all-Opus: would have spent ~${allOpusCost.toFixed(2)} &middot; Time saved: ~{timeSavedHrs}h
      </div>
    </div>
  );
}

// ── PEÇA 2b: AI Stack Card ───────────────────────────────────────────────
type LLMProvider = {
  id: string;
  name: string;
  logo: React.ReactNode;
  tier: string;
  hasKey: boolean;
  keyPattern: RegExp;
  keyPrefix: string;
  fieldName: string;
};

function AIStackCard({ profile }: { profile: Profile }) {
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  const { hasOllama, hasAnthropicKey } = cfgVal(cfg);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  const hasMax = profile.subscriptions?.some(s =>
    s.toLowerCase().includes('max') || s.toLowerCase().includes('claude max'));
  const hasGptPlus = profile.subscriptions?.some(s =>
    s.toLowerCase().includes('gpt plus') || s.toLowerCase().includes('gpt_plus'));

  const providers: LLMProvider[] = [
    {
      id: 'anthropic_max',
      name: hasMax ? 'Claude Max' : 'Claude (subscription)',
      logo: <AnthropicLogo />,
      tier: hasMax ? 'T2/T3' : '--',
      hasKey: !!hasMax,
      keyPattern: /./,
      keyPrefix: '',
      fieldName: '',
    },
    {
      id: 'anthropic_api',
      name: 'Claude API',
      logo: <AnthropicLogo />,
      tier: 'T1',
      hasKey: hasAnthropicKey,
      keyPattern: /^sk-ant-/,
      keyPrefix: 'sk-ant-...',
      fieldName: 'anthropic_api_key',
    },
    {
      id: 'openai_plus',
      name: 'GPT Plus',
      logo: <OpenAILogo />,
      tier: '--',
      hasKey: !!hasGptPlus,
      keyPattern: /./,
      keyPrefix: '',
      fieldName: '',
    },
    {
      id: 'openai_api',
      name: 'GPT API',
      logo: <OpenAILogo />,
      tier: 'T2',
      hasKey: cfg.has_openai_key === true,
      keyPattern: /^sk-/,
      keyPrefix: 'sk-...',
      fieldName: 'openai_api_key',
    },
    {
      id: 'gemini',
      name: 'Gemini',
      logo: <GeminiLogo />,
      tier: '--',
      hasKey: profile.subscriptions?.some(s => s.toLowerCase().includes('gemini')) || false,
      keyPattern: /./,
      keyPrefix: '',
      fieldName: '',
    },
    {
      id: 'ollama',
      name: 'Ollama',
      logo: <OllamaLogo />,
      tier: 'T0',
      hasKey: hasOllama,
      keyPattern: /./,
      keyPrefix: '',
      fieldName: '',
    },
  ];

  const handleSaveKey = async (provider: LLMProvider) => {
    if (!keyInput || !provider.keyPattern.test(keyInput)) {
      setSaveResult('Invalid key format');
      return;
    }
    setSaving(true);
    setSaveResult(null);
    try {
      const res = await fetch('/api/save-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id, key: keyInput }),
      });
      if (res.ok) {
        setSaveResult('Key validated. Add it to your shell profile to use locally.');
        setKeyInput('');
        setExpandedProvider(null);
      } else {
        const data = await res.json();
        setSaveResult(data.error || 'Failed to save');
      }
    } catch {
      setSaveResult('Network error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard-card">
      <h2>Your AI stack</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {providers.map(p => (
          <div key={p.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 0' }}>
              <span style={{ flexShrink: 0 }}>{p.logo}</span>
              <span style={{ flex: 1, fontSize: '0.9rem' }}>{p.name}</span>
              <span className="dashboard-muted" style={{ fontSize: '0.8rem', minWidth: 40 }}>{p.tier}</span>
              {p.hasKey ? (
                <span style={{ color: 'var(--success, #4ec9b0)', fontSize: '0.9rem' }}>{'\u2713'}</span>
              ) : p.fieldName ? (
                <button
                  onClick={() => setExpandedProvider(expandedProvider === p.id ? null : p.id)}
                  style={{ background: 'none', border: '1px solid var(--border, #333)', borderRadius: 6, padding: '2px 8px', color: 'var(--t0, #4ec9b0)', cursor: 'pointer', fontSize: '0.75rem' }}
                >
                  + Add key
                </button>
              ) : (
                <span style={{ color: 'var(--error, #f44747)', fontSize: '0.9rem' }}>{'\u2717'}</span>
              )}
            </div>
            {expandedProvider === p.id && p.fieldName && (
              <div style={{ marginLeft: 32, padding: '0.5rem 0.75rem', border: '1px solid var(--border, #333)', borderRadius: 8, marginBottom: '0.5rem', background: 'var(--surface-2, #1a1a1a)' }}>
                <div style={{ fontSize: '0.8rem', marginBottom: 6 }} className="dashboard-muted">
                  {p.keyPrefix && <>Format: <code>{p.keyPrefix}</code></>}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    type="password"
                    value={keyInput}
                    onChange={e => setKeyInput(e.target.value)}
                    placeholder={p.keyPrefix}
                    style={{ flex: 1, background: 'var(--bg, #080808)', border: '1px solid var(--border, #333)', borderRadius: 6, padding: '4px 8px', color: 'var(--text, #ededed)', fontSize: '0.85rem', fontFamily: 'var(--mono)' }}
                  />
                  <button
                    onClick={() => handleSaveKey(p)}
                    disabled={saving}
                    style={{ background: 'var(--t0, #4ec9b0)', color: '#000', border: 'none', borderRadius: 6, padding: '4px 12px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600 }}
                  >
                    {saving ? '...' : 'Save'}
                  </button>
                </div>
                {saveResult && <div className="dashboard-muted" style={{ fontSize: '0.8rem', marginTop: 4 }}>{saveResult}</div>}
                <div className="dashboard-muted" style={{ fontSize: '0.75rem', marginTop: 4 }}>
                  Key is never stored in plaintext. Only validates format and records availability.
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PEÇA 2c: Setup Stepper Card ──────────────────────────────────────────
function SetupStepperCard({ profile }: { profile: Profile }) {
  // MP-12: prefer latest device data over legacy frugal_config
  const latestDevice = (profile.devices || [])[0];
  const config = (profile.frugal_config || {}) as Record<string, unknown>;
  const legacyCfg = cfgVal(config);
  const hasOllama = latestDevice ? latestDevice.has_ollama : legacyCfg.hasOllama;
  const hasAnthropicKey = latestDevice ? latestDevice.has_anthropic_key : legacyCfg.hasAnthropicKey;
  const { decisionsCount, savingsUsd } = aggregateDevices(profile);

  type Step = { label: string; ok: boolean; detail: string; fix: string | null };
  const steps: Step[] = [
    {
      label: 'Logged in',
      ok: true,
      detail: profile.email,
      fix: null,
    },
    {
      label: 'Hardware detected',
      ok: !!profile.hardware_tier && !['unknown', ''].includes(profile.hardware_tier),
      detail: profile.hardware_tier?.replace(/_/g, ' ') || 'not detected',
      fix: '/onboarding',
    },
    {
      label: 'Ollama installed',
      ok: hasOllama,
      detail: hasOllama ? (config.ollama_has_qwen3b ? 'qwen2.5:3b ready' : 'installed') : 'not installed',
      fix: hasOllama ? null : 'https://ollama.com/download',
    },
    {
      label: 'API key configured',
      ok: hasAnthropicKey,
      detail: hasAnthropicKey ? 'configured' : 'missing',
      fix: hasAnthropicKey ? null : 'export ANTHROPIC_API_KEY=sk-ant-...',
    },
    {
      label: 'First sync',
      ok: decisionsCount > 0,
      detail: decisionsCount > 0 ? `${decisionsCount} prompts · $${savingsUsd.toFixed(2)}` : 'not synced',
      fix: decisionsCount > 0 ? null : 'frugal-doctor --sync',
    },
  ];

  const completed = steps.filter(s => s.ok).length;

  return (
    <div className="dashboard-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h2 style={{ margin: 0 }}>Setup progress</h2>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {steps.map((s, i) => (
            <div key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: s.ok ? 'var(--t0, #4ec9b0)' : 'var(--border, #333)' }} />
          ))}
          <span className="dashboard-muted" style={{ fontSize: '0.8rem', marginLeft: 6 }}>{completed}/{steps.length}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', padding: '0.25rem 0' }}>
            <span style={{ flexShrink: 0, color: s.ok ? 'var(--success, #4ec9b0)' : 'var(--muted, #666)', fontSize: '0.9rem', width: 18, textAlign: 'center' }}>
              {s.ok ? '\u2713' : '\u25CB'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '0.9rem', color: s.ok ? 'var(--text, #ededed)' : 'var(--muted, #666)' }}>{s.label}</div>
              <div className="dashboard-muted" style={{ fontSize: '0.8rem' }}>{s.detail}</div>
            </div>
            {s.fix && !s.ok && (
              s.fix.startsWith('/') ? (
                <a href={s.fix} style={{ fontSize: '0.75rem', color: 'var(--t0, #4ec9b0)' }}>Fix</a>
              ) : s.fix.startsWith('http') ? (
                <a href={s.fix} target="_blank" rel="noopener" style={{ fontSize: '0.75rem', color: 'var(--t0, #4ec9b0)' }}>Install</a>
              ) : (
                <code style={{ fontSize: '0.7rem', color: 'var(--muted, #666)' }}>{s.fix}</code>
              )
            )}
          </div>
        ))}
      </div>
      {completed < steps.length && (
        <a href="/setup" style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--t0, #4ec9b0)' }}>
          {'\u2192'} Setup guide
        </a>
      )}
    </div>
  );
}

// ── PEÇA 2d: Savings Calculator ──────────────────────────────────────────
function SavingsCalculatorCard() {
  const [promptsPerDay, setPromptsPerDay] = useState(50);
  const [avgTokens, setAvgTokens] = useState(2000);

  const opusPricePerToken = 0.000015;
  const withoutFrugal = promptsPerDay * avgTokens * opusPricePerToken;
  const savingsRate = 0.7; // conservative 70% savings
  const withFrugal = withoutFrugal * (1 - savingsRate);
  const monthlySaving = (withoutFrugal - withFrugal) * 30;

  const sliderStyle = {
    width: '100%',
    accentColor: 'var(--t0, #4ec9b0)',
    background: 'transparent',
    cursor: 'pointer',
  };

  return (
    <div className="dashboard-card">
      <h2>Savings calculator</h2>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="dashboard-label">Prompts/day</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{promptsPerDay}</span>
        </div>
        <input
          type="range"
          min={5}
          max={200}
          value={promptsPerDay}
          onChange={e => setPromptsPerDay(Number(e.target.value))}
          style={sliderStyle}
        />
      </div>
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="dashboard-label">Avg tokens</span>
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{avgTokens}</span>
        </div>
        <input
          type="range"
          min={500}
          max={8000}
          step={500}
          value={avgTokens}
          onChange={e => setAvgTokens(Number(e.target.value))}
          style={sliderStyle}
        />
      </div>
      <div style={{ background: 'var(--surface-2, #1a1a1a)', borderRadius: 8, padding: '0.75rem 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="dashboard-muted" style={{ fontSize: '0.85rem' }}>Without frugal</span>
          <span style={{ fontSize: '0.9rem' }}>~${withoutFrugal.toFixed(2)}/day</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span className="dashboard-muted" style={{ fontSize: '0.85rem' }}>With frugal</span>
          <span style={{ fontSize: '0.9rem', color: 'var(--t0, #4ec9b0)' }}>~${withFrugal.toFixed(2)}/day</span>
        </div>
        <div style={{ borderTop: '1px solid var(--border, #333)', paddingTop: 6, display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Monthly saving</span>
          <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--t0, #4ec9b0)' }}>~${monthlySaving.toFixed(0)}/month</span>
        </div>
      </div>
    </div>
  );
}

// ── RecommendedModeCard ──────────────────────────────────────────────────
type RecommendedMode = {
  mode: 'beast' | 'auto' | 'zen';
  emoji: string;
  title: string;
  reason: string;
  t0_available: boolean;
  t3_unlimited: boolean;
  est_savings_day: string;
  config_block: string;
};

function calcRecommendedMode(profile: Profile): RecommendedMode {
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  const { hasOllama, hasAnthropicKey } = cfgVal(cfg);
  const hasMax = profile.subscriptions?.some(s =>
    s.toLowerCase().includes('max') || s.toLowerCase().includes('claude max'));
  const hasGpu = profile.hardware_tier &&
    !['cpu_only', 'cloud', 'other', 'unknown', ''].includes(profile.hardware_tier);

  if (hasMax) {
    return {
      mode: 'auto',
      emoji: '\u26A1',
      title: 'Auto (optimised for Max)',
      reason: 'Claude Max detected \u2014 Opus sem limite. Router usa T0 local quando dispon\u00edvel, T3 Opus para o resto.',
      t0_available: hasOllama,
      t3_unlimited: true,
      est_savings_day: hasOllama ? '~$8\u201315/day vs all-Opus' : '~$3\u20138/day vs all-Opus',
      config_block: '## Router Context\ncomplexity_bias: T2\nhub_push_enabled: true',
    };
  }

  if (hasAnthropicKey && !hasMax && !hasGpu && !hasOllama) {
    return {
      mode: 'zen',
      emoji: '\uD83E\uDDD8',
      title: 'Zen mode',
      reason: 'API-paid sem GPU local. Cada token custa. Zen mant\u00e9m tudo em T0/T1 para poupar ao m\u00e1ximo.',
      t0_available: false,
      t3_unlimited: false,
      est_savings_day: '~$5\u201312/day vs default',
      config_block: '## Router Context\ncomplexity_bias: T1\nhub_push_enabled: true',
    };
  }

  return {
    mode: 'auto',
    emoji: '\u26A1',
    title: 'Auto (balanced)',
    reason: hasGpu || hasOllama
      ? 'GPU/Ollama detectado \u2014 T0 local gr\u00e1tis para tarefas simples, T3 s\u00f3 quando importa.'
      : 'Setup standard \u2014 router decide por cada prompt. Adiciona Ollama para poupar mais.',
    t0_available: hasOllama,
    t3_unlimited: false,
    est_savings_day: hasOllama ? '~$6\u201312/day' : '~$2\u20135/day',
    config_block: '## Router Context\nhub_push_enabled: true',
  };
}

function RecommendedModeCard({ profile }: { profile: Profile }) {
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  const [copied, copy] = useCopyButton();
  const [showApply, setShowApply] = useState(false);

  if (!cfg || Object.keys(cfg).length === 0) {
    return (
      <div className="dashboard-card">
        <h2>Recommended for you</h2>
        <p className="dashboard-muted">Run frugal-doctor --sync to populate</p>
      </div>
    );
  }

  const rec = calcRecommendedMode(profile);

  const modeCompare = [
    { mode: 'beast', label: 'Beast', desc: 'T3 Opus always', cost: 'Highest', savings: 'None' },
    { mode: 'auto', label: 'Auto', desc: 'Smart routing', cost: 'Balanced', savings: 'High' },
    { mode: 'zen', label: 'Zen', desc: 'T0/T1 only', cost: 'Lowest', savings: 'Maximum' },
  ];

  return (
    <div className="dashboard-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Recommended for you</h2>
        <button
          onClick={() => setShowApply(v => !v)}
          style={{ background: 'none', border: '1px solid var(--border, #333)', borderRadius: 6, padding: '4px 12px', color: 'inherit', cursor: 'pointer', fontSize: '0.85em' }}
        >
          Apply
        </button>
      </div>
      {showApply && (
        <div className="dashboard-muted" style={{ fontSize: '0.85em', marginBottom: '0.5rem', padding: '6px 10px', border: '1px solid var(--border, #333)', borderRadius: 6 }}>
          Run in terminal: <code>node ~/.claude/tools/router/frugal-mode.js {rec.mode}</code>
        </div>
      )}
      <p style={{ fontSize: '1.15em', margin: '0.25rem 0 0.5rem' }}>{rec.emoji} {rec.title}</p>
      <p className="dashboard-muted" style={{ marginBottom: '0.75rem' }}>{rec.reason}</p>
      <div className="dashboard-grid">
        <div className="dashboard-field">
          <span className="dashboard-label">T0 Ollama (free)</span>
          <span className="dashboard-val" style={{ color: rec.t0_available ? 'var(--success, #4ec9b0)' : 'var(--error, #f44747)' }}>
            {rec.t0_available ? '\u2713 available' : '\u2717 not available'}
          </span>
        </div>
        <div className="dashboard-field">
          <span className="dashboard-label">T3 Opus</span>
          <span className="dashboard-val" style={{ color: rec.t3_unlimited ? 'var(--success, #4ec9b0)' : 'inherit' }}>
            {rec.t3_unlimited ? '\u2713 unlimited (Max)' : 'metered'}
          </span>
        </div>
        <div className="dashboard-field">
          <span className="dashboard-label">Est. savings</span>
          <span className="dashboard-val">{rec.est_savings_day}</span>
        </div>
      </div>

      {/* Mode comparison table */}
      <div style={{ marginTop: '0.75rem', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border, #333)', color: 'var(--muted, #666)' }}>Mode</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border, #333)', color: 'var(--muted, #666)' }}>Strategy</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border, #333)', color: 'var(--muted, #666)' }}>Cost</th>
              <th style={{ textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid var(--border, #333)', color: 'var(--muted, #666)' }}>Savings</th>
            </tr>
          </thead>
          <tbody>
            {modeCompare.map(m => (
              <tr key={m.mode} style={{ background: m.mode === rec.mode ? 'rgba(78,201,176,0.08)' : 'transparent' }}>
                <td style={{ padding: '4px 8px', fontWeight: m.mode === rec.mode ? 700 : 400 }}>
                  {m.mode === rec.mode ? '\u2192 ' : ''}{m.label}
                </td>
                <td style={{ padding: '4px 8px' }} className="dashboard-muted">{m.desc}</td>
                <td style={{ padding: '4px 8px' }} className="dashboard-muted">{m.cost}</td>
                <td style={{ padding: '4px 8px' }} className="dashboard-muted">{m.savings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: '0.75rem', padding: '8px 10px', background: 'var(--card-bg-alt, rgba(255,255,255,0.03))', borderRadius: 6, fontSize: '0.85em' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span className="dashboard-muted">Router Context for your CLAUDE.md</span>
          <CopyBtn id="rec-config" text={rec.config_block} copied={copied} onCopy={copy} />
        </div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.9em' }}>{rec.config_block}</pre>
      </div>
    </div>
  );
}

// ── ProjectContextCard ───────────────────────────────────────────────────
type ProjectType = 'frontend' | 'backend' | 'fullstack' | 'cli' | '';
type Language = 'typescript' | 'python' | 'go' | 'rust' | 'other' | '';
type Sensitive = 'migrations' | 'secrets' | 'experiments';

function generateRouterContext(opts: { projectType: ProjectType; language: Language; sensitive: Sensitive[] }): string {
  const lines = ['## Router Context'];
  if (opts.projectType) lines.push(`project_type: ${opts.projectType}`);
  const biasMap: Record<string, string> = { frontend: 'T2', backend: 'T3', fullstack: 'T2', cli: 'T1' };
  if (opts.projectType && biasMap[opts.projectType]) lines.push(`complexity_bias: ${biasMap[opts.projectType]}`);
  const patterns: string[] = [];
  if (opts.sensitive.includes('migrations')) patterns.push('migration', 'deploy', 'prod');
  if (opts.sensitive.includes('secrets')) patterns.push('secret', 'env', 'token', 'key');
  if (patterns.length) lines.push(`sensitive_patterns: ${patterns.join(', ')}`);
  lines.push('hub_push_enabled: true');
  return lines.join('\n');
}

function ProjectContextCard({ profile }: { profile: Profile }) {
  const [projectType, setProjectType] = useState<ProjectType>('');
  const [language, setLanguage] = useState<Language>('');
  const [sensitive, setSensitive] = useState<Sensitive[]>([]);
  const [copied, copy] = useCopyButton();

  if (!isInstalled(profile)) return null;

  const toggleSensitive = (s: Sensitive) => {
    setSensitive(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const context = generateRouterContext({ projectType, language, sensitive });

  const btnStyle = (active: boolean) => ({
    background: active ? 'var(--accent, #4ec9b0)' : 'none',
    color: active ? '#000' : 'inherit',
    border: '1px solid var(--border, #333)',
    borderRadius: 6,
    padding: '4px 12px',
    cursor: 'pointer' as const,
    fontSize: '0.85em',
    marginRight: 6,
    marginBottom: 4,
  });

  return (
    <div className="dashboard-card">
      <h2>Project context</h2>
      <p className="dashboard-muted" style={{ marginBottom: '0.75rem' }}>Configure the router for a specific project.</p>

      <div style={{ marginBottom: '0.75rem' }}>
        <span className="dashboard-label" style={{ display: 'block', marginBottom: 4 }}>Project type</span>
        {(['frontend', 'backend', 'fullstack', 'cli'] as ProjectType[]).map(t => (
          <button key={t} style={btnStyle(projectType === t)} onClick={() => setProjectType(projectType === t ? '' : t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <span className="dashboard-label" style={{ display: 'block', marginBottom: 4 }}>Primary language</span>
        {(['typescript', 'python', 'go', 'rust', 'other'] as Language[]).map(l => (
          <button key={l} style={btnStyle(language === l)} onClick={() => setLanguage(language === l ? '' : l)}>
            {l.charAt(0).toUpperCase() + l.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <span className="dashboard-label" style={{ display: 'block', marginBottom: 4 }}>Sensitive context?</span>
        <button style={btnStyle(sensitive.includes('migrations'))} onClick={() => toggleSensitive('migrations')}>
          Has migrations/prod
        </button>
        <button style={btnStyle(sensitive.includes('secrets'))} onClick={() => toggleSensitive('secrets')}>
          Has secrets/CI
        </button>
        <button style={btnStyle(sensitive.includes('experiments'))} onClick={() => toggleSensitive('experiments')}>
          Experiments only
        </button>
      </div>

      <div style={{ padding: '8px 10px', background: 'var(--card-bg-alt, rgba(255,255,255,0.03))', borderRadius: 6, fontSize: '0.85em' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
          <span className="dashboard-muted">Generated ## Router Context</span>
          <CopyBtn id="project-ctx" text={context} copied={copied} onCopy={copy} />
        </div>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '0.9em' }}>{context}</pre>
      </div>
    </div>
  );
}

// ── RecommendationsCard ──────────────────────────────────────────────────
type Recommendation = {
  id: string;
  title: string;
  reason: string;
  action: string;
  actionType: 'copy' | 'link' | 'command';
  priority: 'high' | 'medium' | 'low';
};

function getRecommendations(profile: Profile): Recommendation[] {
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  const legacyCfg = cfgVal(cfg);
  const latestDevice = (profile.devices || [])[0];
  const hasOllama = latestDevice ? latestDevice.has_ollama : legacyCfg.hasOllama;
  const hasAnthropicKey = latestDevice ? latestDevice.has_anthropic_key : legacyCfg.hasAnthropicKey;
  const { decisionsCount } = aggregateDevices(profile);
  const recs: Recommendation[] = [];

  if (!hasOllama) {
    recs.push({
      id: 'install-ollama',
      title: 'Instala Ollama para T0 gratuito',
      reason: 'Sem Ollama, todas as tarefas simples v\u00e3o para Haiku/Sonnet pago.',
      action: 'https://ollama.com/download',
      actionType: 'link',
      priority: 'high',
    });
  }

  if (hasOllama && !cfg.ollama_has_qwen3b) {
    recs.push({
      id: 'pull-qwen3b',
      title: 'Instala qwen2.5:3b para T0 r\u00e1pido',
      reason: 'Modelo recomendado para tarefas T0 (renames, commits, formata\u00e7\u00e3o).',
      action: 'ollama pull qwen2.5:3b',
      actionType: 'copy',
      priority: 'high',
    });
  }

  const hasGpu = profile.hardware_tier &&
    !['cpu_only', 'cloud', 'other', 'unknown', ''].includes(profile.hardware_tier);
  if (hasOllama && hasGpu && !cfg.ollama_has_qwen30b) {
    recs.push({
      id: 'pull-qwen30b',
      title: 'Instala qwen3:30b para T0-smart',
      reason: 'O teu GPU aguenta. qwen3:30b faz root cause analysis local \u2014 gr\u00e1tis.',
      action: 'ollama pull qwen3:30b',
      actionType: 'copy',
      priority: 'medium',
    });
  }

  if (decisionsCount > 200) {
    recs.push({
      id: 'run-backtest',
      title: 'Optimiza o teu router com backtest',
      reason: `Tens ${decisionsCount} decis\u00f5es. O backtest vai afinar o classifier para o teu padr\u00e3o de uso.`,
      action: 'node ~/.claude/tools/router/backtest.js && node ~/.claude/tools/router/update-router.js',
      actionType: 'copy',
      priority: 'medium',
    });
  }

  if (!hasAnthropicKey && isInstalled(profile)) {
    recs.push({
      id: 'add-anthropic-key',
      title: 'Adiciona ANTHROPIC_API_KEY',
      reason: 'Sem a key, T1 (Haiku) n\u00e3o est\u00e1 dispon\u00edvel. O router salta de T0 para T2.',
      action: 'export ANTHROPIC_API_KEY=sk-ant-... # adiciona ao ~/.zshrc ou ~/.bashrc',
      actionType: 'copy',
      priority: 'medium',
    });
  }

  return recs.sort((a, b) =>
    ['high', 'medium', 'low'].indexOf(a.priority) -
    ['high', 'medium', 'low'].indexOf(b.priority)
  );
}

function RecommendationsCard({ profile }: { profile: Profile }) {
  const [copied, copy] = useCopyButton();
  const recs = getRecommendations(profile);

  if (recs.length === 0) return null;

  const priorityDot = (p: string) => p === 'high' ? '\uD83D\uDD34' : p === 'medium' ? '\uD83D\uDFE1' : '\uD83D\uDFE2';

  return (
    <div className="dashboard-card">
      <h2>Recommendations</h2>
      {recs.map(r => (
        <div key={r.id} style={{ marginBottom: '0.75rem' }}>
          <p style={{ margin: '0 0 2px', fontWeight: 500 }}>{priorityDot(r.priority)} {r.title}</p>
          <p className="dashboard-muted" style={{ margin: '0 0 4px', fontSize: '0.9em' }}>{r.reason}</p>
          {r.actionType === 'link' ? (
            <a href={r.action} target="_blank" rel="noopener" className="dashboard-link" style={{ fontSize: '0.85em' }}>
              {r.action}
            </a>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: '0.85em' }}>
              <code style={{ flex: 1 }}>{r.action}</code>
              <CopyBtn id={r.id} text={r.action} copied={copied} onCopy={copy} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── MP-14: Overview tab content ─────────────────────────────────────────
function OverviewTab({ profile }: { profile: Profile }) {
  const { decisionsCount, savingsUsd } = aggregateDevices(profile);
  const allOpusCost = decisionsCount * 0.015;
  const savingsPct = allOpusCost > 0 ? Math.min(100, Math.round((savingsUsd / allOpusCost) * 100)) : 0;

  const config = (profile.frugal_config || {}) as Record<string, unknown>;
  const legacyCfg = cfgVal(config);
  const latestDevice = (profile.devices || [])[0];
  const hasOllama = latestDevice ? latestDevice.has_ollama : legacyCfg.hasOllama;
  const hasAnthropicKey = latestDevice ? latestDevice.has_anthropic_key : legacyCfg.hasAnthropicKey;
  const hasMax = profile.subscriptions?.some(s =>
    s.toLowerCase().includes('max') || s.toLowerCase().includes('claude max'));
  const hasOpenAI = profile.subscriptions?.some(s =>
    s.toLowerCase().includes('gpt') || s.toLowerCase().includes('openai')) || config.has_openai_key === true;

  const healthItems = [
    { label: 'Router', ok: decisionsCount > 0 },
    { label: 'Hook', ok: profile.install_completed || decisionsCount > 0 },
    { label: 'Tracker', ok: savingsUsd > 0 },
    { label: 'Sync', ok: !!(profile.devices && profile.devices.length > 0) },
  ];

  return (
    <>
      {/* Savings Hero */}
      {decisionsCount > 0 && (
        <div className="savings-hero">
          <div>
            <div className="savings-hero-number">${savingsUsd.toFixed(2)}</div>
            <div className="savings-hero-label">Saved</div>
          </div>
          <div>
            <div className="savings-hero-number">{decisionsCount}</div>
            <div className="savings-hero-label">Decisions</div>
          </div>
          <div>
            <div className="savings-hero-number">{savingsPct}%</div>
            <div className="savings-hero-label">Routed away from Opus</div>
          </div>
          {/* Device context line */}
          {latestDevice && (
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--muted)',
              fontFamily: 'var(--mono)',
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid rgba(78,201,176,0.15)',
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              width: '100%',
            }}>
              {latestDevice.gpu_name && <span>{latestDevice.gpu_name}</span>}
              {latestDevice.os_type && <span>{latestDevice.os_type === 'win32' ? 'Windows' : latestDevice.os_type === 'darwin' ? 'macOS' : 'Linux'}</span>}
              {latestDevice.hw_tier && <span>{latestDevice.hw_tier}</span>}
              {latestDevice.frugal_version && <span>frugal v{latestDevice.frugal_version}</span>}
            </div>
          )}
        </div>
      )}

      {/* AI Stack — 3 columns */}
      <div className="dashboard-card" style={{ marginBottom: 16 }}>
        <h2>AI Stack</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 8, textAlign: 'center' }}>
            <AnthropicLogo />
            <div style={{ fontSize: '0.85rem', marginTop: 6, fontWeight: 500 }}>Anthropic</div>
            <span className={`status-pill ${hasAnthropicKey || hasMax ? 'ok' : 'err'}`} style={{ marginTop: 6 }}>
              {hasAnthropicKey || hasMax ? '\u2713 Active' : '\u2717 Inactive'}
            </span>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 8, textAlign: 'center' }}>
            <OllamaLogo />
            <div style={{ fontSize: '0.85rem', marginTop: 6, fontWeight: 500 }}>Ollama</div>
            <span className={`status-pill ${hasOllama ? 'ok' : 'err'}`} style={{ marginTop: 6 }}>
              {hasOllama ? '\u2713 Active' : '\u2717 Inactive'}
            </span>
          </div>
          <div style={{ padding: '12px', background: 'var(--surface-2)', borderRadius: 8, textAlign: 'center' }}>
            <OpenAILogo />
            <div style={{ fontSize: '0.85rem', marginTop: 6, fontWeight: 500 }}>OpenAI</div>
            <span className={`status-pill ${hasOpenAI ? 'ok' : 'err'}`} style={{ marginTop: 6 }}>
              {hasOpenAI ? '\u2713 Active' : '\u2717 Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Health bar */}
      <div className="dashboard-card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {healthItems.map(h => (
            <span key={h.label} className={`status-pill ${h.ok ? 'ok' : 'err'}`}>
              {h.ok ? '\u2713' : '\u2717'} {h.label}
            </span>
          ))}
        </div>
      </div>

      {/* Rest of overview cards */}
      <SavingsCalculatorCard />
      <RecommendedModeCard profile={profile} />
      <ProjectContextCard profile={profile} />
      <RecommendationsCard profile={profile} />
    </>
  );
}

// ── MP-16: Metrics Transparency tab ─────────────────────────────────────
function MetricsTab({ profile }: { profile: Profile }) {
  const { decisionsCount, savingsUsd } = aggregateDevices(profile);

  return (
    <div style={{ maxWidth: 680 }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 6 }}>How frugal measures savings</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          frugal tracks routing decisions, not tokens. Here&apos;s what each number means and why
          they may differ from what you see in VSCode or the Claude interface.
        </p>
      </div>

      {/* Source comparison table */}
      <div style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: '0.875rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Where each number comes from
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {[
            {
              source: 'frugal dashboard',
              badge: '~est',
              badgeColor: 'var(--yellow)',
              what: `${decisionsCount} decisions · $${savingsUsd.toFixed(2)} saved`,
              how: 'Counts user prompts routed. Savings = (what Opus would cost) \u2212 (what frugal paid). Uses estimated token counts from prompt length.',
              why: 'Honest estimate. Not real tokens \u2014 real token counts require API access frugal doesn\u2019t have.',
            },
            {
              source: 'VSCode Claude plugin',
              badge: 'real',
              badgeColor: 'var(--t0)',
              what: 'Real token count \u00b7 real USD cost',
              how: 'Reads directly from Anthropic OAuth session. Counts every token sent and received, including system prompts and tool calls.',
              why: 'This is the ground truth for token usage. Higher than frugal\u2019s prompt count because it includes all context.',
            },
            {
              source: 'decisions.log (local)',
              badge: 'raw',
              badgeColor: 'var(--muted)',
              what: 'All classify() calls (includes hooks + system prompts)',
              how: 'Raw log of every classify() call. Includes UserPromptSubmit hooks, PostToolUse hooks, and system messages.',
              why: 'More lines than \u201cdecisions\u201d because frugal filters system prompts out before counting.',
            },
            {
              source: 'statusline (terminal)',
              badge: '~est',
              badgeColor: 'var(--yellow)',
              what: 'Live savings % per session',
              how: 'Reads the same decisions.log. Shows per-session and cumulative savings with tier breakdown.',
              why: 'Same methodology as the dashboard \u2014 refreshes in real time as you work.',
            },
          ].map(row => (
            <div key={row.source} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '14px 16px',
              display: 'grid',
              gridTemplateColumns: '160px 1fr',
              gap: '8px 16px',
              alignItems: 'start',
            }}>
              <div>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                  {row.source}
                </div>
                <span style={{
                  display: 'inline-block',
                  padding: '1px 7px',
                  borderRadius: 100,
                  fontSize: '0.65rem',
                  fontFamily: 'var(--mono)',
                  background: `color-mix(in srgb, ${row.badgeColor} 13%, transparent)`,
                  color: row.badgeColor,
                  border: `1px solid color-mix(in srgb, ${row.badgeColor} 27%, transparent)`,
                }}>
                  {row.badge}
                </span>
              </div>
              <div>
                <div style={{ fontSize: '0.8rem', color: 'var(--accent)', fontFamily: 'var(--mono)', marginBottom: 6 }}>
                  {row.what}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5, marginBottom: 4 }}>
                  <strong style={{ color: 'var(--text)' }}>How: </strong>{row.how}
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--text)' }}>Why different: </strong>{row.why}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key insight callout */}
      <div style={{
        background: 'rgba(78,201,176,0.06)',
        border: '1px solid rgba(78,201,176,0.2)',
        borderRadius: 8,
        padding: '14px 16px',
        marginBottom: 20,
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--accent)', marginBottom: 6 }}>
          The number that matters
        </div>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6, margin: 0 }}>
          frugal&apos;s <strong style={{ color: 'var(--text)' }}>decisions count</strong> tells you how many times
          the router intervened. The <strong style={{ color: 'var(--text)' }}>savings estimate</strong> is a
          lower bound &mdash; real savings are higher because frugal also reduces latency and context window usage.
          The VSCode token count is the ground truth for what Anthropic actually processed.
        </p>
      </div>

      {/* Glossary */}
      <div>
        <h3 style={{ fontSize: '0.875rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
          Glossary
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { term: 'decision', def: 'One user prompt that went through classify.js and was routed to a tier.' },
            { term: 'naive cost', def: 'What that decision would have cost if routed to Opus every time.' },
            { term: 'real cost (est.)', def: 'Estimated actual cost based on the tier it was routed to \u00d7 avg token estimate.' },
            { term: 'saved (est.)', def: 'naive cost \u2212 real cost (est.). This is the savings number shown in the dashboard.' },
            { term: 'guaranteed saved', def: 'Only Option A hits where Ollama answered directly instead of Opus. Conservative floor.' },
            { term: 'savings %', def: 'saved / naive \u00d7 100. 68% means frugal spent 32% of what pure-Opus would cost.' },
          ].map(({ term, def }) => (
            <div key={term} style={{ display: 'flex', gap: 12, fontSize: '0.8rem' }}>
              <code style={{ color: 'var(--accent)', fontFamily: 'var(--mono)', minWidth: 140, flexShrink: 0 }}>{term}</code>
              <span style={{ color: 'var(--muted)', lineHeight: 1.5 }}>{def}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

// ── MP-17: SVG Icons for flowchart ──────────────────────────────────────
function PromptIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="1" y="4" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M5 8h8M5 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>;
}

function ChipIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <rect x="4" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M7 1v3M11 1v3M7 14v3M11 14v3M1 7h3M1 11h3M14 7h3M14 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <rect x="6.5" y="6.5" width="5" height="5" rx="0.5" fill="currentColor" opacity="0.3"/>
  </svg>;
}

function LightningIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
    <path d="M10.5 1L3 10.5h6L7.5 17 15 7.5H9L10.5 1z"/>
  </svg>;
}

function ScanIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
    <path d="M12 12l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M6 8h4M8 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>;
}

function DiamondIcon() {
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
    <path d="M9 1L17 9L9 17L1 9L9 1Z" stroke="currentColor" strokeWidth="1.5"/>
  </svg>;
}

// ── MP-17: AnimatedCounter ──────────────────────────────────────────────
function AnimatedCounter({ value, prefix = '', suffix = '', duration = 1500 }: {
  value: number; prefix?: string; suffix?: string; duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [value, duration]);
  return <span>{prefix}{display.toFixed(2)}{suffix}</span>;
}

// ── MP-17: FlowNode ────────────────────────────────────────────────────
function FlowNode({ index, icon, label, badge, tooltip, highlight, children }: {
  index: number;
  icon: React.ReactNode;
  label: string;
  badge?: string;
  tooltip: string;
  highlight?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="flow-node"
      style={{
        animationDelay: `${index * 0.1}s`,
        border: highlight ? '2px solid var(--accent, #4ec9b0)' : '1px solid var(--border)',
        background: highlight ? 'rgba(78,201,176,0.08)' : 'var(--surface-2, #1a1a1a)',
        borderRadius: 12,
        padding: '16px 20px',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: children ? 10 : 0 }}>
        <span style={{ color: highlight ? 'var(--accent)' : 'var(--muted)', display: 'flex' }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{label}</span>
        {badge && (
          <span style={{
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: 20,
            background: highlight ? 'rgba(78,201,176,0.15)' : 'rgba(255,255,255,0.06)',
            color: highlight ? 'var(--accent)' : 'var(--muted)',
            fontFamily: 'var(--mono)',
          }}>{badge}</span>
        )}
      </div>
      {children}
      <div className="flow-tooltip">{tooltip}</div>
    </div>
  );
}

// ── MP-17: FlowArrow ───────────────────────────────────────────────────
function FlowArrow() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
      <svg width="2" height="28" viewBox="0 0 2 28" style={{ overflow: 'visible' }}>
        <line x1="1" y1="0" x2="1" y2="28" className="flow-arrow" stroke="var(--border-light, #2e2e2e)" strokeWidth="2"/>
      </svg>
    </div>
  );
}

// ── MP-17: ModelCard ───────────────────────────────────────────────────
function ModelCard({ label, badge, color, cost, tooltip }: {
  label: string; badge: string; color: string; cost: string; tooltip: string;
}) {
  return (
    <div className="flow-node" style={{
      animationDelay: '0.5s',
      border: `1px solid ${color}33`,
      background: `${color}0a`,
      borderRadius: 10,
      padding: '12px 14px',
      position: 'relative',
      flex: 1,
      minWidth: 130,
    }}>
      <div style={{ fontWeight: 600, fontSize: '0.85rem', color, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '0.65rem', color: 'var(--muted)', fontFamily: 'var(--mono)', marginBottom: 6 }}>{badge}</div>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, fontFamily: 'var(--mono)' }}>{cost}</div>
      <div className="flow-tooltip">{tooltip}</div>
    </div>
  );
}

// ── MP-17: HowItWorksTab ───────────────────────────────────────────────
function HowItWorksTab({ profile }: { profile: Profile }) {
  const { decisionsCount, savingsUsd } = aggregateDevices(profile);
  const config = (profile.frugal_config || {}) as Record<string, unknown>;
  const pctByTier = (config.pct_by_tier || {}) as Record<string, number>;
  const t0Pct = pctByTier.t0 ?? 59;
  const t1Pct = pctByTier.t1 ?? 12;
  const t2Pct = pctByTier.t2 ?? 0;
  const t3Pct = pctByTier.t3 ?? 29;
  const routedAwayPct = Math.round(t0Pct + t1Pct + t2Pct);

  const latestDevice = (profile.devices || [])[0];
  const gpuName = latestDevice?.gpu_name || 'GPU';
  const osType = latestDevice?.os_type || profile.os_type || 'unknown';
  const frugalVersion = latestDevice?.frugal_version || profile.frugal_version || '0.9';

  const naiveCost = decisionsCount * 0.045;

  const tiers: { key: string; pct: number; color: string }[] = [
    { key: 'T0', pct: t0Pct, color: 'var(--t0, #4ec9b0)' },
    { key: 'T1', pct: t1Pct, color: 'var(--t1, #569cd6)' },
    { key: 'T2', pct: t2Pct, color: 'var(--t2, #dcdcaa)' },
    { key: 'T3', pct: t3Pct, color: 'var(--t3, #f47373)' },
  ];

  const featurePills = [
    'has_code_block', 'has_file_refs', 'has_error_trace',
    'lang_detected', 'quality_intent', 'complexity_score', 'risk_level',
  ];

  return (
    <div style={{ maxWidth: 680 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: '1.1rem', marginBottom: 6 }}>How frugal works</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', lineHeight: 1.6 }}>
          Every prompt you write is classified in under 50ms &mdash; before any model sees it.
          frugal reads 40+ signals, extracts 7 features, and routes to the cheapest model
          that can do the job. No guessing. No waste.
        </p>
      </div>

      {/* Flow */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Node 1 — Your prompt */}
        <FlowNode index={0} icon={<PromptIcon />} label="Your prompt" tooltip="Every message you send in Claude Code passes through frugal before reaching any model. Nothing is sent to any LLM until frugal decides which one.">
          <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>The question you typed</div>
        </FlowNode>
        <FlowArrow />

        {/* Node 2 — Pre-processing */}
        <FlowNode index={1} icon={<ChipIcon />} label="Pre-processing" badge="LOCAL · ~1ms" tooltip="frugal normalizes your prompt locally — strips noise, detects language (PT/EN), identifies code blocks, file references, error traces, and URLs. Zero data leaves your machine at this step.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['language detection', 'code block?', 'file refs', 'error trace?'].map(f => (
              <span key={f} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{f}</span>
            ))}
          </div>
        </FlowNode>
        <FlowArrow />

        {/* Node 3 — classify.js (CORE — highlighted) */}
        <FlowNode index={2} icon={<LightningIcon />} label="classify.js" badge="< 50ms · zero LLM" highlight tooltip="The router. Pure regex heuristics, no AI involved. Reads 40+ patterns across HIGH_RISK, MED_RISK, LOW_RISK, and TRIVIAL signal buckets. Trained on 230 real decisions from your own usage. Complexity threshold: 0.25.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['230 samples trained', '40+ patterns', 'SHA-256 cache (30min TTL)'].map(f => (
              <span key={f} style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(78,201,176,0.12)', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{f}</span>
            ))}
          </div>
        </FlowNode>
        <FlowArrow />

        {/* Node 4 — Signal extraction */}
        <FlowNode index={3} icon={<ScanIcon />} label="Signal extraction" badge="7 features" tooltip="Before routing, frugal extracts boolean/numeric features from the prompt: has_code_block, has_file_refs, has_error_trace, is_question, has_url, lang_detected, file_ref_count. These feed the complexity score and future auto-learning.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {featurePills.map((f, i) => (
              <span key={f} className="flow-pill" style={{ animationDelay: `${0.3 + i * 0.07}s`, fontSize: '0.7rem', padding: '2px 8px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>{f}</span>
            ))}
          </div>
        </FlowNode>
        <FlowArrow />

        {/* Node 5 — Tier decision (diamond) */}
        <FlowNode index={4} icon={<DiamondIcon />} label="Tier decision" tooltip="Based on signal weights, frugal assigns a tier. HIGH_RISK signals (prod, deploy, migrations, secrets) always force T3. TRIVIAL signals (rename, color change, single file) go T0. The complexity threshold (0.25) was tuned from your real history.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {tiers.map(t => (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', width: 24, color: t.color, fontWeight: 600 }}>{t.key}</span>
                <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                  <div className="tier-bar" style={{ '--target-width': `${t.pct}%`, height: '100%', borderRadius: 4, background: t.color } as React.CSSProperties} />
                </div>
                <span style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', width: 36, textAlign: 'right', color: t.color }}>{t.pct}%</span>
              </div>
            ))}
          </div>
        </FlowNode>
        <FlowArrow />

        {/* Node 6 — Model cards */}
        <div className="flow-node" style={{ animationDelay: '0.5s', padding: 0, border: 'none', background: 'transparent' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <ModelCard label="Ollama" badge="FREE · LOCAL" color="#4ec9b0" cost="$0.00" tooltip={`Runs entirely on your ${gpuName}. No API calls. No data sent anywhere. frugal warms the model in RAM before you need it so there's no cold-start penalty.`} />
            <ModelCard label="Claude Haiku" badge="API · FAST" color="#569cd6" cost="~$0.001" tooltip="Anthropic's fastest Claude. Used for light code tasks, commit messages, explanations, regex. 40× cheaper than Opus." />
            <ModelCard label="Claude Sonnet" badge="API · BALANCED" color="#dcdcaa" cost="~$0.01" tooltip="Used for debugging, root cause analysis, comparing approaches. 5× cheaper than Opus with 90% of the capability for most tasks." />
            <ModelCard label="Claude Opus" badge="API · MAXIMUM" color="#f47373" cost="~$0.15" tooltip={`Reserved for architecture decisions, multi-file refactors, production-critical tasks. frugal only sends here when it has to — your ${t3Pct}% T3 rate means ${routedAwayPct}% of prompts were handled cheaper.`} />
          </div>
        </div>
      </div>

      {/* Savings block */}
      {decisionsCount > 0 && (
        <div style={{
          marginTop: 32,
          padding: '20px 24px',
          borderRadius: 12,
          background: 'linear-gradient(135deg, rgba(78,201,176,0.08) 0%, rgba(78,201,176,0.02) 100%)',
          border: '1px solid rgba(78,201,176,0.25)',
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--t0, #4ec9b0)', fontFamily: 'var(--mono)' }}>
                <AnimatedCounter value={savingsUsd} prefix="$" />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>saved</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                <AnimatedCounter value={decisionsCount} prefix="" suffix="" />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>decisions</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 700, fontFamily: 'var(--mono)' }}>
                <AnimatedCounter value={routedAwayPct} suffix="%" />
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>routed away</div>
            </div>
          </div>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', textAlign: 'center', lineHeight: 1.7 }}>
            If every prompt went to Opus: ~${naiveCost.toFixed(2)}<br />
            frugal actually spent: ~${Math.max(0, naiveCost - savingsUsd).toFixed(2)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--faint)', textAlign: 'center', marginTop: 10, fontFamily: 'var(--mono)' }}>
            {gpuName} · {osType} · frugal v{frugalVersion}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────
type DashTab = 'overview' | 'devices' | 'setup' | 'metrics' | 'howitworks';

const DASH_TABS: { key: DashTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'devices', label: 'Devices' },
  { key: 'setup', label: 'Setup Guide' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'howitworks', label: 'How it works' },
];

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DashTab>('overview');

  useEffect(() => {
    fetch('/api/me')
      .then(r => r.json())
      .then(async (data) => {
        if (!data.userId) return;
        const res = await fetch(`/api/profile?userId=${data.userId}`);
        if (res.ok) {
          const p = await res.json();
          setProfile(p);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>;
  }

  if (!profile) {
    return (
      <div className="dashboard-card">
        <p>No profile found. <a href="/onboarding">Complete onboarding</a> to set up your profile.</p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800 }}>
      {/* Tabs */}
      <div className="app-tabs">
        {DASH_TABS.map(t => (
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
      {tab === 'overview' && <OverviewTab profile={profile} />}
      {tab === 'devices' && <DevicesTab profile={profile} />}
      {tab === 'setup' && <SetupGuideTab profile={profile} />}
      {tab === 'metrics' && <MetricsTab profile={profile} />}
      {tab === 'howitworks' && <HowItWorksTab profile={profile} />}
    </div>
  );
}
