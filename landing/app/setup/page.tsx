'use client';

import { useEffect, useState } from 'react';

// ── Types ────────────────────────────────────────────────────────────────
type OS = 'windows' | 'mac' | '';
type SetupProgress = {
  os: OS;
  hasVscode: boolean | null;
  hasGithub: boolean | null;
  completedSteps: string[];
};

const STORAGE_KEY = 'frugal_setup_progress';

function loadProgress(): SetupProgress {
  if (typeof window === 'undefined') return { os: '', hasVscode: null, hasGithub: null, completedSteps: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { os: '', hasVscode: null, hasGithub: null, completedSteps: [] };
}

function saveProgress(p: SetupProgress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// ── Master Prompts ───────────────────────────────────────────────────────
function getPrompt0(os: OS): string {
  const osName = os === 'windows' ? 'Windows' : 'Mac';
  const installMethod = os === 'windows' ? 'winget (Windows)' : 'brew (Mac)';
  return `I need to prepare my computer to install mooter.
Operating system: ${osName}

Please:
1. Check if I have VS Code installed. If not, give me the direct download link and wait for me to confirm I installed it.
2. Check if I have Node.js v18+ installed. If not, install via ${installMethod}.
3. Check if I have Git installed. If not, install it.
4. At the end, confirm everything is ready with a checklist.

Do one thing at a time and wait for my confirmation before moving on.`;
}

function getPrompt1(): string {
  return `I'm going to log in to mooter to connect my computer to the dashboard.

1. Open https://mooter.ai in my browser
2. Click "Sign in with GitHub"
3. Authorize mooter
4. When the browser shows the token, copy it
5. Save it with: mkdir -p ~/.mooter && echo -n "TOKEN_HERE" > ~/.mooter/auth.token

Guide me step by step. When done, confirm that the file ~/.mooter/auth.token exists.`;
}

function getPrompt2(os: OS): string {
  const osName = os === 'windows' ? 'Windows' : 'Mac';
  const cmd = os === 'windows'
    ? 'irm https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install-windows.ps1 | iex'
    : 'bash <(curl -fsSL https://raw.githubusercontent.com/pauloloureiroshp-ship-it/frugal/main/install.sh)';
  return `Install mooter on my computer.
System: ${osName}

Run the appropriate install command:
${cmd}

During installation:
- If it asks about Ollama, install it
- If it asks about models, choose qwen2.5:3b (fast, free)
- If there's any error, show it to me and resolve it

At the end, confirm that mooter is installed.`;
}

function getPrompt3(): string {
  return `Validate my mooter installation and sync with the dashboard.

1. Run: node ~/.claude/tools/router/mooter-doctor.js --sync
2. Interpret the results in simple language:
   - What's working well
   - What's missing and whether it's critical or optional
   - What's my setup completion percentage
3. If the sync failed, diagnose and fix it
4. At the end, open https://landing-five-azure-16.vercel.app/dashboard and confirm my data appears

Explain everything in simple language, no technical jargon.`;
}

// ── Step definitions ─────────────────────────────────────────────────────
type StepDef = {
  id: string;
  title: string;
  time: string;
  prompt: string;
  pasteTarget: string;
  link?: { label: string; url: string };
  conditional: boolean;
};

function buildSteps(os: OS, hasVscode: boolean, hasGithub: boolean): StepDef[] {
  const steps: StepDef[] = [];

  if (!hasVscode) {
    steps.push({
      id: 'prereqs',
      title: 'Install VS Code & Node.js',
      time: '~5 min',
      prompt: getPrompt0(os),
      pasteTarget: 'Claude Cowork (desktop app)',
      link: { label: 'Download Claude Cowork', url: 'https://claude.ai/download' },
      conditional: true,
    });
  }

  if (!hasGithub) {
    steps.push({
      id: 'github',
      title: 'Create GitHub account',
      time: '~3 min',
      prompt: '',
      pasteTarget: '',
      link: { label: 'Sign up for GitHub', url: 'https://github.com/signup' },
      conditional: true,
    });
  }

  steps.push({
    id: 'login',
    title: 'Log in to mooter',
    time: '~2 min',
    prompt: getPrompt1(),
    pasteTarget: 'Claude Cowork (desktop app)',
    conditional: false,
  });

  steps.push({
    id: 'install',
    title: 'Install mooter',
    time: '~5 min',
    prompt: getPrompt2(os),
    pasteTarget: 'Claude Cowork (desktop app)',
    conditional: false,
  });

  steps.push({
    id: 'validate',
    title: 'Validate your setup',
    time: '~2 min',
    prompt: getPrompt3(),
    pasteTarget: 'Claude Cowork (desktop app)',
    conditional: false,
  });

  return steps;
}

// ── Copy button ──────────────────────────────────────────────────────────
function CopyPromptBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      style={{
        background: copied ? 'var(--t0, #4ec9b0)' : 'none',
        color: copied ? '#000' : 'var(--t0, #4ec9b0)',
        border: '1px solid var(--border, #333)',
        borderRadius: 6,
        padding: '4px 14px',
        cursor: 'pointer',
        fontSize: '0.85rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {copied ? '\u2713 Copied' : 'Copy prompt'}
    </button>
  );
}

// ── Main page ────────────────────────────────────────────────────────────
export default function SetupPage() {
  const [progress, setProgress] = useState<SetupProgress>(loadProgress);
  const [phase, setPhase] = useState<'questions' | 'plan'>(
    progress.os && progress.hasVscode !== null && progress.hasGithub !== null ? 'plan' : 'questions'
  );
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

  // Detect OS from user-agent on mount
  useEffect(() => {
    if (!progress.os) {
      const ua = navigator.userAgent.toLowerCase();
      const detectedOs: OS = ua.includes('win') ? 'windows' : ua.includes('mac') ? 'mac' : '';
      if (detectedOs) {
        setProgress(prev => {
          const next = { ...prev, os: detectedOs };
          saveProgress(next);
          return next;
        });
      }
    }
  }, [progress.os]);

  const update = (partial: Partial<SetupProgress>) => {
    setProgress(prev => {
      const next = { ...prev, ...partial };
      saveProgress(next);
      return next;
    });
  };

  const toggleComplete = (stepId: string) => {
    const completed = progress.completedSteps.includes(stepId)
      ? progress.completedSteps.filter(s => s !== stepId)
      : [...progress.completedSteps, stepId];
    update({ completedSteps: completed });
  };

  const canGenerate = !!progress.os && progress.hasVscode !== null && progress.hasGithub !== null;

  const steps = phase === 'plan'
    ? buildSteps(progress.os as OS, progress.hasVscode ?? true, progress.hasGithub ?? true)
    : [];

  const totalTime = steps.reduce((acc, s) => {
    const m = s.time.match(/(\d+)/);
    return acc + (m ? parseInt(m[1], 10) : 0);
  }, 0);

  const completedCount = steps.filter(s => progress.completedSteps.includes(s.id)).length;

  const toggleBtnStyle = (active: boolean) => ({
    background: active ? 'var(--t0, #4ec9b0)' : 'transparent',
    color: active ? '#000' : 'var(--text, #ededed)',
    border: '1px solid ' + (active ? 'var(--t0, #4ec9b0)' : 'var(--border, #333)'),
    borderRadius: 8,
    padding: '8px 20px',
    cursor: 'pointer' as const,
    fontSize: '0.9rem',
    fontWeight: active ? 700 : 400,
    transition: 'all 0.15s ease',
  });

  return (
    <div className="dashboard-page">
      <div className="dashboard-container">
        {/* Header */}
        <div className="dashboard-header">
          <a href="/" className="dashboard-brand">
            <span style={{ fontSize: '1.5rem' }}>🐮</span>
            <span>mooter</span>
          </a>
        </div>

        <h1 className="dashboard-h1">
          {phase === 'questions' ? "Let's get you set up" : `Your plan \u2014 ${steps.length} steps, ~${totalTime} min`}
        </h1>
        {phase === 'questions' && (
          <p className="dashboard-muted" style={{ marginTop: '-1.5rem', marginBottom: '2rem' }}>
            ~12 minutes \u00b7 No coding required
          </p>
        )}

        {/* Phase 1: Questions */}
        {phase === 'questions' && (
          <div className="dashboard-card">
            <h2>First, tell us about your setup</h2>

            <div style={{ marginBottom: '1.5rem' }}>
              <span className="dashboard-label" style={{ display: 'block', marginBottom: 8 }}>Your computer</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={toggleBtnStyle(progress.os === 'windows')} onClick={() => update({ os: 'windows' })}>
                  Windows
                </button>
                <button style={toggleBtnStyle(progress.os === 'mac')} onClick={() => update({ os: 'mac' })}>
                  Mac
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <span className="dashboard-label" style={{ display: 'block', marginBottom: 8 }}>VS Code installed?</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={toggleBtnStyle(progress.hasVscode === true)} onClick={() => update({ hasVscode: true })}>
                  Yes
                </button>
                <button style={toggleBtnStyle(progress.hasVscode === false)} onClick={() => update({ hasVscode: false })}>
                  Not yet
                </button>
              </div>
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <span className="dashboard-label" style={{ display: 'block', marginBottom: 8 }}>GitHub account?</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={toggleBtnStyle(progress.hasGithub === true)} onClick={() => update({ hasGithub: true })}>
                  Yes
                </button>
                <button style={toggleBtnStyle(progress.hasGithub === false)} onClick={() => update({ hasGithub: false })}>
                  Not yet
                </button>
              </div>
            </div>

            <button
              disabled={!canGenerate}
              onClick={() => setPhase('plan')}
              style={{
                width: '100%',
                padding: '12px',
                background: canGenerate ? 'var(--t0, #4ec9b0)' : 'var(--border, #333)',
                color: canGenerate ? '#000' : 'var(--muted, #666)',
                border: 'none',
                borderRadius: 8,
                fontSize: '1rem',
                fontWeight: 700,
                cursor: canGenerate ? 'pointer' : 'default',
                marginTop: '0.5rem',
              }}
            >
              Generate my plan \u2192
            </button>
          </div>
        )}

        {/* Phase 2: Plan */}
        {phase === 'plan' && (
          <>
            {/* Progress bar */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span className="dashboard-muted" style={{ fontSize: '0.85rem' }}>Progress</span>
                <span className="dashboard-muted" style={{ fontSize: '0.85rem' }}>{completedCount}/{steps.length} done</span>
              </div>
              <div style={{ background: 'var(--border, #333)', borderRadius: 8, height: 6, overflow: 'hidden' }}>
                <div style={{ width: steps.length > 0 ? `${(completedCount / steps.length) * 100}%` : '0%', height: '100%', background: 'var(--t0, #4ec9b0)', borderRadius: 8, transition: 'width 0.4s ease' }} />
              </div>
            </div>

            {/* Reset link */}
            <div style={{ marginBottom: '1rem', textAlign: 'right' }}>
              <button
                onClick={() => { setPhase('questions'); update({ completedSteps: [] }); }}
                style={{ background: 'none', border: 'none', color: 'var(--muted, #666)', cursor: 'pointer', fontSize: '0.8rem', textDecoration: 'underline' }}
              >
                Change answers
              </button>
            </div>

            {/* Steps */}
            {steps.map((step, idx) => {
              const isDone = progress.completedSteps.includes(step.id);
              const isExpanded = expandedStep === step.id;
              const isCurrent = !isDone && steps.slice(0, idx).every(s => progress.completedSteps.includes(s.id));

              return (
                <div
                  key={step.id}
                  className="dashboard-card"
                  style={{
                    borderColor: isCurrent ? 'var(--t0, #4ec9b0)' : isDone ? 'rgba(78,201,176,0.2)' : undefined,
                    opacity: isDone ? 0.7 : 1,
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', cursor: 'pointer' }}
                    onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                  >
                    <span style={{ flexShrink: 0, fontSize: '1.1rem', width: 24, textAlign: 'center', color: isDone ? 'var(--t0, #4ec9b0)' : isCurrent ? 'var(--t0, #4ec9b0)' : 'var(--muted, #666)' }}>
                      {isDone ? '\u2713' : isCurrent ? '\u25CF' : '\u25CB'}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                        {step.conditional ? '' : `Step ${idx + 1 - steps.filter((s, j) => j < idx && s.conditional).length}  `}
                        {step.title}
                      </div>
                    </div>
                    <span className="dashboard-muted" style={{ fontSize: '0.8rem', flexShrink: 0 }}>{step.time}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--muted, #666)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>{'\u25BC'}</span>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border, #333)' }}>
                      {/* Link-only step (GitHub signup) */}
                      {!step.prompt && step.link && (
                        <div>
                          <a href={step.link.url} target="_blank" rel="noopener" style={{ color: 'var(--t0, #4ec9b0)', fontSize: '0.9rem' }}>
                            {step.link.label} \u2192
                          </a>
                          <p className="dashboard-muted" style={{ fontSize: '0.8rem', marginTop: 8 }}>
                            Create your free account, then come back and mark this step as done.
                          </p>
                        </div>
                      )}

                      {/* Prompt step */}
                      {step.prompt && (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <span className="dashboard-muted" style={{ fontSize: '0.85rem' }}>
                              Where to paste: <strong>{step.pasteTarget}</strong>
                            </span>
                            <CopyPromptBtn text={step.prompt} />
                          </div>
                          <pre style={{
                            background: 'var(--bg, #080808)',
                            border: '1px solid var(--border, #333)',
                            borderRadius: 8,
                            padding: '0.75rem 1rem',
                            fontSize: '0.8rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: 200,
                            overflow: 'auto',
                            margin: 0,
                            color: 'var(--text, #ededed)',
                          }}>
                            {step.prompt}
                          </pre>
                          {step.link && (
                            <a href={step.link.url} target="_blank" rel="noopener" className="dashboard-muted" style={{ fontSize: '0.8rem', display: 'block', marginTop: 8, color: 'var(--t0, #4ec9b0)' }}>
                              {step.link.label} \u2192
                            </a>
                          )}
                        </>
                      )}

                      {/* Mark as done */}
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleComplete(step.id); }}
                        style={{
                          marginTop: '0.75rem',
                          background: isDone ? 'transparent' : 'var(--t0, #4ec9b0)',
                          color: isDone ? 'var(--muted, #666)' : '#000',
                          border: isDone ? '1px solid var(--border, #333)' : 'none',
                          borderRadius: 6,
                          padding: '6px 16px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                        }}
                      >
                        {isDone ? 'Undo' : 'Mark as done \u2713'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* All done */}
            {completedCount === steps.length && steps.length > 0 && (
              <div className="dashboard-card" style={{ textAlign: 'center', border: '1px solid var(--t0, #4ec9b0)', background: 'rgba(78,201,176,0.06)' }}>
                <h2 style={{ color: 'var(--t0, #4ec9b0)', marginBottom: '0.5rem' }}>Setup complete!</h2>
                <p className="dashboard-muted" style={{ marginBottom: '1rem' }}>Your mooter installation is ready. Check your dashboard for live savings data.</p>
                <a href="/dashboard" style={{
                  display: 'inline-block',
                  background: 'var(--t0, #4ec9b0)',
                  color: '#000',
                  padding: '10px 24px',
                  borderRadius: 8,
                  fontWeight: 700,
                  textDecoration: 'none',
                  fontSize: '0.95rem',
                }}>
                  Go to dashboard \u2192
                </a>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
