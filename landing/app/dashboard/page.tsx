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
      {copied[id] ? '✓' : 'Copy'}
    </button>
  );
}

// ── PEÇA 1: RecommendedModeCard ──────────────────────────────────────────
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
  const hasMax = profile.subscriptions?.some(s =>
    s.toLowerCase().includes('max') || s.toLowerCase().includes('claude max'));
  const hasGpu = profile.hardware_tier &&
    !['cpu_only', 'cloud', 'other', 'unknown', ''].includes(profile.hardware_tier);
  const hasOllama = cfg.has_ollama === true || cfg.ollama_enabled === true;
  const hasAnthropicKey = cfg.has_anthropic_key === true || cfg.anthropic_key === true;

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

// ── PEÇA 2: ProjectContextCard ───────────────────────────────────────────
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

  if (!profile.install_completed) return null;

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

// ── PEÇA 3: RecommendationsCard ──────────────────────────────────────────
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
  const hasOllama = cfg.has_ollama === true || cfg.ollama_enabled === true;
  const hasAnthropicKey = cfg.has_anthropic_key === true || cfg.anthropic_key === true;
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

  const decisionsCount = Number(cfg.decisions_count) || 0;
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

  if (!hasAnthropicKey && profile.install_completed) {
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

function SetupHealthCard({ profile }: { profile: Profile }) {
  const config = (profile.frugal_config || {}) as Record<string, unknown>;

  type Check = { label: string; ok: boolean; warn: boolean; value: string; fix: string | null };
  const checks: Check[] = [
    {
      label: 'Frugal installed',
      ok: !!profile.install_completed && !!profile.frugal_version,
      warn: false,
      value: profile.frugal_version ? `v${profile.frugal_version}` : '',
      fix: profile.install_completed ? null : '/onboarding',
    },
    {
      label: 'Hardware detected',
      ok: !!profile.hardware_tier && profile.hardware_tier !== 'unknown' && profile.hardware_tier !== '',
      warn: false,
      value: profile.hardware_tier?.replace(/_/g, ' ') || '',
      fix: (!profile.hardware_tier || profile.hardware_tier === 'unknown' || profile.hardware_tier === '') ? '/onboarding' : null,
    },
    {
      label: 'Anthropic API key',
      ok: config.has_anthropic_key === true || config.anthropic_key === true,
      warn: false,
      value: (config.has_anthropic_key === true || config.anthropic_key === true) ? 'configured' : 'missing',
      fix: (config.has_anthropic_key === true || config.anthropic_key === true) ? null : 'export ANTHROPIC_API_KEY=sk-ant-... in your shell profile',
    },
    (() => {
      const hasOllama = config.has_ollama === true || config.ollama_enabled === true;
      const hasQwen3b = config.ollama_has_qwen3b === true;
      if (hasOllama && hasQwen3b) return { label: 'Ollama', ok: true, warn: false, value: 'qwen2.5:3b ready', fix: null };
      if (hasOllama && !hasQwen3b) return { label: 'Ollama', ok: false, warn: true, value: 'installed, missing qwen2.5:3b', fix: 'ollama pull qwen2.5:3b' };
      return { label: 'Ollama', ok: false, warn: false, value: 'not installed', fix: 'https://ollama.com/download' };
    })(),
    {
      label: 'Savings synced',
      ok: (config.decisions_count as number || 0) > 0,
      warn: false,
      value: (config.decisions_count as number || 0) > 0
        ? `${config.decisions_count} prompts · $${(Number(config.savings_usd) || 0).toFixed(2)} saved`
        : 'no data yet',
      fix: (config.decisions_count as number || 0) > 0 ? null : 'Run frugal-doctor --sync after first Claude Code session',
    },
  ];

  const score = checks.filter(c => c.ok).length;

  return (
    <div className="dashboard-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Setup <span className="dashboard-muted" style={{ fontWeight: 400, fontSize: '0.85em' }}>{score}/5</span></h2>
        <button
          onClick={() => window.location.reload()}
          style={{ background: 'none', border: '1px solid var(--border, #333)', borderRadius: 6, padding: '4px 12px', color: 'inherit', cursor: 'pointer', fontSize: '0.85em' }}
        >
          Refresh
        </button>
      </div>
      <div className="dashboard-grid" style={{ gap: '0.5rem' }}>
        {checks.map((c) => (
          <div className="dashboard-field" key={c.label} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
            <span style={{ flexShrink: 0, fontSize: '1.1em' }}>
              {c.ok ? '✓' : c.warn ? '⚠' : '✗'}
            </span>
            <div>
              <span className="dashboard-label">{c.label}</span>
              <span className="dashboard-val" style={{ color: c.ok ? 'var(--success, #4ec9b0)' : c.warn ? 'var(--warning, #dcdc aa)' : 'var(--error, #f44747)' }}>
                {c.value}
              </span>
              {c.fix && (
                c.fix.startsWith('/') ? (
                  <a href={c.fix} className="dashboard-link" style={{ fontSize: '0.8em', display: 'block' }}>Fix: go to {c.fix}</a>
                ) : c.fix.startsWith('http') ? (
                  <a href={c.fix} target="_blank" rel="noopener" className="dashboard-link" style={{ fontSize: '0.8em', display: 'block' }}>Fix: {c.fix}</a>
                ) : (
                  <span className="dashboard-muted" style={{ fontSize: '0.8em', display: 'block' }}>Fix: <code>{c.fix}</code></span>
                )
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
        <div className="dashboard-header">
          <a href="/" className="dashboard-brand">
            <img src="/frugal-logo.svg" alt="frugal" width={28} height={28} />
            <span>frugal</span>
          </a>
          <a href="/api/logout" className="dashboard-logout">Sign out</a>
        </div>

        <h1 className="dashboard-h1">Your dashboard</h1>

        {!profile ? (
          <div className="dashboard-card">
            <p>No profile found. <a href="/onboarding">Complete onboarding</a> to set up your profile.</p>
          </div>
        ) : (
          <>
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
                      <span className="dashboard-val">{profile.github_primary_language || '—'}</span>
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

            {/* Setup Health Check card */}
            <SetupHealthCard profile={profile} />

            {/* Recommended mode card (MP-8) */}
            <RecommendedModeCard profile={profile} />

            {/* Project context card (MP-8) */}
            <ProjectContextCard profile={profile} />

            {/* Recommendations card (MP-8) */}
            <RecommendationsCard profile={profile} />

            {/* Savings card */}
            <div className="dashboard-card">
              <h2>Savings</h2>
              {!profile.install_completed ? (
                <div>
                  <p className="dashboard-muted">
                    We haven&apos;t detected your first prompt yet. Install frugal and start using Claude Code.
                  </p>
                  <a href="/onboarding" className="dashboard-link">View install instructions</a>
                </div>
              ) : (
                <p className="dashboard-muted">
                  Savings data will appear here once usage sessions are synced.
                </p>
              )}
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
