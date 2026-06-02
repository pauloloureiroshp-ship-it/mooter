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
      <style>{`@media (max-width: 900px){ .uth-row{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
