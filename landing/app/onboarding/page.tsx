'use client';

import { useState } from 'react';
import { generateFrugalConfig } from '../lib/generate-frugal-config';

const HW_OPTIONS = [
  { value: 'mac_m_series', label: 'Mac M-series' },
  { value: 'windows_nvidia', label: 'Windows + NVIDIA' },
  { value: 'windows_amd', label: 'Windows + AMD' },
  { value: 'linux_nvidia', label: 'Linux + NVIDIA' },
  { value: 'linux_amd', label: 'Linux + AMD' },
  { value: 'cloud', label: 'Cloud' },
  { value: 'other', label: 'Other' },
];

const SUB_OPTIONS = ['Claude Max', 'Claude API', 'GPT Plus', 'GPT API', 'Gemini'];

const BUDGET_OPTIONS = [
  { value: 0,   label: 'Free only' },
  { value: 10,  label: '~$10/mo' },
  { value: 30,  label: '~$30/mo' },
  { value: 100, label: '~$100/mo' },
  { value: 999, label: 'No limit' },
];

const INSTALL_CMD_MAC = 'bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)';
const INSTALL_CMD_WIN = 'irm https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 | iex';

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [hw, setHw] = useState('');
  const [subs, setSubs] = useState<string[]>([]);
  const [budget, setBudget] = useState(30);
  const [saving, setSaving] = useState(false);
  const [cliToken, setCliToken] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenRevealed, setTokenRevealed] = useState(false);

  const toggleSub = (s: string) => {
    setSubs(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const isWindows = hw === 'windows_nvidia' || hw === 'windows_amd';

  const saveProfile = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/me');
      if (!res.ok) return;
      const { userId, email } = await res.json();

      const config = generateFrugalConfig({
        hardware_tier: hw,
        subscriptions: subs.map(s => s.toLowerCase().replace(/\s+/g, '_')),
        monthly_budget_usd: budget,
      });

      await fetch('/api/profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          data: {
            id: userId,
            email,
            hardware_tier: hw,
            subscriptions: subs,
            frugal_config: config,
            onboarding_completed: true,
            updated_at: new Date().toISOString(),
          },
        }),
      });

      // Fetch CLI token for display
      try {
        const tokenRes = await fetch('/api/cli-token');
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData.token) setCliToken(tokenData.token);
        }
      } catch { /* best-effort */ }
    } catch {
      // best-effort
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="onboarding-page">
      <div className="onboarding-container">
        <div className="onboarding-header">
          <img src="/frugal-logo.svg" alt="frugal" width={32} height={32} />
          <span className="onboarding-brand">frugal</span>
        </div>

        <div className="onboarding-progress">
          {[1, 2, 3].map(s => (
            <div key={s} className={`onboarding-dot ${step >= s ? 'onboarding-dot-active' : ''}`} />
          ))}
        </div>

        {/* Step 1: Hardware + Subscriptions */}
        {step === 1 && (
          <div className="onboarding-step">
            <h2>Your setup</h2>
            <p className="onboarding-sub">What hardware are you running on?</p>

            <div className="onboarding-chips">
              {HW_OPTIONS.map(o => (
                <button
                  key={o.value}
                  className={`onboarding-chip ${hw === o.value ? 'onboarding-chip-active' : ''}`}
                  onClick={() => setHw(o.value)}
                >
                  {o.label}
                </button>
              ))}
            </div>

            <p className="onboarding-sub" style={{ marginTop: '2rem' }}>Which AI subscriptions do you have?</p>

            <div className="onboarding-chips">
              {SUB_OPTIONS.map(s => (
                <button
                  key={s}
                  className={`onboarding-chip ${subs.includes(s) ? 'onboarding-chip-active' : ''}`}
                  onClick={() => toggleSub(s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <p className="onboarding-sub" style={{ marginTop: '2rem' }}>Monthly token budget (beyond existing subscriptions)?</p>

            <div className="onboarding-chips">
              {BUDGET_OPTIONS.map(b => (
                <button
                  key={b.value}
                  className={`onboarding-chip ${budget === b.value ? 'onboarding-chip-active' : ''}`}
                  onClick={() => setBudget(b.value)}
                >
                  {b.label}
                </button>
              ))}
            </div>

            <button
              className="onboarding-next"
              disabled={!hw}
              onClick={() => setStep(2)}
            >
              Next &rarr;
            </button>
          </div>
        )}

        {/* Step 2: Install */}
        {step === 2 && (
          <div className="onboarding-step">
            <h2>Install frugal</h2>
            <p className="onboarding-sub">
              Copy and paste this command in your terminal.
              The installer detects your system automatically.
            </p>

            <div className="onboarding-cmd-block">
              <code>{isWindows ? INSTALL_CMD_WIN : INSTALL_CMD_MAC}</code>
              <button
                className="onboarding-copy"
                onClick={() => navigator.clipboard.writeText(isWindows ? INSTALL_CMD_WIN : INSTALL_CMD_MAC)}
              >
                Copy
              </button>
            </div>

            <button className="onboarding-next" onClick={() => { saveProfile(); setStep(3); }}>
              Done, next &rarr;
            </button>
          </div>
        )}

        {/* Step 3: Personalized config */}
        {step === 3 && (
          <div className="onboarding-step">
            <h2>Your personalized config</h2>
            <p className="onboarding-sub">
              frugal has been configured specifically for your setup.
            </p>

            {(() => {
              const config = generateFrugalConfig({
                hardware_tier: hw,
                subscriptions: subs.map(s => s.toLowerCase().replace(/\s+/g, '_')),
                monthly_budget_usd: budget,
              });
              return (
                <div className="onboarding-config-display">
                  <div className="onboarding-config-row">
                    <span className="onboarding-config-label">Mode</span>
                    <span className="onboarding-config-val">{config.default_mode}</span>
                  </div>
                  <div className="onboarding-config-row">
                    <span className="onboarding-config-label">Ollama</span>
                    <span className="onboarding-config-val">
                      {config.ollama_enabled ? `${config.ollama_model} (active)` : 'Disabled'}
                    </span>
                  </div>
                  <div className="onboarding-config-row">
                    <span className="onboarding-config-label">T0 threshold</span>
                    <span className="onboarding-config-val">{config.t0_threshold}</span>
                  </div>
                  <div className="onboarding-config-row">
                    <span className="onboarding-config-label">Hub push</span>
                    <span className="onboarding-config-val">{config.hub_push_enabled ? 'Enabled' : 'Disabled'}</span>
                  </div>
                  <div className="onboarding-config-row">
                    <span className="onboarding-config-label">Budget</span>
                    <span className="onboarding-config-val">
                      {config.monthly_budget_usd === 999 ? 'No limit' : `$${config.monthly_budget_usd}/mo (${config.budget_tier})`}
                    </span>
                  </div>
                  {config.personalized_message && (
                    <p className="onboarding-config-msg">{config.personalized_message}</p>
                  )}
                </div>
              );
            })()}

            {cliToken && (
              <div style={{ margin: '1.5rem 0', padding: '1rem', border: '1px solid #333', borderRadius: 8, background: '#111' }}>
                <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
                  Paste this token in Claude Cowork when prompted during setup:
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <code style={{ flex: 1, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: '#080808', padding: '6px 8px', borderRadius: 6, border: '1px solid #222', fontFamily: 'var(--mono)' }}>
                    {tokenRevealed ? cliToken : `${cliToken.slice(0, 10)}...${cliToken.slice(-6)}`}
                  </code>
                  <button
                    onClick={() => setTokenRevealed(v => !v)}
                    title={tokenRevealed ? 'Hide token' : 'Reveal token'}
                    style={{ background: 'none', border: '1px solid #333', borderRadius: 6, padding: '4px 8px', cursor: 'pointer', fontSize: '0.9rem', color: '#666', lineHeight: 1 }}
                  >
                    {tokenRevealed ? '\uD83D\uDE48' : '\uD83D\uDC41'}
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(cliToken).catch(() => {}); setTokenCopied(true); setTimeout(() => setTokenCopied(false), 2000); }}
                    style={{ background: tokenCopied ? '#4ec9b0' : 'none', color: tokenCopied ? '#000' : '#4ec9b0', border: '1px solid #333', borderRadius: 6, padding: '4px 14px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    {tokenCopied ? '\u2713 Copied' : 'Copy'}
                  </button>
                </div>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.75rem', color: '#666' }}>
                  This token connects your CLI to your dashboard. <a href="/setup" style={{ color: '#4ec9b0' }}>{'\u2192'} Open frugal setup guide</a>
                </p>
              </div>
            )}

            <a href="/dashboard" className="onboarding-next" style={{ textAlign: 'center', display: 'block', textDecoration: 'none' }}>
              {saving ? 'Saving...' : 'Go to dashboard \u2192'}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
