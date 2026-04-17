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

// ── Live preview helpers — gives the user a tangible "what you'll get" as
//    they fill out step 1. Numbers are directional, anchored on real router
//    accuracy (~88%) and tier cost ratios used in the landing page calculator.
const LOCAL_HW = new Set(['mac_m_series', 'windows_nvidia', 'windows_amd', 'linux_nvidia', 'linux_amd']);

function estimateMonthlySavings({ hw, subs, budget }: { hw: string; subs: string[]; budget: number }): string {
  const hasLocal = LOCAL_HW.has(hw);
  const hasMax = subs.includes('Claude Max');
  const effectiveBudget = budget === 999 ? 300 : budget; // "no limit" anchor
  // Rough mental model: without mooter, users burn ~$120/mo in Opus-only at moderate usage.
  // With mooter, local deflection + tier routing typically brings that down 70–90%.
  const floor = hasLocal ? 0.10 : 0.25;
  const baseline = hasMax ? 120 : Math.max(40, effectiveBudget * 4);
  const saved = Math.round(baseline * (1 - floor));
  if (hasLocal) return `Save ~$${saved}/mo · ${Math.round((1 - floor) * 100)}% less than Opus-only`;
  return `Save ~$${saved}/mo · ${Math.round((1 - floor) * 100)}% less than Opus-only (cloud-only routing)`;
}

function estimateExplanation({ hw, subs, budget }: { hw: string; subs: string[]; budget: number }): string {
  const hasLocal = LOCAL_HW.has(hw);
  const hasMax = subs.includes('Claude Max');
  const parts: string[] = [];
  if (hasLocal) parts.push('Trivial tasks (T0) run locally via Ollama — $0');
  else parts.push('No GPU detected — T0 tasks go to Haiku (~$0.003/prompt)');
  if (hasMax) parts.push('Claude Max subscription covers Opus for T3 work at flat rate');
  else if (subs.length > 0) parts.push(`Routed across your ${subs.length} provider${subs.length > 1 ? 's' : ''} for best cost/quality`);
  if (budget === 0) parts.push('Free-only mode — never hits paid APIs');
  else if (budget >= 100) parts.push('Budget headroom for occasional Opus (critical architecture decisions)');
  return parts.join(' · ');
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [hw, setHw] = useState('');
  const [subs, setSubs] = useState<string[]>([]);
  const [budget, setBudget] = useState(30);
  const [saving, setSaving] = useState(false);
  const [cliToken, setCliToken] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [cmdCopied, setCmdCopied] = useState(false);

  const toggleSub = (s: string) => {
    setSubs(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
  };

  const isWindows = hw === 'windows_nvidia' || hw === 'windows_amd';
  const installCmd = isWindows ? INSTALL_CMD_WIN : INSTALL_CMD_MAC;

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

      try {
        const tokenRes = await fetch('/api/cli-token');
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          if (tokenData.token) setCliToken(tokenData.token);
        }
      } catch { /* best-effort */ }
    } catch {
      /* best-effort */
    } finally {
      setSaving(false);
    }
  };

  const copyCmd = () => {
    navigator.clipboard.writeText(installCmd).catch(() => {});
    setCmdCopied(true);
    setTimeout(() => setCmdCopied(false), 2000);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      padding: '48px 20px',
      display: 'flex',
      justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* ── Header / brand ─────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <span style={{ fontSize: '1.75rem', lineHeight: 1 }}>🐮</span>
          <span style={{
            fontSize: '1.1rem', fontWeight: 700, letterSpacing: '-0.01em',
            fontFamily: 'var(--font)', color: 'var(--text)',
          }}>
            mooter
          </span>
        </div>

        {/* ── Progress dots ──────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
          {[1, 2, 3].map(s => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 'var(--r-full)',
                background: step >= s ? 'var(--accent)' : 'var(--border)',
                transition: 'background 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* ── Step 1 ─────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h2 style={{
              fontSize: '1.75rem', fontWeight: 700, margin: '0 0 8px',
              letterSpacing: '-0.02em', color: 'var(--text)',
              fontFamily: 'var(--font)',
            }}>
              Your setup
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 24px' }}>
              Tell mooter about your machine so it can route smart.
            </p>

            <FieldLabel required>What hardware are you running on?</FieldLabel>
            <ChipGroup>
              {HW_OPTIONS.map(o => (
                <Chip key={o.value} active={hw === o.value} onClick={() => setHw(o.value)}>
                  {o.label}
                </Chip>
              ))}
            </ChipGroup>

            <FieldLabel>Which AI subscriptions do you have?</FieldLabel>
            <ChipGroup>
              {SUB_OPTIONS.map(s => (
                <Chip key={s} active={subs.includes(s)} onClick={() => toggleSub(s)}>
                  {s}
                </Chip>
              ))}
            </ChipGroup>

            <FieldLabel>Monthly token budget (beyond existing subs)?</FieldLabel>
            <ChipGroup>
              {BUDGET_OPTIONS.map(b => (
                <Chip key={b.value} active={budget === b.value} onClick={() => setBudget(b.value)}>
                  {b.label}
                </Chip>
              ))}
            </ChipGroup>

            {/* Savings preview — lights up as user makes selections */}
            {hw && (
              <div style={{
                marginTop: 32,
                padding: '20px 24px',
                background: 'color-mix(in srgb, var(--accent) 6%, var(--surface))',
                border: '1px solid color-mix(in srgb, var(--accent) 24%, var(--border))',
                borderRadius: 'var(--r-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                  Estimated impact
                </div>
                <div style={{ fontSize: '1.35rem', color: 'var(--text)', fontWeight: 700, fontFamily: 'var(--font)', letterSpacing: '-0.01em' }}>
                  {estimateMonthlySavings({ hw, subs, budget })}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                  {estimateExplanation({ hw, subs, budget })}
                </div>
              </div>
            )}

            <PrimaryButton disabled={!hw} onClick={() => setStep(2)}>
              {hw ? 'Next \u2192' : 'Pick your hardware to continue'}
            </PrimaryButton>
          </div>
        )}

        {/* ── Step 2 ─────────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <h2 style={{
              fontSize: '1.75rem', fontWeight: 700, margin: '0 0 8px',
              letterSpacing: '-0.02em', color: 'var(--text)',
              fontFamily: 'var(--font)',
            }}>
              Install mooter
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 24px', lineHeight: 1.6 }}>
              Paste this in your terminal. The installer detects your system automatically.
            </p>

            {/* Terminal mock */}
            <div style={{
              background: '#0D0D0D',
              border: '1px solid var(--border)',
              borderRadius: 'var(--r-md)',
              overflow: 'hidden',
              marginBottom: 24,
            }}>
              <div style={{
                display: 'flex', gap: 6, padding: '10px 14px',
                borderBottom: '1px solid var(--border)',
                alignItems: 'center',
              }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--tier-3)' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--yellow)' }} />
                <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--tier-0)' }} />
                <span style={{
                  marginLeft: 'auto',
                  fontSize: '0.7rem', color: 'var(--muted)',
                  fontFamily: 'var(--mono)',
                }}>
                  {isWindows ? 'PowerShell' : 'Terminal'}
                </span>
              </div>
              <div style={{
                padding: 16,
                fontFamily: 'var(--mono)',
                fontSize: '0.8rem',
                color: 'var(--cream)',
                lineHeight: 1.7,
                overflowX: 'auto',
              }}>
                <div>
                  <span style={{ color: 'var(--accent)' }}>$ </span>
                  <span style={{ wordBreak: 'break-all' }}>{installCmd}</span>
                </div>
              </div>
              <div style={{
                display: 'flex', justifyContent: 'flex-end',
                padding: '10px 14px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
              }}>
                <button
                  onClick={copyCmd}
                  style={{
                    background: cmdCopied ? 'var(--tier-0)' : 'var(--surface-2)',
                    color: cmdCopied ? 'var(--bg)' : 'var(--text)',
                    border: '1px solid var(--border-light)',
                    borderRadius: 'var(--r-sm)',
                    padding: '6px 14px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    fontFamily: 'var(--font)',
                    transition: 'background 0.15s ease',
                  }}
                >
                  {cmdCopied ? '\u2713 Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <SecondaryButton onClick={() => setStep(1)}>&larr; Back</SecondaryButton>
              <PrimaryButton onClick={() => { saveProfile(); setStep(3); }}>
                Done, next &rarr;
              </PrimaryButton>
            </div>
          </div>
        )}

        {/* ── Step 3 ─────────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <h2 style={{
              fontSize: '1.75rem', fontWeight: 700, margin: '0 0 8px',
              letterSpacing: '-0.02em', color: 'var(--text)',
              fontFamily: 'var(--font)',
            }}>
              Your personalised config
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 24px', lineHeight: 1.6 }}>
              mooter is configured for your exact setup. You can change this later in settings.
            </p>

            {(() => {
              const config = generateFrugalConfig({
                hardware_tier: hw,
                subscriptions: subs.map(s => s.toLowerCase().replace(/\s+/g, '_')),
                monthly_budget_usd: budget,
              });
              const rows: Array<[string, string]> = [
                ['Mode', config.default_mode],
                ['Ollama', config.ollama_enabled ? `${config.ollama_model} (active)` : 'Disabled'],
                ['T0 threshold', String(config.t0_threshold)],
                ['Hub push', config.hub_push_enabled ? 'Enabled' : 'Disabled'],
                ['Budget', config.monthly_budget_usd === 999 ? 'No limit' : `$${config.monthly_budget_usd}/mo (${config.budget_tier})`],
              ];
              return (
                <div style={{
                  background: 'var(--surface-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--r-md)',
                  padding: 4,
                  marginBottom: 24,
                }}>
                  {rows.map(([label, val], i) => (
                    <div
                      key={label}
                      style={{
                        display: 'flex', justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
                        fontSize: '0.85rem',
                      }}
                    >
                      <span style={{ color: 'var(--muted)' }}>{label}</span>
                      <span style={{
                        color: 'var(--tier-0)',
                        fontWeight: 600,
                        fontFamily: 'var(--mono)',
                      }}>
                        {val}
                      </span>
                    </div>
                  ))}
                  {config.personalized_message && (
                    <p style={{
                      margin: 0,
                      padding: '14px 16px',
                      borderTop: '1px solid var(--border)',
                      color: 'var(--cream)',
                      fontSize: '0.8rem',
                      lineHeight: 1.6,
                      background: 'rgba(255,107,53,0.04)',
                    }}>
                      {config.personalized_message}
                    </p>
                  )}
                </div>
              );
            })()}

            {cliToken && (
              <div style={{
                marginBottom: 24,
                padding: 16,
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                background: 'var(--surface)',
              }}>
                <p style={{
                  margin: '0 0 10px', fontSize: '0.85rem',
                  color: 'var(--text)', fontWeight: 500,
                }}>
                  Paste this token in Claude Cowork when prompted:
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <code style={{
                    flex: 1, minWidth: 0,
                    fontSize: '0.78rem',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    background: 'var(--bg)',
                    padding: '8px 10px',
                    borderRadius: 'var(--r-sm)',
                    border: '1px solid var(--border)',
                    fontFamily: 'var(--mono)',
                    color: 'var(--accent)',
                  }}>
                    {tokenRevealed ? cliToken : `${cliToken.slice(0, 10)}...${cliToken.slice(-6)}`}
                  </code>
                  <button
                    onClick={() => setTokenRevealed(v => !v)}
                    title={tokenRevealed ? 'Hide token' : 'Reveal token'}
                    style={{
                      background: 'var(--surface-2)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-sm)',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                      color: 'var(--muted)',
                      lineHeight: 1,
                    }}
                  >
                    {tokenRevealed ? '\uD83D\uDE48' : '\uD83D\uDC41'}
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(cliToken).catch(() => {});
                      setTokenCopied(true);
                      setTimeout(() => setTokenCopied(false), 2000);
                    }}
                    style={{
                      background: tokenCopied ? 'var(--tier-0)' : 'var(--accent)',
                      color: 'var(--bg)',
                      border: 'none',
                      borderRadius: 'var(--r-sm)',
                      padding: '7px 16px',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      whiteSpace: 'nowrap',
                      fontFamily: 'var(--font)',
                    }}
                  >
                    {tokenCopied ? '\u2713 Copied' : 'Copy'}
                  </button>
                </div>
                <p style={{
                  margin: '10px 0 0', fontSize: '0.75rem',
                  color: 'var(--muted)', lineHeight: 1.5,
                }}>
                  This token connects your CLI to your dashboard.{' '}
                  <a href="/setup" style={{ color: 'var(--accent)' }}>
                    {'\u2192'} Open mooter setup guide
                  </a>
                </p>
              </div>
            )}

            <a
              href="/dashboard"
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
              onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
              style={{
                display: 'block',
                textAlign: 'center',
                textDecoration: 'none',
                background: 'var(--accent)',
                color: 'var(--bg)',
                padding: '14px 24px',
                borderRadius: 'var(--r-md)',
                fontSize: '0.95rem',
                fontWeight: 700,
                fontFamily: 'var(--font)',
                transition: 'filter 0.15s ease',
              }}
            >
              {saving ? 'Saving...' : 'Go to dashboard \u2192'}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Local UI primitives ────────────────────────────────────────────────
function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <p style={{
      fontSize: '0.75rem',
      color: 'var(--muted)',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
      fontWeight: 600,
      margin: '24px 0 10px',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}>
      {children}
      {required && (
        <span style={{ color: 'var(--accent)', fontSize: '0.85em', letterSpacing: 0, textTransform: 'none' }}>
          • required
        </span>
      )}
    </p>
  );
}

function ChipGroup({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
      {children}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={e => { if (!active) e.currentTarget.style.borderColor = 'var(--border-light)'; }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.borderColor = 'var(--border)'; }}
      style={{
        background: active ? 'var(--accent)' : 'var(--surface-2)',
        color: active ? 'var(--bg)' : 'var(--text)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 'var(--r-full)',
        padding: '8px 16px',
        fontSize: '0.85rem',
        fontWeight: active ? 600 : 400,
        cursor: 'pointer',
        fontFamily: 'var(--font)',
        transition: 'border-color 0.15s ease, background 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}

function PrimaryButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.filter = 'brightness(1.1)'; }}
      onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
      style={{
        flex: 1,
        marginTop: 32,
        padding: '14px 24px',
        background: disabled ? 'var(--surface-2)' : 'var(--accent)',
        color: disabled ? 'var(--muted)' : 'var(--bg)',
        border: 'none',
        borderRadius: 'var(--r-md)',
        fontSize: '0.95rem',
        fontWeight: 700,
        fontFamily: 'var(--font)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'filter 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
      style={{
        marginTop: 32,
        padding: '14px 24px',
        background: 'var(--surface-2)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-md)',
        fontSize: '0.95rem',
        fontWeight: 600,
        fontFamily: 'var(--font)',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease',
      }}
    >
      {children}
    </button>
  );
}
