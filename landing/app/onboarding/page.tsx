'use client';

import { useState } from 'react';
import { upsertProfile, getUser, SUPABASE_URL, SUPABASE_ANON_KEY } from '../lib/supabase';

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

const INSTALL_CMD_MAC = 'bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)';
const INSTALL_CMD_WIN = 'irm https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 | iex';

const PROMPT_TIERS = [10, 50, 100, 200, 500];

function estimateCost(prompts: number): { without: number; with: number } {
  // Rough estimate: avg prompt ~$0.03 on Opus, frugal saves ~90%
  const without = prompts * 30 * 0.03;
  const withFrugal = without * 0.1;
  return { without: Math.round(without), with: Math.round(withFrugal) };
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [hw, setHw] = useState('');
  const [subs, setSubs] = useState<string[]>([]);
  const [prompts, setPrompts] = useState(100);
  const [saving, setSaving] = useState(false);

  const toggleSub = (s: string) => {
    setSubs(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const isWindows = hw === 'windows_nvidia' || hw === 'windows_amd';

  const saveProfile = async () => {
    setSaving(true);
    try {
      // Read access token from cookie via a simple API call
      const res = await fetch('/api/me');
      if (!res.ok) return;
      const { accessToken, userId } = await res.json();

      await upsertProfile(accessToken, {
        id: userId,
        hardware_tier: hw,
        subscriptions: subs,
        prompts_per_day_estimate: prompts,
        ollama_available: !hw.includes('cloud'),
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // Silent fail — profile save is best-effort
    } finally {
      setSaving(false);
    }
  };

  const costs = estimateCost(prompts);

  return (
    <div className="onboarding-page">
      <div className="onboarding-container">
        <div className="onboarding-header">
          <img src="/frugal-logo.svg" alt="frugal" width={32} height={32} />
          <span className="onboarding-brand">frugal</span>
        </div>

        <div className="onboarding-progress">
          {[1, 2, 3, 4].map(s => (
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

            <button
              className="onboarding-next"
              disabled={!hw}
              onClick={() => setStep(2)}
            >
              Next &rarr;
            </button>
          </div>
        )}

        {/* Step 2: Usage estimate */}
        {step === 2 && (
          <div className="onboarding-step">
            <h2>How much do you use Claude Code?</h2>

            <div className="onboarding-slider-wrap">
              <input
                type="range"
                min={0}
                max={PROMPT_TIERS.length - 1}
                value={PROMPT_TIERS.indexOf(prompts)}
                onChange={e => setPrompts(PROMPT_TIERS[parseInt(e.target.value)])}
                className="onboarding-slider"
              />
              <div className="onboarding-slider-label">{prompts} prompts/day</div>
            </div>

            <div className="onboarding-estimate">
              <div className="onboarding-est-row">
                <span>Without frugal</span>
                <span className="onboarding-est-val onboarding-est-high">~${costs.without}/mo</span>
              </div>
              <div className="onboarding-est-row">
                <span>With frugal</span>
                <span className="onboarding-est-val onboarding-est-low">~${costs.with}/mo</span>
              </div>
              <div className="onboarding-est-savings">
                You save ~${costs.without - costs.with}/mo
              </div>
            </div>

            <button className="onboarding-next" onClick={() => setStep(3)}>
              Next &rarr;
            </button>
          </div>
        )}

        {/* Step 3: Install */}
        {step === 3 && (
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

            <button className="onboarding-next" onClick={() => { saveProfile(); setStep(4); }}>
              Done, next &rarr;
            </button>
          </div>
        )}

        {/* Step 4: Verify */}
        {step === 4 && (
          <div className="onboarding-step">
            <h2>Verify it works</h2>
            <p className="onboarding-sub">Run this in Claude Code:</p>

            <div className="onboarding-cmd-block">
              <code>/frugal-status</code>
            </div>

            <p className="onboarding-sub" style={{ marginTop: '1.5rem' }}>What you should see:</p>

            <div className="onboarding-terminal">
              <div className="onboarding-term-bar">
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f47373' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dcdcaa' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#4ec9b0' }} />
              </div>
              <pre className="onboarding-term-body">{`frugal status — all green
  Router: active · last prompt · T0 (free) ✓
  Savings: $0.05 saved already
  Ollama: qwen2.5:3b online
  Hub: connected`}</pre>
            </div>

            <a href="/dashboard" className="onboarding-next" style={{ textAlign: 'center', display: 'block', textDecoration: 'none' }}>
              {saving ? 'Saving...' : 'I see this! Go to dashboard \u2192'}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
