'use client';

import { useEffect, useRef, useState } from 'react';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import MonoNum from '@/components/MonoNum';
import { CrookOutline } from '@/components/PastorCrook';
import versionInfo from '@/app/version.json';

// Animated bar that grows to `pct` only while visible, settling instantly when
// the OS prefers reduced motion. transform-only (scaleX) — no layout thrash.
function GrowBar({ pct, color }: { pct: number; color: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setGrown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => setGrown(entry.isIntersecting),
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ height: 14, background: 'var(--color-bg)', border: '1px solid var(--color-border)', borderRadius: 4, overflow: 'hidden' }}>
      <div
        style={{
          width: `${pct}%`, height: '100%', background: color,
          transform: grown ? 'scaleX(1)' : 'scaleX(0)', transformOrigin: 'left',
          transition: 'transform 700ms cubic-bezier(0.22,1,0.36,1)',
        }}
      />
    </div>
  );
}

export default function UnderTheHoodPage() {
  return (
    <section style={{ maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }} className="m-pad m-pad-y">
      <Eyebrow>Under the hood · Smart routing. Mooter routes.</Eyebrow>
      <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.05, margin: '0 0 8px', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        <CrookOutline size={34} /> Two ideas you don&apos;t need a PhD to use.
      </h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 660, marginBottom: 48 }}>
        Quantization and DoRA make local-first routing work without trading off the answer — 30 seconds each.
      </p>

      {/* §7.1 Quantization */}
      <div className="uth-row m-stack" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 28, alignItems: 'start', marginBottom: 64 }}>
        <div>
          <Eyebrow>01 · Quantization</Eyebrow>
          <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1, margin: '0 0 6px' }}>Why your laptop can run Opus-grade models now</h2>
          <div style={{ color: 'var(--color-accent-2)', fontSize: 13, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>quantization, in 30 seconds</div>
          <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65 }}>
            Full-precision AI models are huge. A 30-billion-parameter model in 32-bit floats weighs 120GB — too big
            for your GPU. Quantization compresses the model&apos;s numbers to 4-bit integers, shrinking it to 18GB while
            keeping ~98% of the quality. The same model now runs on your RTX 4090 instead of a data center. Mooter
            prefers quantized local models for T0 whenever quality stays above the bar — saving you money without
            trading off the answer.
          </p>
          {/* visual size comparison (animated, reduced-motion safe) */}
          <Card style={{ marginTop: 20, background: 'var(--color-surface-2)' }} padding={16}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, fontFamily: 'var(--mono)' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                  <span>qwen3:30b <span style={{ color: 'var(--color-muted)' }}>(full precision FP32)</span></span>
                  <span style={{ color: 'var(--color-tier-3)' }}>120 GB</span>
                </div>
                <GrowBar pct={100} color="var(--color-tier-3)" />
                <div style={{ fontSize: 11, color: 'var(--color-tier-3)', marginTop: 4 }}>✗ doesn&apos;t fit your GPU</div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                  <span>qwen3:30b <span style={{ color: 'var(--color-muted)' }}>(quantized Q4_K_M)</span></span>
                  <span style={{ color: 'var(--color-green)' }}>18 GB</span>
                </div>
                <GrowBar pct={15} color="var(--color-green)" />
                <div style={{ fontSize: 11, color: 'var(--color-green)', marginTop: 4 }}>✓ fits 24GB GPU · <MonoNum color="var(--color-green)">~98%</MonoNum> quality</div>
              </div>
            </div>
          </Card>
        </div>
        <Card accent padding={26}>
          <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-muted)', whiteSpace: 'pre-wrap' }}>{`Quantization in mooter

T0 models (local, free)        Q4_K_M default
├─ qwen2.5-coder:7b            5 GB · code
├─ qwen3:30b                   18 GB · reasoning
├─ gemma3:12b                  7 GB · general
└─ deepseek-r1:7b              4 GB · math

T1–T3 models                   served by provider
                               quantization handled cloud-side

Quality delta (T0 quantized vs FP32):
  qwen2.5-coder    -1.8pp
  qwen3:30b        -1.2pp
  gemma3:12b       -2.4pp

Source: mooter benchmark, 34 prompts × 3 arms, blind judge`}</pre>
        </Card>
      </div>

      {/* 2026 local frontier */}
      <div style={{ marginTop: 8, marginBottom: 8 }}>
        <p style={{ color: 'var(--color-muted)', fontSize: 14.5, lineHeight: 1.7, maxWidth: 780 }}>
          The local frontier moves fast. As of 2026, notable local-capable coding models include{' '}
          <strong>Qwen3-Coder-Next</strong> (~58.7% SWE-bench Verified), <strong>GLM-5</strong> (~77.8%),{' '}
          <strong>DeepSeek V3.2</strong>, and <strong>Llama 4 Scout</strong> (10M-token context). Those are{' '}
          <em>vendor/community-reported</em> numbers — not mooter benchmarks; check each model card before relying on them.
          mooter routes T0 to whatever you&apos;ve pulled: the default stays the dependable <code>qwen2.5-coder</code>,
          and if you pull a stronger model mooter uses it automatically — no config change.
        </p>
      </div>

      {/* §7.2 LoRA / DoRA */}
      <div className="uth-row m-stack" id="forge" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 28, alignItems: 'start', marginTop: 56 }}>
        <div>
          <Eyebrow>02 · LoRA / DoRA</Eyebrow>
          <h2 style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.025em', lineHeight: 1.1, margin: '0 0 6px' }}>Specialize the brain on your code — locally, overnight.</h2>
          <div style={{ color: 'var(--color-accent-2)', fontSize: 13, fontFamily: 'var(--mono)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>LoRA and DoRA, in 30 seconds</div>
          <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65 }}>
            A 7-billion-parameter model knows a lot — but it doesn&apos;t know <em style={{ color: 'var(--color-accent)' }}>your</em> codebase.
            Re-training from scratch would take weeks and a cluster. LoRA (Low-Rank Adaptation) lets you train a tiny &apos;patch&apos; — usually under
            100MB — that adjusts the model toward your specific style, your conventions, your domain. DoRA is the 2024
            refinement: it separates <em>how much</em> the patch moves a weight from <em>which direction</em>, which
            makes the adapter sharper for the same compute budget. Mooter&apos;s Wave 5 trains a DoRA r=32 adapter on your
            repo locally on your RTX 4090 in 3-6 hours, overnight. Activate it in your terminal. Your code never leaves
            your machine.
          </p>
          {/* adapter diagram */}
          <Card style={{ marginTop: 20, background: 'var(--color-surface-2)' }} padding={20}>
            <div style={{ border: '1.5px dashed var(--color-border-light)', borderRadius: 10, padding: 16, position: 'relative' }}>
              <div style={{ position: 'absolute', top: -10, left: 14, padding: '2px 8px', background: 'var(--color-surface-2)', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--color-muted)' }}>base model · frozen · 7B params · 5 GB</div>
              <div style={{ margin: '10px 0', border: '1.5px solid var(--color-accent)', borderRadius: 8, padding: '14px 16px', background: 'var(--color-accent-08)' }}>
                <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 13, color: 'var(--color-accent)' }}>LoRA adapter · your code</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--color-muted)', marginTop: 2 }}>r=32 · ~80 MB · trained ~4h</div>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 10, fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-muted)' }}>↓</div>
            <div style={{ textAlign: 'center', marginTop: 6, fontSize: 13, color: 'var(--color-text)' }}>Output specialized to <span style={{ color: 'var(--color-accent)' }}>your repo</span></div>
          </Card>
        </div>
        {/* Wave 5 Adapter Forge card */}
        <Card accent padding={26} style={{ background: 'linear-gradient(135deg, var(--color-accent-08), transparent 60%)' }}>
          <Eyebrow>Coming Wave 5 · Adapter Forge</Eyebrow>
          <h3 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, margin: '6px 0 6px' }}>Train your code&apos;s brain.</h3>
          <p style={{ fontSize: 14, color: 'var(--color-text)', marginBottom: 18 }}>Locally. Overnight. ToS-safe.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
            {[
              'Self-distillation on your repo',
              'DoRA r=32 + Unsloth',
              'Qwen3-14B base',
              'Eval harness vs Sonnet',
              'Hot-swap via vLLM',
              'Your code never leaves your machine',
            ].map((item) => (
              <div key={item} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                <span aria-hidden style={{ color: 'var(--color-green)' }}>✓</span>
                <span style={{ color: 'var(--color-text)' }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 14, borderTop: '1px solid var(--color-accent-25)', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--color-muted)' }}>
            <div>Eligibility · <span style={{ color: 'var(--color-text)' }}>30 days of mooter use</span> + <span style={{ color: 'var(--color-text)' }}>≥200 logged decisions</span></div>
            <div>Est. time · <span style={{ color: 'var(--color-text)' }}>3–6 hours</span> on RTX 4090</div>
            <div>Est. gain · <span style={{ color: 'var(--color-green)' }}>+12pp</span> quality on domain prompts</div>
          </div>
          <div style={{ marginTop: 16, padding: '8px 12px', background: 'rgba(212,192,144,0.08)', border: '1px solid rgba(212,192,144,0.3)', borderRadius: 6, fontSize: 11.5, color: 'var(--color-yellow)', fontFamily: 'var(--mono)' }}>
            status · in development · expected Q3 2026
          </div>
        </Card>
      </div>

      {/* §7.2b — DoRA decomposition diagram + citations */}
      <div style={{ marginTop: 44 }}>
        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>How a DoRA adapter decomposes a weight</h3>
        <svg role="img" aria-label="LoRA and DoRA weight decomposition" viewBox="0 0 720 150" style={{ maxWidth: 720, width: '100%', height: 'auto', border: '1px solid var(--color-border)', borderRadius: 10, background: 'var(--color-surface)' }}>
          <style>{`.lbl{font:13px var(--mono,monospace);fill:var(--color-text)}.dim{font:11px var(--mono,monospace);fill:var(--color-muted)}`}</style>
          <rect x="16" y="50" width="120" height="48" rx="6" fill="none" stroke="var(--color-muted)" />
          <text x="76" y="72" textAnchor="middle" className="lbl">W₀</text>
          <text x="76" y="88" textAnchor="middle" className="dim">frozen</text>
          <text x="150" y="80" textAnchor="middle" className="lbl">+</text>
          <rect x="172" y="50" width="150" height="48" rx="6" fill="none" stroke="var(--color-accent)" />
          <text x="247" y="72" textAnchor="middle" className="lbl">B · A</text>
          <text x="247" y="88" textAnchor="middle" className="dim">rank-r update (LoRA)</text>
          <text x="345" y="80" textAnchor="middle" className="dim">→ DoRA splits it:</text>
          <rect x="470" y="24" width="110" height="40" rx="6" fill="none" stroke="var(--color-accent-2)" />
          <text x="525" y="48" textAnchor="middle" className="lbl">magnitude m</text>
          <rect x="470" y="86" width="110" height="40" rx="6" fill="none" stroke="var(--color-accent-2)" />
          <text x="525" y="110" textAnchor="middle" className="lbl">direction Ŵ</text>
          <text x="640" y="80" textAnchor="middle" className="dim">trained</text>
          <text x="640" y="96" textAnchor="middle" className="dim">separately</text>
        </svg>
        <p style={{ color: 'var(--color-muted)', fontSize: 14.5, lineHeight: 1.7, marginTop: 12, maxWidth: 780 }}>
          LoRA freezes the base weight <code>W₀</code> and learns a low-rank update <code>B·A</code> (rank r). DoRA
          additionally decomposes that update into a <em>magnitude</em> and a normalized <em>direction</em>, training
          them separately — sharper adapters at the same rank. Implementation reference:{' '}
          <a href="https://huggingface.co/docs/peft" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-accent)' }}>HuggingFace PEFT</a>.
          As of 2026, fused Triton kernels (e.g. Unsloth&apos;s fused LoRA/DoRA) cut training memory and roughly double
          throughput vs the naïve implementation — which is what makes the overnight RTX 4090 run above feasible.
        </p>
      </div>

      {/* §7.3 — How the router decides (classify.js + hook) */}
      <div style={{ marginTop: 44 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, marginBottom: 6 }}>How the router decides — <code>classify.js</code> + the hook</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65, maxWidth: 820 }}>
          Mooter is a Claude Code <strong>UserPromptSubmit hook</strong>, not a proxy. Every prompt passes through{' '}
          <code>inject_context.js</code> (the hook entry) <em>before</em> Claude Code sees it; the hook runs{' '}
          <code>classify.js</code> and emits a <code>&lt;router-hint&gt;</code> + a <code>&lt;tier-badge&gt;</code>. If the
          hook errors, Claude Code proceeds unchanged — routing never blocks you.
        </p>
        <Card style={{ marginTop: 16 }}>
          <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--color-term-fg)', whiteSpace: 'pre-wrap' }}>{`prompt
  │
  ▼  UserPromptSubmit hook            inject_context.js
  ▼  pattern match (4 regex banks)    patterns.js  — HIGH / MED / LOW / TRIVIAL risk
  ▼  complexity score → tier T0–T3    classify.js  — TUNED thresholds
  ▼  safety guard                     classify.js  — HIGH_RISK never downgrades (deploy/migration)
  ▼  low confidence? semantic check   arbiter.js   — Haiku arbiter (long-tail only)
  ▼  emit hint + badge                <router-hint> · <tier-badge>
  │
  ▼  Claude Code runs the chosen model`}</pre>
        </Card>
        <p style={{ color: 'var(--color-muted)', fontSize: 14, lineHeight: 1.7, marginTop: 12, maxWidth: 820 }}>
          The pattern banks live in <code>patterns.js</code> (HIGH/MED/LOW/TRIVIAL), counted into{' '}
          <code>PATTERN_COUNT</code> (<code>classify.js</code>). User intent wins over the heuristic tier <em>except</em>{' '}
          when it would downgrade a HIGH_RISK prompt — mooter refuses to route a deploy or migration to a weaker model.
          The arbiter (a cheap Haiku call) only fires on the low-confidence long tail (~17% of prompts); the other ~83%
          stay on the zero-cost regex fast path. It&apos;s all open source — read{' '}
          <code>tools/router/classify.js</code>, <code>patterns.js</code>, <code>arbiter.js</code> and{' '}
          <code>inject_context.js</code> on GitHub.
        </p>
      </div>

      {/* §7.4 — Familiarity bridge: Claude Dynamic Workflows ↔ Mooter Moos */}
      <div style={{ marginTop: 44 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, marginBottom: 6 }}>Dynamic Workflows, made visible — the herd 🐄</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65, maxWidth: 820 }}>
          Anthropic shipped <strong>Dynamic Workflows</strong> in May 2026: Claude Code spawns up to 16 subagents in
          parallel (capped at 1000 per run) and fans your prompt across them. It&apos;s a great mental model — and
          mooter reuses it. The one gap Anthropic names in their own guidance is visibility:{' '}
          <em>&ldquo;no transparent intermediate output, making it challenging to monitor progress in real time.&rdquo;</em>{' '}
          The 16 agents in flight are a black box until the final answer lands.
        </p>
        <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65, maxWidth: 820, marginTop: 10 }}>
          A cloud orchestrator can&apos;t stream 16 live subagent logs without saturating your terminal and your bill.
          A <strong>local</strong> herd can: your GPU is right there, <code>Q4_K_M</code> Moos answer fast enough that the
          one-liner shows up <em>during</em> the work, and the hook owns the render moment. So mooter inverts the
          contract — <strong>the cheaper the work, the louder it speaks</strong>.
        </p>
        <div style={{ marginTop: 16, overflowX: 'auto' }} className="m-scroll-x">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--color-muted)' }}>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Capability</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Claude Dynamic Workflows</th>
                <th style={{ padding: '8px 10px', fontWeight: 600 }}>Mooter Moos 🐄</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Spawned per prompt', '✅ up to 16 concurrent', '✅ bounded by your hardware'],
                ['Subagent count visible during execution', '❌ hidden until final answer', '✅ 🐄×N live in the statusline'],
                ['Per-agent activity log', '❌ no transparent intermediate output', '✅ one line per spawn (standard verbosity)'],
                ['Per-agent latency', 'only after completion', '✅ live avg + Stop digest'],
                ['Where it runs', '☁ Anthropic cloud (Opus 4.8 orchestrator)', 'hybrid — orchestrator stays on Claude Code; workers can be local Moos'],
                ['Cost per spawn', 'Anthropic billing', '$0 for local Moos (your hardware)'],
                ['“Peak concurrent” stat', 'not surfaced', '✅ Stop digest: peak concurrent: N'],
              ].map((row, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '8px 10px' }}>{row[0]}</td>
                  <td style={{ padding: '8px 10px', color: 'var(--color-muted)' }}>{row[1]}</td>
                  <td style={{ padding: '8px 10px' }}>{row[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.7, marginTop: 12, maxWidth: 820 }}>
          <strong>Honest scope:</strong> mooter doesn&apos;t replace Dynamic Workflows — the orchestrator stays in
          Claude Code; Moos are the local workers it can fan to. We don&apos;t claim 1000 concurrent Moos (your effective
          cap is whatever your GPU holds, not Anthropic&apos;s cloud limit). We made <em>the local side of the same idea
          visible</em> — that&apos;s it.
        </p>
      </div>

      {/* §7.5 — opt-in performance backends, honest scope */}
      <div style={{ marginTop: 44 }}>
        <h2 style={{ fontSize: 28, fontWeight: 600, marginBottom: 6 }}>Newer, faster local backends — opt-in, never default</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65, maxWidth: 820 }}>
          The local-first path with the frozen classifier is what runs out of the box. On top of it, mooter ships
          three performance backends you can turn on when your hardware supports them — each is <strong>opt-in</strong>,
          and each falls back gracefully when it can&apos;t help.
        </p>
        <ul style={{ color: 'var(--color-muted)', fontSize: 15.5, lineHeight: 1.7, maxWidth: 820, marginTop: 12 }}>
          <li>
            <strong>3-bit KV cache (TurboQuant).</strong> Google DeepMind&apos;s TurboQuant (ICLR 2026, arXiv:2504.19874)
            shrinks the KV cache <strong>3.6–5.2×</strong> (model-dependent). It&apos;s <em>experimental</em> and built from
            source — mainline llama.cpp hasn&apos;t merged it — so mooter wraps the build and stays on stock inference until
            you enable it.
          </li>
          <li style={{ marginTop: 8 }}>
            <strong>Speculative decoding (EAGLE-3) via vLLM.</strong> A draft model proposes tokens the target verifies in
            parallel — <strong>2–2.5× faster</strong> on a GPU. mooter checks VRAM headroom first and falls back to plain
            vLLM when it&apos;s short.
          </li>
          <li style={{ marginTop: 8 }}>
            <strong>MiniMax M3, ready on day one.</strong> The weights aren&apos;t public yet (expected ~June 11, 2026). A
            watcher polls HuggingFace and offers a one-command Ollama install the moment they land — nothing downloads until
            you say so.
          </li>
        </ul>
        <p style={{ color: 'var(--color-muted)', fontSize: 13.5, lineHeight: 1.7, marginTop: 12, maxWidth: 820 }}>
          <strong>Honest scope:</strong> none of these are on by default, and none of them change which <em>tier</em> a
          prompt gets — <code>classify.js</code> still decides that, and its logic has been byte-frozen for 12 consecutive
          releases. They make the local side faster and lighter; the routing you trust is unchanged. Current build: mooter v{versionInfo.version}.
        </p>
      </div>

      <style>{`@media (max-width: 900px){ .uth-row{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
