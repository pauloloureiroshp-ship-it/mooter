'use client';

import { useEffect, useState } from 'react';

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

// ── PEÇA 2a: Savings Hero Card ───────────────────────────────────────────
function SavingsHeroCard({ profile }: { profile: Profile }) {
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  const { decisionsCount, savingsUsd } = cfgVal(cfg);

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
  const config = (profile.frugal_config || {}) as Record<string, unknown>;
  const { hasOllama, hasAnthropicKey, decisionsCount, savingsUsd } = cfgVal(config);

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
  const { hasOllama, hasAnthropicKey, decisionsCount } = cfgVal(cfg);
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

// ── Dashboard Header ─────────────────────────────────────────────────────
function DashboardHeader({ profile }: { profile: Profile }) {
  const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
  const { decisionsCount } = cfgVal(cfg);

  return (
    <div className="dashboard-header">
      <a href="/" className="dashboard-brand">
        <img src="/frugal-logo.svg" alt="frugal" width={28} height={28} />
        <span>frugal</span>
      </a>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span className="dashboard-muted" style={{ fontSize: '0.8rem' }}>
          {profile.frugal_version && `v${profile.frugal_version}`}
          {profile.hardware_tier && profile.hardware_tier !== 'unknown' && ` \u00b7 ${profile.hardware_tier.replace(/_/g, ' ')}`}
          {decisionsCount > 0 && ` \u00b7 ${decisionsCount} decisions`}
        </span>
        <a href="/api/logout" className="dashboard-logout">Sign out</a>
      </div>
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────
export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

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
    return (
      <div className="dashboard-page">
        <div className="dashboard-container">
          <div className="dashboard-loading">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        {profile ? <DashboardHeader profile={profile} /> : (
          <div className="dashboard-header">
            <a href="/" className="dashboard-brand">
              <img src="/frugal-logo.svg" alt="frugal" width={28} height={28} />
              <span>frugal</span>
            </a>
            <a href="/api/logout" className="dashboard-logout">Sign out</a>
          </div>
        )}

        <h1 className="dashboard-h1">Your dashboard</h1>

        {!profile ? (
          <div className="dashboard-card">
            <p>No profile found. <a href="/onboarding">Complete onboarding</a> to set up your profile.</p>
          </div>
        ) : (
          <>
            {/* Savings Hero (top, prominent) */}
            <SavingsHeroCard profile={profile} />

            {/* AI Stack */}
            <AIStackCard profile={profile} />

            {/* Setup Stepper */}
            <SetupStepperCard profile={profile} />

            {/* Savings Calculator */}
            <SavingsCalculatorCard />

            {/* Recommended mode card */}
            <RecommendedModeCard profile={profile} />

            {/* Project context card */}
            <ProjectContextCard profile={profile} />

            {/* Recommendations card */}
            <RecommendationsCard profile={profile} />

            {/* Profile card */}
            <div className="dashboard-card">
              <h2>Profile</h2>
              <div className="dashboard-grid">
                <div className="dashboard-field">
                  <span className="dashboard-label">Email</span>
                  <span className="dashboard-val">{profile.email}</span>
                </div>
                <div className="dashboard-field">
                  <span className="dashboard-label">Hardware</span>
                  <span className="dashboard-val">{profile.hardware_tier?.replace(/_/g, ' ') || 'Not set'}</span>
                </div>
                <div className="dashboard-field">
                  <span className="dashboard-label">Subscriptions</span>
                  <span className="dashboard-val">{profile.subscriptions?.join(', ') || 'None'}</span>
                </div>
                {profile.github_username && (
                  <>
                    <div className="dashboard-field">
                      <span className="dashboard-label">GitHub</span>
                      <span className="dashboard-val">@{profile.github_username}</span>
                    </div>
                    <div className="dashboard-field">
                      <span className="dashboard-label">Primary language</span>
                      <span className="dashboard-val">{profile.github_primary_language || '\u2014'}</span>
                    </div>
                    <div className="dashboard-field">
                      <span className="dashboard-label">Public repos</span>
                      <span className="dashboard-val">{profile.github_public_repos_count}</span>
                    </div>
                  </>
                )}
                <div className="dashboard-field">
                  <span className="dashboard-label">Level</span>
                  <span className="dashboard-val">{profile.experience_level || 'unknown'}</span>
                </div>
              </div>
              <a href="/onboarding" className="dashboard-link">Edit profile</a>
            </div>

            {/* Config card */}
            <div className="dashboard-card">
              <h2>Your frugal config</h2>
              {profile.frugal_config && Object.keys(profile.frugal_config).length > 0 ? (
                <div className="dashboard-grid">
                  {Object.entries(profile.frugal_config).map(([key, val]) => (
                    <div className="dashboard-field" key={key}>
                      <span className="dashboard-label">{key.replace(/_/g, ' ')}</span>
                      <span className="dashboard-val">{String(val)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dashboard-muted">Config will be generated after onboarding.</p>
              )}
            </div>

            {/* Community */}
            <div className="dashboard-card">
              <h2>Community</h2>
              <p className="dashboard-muted">
                Your routing decisions help improve the algorithm for everyone.
              </p>
              <a
                href="https://frugal-hub.frugal-hub.workers.dev/api/stats"
                target="_blank"
                rel="noopener"
                className="dashboard-link"
              >
                View live community stats
              </a>
            </div>

            {/* Install on another machine */}
            <div className="dashboard-card">
              <h2>Install on another machine</h2>
              <div className="dashboard-cmd">
                <code>bash &lt;(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)</code>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
