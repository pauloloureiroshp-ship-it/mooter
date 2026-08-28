'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import Cartucho from '@/components/Cartucho';
import MonoNum from '@/components/MonoNum';
import { CrookOutline } from '@/components/PastorCrook';
import versionInfo from '@/app/version.json';

// Animated bar that grows to `pct` only while visible, settling instantly when
// the OS prefers reduced motion. transform-only (scaleX) — no layout thrash.
// A curva e a da familia (.16,1,.3,1) — era 0.22,1,0.36,1, que e uma quinta
// curva a mais numa linguagem que declara ter quatro.
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
          transition: 'transform 700ms cubic-bezier(.16,1,.3,1)',
        }}
      />
    </div>
  );
}

/**
 * Um grupo do desenho — o mesmo da folha 002. Era um `<Card>`: fundo proprio e
 * raio 14, ou seja uma CAIXA, que e o que a direccao de 2026-08-27 tirou da
 * linguagem. O que separa passa a ser a hairline; o rotulo passa a ser mono em
 * caixa-alta (`.moo-label`) e nao o eyebrow rosa — o rosa fica para as cotas e
 * para o CTA.
 */
function Grupo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
      <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>{rotulo}</div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

/** O bloco de terminal — mono sobre o fundo de terminal, como na folha 002. */
const TERM: CSSProperties = {
  margin: 0, fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-term-fg)',
  background: 'var(--color-term-bg)', border: '1px solid var(--color-term-border)',
  borderRadius: 8, padding: '14px 16px', whiteSpace: 'pre', overflowX: 'auto',
};

export default function UnderTheHoodPage() {
  return (
    <section style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }} className="m-pad m-pad-y">
      {/* A grelha de 8px, faint — papel milimetrico, nao um campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />

      {/* O cartucho identifica a folha antes de qualquer conteudo. A revisao vem
          de version.json, escrito pelo version-sync a partir da tag. */}
      <Cartucho o_que="POR DENTRO" desenho="007" revisao={`v${versionInfo.version}`} data="2026-08-27" />

      {/* O UNICO momento extremo da folha (regra 10). Um. */}
      <div style={{ position: 'relative', padding: '48px 0 0' }}>
        <h1 className="moo-h1" style={{ margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <CrookOutline size={40} /> Two ideas you don&apos;t need a PhD to use.
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: 0 }}>
          Quantization is what makes local-first routing work today. DoRA is where it goes next — 30 seconds each.
        </p>
      </div>

      {/* §7.1 Quantization — a margem e telegrafica: o que a seccao E, o numero
          que a governa, a ressalva. Nunca prosa, e nunca dentro de um cartao. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          quantization
          <b>18 GB</b>
          qwen3:30b at Q4_K_M — down from 120 GB
        </div>
        <div className="uth-row m-stack" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 28, alignItems: 'start' }}>
          <div>
            <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.15, margin: '0 0 12px' }}>Why your laptop can run Opus-grade models now</h2>
            <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65, margin: 0 }}>
              Full-precision AI models are huge. A 30-billion-parameter model in 32-bit floats weighs 120GB — too big
              for your GPU. Quantization compresses the model&apos;s numbers to 4-bit integers, shrinking it to 18GB while
              keeping ~98% of the quality. The same model now runs on your RTX 4090 instead of a data center. Mooter
              prefers quantized local models for T0 whenever quality stays above the bar — saving you money without
              trading off the answer.
            </p>
            {/* A comparacao de tamanhos. Era um cartao com fundo proprio; passa a
                grupo com hairline — o mesmo que separa as seccoes. */}
            <div style={{ marginTop: 20 }}>
              <Grupo rotulo="o mesmo modelo, dois pesos">
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
              </Grupo>
            </div>
          </div>
          <pre style={TERM}>{`Quantization in mooter

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
        </div>
      </div>

      {/* 2026 local frontier */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          local frontier
          <b>4 models</b>
          vendor figures — not measured here
        </div>
        <p style={{ color: 'var(--color-muted)', fontSize: 15.5, lineHeight: 1.7, maxWidth: 780, margin: 0 }}>
          The local frontier moves fast. As of 2026, notable local-capable coding models include{' '}
          <strong>Qwen3-Coder-Next</strong> (~58.7% SWE-bench Verified), <strong>GLM-5</strong> (~77.8%),{' '}
          <strong>DeepSeek V3.2</strong>, and <strong>Llama 4 Scout</strong> (10M-token context). Those are{' '}
          <em>vendor/community-reported</em> numbers — not mooter benchmarks; check each model card before relying on them.
          mooter routes T0 to whatever you&apos;ve pulled: the default stays the dependable <code>qwen2.5-coder</code>,
          and if you pull a stronger model mooter uses it automatically — no config change.
        </p>
      </div>

      {/* §7.2 + §7.2b LoRA / DoRA — mesmo assunto, uma so margem a governa. */}
      <div className="moo-secao m-stack" id="forge">
        <div className="moo-marg">
          lora · dora
          <b>0 adapters</b>
          never trained — literature targets
        </div>
        <div>
          <div className="uth-row m-stack" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 28, alignItems: 'start' }}>
            <div>
              <h2 style={{ fontSize: 26, fontWeight: 600, letterSpacing: '-0.025em', lineHeight: 1.15, margin: '0 0 12px' }}>Specialize the brain on your code — the plan, not a promise.</h2>
              <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65, margin: 0 }}>
                A 7-billion-parameter model knows a lot — but it doesn&apos;t know <em style={{ color: 'var(--color-text)' }}>your</em> codebase.
                Re-training from scratch would take weeks and a cluster. LoRA (Low-Rank Adaptation) lets you train a tiny &apos;patch&apos; — usually under
                100MB — that adjusts the model toward your specific style, your conventions, your domain. DoRA is the 2024
                refinement: it separates <em>how much</em> the patch moves a weight from <em>which direction</em>, which
                makes the adapter sharper for the same compute budget. Adapter Forge — training a DoRA adapter on your own
                repo, on your own GPU — is planned for Wave 5 and <strong>is not shipped</strong>. Mooter has never trained
                an adapter, and today every install runs on the baseline model. Numbers below are targets from the
                published DoRA/Unsloth literature, not measurements of Mooter.
              </p>
              {/* O diagrama do adaptador. Sem fundo proprio, sem raio grande e sem
                  rosa: o rosa e das cotas, e este numero e um alvo, nao uma medicao. */}
              <div style={{ marginTop: 20 }}>
                <Grupo rotulo="onde o adaptador entra">
                  <div style={{ border: '1px dashed var(--color-border-light)', borderRadius: 8, padding: 16, position: 'relative', marginTop: 12 }}>
                    <div style={{ position: 'absolute', top: -9, left: 14, padding: '0 8px', background: 'var(--color-bg)', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--color-muted)' }}>base model · frozen · 7B params · 5 GB</div>
                    <div style={{ margin: '10px 0', border: '1px solid var(--color-border-light)', borderRadius: 6, padding: '14px 16px' }}>
                      <div style={{ fontFamily: 'var(--mono)', fontWeight: 600, fontSize: 13, color: 'var(--color-text)' }}>LoRA adapter · your code</div>
                      <div style={{ fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--color-muted)', marginTop: 2 }}>r=32 · ~80 MB · ~4h — target, not measured</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', marginTop: 10, fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-muted)' }}>↓</div>
                  <div style={{ textAlign: 'center', marginTop: 6, fontSize: 13, color: 'var(--color-text)' }}>Output specialized to your repo</div>
                </Grupo>
              </div>
            </div>

            {/* Wave 5 Adapter Forge — era um cartao com gradiente rosa. Passa a
                grupo com hairline: o que esta por expedir nao ganha o unico
                momento de cor da folha. */}
            <Grupo rotulo="Wave 5 · Adapter Forge">
              <h3 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '0 0 4px' }}>Train your code&apos;s brain.</h3>
              <p style={{ fontSize: 14, color: 'var(--color-muted)', margin: '0 0 16px' }}>Locally. Overnight. ToS-safe.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
                {[
                  'Self-distillation on your repo',
                  'DoRA r=32 + Unsloth',
                  'Qwen3-14B base',
                  'Eval harness vs Sonnet',
                  'Hot-swap via vLLM',
                  'Your code never leaves your machine',
                ].map((item) => (
                  <div key={item} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                    <span aria-hidden style={{ color: 'var(--color-muted)' }}>·</span>
                    <span style={{ color: 'var(--color-text)' }}>{item}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 14, borderTop: '1px solid var(--color-border)', fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--color-muted)' }}>
                <div>Eligibility · <span style={{ color: 'var(--color-text)' }}>30 days of mooter use</span> + <span style={{ color: 'var(--color-text)' }}>≥200 logged decisions</span></div>
                <div>Est. time · <span style={{ color: 'var(--color-text)' }}>3–6 hours</span> on RTX 4090</div>
                <div>Est. gain · <span style={{ color: 'var(--color-text)' }}>+12pp</span> quality on domain prompts — target, not measured</div>
                <div style={{ color: 'var(--color-yellow)', marginTop: 6 }}>status · in development · expected Q3 2026</div>
              </div>
            </Grupo>
          </div>

          {/* §7.2b — DoRA decomposition diagram + citations */}
          <div style={{ marginTop: 32 }}>
            <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 10 }}>How a DoRA adapter decomposes a weight</h3>
            <svg role="img" aria-label="LoRA and DoRA weight decomposition" viewBox="0 0 720 150" style={{ maxWidth: 720, width: '100%', height: 'auto' }}>
              <style>{`.lbl{font:13px var(--mono,monospace);fill:var(--color-text)}.dim{font:11px var(--mono,monospace);fill:var(--color-muted)}`}</style>
              <rect x="16" y="50" width="120" height="48" rx="6" fill="none" stroke="var(--color-border-light)" />
              <text x="76" y="72" textAnchor="middle" className="lbl">W₀</text>
              <text x="76" y="88" textAnchor="middle" className="dim">frozen</text>
              <text x="150" y="80" textAnchor="middle" className="lbl">+</text>
              {/* A unica cota do desenho: o que o adaptador acrescenta. */}
              <rect x="172" y="50" width="150" height="48" rx="6" fill="none" className="moo-cota" />
              <text x="247" y="72" textAnchor="middle" className="lbl">B · A</text>
              <text x="247" y="88" textAnchor="middle" className="dim">rank-r update (LoRA)</text>
              <text x="345" y="80" textAnchor="middle" className="dim">→ DoRA splits it:</text>
              <rect x="470" y="24" width="110" height="40" rx="6" fill="none" stroke="var(--color-border-light)" />
              <text x="525" y="48" textAnchor="middle" className="lbl">magnitude m</text>
              <rect x="470" y="86" width="110" height="40" rx="6" fill="none" stroke="var(--color-border-light)" />
              <text x="525" y="110" textAnchor="middle" className="lbl">direction Ŵ</text>
              <text x="640" y="80" textAnchor="middle" className="dim">trained</text>
              <text x="640" y="96" textAnchor="middle" className="dim">separately</text>
            </svg>
            <p style={{ color: 'var(--color-muted)', fontSize: 14.5, lineHeight: 1.7, marginTop: 12, maxWidth: 780 }}>
              LoRA freezes the base weight <code>W₀</code> and learns a low-rank update <code>B·A</code> (rank r). DoRA
              additionally decomposes that update into a <em>magnitude</em> and a normalized <em>direction</em>, training
              them separately — sharper adapters at the same rank. Implementation reference:{' '}
              <a href="https://huggingface.co/docs/peft" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>HuggingFace PEFT</a>.
              As of 2026, fused Triton kernels (e.g. Unsloth&apos;s fused LoRA/DoRA) cut training memory and roughly double
              throughput vs the naïve implementation — which is what would make an overnight RTX 4090 run feasible when
              Adapter Forge ships.
            </p>
          </div>
        </div>
      </div>

      {/* §7.3 — How the router decides (classify.js + hook) */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          the router decides
          <b>~17%</b>
          only the long tail reaches the arbiter
        </div>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 10px' }}>How the router decides — <code>classify.js</code> + the hook</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65, maxWidth: 820, margin: 0 }}>
            Mooter is a Claude Code <strong>UserPromptSubmit hook</strong>, not a proxy. Every prompt passes through{' '}
            <code>inject_context.js</code> (the hook entry) <em>before</em> Claude Code sees it; the hook runs{' '}
            <code>classify.js</code> and emits a <code>&lt;router-hint&gt;</code> + a <code>&lt;tier-badge&gt;</code>. If the
            hook errors, Claude Code proceeds unchanged — routing never blocks you.
          </p>
          <pre style={{ ...TERM, marginTop: 16, whiteSpace: 'pre-wrap' }}>{`prompt
  │
  ▼  UserPromptSubmit hook            inject_context.js
  ▼  pattern match (4 regex banks)    patterns.js  — HIGH / MED / LOW / TRIVIAL risk
  ▼  complexity score → tier T0–T3    classify.js  — TUNED thresholds
  ▼  safety guard                     classify.js  — HIGH_RISK never downgrades (deploy/migration)
  ▼  low confidence? semantic check   arbiter.js   — Haiku arbiter (long-tail only)
  ▼  emit hint + badge                <router-hint> · <tier-badge>
  │
  ▼  Claude Code runs the chosen model`}</pre>
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
      </div>

      {/* §7.4 — Familiarity bridge: Claude Dynamic Workflows ↔ Mooter Moos */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          dynamic workflows
          <b>16 in parallel</b>
          cap set by Anthropic — yours is the GPU
        </div>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 10px' }}>Dynamic Workflows, made visible — the herd 🐄</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65, maxWidth: 820, margin: 0 }}>
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
                <tr style={{ textAlign: 'left', color: 'var(--moo-faint)' }}>
                  <th className="moo-label" style={{ padding: '8px 10px' }}>Capability</th>
                  <th className="moo-label" style={{ padding: '8px 10px' }}>Claude Dynamic Workflows</th>
                  <th className="moo-label" style={{ padding: '8px 10px' }}>Mooter Moos 🐄</th>
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
      </div>

      {/* §7.5 — opt-in performance backends, honest scope */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          opt-in backends
          <b>3</b>
          none enabled by default
        </div>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 10px' }}>Newer, faster local backends — opt-in, never default</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: 16, lineHeight: 1.65, maxWidth: 820, margin: 0 }}>
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
      </div>

      <style>{`@media (max-width: 900px){ .uth-row{ grid-template-columns: 1fr !important; } }`}</style>
    </section>
  );
}
