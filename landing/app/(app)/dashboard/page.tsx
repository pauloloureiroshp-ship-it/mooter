'use client';

import { useEffect, useState } from 'react';
// Wave 4 Phase C — new dashboard cards (extend, not replace).
import { CliStatusCard, ActivityNote, CliSettingsLink, DashboardFooterNote, PHASE_C } from './_phase_c';
import DataSourceBadge from '../../_components/DataSourceBadge';
import { VersionBadge } from '../../_components/VersionBadge';
import { formatGpuLabel } from '../../onboarding/_lib/hardware';
import { heroDataSource, installedOllamaModels, isModelInstalled } from './_state';
import { personaOption, personaPackHint } from '../../onboarding/_lib/persona';
// Wave 58 batch 4 (A.13) — admin-only specialization-matrix panel.
import { MatrixPanel } from './_matrix_panel';

interface Device {
  device_id: string;
  device_name: string;
  os_type: string;
  hw_tier: string;
  gpu_name?: string | null;
  gpu_vram_mb?: number | null;
  ollama_models?: string[] | null;
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
  persona: string | null;
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

// ── Shared tokens ───────────────────────────────────────────────────────
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

// ── Copy hook ────────────────────────────────────────────────────────────
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
      style={{
        background: copied[id] ? 'var(--tier-0)' : 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        padding: '3px 10px',
        color: copied[id] ? 'var(--bg)' : 'var(--accent)',
        cursor: 'pointer',
        fontSize: '0.75rem',
        fontWeight: 600,
        marginLeft: 8,
        fontFamily: 'var(--font)',
        transition: 'background 0.15s ease',
      }}
    >
      {copied[id] ? '\u2713' : 'Copy'}
    </button>
  );
}

// ── SVG Logos ────────────────────────────────────────────────────────────
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
      <path d="M12 2C8 2 6 6 6 10c0 2 .5 3.5 1.5 5C9 17 10 20 12 22c2-2 3-5 4.5-7 1-1.5 1.5-3 1.5-5 0-4-2-8-6-8zm0 3c1.5 0 3 2 3 5s-1 4-3 5c-2-1-3-2-3-5s1.5-5 3-5z" fill="var(--accent)"/>
    </svg>
  );
}

// ── Aggregation ──────────────────────────────────────────────────────────
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

function osLabel(os: string): string {
  if (os === 'win32') return 'Windows';
  if (os === 'darwin') return 'macOS';
  if (os === 'linux') return 'Linux';
  return os || 'unknown';
}

// ── Devices Tab ─────────────────────────────────────────────────────────
function DevicesTab({ profile }: { profile: Profile }) {
  const devices = profile.devices || [];
  if (devices.length === 0) {
    return (
      <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
        No devices synced yet. Run{' '}
        <code style={{
          fontFamily: 'var(--mono)', color: 'var(--accent)',
          background: 'var(--bg)', padding: '2px 6px',
          borderRadius: 'var(--r-sm)',
        }}>
          mooter-doctor --sync
        </code>{' '}
        to register this device.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {devices.map(d => (
        <div
          key={d.device_id}
          style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: 14,
            background: 'var(--surface-2)',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border)',
          }}
        >
          <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{osIcon(d.os_type)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text)' }}>
              {d.device_name || 'Unknown device'}
            </div>
            <div style={{
              color: 'var(--muted)', fontSize: '0.78rem',
              fontFamily: 'var(--mono)', marginTop: 2,
            }}>
              {osLabel(d.os_type)} · {d.hw_tier?.replace(/_/g, ' ')}
              {d.frugal_version && (
                <> · <VersionBadge version={d.frugal_version} lastSync={d.last_sync_at} /></>
              )}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '0.85rem', color: 'var(--text)' }}>
              {(d.decisions_count || 0).toLocaleString()} prompts ·{' '}
              <span style={{ color: 'var(--tier-0)', fontFamily: 'var(--mono)' }}>
                ${Number(d.savings_usd || 0).toFixed(2)}
              </span>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: '0.72rem', marginTop: 2 }}>
              {d.last_sync_at ? timeAgo(d.last_sync_at) : 'never'}
            </div>
          </div>
        </div>
      ))}
      {/* Wave 10 B.2b F-6 — actionable reconnect path for stale telemetry
          (was a dead-end). Manual sync from the user's own machine. */}
      <div style={{
        marginTop: 4, padding: 14,
        background: 'var(--bg)', borderRadius: 'var(--r-md)',
        border: '1px dashed var(--border)',
        fontSize: '0.8rem', color: 'var(--muted)', lineHeight: 1.6,
      }}>
        Numbers look stale? Preview your latest local data:{' '}
        <code style={{
          fontFamily: 'var(--mono)', color: 'var(--accent)',
          background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 'var(--r-sm)',
        }}>
          mooter sync --dry-run
        </code>
        <span style={{ display: 'block', marginTop: 6, fontSize: '0.72rem' }}>
          Stuck? Run{' '}
          <code style={{ fontFamily: 'var(--mono)' }}>mooter doctor</code> to debug your install.
        </span>
      </div>
    </div>
  );
}

// ── Terminal mockup ─────────────────────────────────────────────────────
function TerminalBlock({ lines }: { lines: string[] }) {
  return (
    <div style={{
      background: '#0D0B08',
      border: '1px solid var(--border)',
      borderRadius: 'var(--r-md)',
      padding: '12px 16px',
      fontFamily: 'var(--mono)',
      fontSize: '0.78rem',
      lineHeight: 1.7,
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--tier-3)', display: 'inline-block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--yellow)', display: 'inline-block' }} />
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--tier-0)', display: 'inline-block' }} />
      </div>
      {lines.map((line, i) => (
        <div key={i} style={{
          color: line.startsWith('\u2713')
            ? 'var(--tier-0)'
            : line.startsWith('\u276F')
              ? 'var(--accent)'
              : '#F2ECDF',
        }}>
          {line}
        </div>
      ))}
    </div>
  );
}

// ── Setup Guide tab ─────────────────────────────────────────────────────
function SetupGuideTab({ profile }: { profile: Profile }) {
  const latestDevice = (profile.devices || [])[0];
  const config = (profile.frugal_config || {}) as Record<string, unknown>;
  const legacyCfg = cfgVal(config);
  const hasOllama = latestDevice ? latestDevice.has_ollama : legacyCfg.hasOllama;
  const { decisionsCount } = aggregateDevices(profile);

  // Wave 10 B.2b F-4 — Setup tab was 3 checklist items; surface the real
  // detected setup so this prime tab earns its space. All honest, no fabrication.
  const hasAnthropicKey = latestDevice ? latestDevice.has_anthropic_key : legacyCfg.hasAnthropicKey;
  const hasOpenAI = profile.subscriptions?.some(s =>
    s.toLowerCase().includes('gpt') || s.toLowerCase().includes('openai')) || config.has_openai_key === true;
  const hasGemini = profile.subscriptions?.some(s =>
    s.toLowerCase().includes('gemini') || s.toLowerCase().includes('google')) || config.has_gemini_key === true;
  const aiStack = [
    { name: 'Anthropic', on: hasAnthropicKey },
    { name: 'Ollama', on: hasOllama },
    { name: 'OpenAI', on: hasOpenAI },
    { name: 'Gemini', on: hasGemini },
  ];
  const gpuLabel = formatGpuLabel(latestDevice?.gpu_name ?? null);
  const setupRows: { label: string; value: string }[] = [
    { label: 'Hardware', value: [gpuLabel, latestDevice?.os_type ? osLabel(latestDevice.os_type) : null, profile.hardware_tier?.replace(/_/g, ' ')].filter(Boolean).join(' · ') || 'Not detected yet' },
    { label: 'Persona', value: personaOption(profile.persona).title },
    { label: 'Recommended packs', value: personaPackHint(profile.persona) },
    { label: 'Adapter', value: '◌ baseline (none active) — install one with `mooter forge`' },
  ];

  const steps = [
    {
      label: 'Install mooter',
      done: profile.install_completed || decisionsCount > 0,
      terminal: [
        '\u276F bash <(curl -fsSL https://mooter.ai/install.sh)',
        '  Downloading mooter...',
        '  \u2713 Installed to ~/.claude/tools/router/',
        '  \u2713 Hook configured',
      ],
    },
    {
      label: 'First sync',
      done: decisionsCount > 0,
      terminal: [
        '\u276F mooter-doctor --sync',
        '  mooter doctor \u2014 health check',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {steps.map((step, i) => (
        <div key={i}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <span style={{
              width: 28, height: 28, borderRadius: '50%',
              background: step.done ? 'var(--accent)' : 'var(--surface-2)',
              color: step.done ? 'var(--bg)' : 'var(--muted)',
              display: 'grid', placeItems: 'center',
              fontSize: '0.8rem', fontWeight: 700,
              fontFamily: 'var(--font)',
              flexShrink: 0,
            }}>
              {step.done ? '\u2713' : i + 1}
            </span>
            <span style={{
              fontSize: '0.95rem', fontWeight: 500,
              color: step.done ? 'var(--text)' : 'var(--muted)',
            }}>
              {step.label}
            </span>
            {step.done && <span className="status-pill ok">Done</span>}
          </div>
          {!step.done && <TerminalBlock lines={step.terminal} />}
        </div>
      ))}

      {/* Wave 10 B.2b F-4 — "Your setup" detail (hardware · AI stack · packs · adapter). */}
      <div style={card}>
        <h2 style={sectionHeading}>Your setup</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {aiStack.map(p => (
            <span key={p.name} className={`status-pill ${p.on ? 'ok' : 'err'}`}>
              {p.on ? '✓' : '✗'} {p.name}
            </span>
          ))}
        </div>
        {setupRows.map(r => (
          <div key={r.label} style={{
            display: 'flex', justifyContent: 'space-between', gap: 16,
            padding: '9px 0', borderTop: '1px solid var(--border)',
            fontSize: '0.82rem',
          }}>
            <span style={{ color: 'var(--muted)', flexShrink: 0 }}>{r.label}</span>
            <span style={{ color: 'var(--text)', textAlign: 'right', fontFamily: 'var(--mono)' }}>{r.value}</span>
          </div>
        ))}
        {!profile.onboarding_completed && (
          <a href="/onboarding" style={{
            display: 'inline-block', marginTop: 14, fontSize: '0.82rem',
            color: 'var(--accent)',
          }}>
            Complete onboarding →
          </a>
        )}
      </div>
    </div>
  );
}

// ── Savings Calculator ───────────────────────────────────────────────────
function SavingsCalculatorCard() {
  const [promptsPerDay, setPromptsPerDay] = useState(50);
  const [avgTokens, setAvgTokens] = useState(2000);

  const opusPricePerToken = 0.000015;
  const withoutFrugal = promptsPerDay * avgTokens * opusPricePerToken;
  const savingsRate = 0.7;
  const withFrugal = withoutFrugal * (1 - savingsRate);
  const monthlySaving = (withoutFrugal - withFrugal) * 30;

  const sliderStyle: React.CSSProperties = {
    width: '100%',
    accentColor: 'var(--accent)',
    background: 'transparent',
    cursor: 'pointer',
  };

  return (
    <div style={card}>
      <h2 style={sectionHeading}>Savings calculator</h2>
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{
            fontSize: '0.72rem', color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
          }}>
            Prompts/day
          </span>
          <span style={{
            fontSize: '0.9rem', fontWeight: 700,
            fontFamily: 'var(--mono)', color: 'var(--text)',
          }}>
            {promptsPerDay}
          </span>
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
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{
            fontSize: '0.72rem', color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600,
          }}>
            Avg tokens
          </span>
          <span style={{
            fontSize: '0.9rem', fontWeight: 700,
            fontFamily: 'var(--mono)', color: 'var(--text)',
          }}>
            {avgTokens}
          </span>
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
      <div style={{
        background: 'var(--surface)',
        borderRadius: 'var(--r-sm)',
        padding: 14,
        border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>Without mooter</span>
          <span style={{ fontSize: '0.9rem', fontFamily: 'var(--mono)', color: 'var(--text)' }}>
            ~${withoutFrugal.toFixed(2)}/day
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>With mooter</span>
          <span style={{ fontSize: '0.9rem', color: 'var(--tier-0)', fontFamily: 'var(--mono)' }}>
            ~${withFrugal.toFixed(2)}/day
          </span>
        </div>
        <div style={{
          borderTop: '1px solid var(--border)', paddingTop: 8,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
            Monthly saving
          </span>
          <span style={{
            fontWeight: 800, fontSize: '1.15rem',
            color: 'var(--tier-0)', fontFamily: 'var(--mono)',
          }}>
            ~${monthlySaving.toFixed(0)}/mo
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Recommended Mode ─────────────────────────────────────────────────────
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
      reason: 'Claude Max detected — Opus unlimited. Router uses local T0 when available, T3 Opus for the rest.',
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
      reason: 'API-paid with no local GPU. Every token costs. Zen keeps everything in T0/T1 to save as much as possible.',
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
      ? 'GPU/Ollama detected — local T0 free for simple tasks, T3 only when it matters.'
      : 'Standard setup — the Router decides per prompt. Add Ollama to save more.',
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
      <div style={card}>
        <h2 style={sectionHeading}>Recommended for you</h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Run <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>mooter-doctor --sync</code> to populate
        </p>
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
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h2 style={{ ...sectionHeading, margin: 0 }}>Recommended for you</h2>
        <button
          onClick={() => setShowApply(v => !v)}
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-sm)',
            padding: '4px 14px',
            color: 'var(--accent)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
            fontFamily: 'var(--font)',
          }}
        >
          Apply
        </button>
      </div>
      {showApply && (
        <div style={{
          color: 'var(--muted)', fontSize: '0.85rem',
          marginBottom: 12, padding: '8px 12px',
          border: '1px solid var(--border)', borderRadius: 'var(--r-sm)',
          background: 'var(--surface)',
        }}>
          Run in terminal:{' '}
          <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
            node ~/.claude/tools/router/mooter-mode.js {rec.mode}
          </code>
        </div>
      )}
      <p style={{ fontSize: '1.1rem', margin: '0 0 8px', color: 'var(--text)', fontWeight: 600 }}>
        {rec.emoji} {rec.title}
      </p>
      <p style={{ color: 'var(--muted)', marginBottom: 14, fontSize: '0.9rem', lineHeight: 1.6 }}>
        {rec.reason}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <span style={{
            fontSize: '0.7rem', color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
            display: 'block', marginBottom: 4,
          }}>
            T0 Ollama (free)
          </span>
          <span style={{ color: rec.t0_available ? 'var(--tier-0)' : 'var(--tier-3)', fontSize: '0.85rem' }}>
            {rec.t0_available ? '\u2713 available' : '\u2717 not available'}
          </span>
        </div>
        <div>
          <span style={{
            fontSize: '0.7rem', color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
            display: 'block', marginBottom: 4,
          }}>
            T3 Opus
          </span>
          <span style={{
            color: rec.t3_unlimited ? 'var(--tier-0)' : 'var(--text)',
            fontSize: '0.85rem',
          }}>
            {rec.t3_unlimited ? '\u2713 unlimited (Max)' : 'metered'}
          </span>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <span style={{
            fontSize: '0.7rem', color: 'var(--muted)',
            textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600,
            display: 'block', marginBottom: 4,
          }}>
            Est. savings
          </span>
          <span style={{ color: 'var(--text)', fontSize: '0.85rem', fontFamily: 'var(--mono)' }}>
            {rec.est_savings_day}
          </span>
        </div>
      </div>

      {/* Mode comparison table */}
      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr>
              {['Mode', 'Strategy', 'Cost', 'Savings'].map(h => (
                <th
                  key={h}
                  style={{
                    textAlign: 'left', padding: '6px 10px',
                    borderBottom: '1px solid var(--border)',
                    color: 'var(--muted)',
                    fontWeight: 600,
                    fontSize: '0.72rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modeCompare.map(m => (
              <tr
                key={m.mode}
                style={{ background: m.mode === rec.mode ? 'rgba(232,136,138,0.06)' : 'transparent' }}
              >
                <td style={{ padding: '6px 10px', fontWeight: m.mode === rec.mode ? 700 : 400, color: 'var(--text)' }}>
                  {m.mode === rec.mode ? '\u2192 ' : ''}{m.label}
                </td>
                <td style={{ padding: '6px 10px', color: 'var(--muted)' }}>{m.desc}</td>
                <td style={{ padding: '6px 10px', color: 'var(--muted)' }}>{m.cost}</td>
                <td style={{ padding: '6px 10px', color: 'var(--muted)' }}>{m.savings}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{
        marginTop: 14,
        padding: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        fontSize: '0.85rem',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 6,
        }}>
          <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
            Router Context for your CLAUDE.md
          </span>
          <CopyBtn id="rec-config" text={rec.config_block} copied={copied} onCopy={copy} />
        </div>
        <pre style={{
          margin: 0,
          whiteSpace: 'pre-wrap',
          fontSize: '0.82rem',
          fontFamily: 'var(--mono)',
          color: '#F2ECDF',
          background: '#0D0B08',
          border: '1px solid #2A2218',
          borderRadius: 'var(--r-sm)',
          padding: 14,
        }}>
          {rec.config_block}
        </pre>
      </div>
    </div>
  );
}

// ── Project Context Card ─────────────────────────────────────────────────
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

  const chipStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--accent)' : 'var(--surface)',
    color: active ? 'var(--bg)' : 'var(--text)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'var(--r-full)',
    padding: '5px 14px',
    cursor: 'pointer',
    fontSize: '0.82rem',
    marginRight: 6,
    marginBottom: 6,
    fontWeight: active ? 600 : 400,
    fontFamily: 'var(--font)',
    transition: 'background 0.15s ease, border-color 0.15s ease',
  });

  const fieldLabel: React.CSSProperties = {
    display: 'block',
    marginBottom: 8,
    fontSize: '0.7rem',
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    fontWeight: 600,
  };

  return (
    <div style={card}>
      <h2 style={sectionHeading}>Project context</h2>
      <p style={{ color: 'var(--muted)', marginBottom: 14, fontSize: '0.85rem' }}>
        Configure the router for a specific project.
      </p>

      <div style={{ marginBottom: 14 }}>
        <span style={fieldLabel}>Project type</span>
        {(['frontend', 'backend', 'fullstack', 'cli'] as ProjectType[]).map(t => (
          <button key={t} style={chipStyle(projectType === t)} onClick={() => setProjectType(projectType === t ? '' : t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={fieldLabel}>Primary language</span>
        {(['typescript', 'python', 'go', 'rust', 'other'] as Language[]).map(l => (
          <button key={l} style={chipStyle(language === l)} onClick={() => setLanguage(language === l ? '' : l)}>
            {l.charAt(0).toUpperCase() + l.slice(1)}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 14 }}>
        <span style={fieldLabel}>Sensitive context?</span>
        <button style={chipStyle(sensitive.includes('migrations'))} onClick={() => toggleSensitive('migrations')}>
          Has migrations/prod
        </button>
        <button style={chipStyle(sensitive.includes('secrets'))} onClick={() => toggleSensitive('secrets')}>
          Has secrets/CI
        </button>
        <button style={chipStyle(sensitive.includes('experiments'))} onClick={() => toggleSensitive('experiments')}>
          Experiments only
        </button>
      </div>

      <div style={{
        padding: 12,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-sm)',
        fontSize: '0.85rem',
      }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', marginBottom: 6,
        }}>
          <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>
            Generated ## Router Context
          </span>
          <CopyBtn id="project-ctx" text={context} copied={copied} onCopy={copy} />
        </div>
        <pre style={{
          margin: 0, whiteSpace: 'pre-wrap',
          fontSize: '0.82rem', fontFamily: 'var(--mono)',
          color: '#F2ECDF',
          background: '#0D0B08',
          border: '1px solid #2A2218',
          borderRadius: 'var(--r-sm)',
          padding: 14,
        }}>
          {context}
        </pre>
      </div>
    </div>
  );
}

// ── Recommendations Card ─────────────────────────────────────────────────
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
  // Wave 14 Day 2 F-6 — the real source of truth for installed models is the
  // sync payload (device.ollama_models), not the legacy ollama_has_* booleans.
  const installed = installedOllamaModels(profile);
  const recs: Recommendation[] = [];

  if (!hasOllama) {
    recs.push({
      id: 'install-ollama',
      title: 'Install Ollama for free T0',
      reason: 'Without Ollama, every simple task goes to paid Haiku/Sonnet.',
      action: 'https://ollama.com/download',
      actionType: 'link',
      priority: 'high',
    });
  }

  if (hasOllama && !cfg.ollama_has_qwen3b && !isModelInstalled(installed, 'qwen2.5:3b')) {
    recs.push({
      id: 'pull-qwen3b',
      title: 'Install qwen2.5:3b for fast T0',
      reason: 'Recommended model for T0 tasks (renames, commits, formatting).',
      action: 'ollama pull qwen2.5:3b',
      actionType: 'copy',
      priority: 'high',
    });
  }

  const hasGpu = profile.hardware_tier &&
    !['cpu_only', 'cloud', 'other', 'unknown', ''].includes(profile.hardware_tier);
  if (hasOllama && hasGpu && !cfg.ollama_has_qwen30b && !isModelInstalled(installed, 'qwen3:30b')) {
    recs.push({
      id: 'pull-qwen30b',
      title: 'Install qwen3:30b for T0-smart',
      reason: 'Your GPU can handle it. qwen3:30b runs root-cause analysis locally — free.',
      action: 'ollama pull qwen3:30b',
      actionType: 'copy',
      priority: 'medium',
    });
  }

  if (decisionsCount > 200) {
    recs.push({
      id: 'run-backtest',
      title: 'Optimise your Router with a backtest',
      reason: `You have ${decisionsCount} decisions. The backtest will tune the classifier to your usage pattern.`,
      action: 'node ~/.claude/tools/router/backtest.js && node ~/.claude/tools/router/update-router.js',
      actionType: 'copy',
      priority: 'medium',
    });
  }

  if (!hasAnthropicKey && isInstalled(profile)) {
    recs.push({
      id: 'add-anthropic-key',
      title: 'Add ANTHROPIC_API_KEY',
      reason: 'Without the key, T1 (Haiku) is unavailable. The Router jumps from T0 straight to T2.',
      action: 'export ANTHROPIC_API_KEY=sk-ant-... # add to ~/.zshrc or ~/.bashrc',
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

  // Wave 10 B.2b.2 F-9 \u2014 state-aware: instead of silently vanishing once a
  // recommendation is satisfied, confirm what's already in place.
  if (recs.length === 0) {
    const cfg = (profile.frugal_config || {}) as Record<string, unknown>;
    // Wave 14 Day 2 F-6 — surface what's actually installed (real sync payload
    // first, legacy config flags as fallback) so the card confirms the setup
    // instead of silently vanishing.
    const installed = installedOllamaModels(profile);
    const applied = [...new Set([
      ((cfg.has_ollama === true || cfgVal(cfg).hasOllama) || installed.length > 0) && 'Ollama',
      ...installed,
      cfg.ollama_has_qwen3b === true && 'qwen2.5:3b',
      cfg.ollama_has_qwen30b === true && 'qwen3:30b',
    ].filter(Boolean) as string[])];
    if (applied.length === 0) return null;
    return (
      <div style={card}>
        <h2 style={sectionHeading}>Recommendations</h2>
        <p style={{ margin: '0 0 6px', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>
          \u2713 Your setup is optimised
        </p>
        <p style={{ color: 'var(--muted)', margin: '0 0 8px', fontSize: '0.85rem', lineHeight: 1.6 }}>
          Installed: {applied.join(' \u00B7 ')}. Verify anytime with{' '}
          <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>ollama ls</code>.
        </p>
      </div>
    );
  }

  const priorityDot = (p: string) => p === 'high' ? '\uD83D\uDD34' : p === 'medium' ? '\uD83D\uDFE1' : '\uD83D\uDFE2';

  return (
    <div style={card}>
      <h2 style={sectionHeading}>Recommendations</h2>
      {recs.map((r, i) => (
        <div
          key={r.id}
          style={{
            marginBottom: i < recs.length - 1 ? 14 : 0,
            paddingBottom: i < recs.length - 1 ? 14 : 0,
            borderBottom: i < recs.length - 1 ? '1px solid var(--border)' : 'none',
          }}
        >
          <p style={{
            margin: '0 0 4px', fontWeight: 600,
            fontSize: '0.9rem', color: 'var(--text)',
          }}>
            {priorityDot(r.priority)} {r.title}
          </p>
          <p style={{ color: 'var(--muted)', margin: '0 0 6px', fontSize: '0.85rem', lineHeight: 1.6 }}>
            {r.reason}
          </p>
          {r.actionType === 'link' ? (
            <a
              href={r.action}
              target="_blank"
              rel="noopener"
              style={{
                color: 'var(--accent)', fontSize: '0.82rem',
                textDecoration: 'underline',
              }}
            >
              {r.action}
            </a>
          ) : (
            <div style={{
              display: 'flex', alignItems: 'center',
              fontSize: '0.82rem', gap: 6,
            }}>
              <code style={{
                flex: 1, minWidth: 0,
                fontFamily: 'var(--mono)', color: 'var(--accent)',
                background: 'var(--bg)', padding: '6px 8px',
                borderRadius: 'var(--r-sm)',
                overflow: 'auto',
                border: '1px solid var(--border)',
              }}>
                {r.action}
              </code>
              <CopyBtn id={r.id} text={r.action} copied={copied} onCopy={copy} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Overview Tab ─────────────────────────────────────────────────────────
// Wave 14 Day 1 F-2 — the reported version + device stats are only as fresh as
// the last synced heartbeat. When that sync is older than the threshold we nudge
// the user to re-sync rather than treating stale telemetry (e.g. a long-gone
// v0.9) as current. Display only — we never mutate the telemetry payload.
const STALE_SYNC_DAYS = 7;
function daysSinceSync(iso: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.floor((nowMs - ms) / 86_400_000);
}

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
  const hasGemini = profile.subscriptions?.some(s =>
    s.toLowerCase().includes('gemini') || s.toLowerCase().includes('google')) || config.has_gemini_key === true;

  const healthItems = [
    { label: 'Router', ok: decisionsCount > 0 },
    { label: 'Hook', ok: profile.install_completed || decisionsCount > 0 },
    { label: 'Tracker', ok: savingsUsd > 0 },
    { label: 'Sync', ok: !!(profile.devices && profile.devices.length > 0) },
  ];

  const syncDays = daysSinceSync(latestDevice?.last_sync_at);
  const syncStale = syncDays != null && syncDays > STALE_SYNC_DAYS;
  const neverSynced = !(profile.devices && profile.devices.length > 0);
  const [copied, copy] = useCopyButton();

  return (
    <>
      {/* Wave 24 24.B — never-synced empty state. Friends installing for the
          first time see no numbers; tell them exactly how to populate them
          instead of an ambiguous $0.00. */}
      {neverSynced && (
        <div style={{
          marginBottom: 20, padding: '20px 24px',
          background: 'linear-gradient(135deg, rgba(232,136,138,0.10) 0%, rgba(232,136,138,0.03) 100%)',
          border: '1px solid rgba(232,136,138,0.3)', borderRadius: 'var(--r-lg)',
        }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            Run your first sync to see your numbers
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
            mooter tracks your routing locally. Run the command below in your terminal to push your first snapshot to this dashboard.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 'var(--r-sm)', fontSize: '0.82rem' }}>
              mooter sync
            </code>
            <CopyBtn id="empty-sync" text="mooter sync" copied={copied} onCopy={copy} />
          </div>
        </div>
      )}
      {/* Wave 24 24.B — prominent stale-data banner. The previous nudge was a
          thin line users skipped; friends concluded the product was abandoned.
          Now: bold warning + one-click copy + path to update. Display only —
          we never mutate the telemetry payload. */}
      {syncStale && (
        <div style={{
          marginBottom: 20, padding: '16px 20px',
          background: 'rgba(212,192,144,0.12)', border: '1px solid var(--yellow)',
          borderRadius: 'var(--r-lg)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: '1.1rem' }} aria-hidden>⚠</span>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text)' }}>
              This dashboard shows data from {syncDays} days ago
            </span>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
            The numbers below are your last synced snapshot, not live. Run <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>mooter sync</code> in your terminal to refresh them.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
            <code style={{ fontFamily: 'var(--mono)', color: 'var(--accent)', background: 'var(--surface-2)', padding: '6px 10px', borderRadius: 'var(--r-sm)', fontSize: '0.82rem' }}>
              mooter sync
            </code>
            <CopyBtn id="stale-sync" text="mooter sync" copied={copied} onCopy={copy} />
            <a href="/install" style={{ marginLeft: 8, fontSize: '0.8rem', color: 'var(--accent)', textDecoration: 'none' }}>
              Update mooter →
            </a>
          </div>
        </div>
      )}
      {/* Wave 4 Phase C — CLI connection status (real device data) */}
      <CliStatusCard profile={profile} />
      {/* Savings Hero */}
      {decisionsCount > 0 && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(232,136,138,0.08) 0%, rgba(232,136,138,0.02) 60%)',
          border: '1px solid rgba(232,136,138,0.2)',
          borderRadius: 'var(--r-lg)',
          padding: '28px 32px',
          marginBottom: 20,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 32,
          alignItems: 'center',
          animation: 'fadeIn 0.5s ease both',
        }}>
          {/* Wave 14 Day 2 F-4 — these are the user's own synced numbers, but a
              52-day-old heartbeat is not "Live". The badge now reflects sync age:
              Live (≤7d) / Outdated (>7d) / Demo (no sync) — stats stay visible. */}
          <div style={{ width: '100%', marginBottom: -8 }}>
            {(() => {
              const heroSource = heroDataSource(latestDevice?.last_sync_at, decisionsCount > 0);
              const deviceCount = (profile.devices || []).length || 1;
              const detail =
                heroSource === 'demo'
                  ? 'run `mooter init`'
                  : heroSource === 'outdated'
                  ? `last sync ${syncDays}d ago · \`mooter sync --dry-run\` to preview`
                  : `${deviceCount} device${deviceCount === 1 ? '' : 's'}${latestDevice?.last_sync_at ? ` · last sync ${timeAgo(latestDevice.last_sync_at)}` : ''}`;
              return <DataSourceBadge source={heroSource} detail={detail} />;
            })()}
          </div>
          <div style={syncStale ? { opacity: 0.5 } : undefined}>
            <div style={{
              fontSize: '2.5rem', fontWeight: 800,
              color: 'var(--tier-0)', lineHeight: 1,
              fontFamily: 'var(--mono)', letterSpacing: '-0.02em',
            }}>
              {/* Wave 60 — animate the real synced value in (count-up); the final
                  rendered number is exactly savingsUsd.toFixed(2), unchanged. */}
              <AnimatedCounter value={savingsUsd} prefix="$" decimals={2} />
            </div>
            <div style={{
              fontSize: '0.72rem', color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginTop: 6, fontWeight: 600,
            }}>
              Saved
            </div>
          </div>
          <div style={syncStale ? { opacity: 0.5 } : undefined}>
            <div style={{
              fontSize: '2.5rem', fontWeight: 800,
              color: 'var(--text)', lineHeight: 1,
              fontFamily: 'var(--mono)', letterSpacing: '-0.02em',
            }}>
              <AnimatedCounter value={decisionsCount} decimals={0} />
            </div>
            <div style={{
              fontSize: '0.72rem', color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginTop: 6, fontWeight: 600,
            }}>
              Decisions
            </div>
          </div>
          <div style={syncStale ? { opacity: 0.5 } : undefined}>
            <div style={{
              fontSize: '2.5rem', fontWeight: 800,
              color: 'var(--text)', lineHeight: 1,
              fontFamily: 'var(--mono)', letterSpacing: '-0.02em',
            }}>
              <AnimatedCounter value={savingsPct} decimals={0} suffix="%" />
            </div>
            <div style={{
              fontSize: '0.72rem', color: 'var(--muted)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              marginTop: 6, fontWeight: 600,
            }}>
              % saved vs all-Opus
            </div>
          </div>

          {latestDevice && (
            <div style={{
              fontSize: '0.72rem',
              color: 'var(--muted)',
              fontFamily: 'var(--mono)',
              marginTop: 4,
              paddingTop: 16,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              width: '100%',
            }}>
              {latestDevice.gpu_name && <span>{formatGpuLabel(latestDevice.gpu_name)}</span>}
              {latestDevice.os_type && <span>{osLabel(latestDevice.os_type)}</span>}
              {latestDevice.hw_tier && <span>{latestDevice.hw_tier}</span>}
              {latestDevice.frugal_version && (
                <span>mooter <VersionBadge version={latestDevice.frugal_version} lastSync={latestDevice.last_sync_at} /></span>
              )}
            </div>
          )}

          {/* Wave 60 — local models actually reported by your sync payload (real,
              deduped via installedOllamaModels; never fabricated pack names). */}
          {(() => {
            const models = installedOllamaModels(profile);
            if (models.length === 0) return null;
            return (
              <div style={{ width: '100%', paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div style={{
                  fontSize: '0.66rem', color: 'var(--muted)', textTransform: 'uppercase',
                  letterSpacing: '0.08em', fontWeight: 600, marginBottom: 8,
                }}>
                  Local models · {models.length}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {models.map(m => (
                    <span key={m} style={{
                      fontFamily: 'var(--mono)', fontSize: '0.72rem', color: 'var(--accent)',
                      background: 'rgba(232,136,138,0.08)', border: '1px solid rgba(232,136,138,0.25)',
                      borderRadius: 'var(--r-sm)', padding: '4px 10px',
                    }}>
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* D7 — Savings depth. D7-2 (all-Opus) is REAL; D7-1/D7-3 are honest
          placeholders until the per-category telemetry pipeline ships (no fabricated data). */}
      <div style={card}>
        <h2 style={sectionHeading}>Savings depth</h2>
        {decisionsCount > 0 ? (
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'baseline', marginBottom: 16 }}>
            {[
              { v: `$${savingsUsd.toFixed(2)}`, l: 'you saved', c: 'var(--tier-0)' },
              { v: `$${allOpusCost.toFixed(2)}`, l: 'all-Opus would cost', c: 'var(--text)' },
              { v: `$${Math.max(0, allOpusCost - savingsUsd).toFixed(2)}`, l: 'you actually paid (est.)', c: 'var(--text)' },
              { v: `${savingsPct}%`, l: 'saved vs all-Opus', c: 'var(--tier-0)' },
            ].map((m) => (
              <div key={m.l}>
                <div style={{ fontSize: '1.6rem', fontWeight: 700, fontFamily: 'var(--mono)', color: m.c, lineHeight: 1 }}>{m.v}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{m.l}</div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: 16 }}>Run a few prompts to see your all-Opus comparison.</p>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div style={{ padding: 14, border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', background: 'var(--bg)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>Per-task-type savings</div>
            <p style={{ color: 'var(--muted)', fontSize: '0.78rem', lineHeight: 1.6, margin: 0 }}>
              Breakdown by renames · commits · debug · refactor is computed locally by your CLI. Run <code style={{ fontFamily: 'var(--mono)' }}>mooter trail</code> to inspect — no fabricated numbers here.
            </p>
          </div>
          <div style={{ padding: 14, border: '1px dashed var(--border)', borderRadius: 'var(--r-md)', background: 'var(--bg)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>Misroute report</div>
            <p style={{ color: 'var(--muted)', fontSize: '0.78rem', lineHeight: 1.6, margin: 0 }}>
              Prompts where a higher tier would have helped — inspect them locally with <code style={{ fontFamily: 'var(--mono)' }}>mooter trail</code>.
            </p>
          </div>
        </div>
      </div>

      {/* AI Stack — 3 columns */}
      <div style={card}>
        <h2 style={sectionHeading}>AI stack</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          <div style={stackTile}>
            <AnthropicLogo />
            <div style={stackTileName}>Anthropic</div>
            <span className={`status-pill ${hasAnthropicKey || hasMax ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>
              {hasAnthropicKey || hasMax ? '\u2713 Active' : '\u2717 Inactive'}
            </span>
          </div>
          <div style={stackTile}>
            <OllamaLogo />
            <div style={stackTileName}>Ollama</div>
            <span className={`status-pill ${hasOllama ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>
              {hasOllama ? '\u2713 Active' : '\u2717 Inactive'}
            </span>
          </div>
          <div style={stackTile}>
            <OpenAILogo />
            <div style={stackTileName}>OpenAI</div>
            <span className={`status-pill ${hasOpenAI ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>
              {hasOpenAI ? '\u2713 Active' : '\u2717 Inactive'}
            </span>
          </div>
          <div style={stackTile}>
            <GeminiLogo />
            <div style={stackTileName}>Google Gemini</div>
            <span className={`status-pill ${hasGemini ? 'ok' : 'err'}`} style={{ marginTop: 8 }}>
              {hasGemini ? '\u2713 Active' : '\u2717 Inactive'}
            </span>
          </div>
        </div>
      </div>

      {/* Health bar */}
      <div style={card}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
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
      {/* Wave 4 Phase C — activity note + settings link (no duplication of /settings) */}
      <ActivityNote />
      <CliSettingsLink />
    </>
  );
}

const stackTile: React.CSSProperties = {
  padding: 16,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--r-sm)',
  textAlign: 'center',
};

const stackTileName: React.CSSProperties = {
  fontSize: '0.85rem',
  marginTop: 8,
  fontWeight: 500,
  color: 'var(--text)',
};

// ── Metrics Tab ──────────────────────────────────────────────────────────
function MetricsTab({ profile }: { profile: Profile }) {
  const { decisionsCount, savingsUsd } = aggregateDevices(profile);

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{
          fontSize: '1.25rem', margin: '0 0 8px',
          fontWeight: 700, color: 'var(--text)',
          fontFamily: 'var(--font)', letterSpacing: '-0.01em',
        }}>
          How mooter measures savings
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          mooter tracks routing decisions, not tokens. Here&apos;s what each number means and why
          they may differ from what you see in VSCode or the Claude interface.
        </p>
      </div>

      {/* Source comparison */}
      <div style={{ marginBottom: 28 }}>
        <h3 style={sectionHeading}>Where each number comes from</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            {
              source: 'mooter dashboard',
              badge: '~est',
              badgeColor: 'var(--yellow)',
              what: `${decisionsCount} decisions · $${savingsUsd.toFixed(2)} saved`,
              how: 'Counts user prompts routed. Savings = (what Opus would cost) − (what mooter paid). Uses estimated token counts from prompt length.',
              why: 'Honest estimate. Not real tokens — real token counts require API access mooter doesn\u2019t have.',
            },
            {
              source: 'VSCode Claude plugin',
              badge: 'real',
              badgeColor: 'var(--tier-0)',
              what: 'Real token count · real USD cost',
              how: 'Reads directly from Anthropic OAuth session. Counts every token sent and received, including system prompts and tool calls.',
              why: 'Ground truth for token usage. Higher than mooter\u2019s prompt count because it includes all context.',
            },
            {
              source: 'decisions.log (local)',
              badge: 'raw',
              badgeColor: 'var(--muted)',
              what: 'All classify() calls (includes hooks + system prompts)',
              how: 'Raw log of every classify() call. Includes UserPromptSubmit hooks, PostToolUse hooks, and system messages.',
              why: 'More lines than "decisions" because mooter filters system prompts out before counting.',
            },
            {
              source: 'statusline (terminal)',
              badge: '~est',
              badgeColor: 'var(--yellow)',
              what: 'Live savings % per session',
              how: 'Reads the same decisions.log. Shows per-session and cumulative savings with tier breakdown.',
              why: 'Same methodology as the dashboard — refreshes in real time as you work.',
            },
          ].map(row => (
            <div
              key={row.source}
              style={{
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-md)',
                padding: 16,
                display: 'grid',
                gridTemplateColumns: '160px 1fr',
                gap: '8px 16px',
                alignItems: 'start',
              }}
            >
              <div>
                <div style={{
                  fontSize: '0.82rem', fontWeight: 600,
                  color: 'var(--text)', marginBottom: 6,
                }}>
                  {row.source}
                </div>
                <span style={{
                  display: 'inline-block',
                  padding: '1px 8px',
                  borderRadius: 'var(--r-full)',
                  fontSize: '0.68rem',
                  fontFamily: 'var(--mono)',
                  background: `color-mix(in srgb, ${row.badgeColor} 13%, transparent)`,
                  color: row.badgeColor,
                  border: `1px solid color-mix(in srgb, ${row.badgeColor} 30%, transparent)`,
                  fontWeight: 600,
                }}>
                  {row.badge}
                </span>
              </div>
              <div>
                <div style={{
                  fontSize: '0.82rem', color: 'var(--accent)',
                  fontFamily: 'var(--mono)', marginBottom: 8,
                }}>
                  {row.what}
                </div>
                <div style={{
                  fontSize: '0.78rem', color: 'var(--muted)',
                  lineHeight: 1.6, marginBottom: 4,
                }}>
                  <strong style={{ color: 'var(--text)' }}>How: </strong>{row.how}
                </div>
                <div style={{
                  fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.6,
                }}>
                  <strong style={{ color: 'var(--text)' }}>Why different: </strong>{row.why}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Key insight callout */}
      <div style={{
        background: 'rgba(232,136,138,0.06)',
        border: '1px solid rgba(232,136,138,0.2)',
        borderRadius: 'var(--r-md)',
        padding: 16,
        marginBottom: 24,
      }}>
        <div style={{
          fontSize: '0.82rem', fontWeight: 700,
          color: 'var(--accent)', marginBottom: 8,
          textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          The number that matters
        </div>
        <p style={{
          fontSize: '0.85rem', color: 'var(--muted)',
          lineHeight: 1.7, margin: 0,
        }}>
          mooter&apos;s <strong style={{ color: 'var(--text)' }}>decisions count</strong> tells you how many times
          the router intervened. The <strong style={{ color: 'var(--text)' }}>savings estimate</strong> is a
          lower bound — real savings are higher because mooter also reduces latency and context window usage.
          The VSCode token count is the ground truth for what Anthropic actually processed.
        </p>
      </div>

      {/* Glossary */}
      <div>
        <h3 style={sectionHeading}>Glossary</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[
            { term: 'decision', def: 'One user prompt that went through classify.js and was routed to a tier.' },
            { term: 'naive cost', def: 'What that decision would have cost if routed to Opus every time.' },
            { term: 'real cost (est.)', def: 'Estimated actual cost based on the tier it was routed to × avg token estimate.' },
            { term: 'saved (est.)', def: 'naive cost − real cost (est.). This is the savings number shown in the dashboard.' },
            { term: 'guaranteed saved', def: 'Only Option A hits where Ollama answered directly instead of Opus. Conservative floor.' },
            { term: 'savings %', def: 'saved / naive × 100. 68% means mooter spent 32% of what pure-Opus would cost.' },
          ].map(({ term, def }) => (
            <div key={term} style={{ display: 'flex', gap: 14, fontSize: '0.82rem' }}>
              <code style={{
                color: 'var(--accent)', fontFamily: 'var(--mono)',
                minWidth: 150, flexShrink: 0, fontWeight: 500,
              }}>
                {term}
              </code>
              <span style={{ color: 'var(--muted)', lineHeight: 1.6 }}>{def}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Flowchart icons ──────────────────────────────────────────────────────
function PromptIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="4" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M5 8h8M5 11h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function ChipIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="4" y="4" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 1v3M11 1v3M7 14v3M11 14v3M1 7h3M1 11h3M14 7h3M14 11h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <rect x="6.5" y="6.5" width="5" height="5" rx="0.5" fill="currentColor" opacity="0.3"/>
    </svg>
  );
}

function LightningIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <path d="M10.5 1L3 10.5h6L7.5 17 15 7.5H9L10.5 1z"/>
    </svg>
  );
}

function ScanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 12l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M6 8h4M8 6v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  );
}

function DiamondIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 1L17 9L9 17L1 9L9 1Z" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

function AnimatedCounter({ value, prefix = '', suffix = '', decimals = 2, duration = 1500 }: {
  value: number; prefix?: string; suffix?: string; decimals?: number; duration?: number;
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
  return <span>{prefix}{display.toFixed(decimals)}{suffix}</span>;
}

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
      tabIndex={0}
      aria-label={`${label}: ${tooltip}`}
      style={{
        animationDelay: `${index * 0.1}s`,
        border: highlight ? '2px solid var(--accent)' : '1px solid var(--border)',
        background: highlight ? 'rgba(232,136,138,0.06)' : 'var(--surface-2)',
        borderRadius: 'var(--r-md)',
        padding: '16px 20px',
        position: 'relative',
        cursor: 'help',
        outline: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: children ? 10 : 0 }}>
        <span style={{ color: highlight ? 'var(--accent)' : 'var(--muted)', display: 'flex' }}>{icon}</span>
        <span style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text)' }}>{label}</span>
        {badge && (
          <span style={{
            fontSize: '0.7rem',
            padding: '2px 8px',
            borderRadius: 'var(--r-full)',
            background: highlight ? 'rgba(232,136,138,0.12)' : 'var(--faint)',
            color: highlight ? 'var(--accent)' : 'var(--muted)',
            fontFamily: 'var(--mono)',
          }}>
            {badge}
          </span>
        )}
      </div>
      {children}
      <div className="flow-tooltip">{tooltip}</div>
    </div>
  );
}

function FlowArrow() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
      <svg width="2" height="28" viewBox="0 0 2 28" style={{ overflow: 'visible' }}>
        <line x1="1" y1="0" x2="1" y2="28" className="flow-arrow" stroke="var(--border-light)" strokeWidth="2" />
      </svg>
    </div>
  );
}

function ModelCard({ label, badge, color, cost, tooltip }: {
  label: string; badge: string; color: string; cost: string; tooltip: string;
}) {
  return (
    <div
      className="flow-node"
      tabIndex={0}
      aria-label={`${label}: ${tooltip}`}
      style={{
        animationDelay: '0.5s',
        border: `1px solid ${color}44`,
        background: `${color}0f`,
        borderRadius: 'var(--r-md)',
        padding: '14px 16px',
        position: 'relative',
        flex: 1,
        minWidth: 140,
        cursor: 'help',
        outline: 'none',
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '0.9rem', color, marginBottom: 4 }}>{label}</div>
      <div style={{
        fontSize: '0.65rem', color: 'var(--muted)',
        fontFamily: 'var(--mono)', marginBottom: 8,
        textTransform: 'uppercase', letterSpacing: '0.06em',
      }}>
        {badge}
      </div>
      <div style={{
        fontSize: '1rem', fontWeight: 700,
        fontFamily: 'var(--mono)', color: 'var(--text)',
      }}>
        {cost}
      </div>
      <div className="flow-tooltip">{tooltip}</div>
    </div>
  );
}

// ── How it works Tab ─────────────────────────────────────────────────────
// Canonical routing-pattern count. Mirrors PATTERN_COUNT exported from
// tools/router/classify.js (HIGH 80 + MED 71 + LOW 16 + TRIVIAL 6). Vercel
// builds with rootDirectory=landing so the router file can't be imported here;
// the value is enforced against the source by tools/router/pattern-count.test.js.
const PATTERN_COUNT = 173;

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
  const gpuName = formatGpuLabel(latestDevice?.gpu_name ?? null) || 'GPU';
  const osType = latestDevice?.os_type || profile.os_type || 'unknown';

  const naiveCost = decisionsCount * 0.045;

  const tiers: { key: string; pct: number; color: string }[] = [
    { key: 'T0', pct: t0Pct, color: 'var(--tier-0)' },
    { key: 'T1', pct: t1Pct, color: 'var(--tier-1)' },
    { key: 'T2', pct: t2Pct, color: 'var(--tier-2)' },
    { key: 'T3', pct: t3Pct, color: 'var(--tier-3)' },
  ];

  const featurePills = [
    'has_code_block', 'has_file_refs', 'has_error_trace',
    'is_question', 'has_url', 'lang_detected', 'file_ref_count',
  ];

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{
          fontSize: '1.25rem', margin: '0 0 8px',
          fontWeight: 700, color: 'var(--text)',
          fontFamily: 'var(--font)', letterSpacing: '-0.01em',
        }}>
          How mooter works
        </h2>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          Every prompt you write is classified in under 50ms — before any model sees it.
          mooter reads {PATTERN_COUNT} signals, extracts 7 features, and routes to the cheapest model
          that can do the job. No guessing. No waste.
        </p>
      </div>

      {/* Flow */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <FlowNode index={0} icon={<PromptIcon />} label="Your prompt" tooltip="Every message you send in Claude Code passes through mooter's router before any model is chosen. Routing happens 100% locally — nothing is sent anywhere during classification. The model that runs afterwards may be local (Ollama) or cloud (Anthropic), depending on the tier.">
          <div style={{ color: 'var(--muted)', fontSize: '0.82rem' }}>The question you typed</div>
        </FlowNode>
        <FlowArrow />

        <FlowNode index={1} icon={<ChipIcon />} label="Pre-processing" badge="LOCAL · ~1ms" tooltip="mooter normalizes your prompt locally — strips noise, detects language (PT/EN), identifies code blocks, file references, error traces, and URLs. 100% local: pure regex, no AI, nothing sent anywhere for this step.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {['language detection', 'code block?', 'file refs', 'error trace?'].map(f => (
              <span key={f} style={{
                fontSize: '0.7rem', padding: '2px 8px',
                borderRadius: 'var(--r-full)', background: 'var(--faint)',
                color: 'var(--muted)', fontFamily: 'var(--mono)',
              }}>
                {f}
              </span>
            ))}
          </div>
        </FlowNode>
        <FlowArrow />

        <FlowNode index={2} icon={<LightningIcon />} label="classify.js" badge="< 50ms · zero LLM" highlight tooltip={`The router. Pure regex heuristics, no AI involved. Reads ${PATTERN_COUNT} patterns across HIGH_RISK, MED_RISK, LOW_RISK, and TRIVIAL signal buckets. Tuned from real usage history. Complexity threshold: 0.25.`}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {[`${PATTERN_COUNT} regex patterns`, '4 risk buckets', 'SHA-256 cache (30min TTL)'].map(f => (
              <span key={f} style={{
                fontSize: '0.7rem', padding: '2px 8px',
                borderRadius: 'var(--r-full)',
                background: 'rgba(232,136,138,0.12)',
                color: 'var(--accent)', fontFamily: 'var(--mono)',
              }}>
                {f}
              </span>
            ))}
          </div>
        </FlowNode>
        <FlowArrow />

        <FlowNode index={3} icon={<ScanIcon />} label="Signal extraction" badge="7 features" tooltip="Before routing, mooter extracts boolean/numeric features from the prompt: has_code_block, has_file_refs, has_error_trace, is_question, has_url, lang_detected, file_ref_count. These feed the complexity score and future auto-learning.">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {featurePills.map((f, i) => (
              <span
                key={f}
                className="flow-pill"
                style={{
                  animationDelay: `${0.3 + i * 0.07}s`,
                  fontSize: '0.7rem', padding: '2px 8px',
                  borderRadius: 'var(--r-full)', background: 'var(--faint)',
                  color: 'var(--muted)', fontFamily: 'var(--mono)',
                }}
              >
                {f}
              </span>
            ))}
          </div>
        </FlowNode>
        <FlowArrow />

        <FlowNode index={4} icon={<DiamondIcon />} label="Tier decision" tooltip="Based on signal weights, mooter assigns a tier. HIGH_RISK signals (prod, deploy, migrations, secrets) always force T3. TRIVIAL signals (rename, color change, single file) go T0. The complexity threshold (0.25) was tuned from your real history.">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
            {tiers.map(t => (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  fontSize: '0.78rem', fontFamily: 'var(--mono)',
                  width: 24, color: t.color, fontWeight: 700,
                }}>
                  {t.key}
                </span>
                <div style={{
                  flex: 1, height: 8, borderRadius: 'var(--r-full)',
                  background: 'var(--faint)', overflow: 'hidden',
                }}>
                  <div
                    className="tier-bar"
                    style={{
                      '--target-width': `${t.pct}%`,
                      height: '100%',
                      borderRadius: 'var(--r-full)',
                      background: t.color,
                    } as React.CSSProperties}
                  />
                </div>
                <span style={{
                  fontSize: '0.78rem', fontFamily: 'var(--mono)',
                  width: 40, textAlign: 'right', color: t.color, fontWeight: 600,
                }}>
                  {t.pct}%
                </span>
              </div>
            ))}
          </div>
        </FlowNode>
        <FlowArrow />

        {/* Model cards */}
        <div className="flow-node" style={{ animationDelay: '0.5s', padding: 0, border: 'none', background: 'transparent' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <ModelCard label="Ollama" badge="FREE · LOCAL" color="var(--tier-0)" cost="$0.00" tooltip={`Runs entirely on your ${gpuName} — no API calls, the prompt stays on your machine. Note: when you have an Anthropic API key, some tasks that classify as T0 still execute on cloud Haiku for quality. Your terminal's divergence chip shows when local intent runs cloud.`} />
            <ModelCard label="Claude Haiku" badge="API · FAST" color="var(--tier-1)" cost="~$0.001" tooltip="Anthropic's fastest Claude. Used for light code tasks, commit messages, explanations, regex. 40× cheaper than Opus." />
            <ModelCard label="Claude Sonnet" badge="API · BALANCED" color="var(--tier-2)" cost="~$0.01" tooltip="Used for debugging, root cause analysis, comparing approaches. 5× cheaper than Opus with 90% of the capability for most tasks." />
            <ModelCard label="Claude Opus" badge="API · MAXIMUM" color="var(--tier-3)" cost="~$0.15" tooltip={`Reserved for architecture decisions, multi-file refactors, production-critical tasks. mooter only sends here when it has to — your ${t3Pct}% T3 rate means ${routedAwayPct}% of prompts were handled cheaper.`} />
          </div>
        </div>
      </div>

      {/* Savings block */}
      {decisionsCount > 0 && (
        <div style={{
          marginTop: 32,
          padding: '24px 28px',
          borderRadius: 'var(--r-lg)',
          background: 'linear-gradient(135deg, rgba(232,136,138,0.08) 0%, rgba(232,136,138,0.02) 100%)',
          border: '1px solid rgba(232,136,138,0.2)',
        }}>
          <div style={{
            display: 'flex', flexWrap: 'wrap',
            gap: 32, justifyContent: 'center', marginBottom: 16,
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '1.75rem', fontWeight: 800,
                color: 'var(--tier-0)', fontFamily: 'var(--mono)',
              }}>
                <AnimatedCounter value={savingsUsd} prefix="$" />
              </div>
              <div style={savingsLabel}>saved</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '1.75rem', fontWeight: 800,
                color: 'var(--text)', fontFamily: 'var(--mono)',
              }}>
                <AnimatedCounter value={decisionsCount} decimals={0} />
              </div>
              <div style={savingsLabel}>decisions</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: '1.75rem', fontWeight: 800,
                color: 'var(--text)', fontFamily: 'var(--mono)',
              }}>
                <AnimatedCounter value={routedAwayPct} suffix="%" decimals={0} />
              </div>
              <div style={savingsLabel}>routed away</div>
            </div>
          </div>
          <div style={{
            fontSize: '0.82rem', color: 'var(--muted)',
            textAlign: 'center', lineHeight: 1.7,
          }}>
            If every prompt went to Opus: ~${naiveCost.toFixed(2)}<br />
            mooter actually spent: ~${Math.max(0, naiveCost - savingsUsd).toFixed(2)}
          </div>
          <div style={{
            fontSize: '0.7rem', color: 'var(--faint)',
            textAlign: 'center', marginTop: 12,
            fontFamily: 'var(--mono)',
          }}>
            {gpuName} · {osLabel(osType)}
          </div>
        </div>
      )}
    </div>
  );
}

const savingsLabel: React.CSSProperties = {
  fontSize: '0.7rem',
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  marginTop: 4,
  fontWeight: 600,
};

// ── Decisions Tab ────────────────────────────────────────────────────────
function DecisionsTab({ profile: _profile }: { profile: Profile }) {
  const [log, setLog] = useState<Array<{ recorded_at: string; decisions: number; savings_usd: number; device_id: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/decisions-log')
      .then(r => r.json())
      .then(data => { setLog(data?.rows || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ color: 'var(--muted)', padding: 32 }}>Loading history...</div>;
  }

  if (log.length === 0) {
    return (
      <div style={{ color: 'var(--muted)', padding: 32, textAlign: 'center' }}>
        <p style={{ margin: '0 0 8px', fontSize: '0.9rem' }}>No sync history yet.</p>
        <p style={{ fontSize: '0.8rem', margin: 0 }}>
          History populates automatically after the next Claude Code session.
        </p>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={sectionHeading}>Sync history — {log.length} entries</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.78rem', margin: '6px 0 0' }}>
          ⓘ Synced session snapshots. {PHASE_C.realTimeSync}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {log.slice(0, 50).map((row, i) => {
          const dt = new Date(row.recorded_at);
          const dateStr = dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
          const timeStr = dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
          const prev = log[i + 1];
          const delta = prev ? row.decisions - prev.decisions : null;
          return (
            <div
              key={i}
              style={{
                display: 'grid',
                gridTemplateColumns: '110px 1fr 90px 90px',
                gap: 12,
                padding: '10px 14px',
                background: 'var(--surface-2)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r-sm)',
                fontSize: '0.78rem',
                alignItems: 'center',
              }}
            >
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--muted)' }}>
                {dateStr} {timeStr}
              </span>
              <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>
                {row.decisions.toLocaleString()} decisions
              </span>
              <span style={{
                color: 'var(--tier-0)', fontFamily: 'var(--mono)',
                textAlign: 'right',
              }}>
                ${Number(row.savings_usd).toFixed(2)}
              </span>
              {delta !== null && delta > 0 ? (
                <span style={{
                  color: 'var(--muted)', fontSize: '0.72rem',
                  textAlign: 'right',
                }}>
                  +{delta} new
                </span>
              ) : <span />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Workflow Tab (Wave 10 A.5-V2 — Sankey-lite tier flow) ────────────────
// Renders the community-wide flow of prompts through classify.js into the four
// tiers, from the hub aggregates (/api/dashboard/aggregates). Honest: shows a
// "Demo data" badge with an illustrative distribution when the hub is empty.
// Wave 33.7: a "My usage" toggle fetches per-user aggregates (?scope=user) over
// the anonymous user_id_hash — honest empty/sign-in states, never fabricated.
interface AggregatesResp {
  source: 'live' | 'demo';
  total_events?: number;
  unique_instances?: number;
  tier_distribution?: Record<string, number>;
  top_categories?: Array<{ category: string; count: number }>;
  last_updated?: string;
}

const WF_TIERS = [
  { key: 'T0', glyph: '🏠', label: 'T0 local', model: 'qwen2.5:3b', color: 'var(--tier-0, #48c068)' },
  { key: 'T1', glyph: '☁', label: 'T1 haiku', model: 'claude-haiku', color: 'var(--tier-1, #5b8def)' },
  { key: 'T2', glyph: '☁', label: 'T2 sonnet', model: 'claude-sonnet', color: 'var(--tier-2, #c98a4b)' },
  { key: 'T3', glyph: '☁', label: 'T3 opus', model: 'claude-opus', color: 'var(--tier-3, #e8888a)' },
];

// Illustrative distribution shown only with the explicit "Demo data" badge.
const WF_DEMO_DIST: Record<string, number> = { T0: 0.66, T1: 0.21, T2: 0.1, T3: 0.03 };
const WF_DEMO_TOTAL = 412;

// Per-user response (Wave 33.7 — /api/dashboard/aggregates?scope=user).
interface UserAggResp {
  scope: 'user';
  source: 'live' | 'empty' | 'unauthenticated';
  total_calls?: number;
  saved_usd?: number;
  tier_distribution?: Record<string, number>;
  top_categories?: Array<{ category: string; count: number }>;
  devices_active?: number;
  last_active_at?: string | null;
}

function WorkflowTab() {
  const [agg, setAgg] = useState<AggregatesResp | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Wave 33.7 — "My usage" per-user scope toggle.
  const [scope, setScope] = useState<'community' | 'user'>('community');
  const [userAgg, setUserAgg] = useState<UserAggResp | null>(null);
  const [userLoaded, setUserLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/dashboard/aggregates')
      .then((r) => r.json())
      .then((d: AggregatesResp) => { if (alive) { setAgg(d); setLoaded(true); } })
      .catch(() => { if (alive) { setAgg({ source: 'demo' }); setLoaded(true); } });
    return () => { alive = false; };
  }, []);

  // Lazily fetch per-user data the first time the "My usage" tab is opened.
  useEffect(() => {
    if (scope !== 'user' || userLoaded) return;
    let alive = true;
    fetch('/api/dashboard/aggregates?scope=user')
      .then((r) => r.json().then((d) => ({ ok: r.ok, d: d as UserAggResp })))
      .then(({ d }) => { if (alive) { setUserAgg(d); setUserLoaded(true); } })
      .catch(() => { if (alive) { setUserAgg({ scope: 'user', source: 'empty' }); setUserLoaded(true); } });
    return () => { alive = false; };
  }, [scope, userLoaded]);

  const userLive = !!userAgg && userAgg.source === 'live' && (userAgg.total_calls || 0) > 0;
  const live = scope === 'community'
    ? (!!agg && agg.source === 'live' && !!agg.tier_distribution)
    : userLive;
  const dist = scope === 'community'
    ? (live ? (agg!.tier_distribution as Record<string, number>) : WF_DEMO_DIST)
    : (userLive ? (userAgg!.tier_distribution as Record<string, number>) : WF_DEMO_DIST);
  const total = scope === 'community'
    ? (live ? (agg!.total_events || 0) : WF_DEMO_TOTAL)
    : (userLive ? (userAgg!.total_calls || 0) : 0);

  if (!loaded) return <div style={{ color: 'var(--muted)', padding: 20 }}>Loading workflow…</div>;

  // Honest per-user states: signed-out and empty don't fabricate a distribution.
  const userPending = scope === 'user' && !userLoaded;
  const userUnauth = scope === 'user' && userAgg?.source === 'unauthenticated';
  const userEmpty = scope === 'user' && userLoaded && !userLive && !userUnauth;

  const ScopeToggle = (
    <div style={{ display: 'inline-flex', gap: 4, background: 'var(--surface, rgba(255,255,255,0.04))', borderRadius: 8, padding: 3 }}>
      {(['community', 'user'] as const).map((s) => (
        <button
          key={s}
          onClick={() => setScope(s)}
          style={{
            border: 'none', cursor: 'pointer', padding: '4px 12px', borderRadius: 6,
            fontSize: '0.78rem', fontWeight: 600,
            background: scope === s ? 'var(--accent)' : 'transparent',
            color: scope === s ? 'var(--cream)' : 'var(--muted)',
            transition: 'all 120ms ease',
          }}
        >
          {s === 'community' ? 'Community' : 'My usage'}
        </button>
      ))}
    </div>
  );

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: '1.05rem', color: 'var(--text)' }}>Prompt flow</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {ScopeToggle}
          {scope === 'community'
            ? <DataSourceBadge source={live ? 'live' : 'demo'} detail={live ? `${(agg!.unique_instances || 0).toLocaleString('en-US')} devices` : undefined} />
            : userLive ? <DataSourceBadge source={'live'} detail={`${(userAgg!.devices_active || 0).toLocaleString('en-US')} of your devices`} /> : null}
        </div>
      </div>

      {userPending && (
        <div style={{ color: 'var(--muted)', padding: '18px 0' }}>Asking the cow about your numbers…</div>
      )}
      {userUnauth && (
        <div style={{ color: 'var(--muted)', padding: '14px 0', fontSize: '0.9rem' }}>
          Sign in to see your own routing — your numbers stay private to your account.
        </div>
      )}
      {userEmpty && (
        <div style={{ color: 'var(--muted)', padding: '14px 0', fontSize: '0.9rem', lineHeight: 1.6 }}>
          No routed calls linked to your account yet. Run{' '}
          <span style={{ fontFamily: 'var(--mono)', color: 'var(--text)' }}>mooter sync</span>{' '}
          in a logged-in terminal to populate this — your data, your machine.
        </div>
      )}
      {scope === 'user' && userLive && (
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '8px 0 0' }}>
          <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>{(userAgg!.total_calls || 0).toLocaleString('en-US')}</span> calls routed
          {typeof userAgg!.saved_usd === 'number' && (
            <> · <span style={{ color: 'var(--text)', fontFamily: 'var(--mono)' }}>${(userAgg!.saved_usd).toFixed(2)}</span> saved vs all-Opus</>
          )}
        </p>
      )}
      {!(userPending || userUnauth || userEmpty) && (<>
      <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '8px 0 18px' }}>
        {total.toLocaleString('en-US')} prompts → <span style={{ fontFamily: 'var(--mono)' }}>classify.js</span> → routed across the four tiers.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {WF_TIERS.map((t) => {
          const frac = Math.max(0, Math.min(1, Number(dist[t.key]) || 0));
          const pct = Math.round(frac * 100);
          const count = Math.round(frac * total);
          return (
            <div key={t.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 132, flexShrink: 0, fontSize: '0.85rem', color: 'var(--text)' }}>
                <span style={{ marginRight: 6 }}>{t.glyph}</span>{t.label}
                <span style={{ color: 'var(--muted)', marginLeft: 6, fontFamily: 'var(--mono)', fontSize: '0.75rem' }}>{t.model}</span>
              </div>
              <div style={{ flex: 1, height: 18, background: 'var(--surface, rgba(255,255,255,0.04))', borderRadius: 5, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: t.color, borderRadius: 5, transition: 'width 240ms ease' }} />
              </div>
              <div style={{ width: 96, flexShrink: 0, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '0.8rem', color: 'var(--text)' }}>
                {count.toLocaleString('en-US')} · {pct}%
              </div>
            </div>
          );
        })}
      </div>
      </>)}

      {(() => {
        const cats = scope === 'community'
          ? (live && Array.isArray(agg?.top_categories) ? agg!.top_categories : null)
          : (userLive && Array.isArray(userAgg?.top_categories) ? userAgg!.top_categories : null);
        if (!cats || cats.length === 0) return null;
        return (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 8 }}>Top task categories</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {cats.slice(0, 8).map((c) => (
                <span key={c.category} style={{ fontSize: '0.78rem', fontFamily: 'var(--mono)', color: 'var(--text-2, var(--text))', border: '1px solid var(--border, var(--color-border))', borderRadius: 999, padding: '3px 10px' }}>
                  {c.category} · {c.count.toLocaleString('en-US')}
                </span>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────
type DashTab = 'overview' | 'devices' | 'setup' | 'metrics' | 'howitworks' | 'decisions' | 'workflow' | 'matrix';

// Wave 58 batch 4 (A.13) — the matrix tab is admin-only (adminOnly: true). It is
// appended to the base tabs only when the admin probe succeeds; the /api/admin/matrix
// route is the real server-side enforcement (403 for non-admins).
const DASH_TABS: { key: DashTab; label: string; adminOnly?: boolean }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'devices', label: 'Devices' },
  { key: 'setup', label: 'Setup' },
  { key: 'metrics', label: 'Metrics' },
  { key: 'howitworks', label: 'How it works' },
  { key: 'workflow', label: 'Workflow' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'matrix', label: 'Matrix', adminOnly: true },
];

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DashTab>('overview');
  // Wave 58 batch 4 (A.13) — admin probe gates the matrix tab. We never expose
  // the allow-list client-side; a HEAD-equivalent GET to the admin matrix route
  // returns 200 only for admins (403 otherwise), and that is the gate.
  const [isAdmin, setIsAdmin] = useState(false);

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

  useEffect(() => {
    // Best-effort admin detection — only reveals the tab; the route enforces auth.
    fetch('/api/admin/matrix')
      .then((r) => { if (r.ok) setIsAdmin(true); })
      .catch(() => {});
  }, []);

  if (loading) {
    return <div className="dashboard-loading">Loading...</div>;
  }

  if (!profile) {
    return (
      <div style={card}>
        <p style={{ color: 'var(--muted)' }}>
          No profile found.{' '}
          <a href="/onboarding" style={{ color: 'var(--accent)' }}>Complete onboarding</a>{' '}
          to set up your profile.
        </p>
      </div>
    );
  }


  return (
    <div style={{ maxWidth: 880 }}>
      {/* Tabs */}
      <div className="app-tabs">
        {DASH_TABS.filter(t => !t.adminOnly || isAdmin).map(t => (
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
      {tab === 'workflow' && <WorkflowTab />}
      {tab === 'decisions' && <DecisionsTab profile={profile} />}
      {/* Wave 58 batch 4 (A.13) — admin-only matrix panel */}
      {tab === 'matrix' && isAdmin && <MatrixPanel />}

      {/* Wave 4 Phase C — global honest footer note */}
      <DashboardFooterNote />
    </div>
  );
}
