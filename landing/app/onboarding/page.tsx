'use client';

import { useState } from 'react';
import { upsertProfile, getUser, SUPABASE_URL, SUPABASE_ANON_KEY, signInWithGitHub } from '../lib/supabase';
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

const INSTALL_CMD_MAC = 'bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)';
const INSTALL_CMD_WIN = 'irm https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 | iex';

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [hw, setHw] = useState('');
  const [subs, setSubs] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [githubConnected, setGithubConnected] = useState(false);

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
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      });
    } catch {
      // Silent fail — profile save is best-effort
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

        {/* Step 2: Connect GitHub */}
        {step === 2 && (
          <div className="onboarding-step">
            <h2>Connect GitHub</h2>
            <p className="onboarding-sub">
              We only read public repo metadata — languages and activity.
              We never access code or private repos.
            </p>

            <div className="onboarding-scopes">
              <div className="onboarding-scope-item">
                <span className="onboarding-scope-icon">✓</span>
                <span><strong>read:user</strong> — your username and avatar</span>
              </div>
              <div className="onboarding-scope-item">
                <span className="onboarding-scope-icon">✓</span>
                <span><strong>public_repo</strong> — public repo metadata only</span>
              </div>
              <div className="onboarding-scope-item">
                <span className="onboarding-scope-icon">✗</span>
                <span>No code access. No private repos. No file contents.</span>
              </div>
            </div>

            <button
              className="onboarding-next"
              onClick={() => signInWithGitHub()}
            >
              Connect GitHub
            </button>
            <button
              className="onboarding-skip"
              onClick={() => setStep(3)}
            >
              Skip for now
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

        {/* Step 4: Personalized config */}
        {step === 4 && (
          <div className="onboarding-step">
            <h2>Your personalized config</h2>
            <p className="onboarding-sub">
              frugal has been configured specifically for your setup.
            </p>

            {(() => {
              const config = generateFrugalConfig({
                hardware_tier: hw,
                subscriptions: subs.map(s => s.toLowerCase().replace(' ', '_')),
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
                  {config.personalized_message && (
                    <p className="onboarding-config-msg">{config.personalized_message}</p>
                  )}
                </div>
              );
            })()}

            <a href="/dashboard" className="onboarding-next" style={{ textAlign: 'center', display: 'block', textDecoration: 'none' }}>
              {saving ? 'Saving...' : 'Go to dashboard →'}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
