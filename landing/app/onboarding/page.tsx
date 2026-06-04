'use client';

import { useEffect, useState } from 'react';
import { generateFrugalConfig } from '../lib/generate-frugal-config';
import { suggestHardware, formatGpuLabel } from './_lib/hardware';
import { PERSONAS, personaPackHint, type Persona } from './_lib/persona';
import { LOCAL_HW, estimateMonthlySavings } from './_lib/estimate';

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

const INSTALL_CMD_MAC = 'bash <(curl -fsSL https://mooter.ai/install.sh)';
const INSTALL_CMD_WIN = 'irm https://mooter.ai/install-windows.ps1 | iex';

// ── Live preview helpers — gives the user a tangible "what you'll get" as they
//    fill out step 1. estimateMonthlySavings + LOCAL_HW live in _lib/estimate
//    (pure, unit-tested; page.tsx may only carry valid Next.js Page exports).

// Ollama recommendations — aligned with the real mooter router.
//
// Router (classify.js) uses these models per task type:
//   ollama_terse   → qwen2.5:3b              (Option A / baseline, ~1.9 GB)
//   ollama_code    → qwen2.5-coder:14b       (code tasks, ~9 GB)
//   ollama_math    → deepseek-r1:7b          (math/reasoning, ~4 GB)
//   ollama_reason  → qwen3:30b               (heavy reasoning, ~18 GB)
//
// The installer pulls the baseline. The router auto-uses the others
// if the user adds them via `ollama pull` later.
type OllamaModel = { name: string; size: string; role: string };
type OllamaRec = {
  baseline: OllamaModel;        // what the installer pulls
  optional: OllamaModel[];      // what mooter will auto-use if present
  note?: string;                 // hw-specific caveat
} | null;

function recommendOllamaModel(hwValue: string, gpuName: string | null): OllamaRec {
  const gpuLower = (gpuName || '').toLowerCase();

  // Cloud / other → no local Ollama
  if (!hwValue || hwValue === 'cloud' || hwValue === 'other') return null;

  const baseline: OllamaModel = {
    name: 'qwen2.5:3b',
    size: '~1.9 GB',
    role: 'baseline · T0 tasks',
  };
  const coder: OllamaModel = {
    name: 'qwen2.5-coder:14b',
    size: '~9 GB',
    role: 'code tasks',
  };
  const math: OllamaModel = {
    name: 'deepseek-r1:7b',
    size: '~4 GB',
    role: 'math / reasoning',
  };
  const heavy: OllamaModel = {
    name: 'qwen3:30b',
    size: '~18 GB',
    role: 'heavy reasoning',
  };

  // Mac M-series — unified memory, typical 16-32 GB shared
  if (hwValue === 'mac_m_series') {
    return {
      baseline,
      optional: [coder, math],
      note: 'Mac unified memory handles 14B comfortably on M2/M3 with 16 GB+.',
    };
  }

  // NVIDIA — VRAM-dependent
  if (hwValue === 'linux_nvidia' || hwValue === 'windows_nvidia') {
    const isHighEnd = /rtx\s?(30[789]0|40[789]0|50[789]0)|a(40|100|6000)|h100/.test(gpuLower);
    if (isHighEnd) {
      return {
        baseline,
        optional: [coder, math, heavy],
        note: 'High-end NVIDIA — all router models fit, including qwen3:30b for reasoning.',
      };
    }
    return {
      baseline,
      optional: [coder, math],
      note: 'For 12 GB+ VRAM, add coder:14b and deepseek-r1 via `ollama pull` later.',
    };
  }

  // AMD — ROCm can be fragile with large models
  if (hwValue === 'linux_amd' || hwValue === 'windows_amd') {
    return {
      baseline,
      optional: [coder],
      note: 'AMD via ROCm is stable with 3B; the 14B coder works on most recent cards.',
    };
  }

  return null;
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

// ── Browser-side hardware detection ───────────────────────────────────
// Graceful: any probe may fail silently; card just renders less info.
type DetectedHw = {
  os: 'mac' | 'windows' | 'linux' | 'other';
  cpuCores: number | null;
  gpuName: string | null;
  ramGb: number | null;
  suggestedHw: string | null;  // matches HW_OPTIONS.value
  probed: boolean;
};

function probeHardware(): DetectedHw {
  const empty: DetectedHw = {
    os: 'other', cpuCores: null, gpuName: null, ramGb: null,
    suggestedHw: null, probed: true,
  };
  if (typeof window === 'undefined') return { ...empty, probed: false };

  // OS
  const ua = navigator.userAgent.toLowerCase();
  let os: DetectedHw['os'] = 'other';
  if (ua.includes('mac')) os = 'mac';
  else if (ua.includes('win')) os = 'windows';
  else if (ua.includes('linux')) os = 'linux';

  // CPU cores
  const cpuCores = navigator.hardwareConcurrency || null;

  // RAM (Chrome only, may be undefined elsewhere)
  const ramGb = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;

  // GPU via WebGL
  let gpuName: string | null = null;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl') ||
                canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (dbg) {
        gpuName = (gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string) || null;
      }
    }
  } catch { /* ignore */ }

  // Suggest hw chip value from os + gpu (pure, unit-tested in _lib/hardware.ts).
  const suggestedHw = suggestHardware(os, gpuName);

  return { os, cpuCores, gpuName, ramGb, suggestedHw, probed: true };
}

function useDetectedHardware(): DetectedHw {
  const [hw, setHw] = useState<DetectedHw>({
    os: 'other', cpuCores: null, gpuName: null, ramGb: null,
    suggestedHw: null, probed: false,
  });
  useEffect(() => { setHw(probeHardware()); }, []);
  return hw;
}

function formatOsLabel(os: DetectedHw['os']): string {
  return os === 'mac' ? 'macOS' : os === 'windows' ? 'Windows' : os === 'linux' ? 'Linux' : 'Unknown OS';
}

export default function OnboardingPage() {
  const detected = useDetectedHardware();
  const [step, setStep] = useState(1);
  const [hw, setHw] = useState('');
  const [hwConfirmed, setHwConfirmed] = useState(false);
  const [subs, setSubs] = useState<string[]>([]);
  const [budget, setBudget] = useState(30);
  const [persona, setPersona] = useState<Persona>('other');
  const [saving, setSaving] = useState(false);
  const [cliToken, setCliToken] = useState('');
  const [tokenCopied, setTokenCopied] = useState(false);
  const [tokenRevealed, setTokenRevealed] = useState(false);
  const [cmdCopied, setCmdCopied] = useState(false);
  const [installToken, setInstallToken] = useState('');  // Wave 6 D2 — personalized install URL
  const [urlCopied, setUrlCopied] = useState(false);

  // Auto-seed hardware chip from browser detection, once.
  useEffect(() => {
    if (detected.probed && detected.suggestedHw && !hw) {
      setHw(detected.suggestedHw);
    }
  }, [detected.probed, detected.suggestedHw, hw]);

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
            persona,
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

      // Wave 6 D2 — mint a personalized install token (anonymous pre-config).
      try {
        const instRes = await fetch('/api/install-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            persona,
            subscription_self_reported: subs[0] ?? 'api-only',
            hardware_class: { os_class: detected.os, gpu_class: detected.gpuName ?? 'unknown' },
          }),
        });
        if (instRes.ok) {
          const instData = await instRes.json();
          if (instData.token) setInstallToken(instData.token);
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
    <div className="onboarding-shell" style={{
      minHeight: '100vh',
      padding: '48px 20px',
      display: 'flex',
      justifyContent: 'center',
    }}>
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* ── Header / brand ─────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
          <OnboardingMooterLogo size={28} />
          <span style={{
            fontSize: '1.05rem', fontWeight: 700, letterSpacing: '-0.02em',
            fontFamily: 'var(--font)', color: 'var(--text)',
          }}>
            mooter
          </span>
        </div>

        {/* ── Progress indicator ─────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, marginBottom: 40,
        }}>
          <span style={{
            fontSize: '0.72rem',
            color: 'var(--muted)',
            fontFamily: 'var(--mono)',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            fontWeight: 600,
            flexShrink: 0,
          }}>
            Step {step} of 3
          </span>
          <div style={{ display: 'flex', gap: 6, flex: 1 }}>
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

            {/* Auto-detect card */}
            {detected.probed && (detected.os !== 'other' || detected.gpuName) && (
              <div style={{
                marginBottom: 24,
                padding: '16px 20px',
                background: hwConfirmed
                  ? 'color-mix(in srgb, var(--tier-0) 8%, var(--surface))'
                  : 'color-mix(in srgb, var(--accent) 6%, var(--surface))',
                border: `1px solid ${hwConfirmed
                  ? 'color-mix(in srgb, var(--tier-0) 32%, var(--border))'
                  : 'color-mix(in srgb, var(--accent) 24%, var(--border))'}`,
                borderRadius: 'var(--r-md)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontSize: '0.72rem', color: 'var(--muted)',
                  textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
                  marginBottom: 10,
                }}>
                  <span>{hwConfirmed ? '✓ ' : ''}We detected your machine</span>
                </div>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: 12,
                  marginBottom: 14,
                }}>
                  <DetectRow label="OS" value={formatOsLabel(detected.os)} />
                  {detected.cpuCores && (
                    <DetectRow label="CPU" value={`${detected.cpuCores}-core`} />
                  )}
                  {detected.gpuName && (
                    <DetectRow label="GPU" value={formatGpuLabel(detected.gpuName) ?? 'Unknown GPU'} truncate />
                  )}
                  {detected.ramGb && (
                    <DetectRow label="RAM" value={`~${detected.ramGb} GB`} />
                  )}
                </div>
                <div style={{
                  fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.5,
                  paddingTop: 12, borderTop: '1px solid var(--border)',
                }}>
                  {hwConfirmed
                    ? <>Using <span style={{ color: 'var(--tier-0)', fontWeight: 600 }}>{HW_OPTIONS.find(h => h.value === hw)?.label ?? hw}</span> — change below if wrong.</>
                    : <>Looks like <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{HW_OPTIONS.find(h => h.value === detected.suggestedHw)?.label ?? 'this machine'}</span>. Confirm or pick manually.</>}
                </div>
                {!hwConfirmed && detected.suggestedHw && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      onClick={() => { setHw(detected.suggestedHw!); setHwConfirmed(true); }}
                      onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                      onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
                      style={{
                        flex: 1,
                        background: 'var(--accent)', color: 'var(--cream)',
                        border: 'none', borderRadius: 'var(--r-sm)',
                        padding: '8px 14px', fontSize: '0.82rem',
                        fontWeight: 700, fontFamily: 'var(--font)',
                        cursor: 'pointer', transition: 'filter 0.15s ease',
                      }}
                    >
                      ✓ This looks right
                    </button>
                    <button
                      onClick={() => { setHw(''); setHwConfirmed(false); }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-light)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                      style={{
                        background: 'var(--surface-2)', color: 'var(--text)',
                        border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
                        padding: '8px 14px', fontSize: '0.82rem',
                        fontWeight: 500, fontFamily: 'var(--font)',
                        cursor: 'pointer', transition: 'border-color 0.15s ease',
                      }}
                    >
                      Pick manually
                    </button>
                  </div>
                )}
              </div>
            )}

            <FieldLabel required>What hardware are you running on?</FieldLabel>
            <ChipGroup>
              {HW_OPTIONS.map(o => (
                <Chip key={o.value} active={hw === o.value} onClick={() => setHw(o.value)}>
                  {o.label}
                </Chip>
              ))}
            </ChipGroup>

            <FieldLabel>Which AI providers do you already use?</FieldLabel>
            <p style={{
              fontSize: '0.78rem', color: 'var(--muted)',
              margin: '-6px 0 10px', lineHeight: 1.5,
            }}>
              Your API keys stay on your machine after install — this just tells mooter which tiers to route to.
            </p>
            <ChipGroup>
              {SUB_OPTIONS.map(s => (
                <Chip key={s} active={subs.includes(s)} onClick={() => toggleSub(s)}>
                  {s}
                </Chip>
              ))}
            </ChipGroup>

            {/* Ollama baseline + optional stack — aligned with real mooter router */}
            {(() => {
              const rec = recommendOllamaModel(hw, detected.gpuName);
              if (!rec) return null;
              return (
                <div style={{
                  marginTop: 20,
                  padding: '18px 20px',
                  background: 'var(--surface-2)',
                  border: '1px dashed color-mix(in srgb, var(--tier-0) 40%, var(--border))',
                  borderRadius: 'var(--r-md)',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginBottom: 14, flexWrap: 'wrap',
                  }}>
                    <span style={{
                      fontSize: '0.68rem',
                      color: 'var(--tier-0)',
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      background: 'color-mix(in srgb, var(--tier-0) 14%, transparent)',
                      padding: '3px 8px',
                      borderRadius: 'var(--r-sm)',
                    }}>
                      Free · Local
                    </span>
                    <span style={{
                      fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600,
                    }}>
                      Local stack for your hardware
                    </span>
                  </div>

                  {/* Baseline row (installer auto-pulls this) */}
                  <OllamaModelRow
                    name={rec.baseline.name}
                    size={rec.baseline.size}
                    role={rec.baseline.role}
                    tag="installer pulls"
                    tagColor="var(--accent)"
                  />

                  {/* Optional rows (mooter auto-uses if present) */}
                  {rec.optional.length > 0 && (
                    <>
                      <div style={{
                        marginTop: 12, marginBottom: 6,
                        fontSize: '0.7rem', color: 'var(--muted)',
                        textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
                      }}>
                        Optional — mooter auto-uses if installed
                      </div>
                      {rec.optional.map(m => (
                        <OllamaModelRow
                          key={m.name}
                          name={m.name}
                          size={m.size}
                          role={m.role}
                          tag="ollama pull"
                          tagColor="var(--muted)"
                        />
                      ))}
                    </>
                  )}

                  {rec.note && (
                    <p style={{
                      margin: '12px 0 0', fontSize: '0.78rem',
                      color: 'var(--muted)', lineHeight: 1.55,
                      paddingTop: 12, borderTop: '1px solid var(--border)',
                    }}>
                      {rec.note} The router picks per task — no config needed.
                    </p>
                  )}
                </div>
              );
            })()}

            <FieldLabel>Monthly token budget (beyond existing subs)?</FieldLabel>
            <ChipGroup>
              {BUDGET_OPTIONS.map(b => (
                <Chip key={b.value} active={budget === b.value} onClick={() => setBudget(b.value)}>
                  {b.label}
                </Chip>
              ))}
            </ChipGroup>

            {/* Persona — mirrors the CLI `mooter init` persona step (W3 D2), so a
                web-onboarded user lands on the same profile shape as a CLI user. */}
            <FieldLabel>What best describes you?</FieldLabel>
            <p style={{
              fontSize: '0.78rem', color: 'var(--muted)',
              margin: '-6px 0 10px', lineHeight: 1.5,
            }}>
              Tunes which packs mooter recommends — you can change it later.
            </p>
            <ChipGroup>
              {PERSONAS.map(p => (
                <Chip key={p.value} active={persona === p.value} onClick={() => setPersona(p.value)}>
                  {p.title}
                </Chip>
              ))}
            </ChipGroup>
            <p style={{ fontSize: '0.78rem', color: 'var(--muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
              {personaPackHint(persona)}
            </p>

            {/* Savings preview — hero "reward moment", lights up as the user
                makes selections. Gradient + glow mirrors the landing hero. */}
            {hw && (
              <div style={{
                marginTop: 32,
                padding: '24px 26px',
                background: 'linear-gradient(135deg, rgba(232,136,138,0.12) 0%, rgba(232,136,138,0.02) 60%)',
                border: '1px solid var(--accent-bg)',
                borderColor: 'rgba(232,136,138,0.25)',
                borderRadius: 'var(--r-lg)',
                boxShadow: '0 0 0 1px rgba(232,136,138,0.04), 0 8px 40px -12px rgba(232,136,138,0.35)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}>
                <div style={{ fontSize: '0.72rem', color: 'var(--accent-soft)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
                  Estimated impact
                </div>
                <div style={{ fontSize: '1.7rem', color: 'var(--text)', fontWeight: 800, fontFamily: 'var(--font)', letterSpacing: '-0.02em', lineHeight: 1.15 }}>
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
              background: '#0D0B08',
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
                color: '#F2ECDF',
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
                borderTop: '1px solid #2A2218',
                background: '#181410',
              }}>
                <button
                  onClick={copyCmd}
                  style={{
                    background: cmdCopied ? 'var(--tier-0)' : 'rgba(255,255,255,0.06)',
                    color: cmdCopied ? 'var(--cream)' : '#F2ECDF',
                    border: '1px solid rgba(255,255,255,0.12)',
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
                      color: 'var(--text)',
                      fontSize: '0.8rem',
                      lineHeight: 1.6,
                      background: 'rgba(194,95,101,0.06)',
                    }}>
                      {config.personalized_message}
                    </p>
                  )}
                </div>
              );
            })()}

            {installToken && (
              <div style={{
                marginBottom: 24,
                padding: 16,
                border: '1px solid color-mix(in srgb, var(--accent) 24%, var(--border))',
                borderRadius: 'var(--r-md)',
                background: 'color-mix(in srgb, var(--accent) 5%, var(--surface))',
              }}>
                <p style={{ margin: '0 0 10px', fontSize: '0.85rem', color: 'var(--text)', fontWeight: 600 }}>
                  One-line install — pre-configured for you:
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <code style={{
                    flex: 1, minWidth: 0,
                    fontSize: '0.76rem',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    background: 'var(--bg)', padding: '8px 10px',
                    borderRadius: 'var(--r-sm)', border: '1px solid var(--border)',
                    fontFamily: 'var(--mono)', color: 'var(--accent)',
                  }}>
                    curl https://mooter.ai/i/{installToken} | bash
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`curl https://mooter.ai/i/${installToken} | bash`).catch(() => {});
                      setUrlCopied(true);
                      setTimeout(() => setUrlCopied(false), 2000);
                    }}
                    style={{
                      background: urlCopied ? 'var(--tier-0)' : 'var(--accent)',
                      color: 'var(--cream)', border: 'none', borderRadius: 'var(--r-sm)',
                      padding: '7px 16px', cursor: 'pointer', fontSize: '0.8rem',
                      fontWeight: 700, whiteSpace: 'nowrap', fontFamily: 'var(--font)',
                    }}
                  >
                    {urlCopied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>
                <p style={{ margin: '10px 0 0', fontSize: '0.75rem', color: 'var(--muted)', lineHeight: 1.5 }}>
                  ⓘ Token expires in 24h · single-use. Review the script first:{' '}
                  <code style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>curl … | less</code>
                </p>
                <div style={{
                  marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)',
                  fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6,
                }}>
                  Pre-config: <span style={{ color: 'var(--text)' }}>{HW_OPTIONS.find(h => h.value === hw)?.label ?? hw}</span>
                  {' · '}persona <span style={{ color: 'var(--text)' }}>{persona}</span>
                  {subs.length > 0 && <> · {subs.join(', ')}</>}
                </div>
              </div>
            )}

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
                      color: 'var(--cream)',
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
                color: 'var(--cream)',
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
function OllamaModelRow({ name, size, role, tag, tagColor }: {
  name: string; size: string; role: string; tag: string; tagColor: string;
}) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      alignItems: 'baseline',
      gap: 12,
      padding: '6px 0',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 8,
          marginBottom: 2, flexWrap: 'wrap',
        }}>
          <code style={{
            fontSize: '0.9rem',
            fontFamily: 'var(--mono)',
            color: 'var(--accent)',
            fontWeight: 600,
          }}>
            {name}
          </code>
          <span style={{
            fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--mono)',
          }}>
            {size}
          </span>
        </div>
        <div style={{ fontSize: '0.74rem', color: 'var(--muted)' }}>{role}</div>
      </div>
      <span style={{
        fontSize: '0.65rem',
        color: tagColor,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        fontWeight: 700,
        fontFamily: 'var(--mono)',
        whiteSpace: 'nowrap',
      }}>
        {tag}
      </span>
    </div>
  );
}

function DetectRow({ label, value, truncate }: { label: string; value: string; truncate?: boolean }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{
        fontSize: '0.66rem', color: 'var(--muted)',
        textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div
        title={truncate ? value : undefined}
        style={{
          fontSize: '0.88rem', color: 'var(--text)',
          fontWeight: 600, fontFamily: 'var(--mono)',
          overflow: truncate ? 'hidden' : 'visible',
          textOverflow: truncate ? 'ellipsis' : 'clip',
          whiteSpace: truncate ? 'nowrap' : 'normal',
        }}
      >
        {value}
      </div>
    </div>
  );
}

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

function OnboardingMooterLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg" aria-label="Mooter logo">
      <path fill="#B8C0C8" d="M2 2c-1 1 1 7 4.5 8.5S11 6 10 6C6.5 6 4 0 2 2z"/>
      <path fill="#B8C0C8" d="M34 2c1 1-1 7-4.5 8.5S25 6 26 6c3.5 0 6-6 8-4z"/>
      <path fill="#F5D7D8" d="M4.5 3.5c-.5.5 1 5 3 6s3-3.5 2-3.5c-2 0-3.5-3-5-2.5z"/>
      <path fill="#F5D7D8" d="M31.5 3.5c.5.5-1 5-3 6s-3-3.5-2-3.5c2 0 3.5-3 5-2.5z"/>
      <path fill="#B8C0C8" d="M4 8s-4 2-4 11c0 0 6-1 7-3 0 0 2-12.25-3-8z"/>
      <path fill="#B8C0C8" d="M27.995 8.043s4 2 4 11c0 0-6-.999-7-2.999 0 0-2-12.251 3-8.001z"/>
      <path fill="#CCD3DA" d="M21.976 31h-7.951C8.488 31 4 26.512 4 20.976v-8.951C4 6.488 8.488 2 14.025 2h7.951C27.512 2 32 6.488 32 12.025v8.951C32 26.512 27.512 31 21.976 31z"/>
      <path fill="#EDAEB0" d="M35 28c0 5.522-4.478 8-10 8H11c-5.523 0-10-2.478-10-8s4.477-10 10-10h14c5.522 0 10 4.478 10 10z"/>
      <ellipse fill="#C16A6F" cx="9.5" cy="26" rx="1.5" ry="3"/>
      <ellipse fill="#C16A6F" cx="26.5" cy="26" rx="1.5" ry="3"/>
      <path fill="#2C2F33" d="M11 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z"/>
      <path fill="#2C2F33" d="M21 12s0-2 2-2 2 2 2 2v2s0 2-2 2-2-2-2-2v-2z"/>
    </svg>
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
