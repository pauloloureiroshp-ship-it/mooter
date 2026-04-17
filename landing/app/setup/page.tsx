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
4. At the end, open https://mooter.ai/dashboard and confirm my data appears

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
        background: copied ? 'var(--tier-0)' : 'var(--surface-2)',
        color: copied ? 'var(--bg)' : 'var(--accent)',
        border: `1px solid ${copied ? 'var(--tier-0)' : 'var(--border)'}`,
        borderRadius: 'var(--r-sm)',
        padding: '6px 14px',
        cursor: 'pointer',
        fontSize: '0.8rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        fontFamily: 'var(--font)',
        transition: 'background 0.15s ease',
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

  const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--accent)' : 'var(--surface-2)',
    color: active ? 'var(--bg)' : 'var(--text)',
    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
    borderRadius: 'var(--r-md)',
    padding: '10px 20px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: active ? 700 : 500,
    fontFamily: 'var(--font)',
    transition: 'all 0.15s ease',
  });

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '32px 20px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 40,
        }}>
          <a
            href="/"
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: 'var(--font)', fontWeight: 700,
              color: 'var(--text)', textDecoration: 'none',
            }}
          >
            <span style={{ fontSize: '1.5rem' }}>🐮</span>
            <span>mooter</span>
          </a>
        </div>

        <h1 style={{
          fontSize: '1.75rem', fontWeight: 700, margin: '0 0 8px',
          letterSpacing: '-0.02em', color: 'var(--text)',
          fontFamily: 'var(--font)',
        }}>
          {phase === 'questions' ? "Let's get you set up" : `Your plan \u2014 ${steps.length} steps, ~${totalTime} min`}
        </h1>
        {phase === 'questions' && (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 32px' }}>
            ~12 minutes \u00b7 No coding required
          </p>
        )}
        {phase === 'plan' && (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 24px' }}>
            Paste each prompt into Claude Cowork. Mark as done when complete.
          </p>
        )}

        {/* Phase 1: Questions */}
        {phase === 'questions' && (
          <div style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r-md)',
            padding: 24,
          }}>
            <h2 style={{
              fontSize: '0.75rem',
              color: 'var(--muted)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              margin: '0 0 20px',
              fontWeight: 600,
            }}>
              First, tell us about your setup
            </h2>

            <div style={{ marginBottom: 20 }}>
              <span style={fieldLabel}>Your computer</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={toggleBtnStyle(progress.os === 'windows')} onClick={() => update({ os: 'windows' })}>
                  Windows
                </button>
                <button style={toggleBtnStyle(progress.os === 'mac')} onClick={() => update({ os: 'mac' })}>
                  Mac
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <span style={fieldLabel}>VS Code installed?</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button style={toggleBtnStyle(progress.hasVscode === true)} onClick={() => update({ hasVscode: true })}>
                  Yes
                </button>
                <button style={toggleBtnStyle(progress.hasVscode === false)} onClick={() => update({ hasVscode: false })}>
                  Not yet
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <span style={fieldLabel}>GitHub account?</span>
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
              onMouseEnter={e => { if (canGenerate) e.currentTarget.style.filter = 'brightness(1.1)'; }}
              onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
              style={{
                width: '100%',
                padding: 14,
                background: canGenerate ? 'var(--accent)' : 'var(--border)',
                color: canGenerate ? 'var(--bg)' : 'var(--muted)',
                border: 'none',
                borderRadius: 'var(--r-md)',
                fontSize: '0.95rem',
                fontWeight: 700,
                fontFamily: 'var(--font)',
                cursor: canGenerate ? 'pointer' : 'not-allowed',
                transition: 'filter 0.15s ease',
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
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>Progress</span>
                <span style={{
                  color: 'var(--text)', fontSize: '0.8rem',
                  fontFamily: 'var(--mono)',
                }}>
                  {completedCount}/{steps.length}
                </span>
              </div>
              <div style={{
                background: 'var(--border)',
                borderRadius: 'var(--r-full)',
                height: 6,
                overflow: 'hidden',
              }}>
                <div style={{
                  width: steps.length > 0 ? `${(completedCount / steps.length) * 100}%` : '0%',
                  height: '100%',
                  background: 'var(--tier-0)',
                  borderRadius: 'var(--r-full)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>

            {/* Reset link */}
            <div style={{ marginBottom: 16, textAlign: 'right' }}>
              <button
                onClick={() => { setPhase('questions'); update({ completedSteps: [] }); }}
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--muted)', cursor: 'pointer',
                  fontSize: '0.8rem', textDecoration: 'underline',
                  fontFamily: 'var(--font)',
                }}
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
                  style={{
                    background: 'var(--surface-2)',
                    border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--r-md)',
                    padding: 20,
                    marginBottom: 12,
                    opacity: isDone ? 0.65 : 1,
                    transition: 'opacity 0.2s ease, border-color 0.2s ease',
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                    onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                  >
                    <span style={{
                      flexShrink: 0, fontSize: '1.1rem', width: 24, textAlign: 'center',
                      color: isDone ? 'var(--tier-0)' : isCurrent ? 'var(--accent)' : 'var(--muted)',
                    }}>
                      {isDone ? '\u2713' : isCurrent ? '\u25CF' : '\u25CB'}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text)' }}>
                        {step.conditional ? '' : `Step ${idx + 1 - steps.filter((s, j) => j < idx && s.conditional).length}  `}
                        {step.title}
                      </div>
                    </div>
                    <span style={{
                      color: 'var(--muted)', fontSize: '0.8rem',
                      flexShrink: 0, fontFamily: 'var(--mono)',
                    }}>
                      {step.time}
                    </span>
                    <span style={{
                      fontSize: '0.7rem', color: 'var(--muted)',
                      transform: isExpanded ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s',
                    }}>
                      {'\u25BC'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div style={{
                      marginTop: 16, paddingTop: 16,
                      borderTop: '1px solid var(--border)',
                    }}>
                      {!step.prompt && step.link && (
                        <div>
                          <a href={step.link.url} target="_blank" rel="noopener" style={{
                            color: 'var(--accent)', fontSize: '0.9rem', fontWeight: 500,
                          }}>
                            {step.link.label} \u2192
                          </a>
                          <p style={{
                            color: 'var(--muted)', fontSize: '0.8rem', marginTop: 10, margin: '10px 0 0',
                          }}>
                            Create your free account, then come back and mark this step as done.
                          </p>
                        </div>
                      )}

                      {step.prompt && (
                        <>
                          <div style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap',
                          }}>
                            <span style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>
                              Paste in:{' '}
                              <strong style={{ color: 'var(--text)', fontWeight: 500 }}>
                                {step.pasteTarget}
                              </strong>
                            </span>
                            <CopyPromptBtn text={step.prompt} />
                          </div>
                          <pre style={{
                            background: 'var(--bg)',
                            border: '1px solid var(--border)',
                            borderRadius: 'var(--r-sm)',
                            padding: 14,
                            fontSize: '0.78rem',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                            maxHeight: 220,
                            overflow: 'auto',
                            margin: 0,
                            color: 'var(--cream)',
                            fontFamily: 'var(--mono)',
                            lineHeight: 1.6,
                          }}>
                            {step.prompt}
                          </pre>
                          {step.link && (
                            <a
                              href={step.link.url}
                              target="_blank"
                              rel="noopener"
                              style={{
                                fontSize: '0.8rem',
                                display: 'inline-block',
                                marginTop: 10,
                                color: 'var(--accent)',
                              }}
                            >
                              {step.link.label} \u2192
                            </a>
                          )}
                        </>
                      )}

                      <button
                        onClick={(e) => { e.stopPropagation(); toggleComplete(step.id); }}
                        onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                        onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
                        style={{
                          marginTop: 14,
                          background: isDone ? 'var(--surface)' : 'var(--accent)',
                          color: isDone ? 'var(--muted)' : 'var(--bg)',
                          border: isDone ? '1px solid var(--border)' : 'none',
                          borderRadius: 'var(--r-sm)',
                          padding: '7px 18px',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          fontFamily: 'var(--font)',
                          transition: 'filter 0.15s ease',
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
              <div style={{
                textAlign: 'center',
                padding: 28,
                border: '1px solid var(--accent)',
                borderRadius: 'var(--r-md)',
                background: 'rgba(232,136,138,0.06)',
                marginTop: 12,
              }}>
                <div style={{ fontSize: '2rem', marginBottom: 8 }}>🐮</div>
                <h2 style={{
                  color: 'var(--accent)', margin: '0 0 8px',
                  fontSize: '1.25rem', fontWeight: 700,
                  fontFamily: 'var(--font)',
                }}>
                  Setup complete!
                </h2>
                <p style={{
                  color: 'var(--muted)', margin: '0 0 20px',
                  fontSize: '0.9rem', lineHeight: 1.6,
                }}>
                  Your mooter installation is ready. Check your dashboard for live savings data.
                </p>
                <a
                  href="/dashboard"
                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
                  onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
                  style={{
                    display: 'inline-block',
                    background: 'var(--accent)',
                    color: 'var(--bg)',
                    padding: '12px 28px',
                    borderRadius: 'var(--r-md)',
                    fontWeight: 700,
                    textDecoration: 'none',
                    fontSize: '0.95rem',
                    fontFamily: 'var(--font)',
                    transition: 'filter 0.15s ease',
                  }}
                >
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

const fieldLabel: React.CSSProperties = {
  display: 'block',
  marginBottom: 10,
  fontSize: '0.75rem',
  color: 'var(--muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontWeight: 600,
};
