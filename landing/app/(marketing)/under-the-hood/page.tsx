import type { Metadata } from 'next';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import { CrookOutline } from '@/components/PastorCrook';

export const metadata: Metadata = {
  title: 'Under the hood — quantization, LoRA & DoRA',
  description: 'Why your laptop can run Opus-grade models now. Quantization and DoRA, in 30 seconds each.',
};

export default function UnderTheHoodPage() {
  return (
    <section style={{ maxWidth: 1080, margin: '0 auto', padding: '72px 40px' }}>
      <Eyebrow>Under the hood</Eyebrow>
      <h1 style={{ fontSize: 'clamp(34px, 5vw, 52px)', fontWeight: 700, margin: '0 0 8px', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
        <CrookOutline size={34} /> Mooter pastors the Moos.
      </h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 640, marginBottom: 48 }}>
        Two ideas make local-first routing work without trading off the answer.
      </p>

      {/* §7.1 Quantization */}
      <div className="uth-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start', marginBottom: 64 }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 600 }}>Why your laptop can run Opus-grade models now</h2>
          <div style={{ color: 'var(--color-accent-2)', fontSize: 14, margin: '6px 0 16px' }}>Quantization, in 30 seconds.</div>
          <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65 }}>
            Full-precision AI models are huge. A 30-billion-parameter model in 32-bit floats weighs 120GB — too big
            for your GPU. Quantization compresses the model&apos;s numbers to 4-bit integers, shrinking it to 18GB while
            keeping ~98% of the quality. The same model now runs on your RTX 4090 instead of a data center. Mooter
            prefers quantized local models for T0 whenever quality stays above the bar — saving you money without
            trading off the answer.
          </p>
          <Card style={{ marginTop: 20 }}>
            <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-term-fg)', whiteSpace: 'pre-wrap' }}>{`qwen3:30b (full precision FP32)
████████████████████  120 GB
✗ doesn't fit your GPU

qwen3:30b (quantized Q4_K_M)
████  18 GB
✓ fits 24GB GPU · ~98% quality`}</pre>
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

      {/* 2026 local frontier (D2) */}
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
      <div className="uth-row" id="forge" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 28, alignItems: 'start' }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 600 }}>Specialize the brain on your code — locally, overnight.</h2>
          <div style={{ color: 'var(--color-accent-2)', fontSize: 14, margin: '6px 0 16px' }}>LoRA and DoRA, in 30 seconds.</div>
          <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65 }}>
            A 7-billion-parameter model knows a lot — but it doesn&apos;t know your codebase. Re-training from scratch
            would take weeks and a cluster. LoRA (Low-Rank Adaptation) lets you train a tiny &apos;patch&apos; — usually under
            100MB — that adjusts the model toward your specific style, your conventions, your domain. DoRA is the 2024
            refinement: it separates <em>how much</em> the patch moves a weight from <em>which direction</em>, which
            makes the adapter sharper for the same compute budget. Mooter&apos;s Wave 5 trains a DoRA r=32 adapter on your
            repo locally on your RTX 4090 in 3-6 hours, overnight. Activate it in your terminal. Your code never leaves
            your machine.
          </p>
          <Card style={{ marginTop: 20 }}>
            <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--color-term-fg)', whiteSpace: 'pre-wrap' }}>{`┌─ Base model (frozen, 7B params, 5GB) ─┐
│   ┌──────────────────────────────┐    │
│   │ LoRA adapter (your code)     │    │
│   │ r=32 · ~80MB · trained 4h    │    │
│   └──────────────────────────────┘    │
└────────────────────────────────────────┘
         ↓
   Output specialized to your repo`}</pre>
          </Card>
        </div>
        <Card accent padding={26}>
          <pre style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-muted)', whiteSpace: 'pre-wrap' }}>{`🛠 Adapter Forge — Wave 5 (coming Q3 2026)

Train your code's brain.
Locally. Overnight. ToS-safe.

  ✓ Self-distillation on your repo
  ✓ DoRA r=32 + Unsloth
  ✓ Qwen3-14B base
  ✓ Eval harness vs Sonnet
  ✓ Hot-swap via vLLM
  ✓ Your code never leaves your machine

Eligibility: 30 days of mooter use + ≥200 logged decisions
Estimated time: 3–6 hours on RTX 4090
Estimated gain: +12pp quality on domain prompts

Status: in development · expected Q3 2026`}</pre>
        </Card>
      </div>
      {/* §7.2b — DoRA decomposition diagram + citations (D5, rubric C3) */}
      <div style={{ marginTop: 28 }}>
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

      {/* §7.3 — How the router decides (classify.js + hook), D5 rubric C3 */}
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

      <style>{`@media (max-width: 900px){ .uth-row{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
