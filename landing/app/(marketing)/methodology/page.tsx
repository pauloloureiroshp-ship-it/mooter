'use client';

import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import Cartucho from '@/components/Cartucho';
import ProgressBar from '@/components/ProgressBar';
import ProviderLogo, { type Provider } from '@/components/ProviderLogo';
import { calculateSavings, type Hardware } from '@/lib/cost-calculator';
import { TIER_COLORS_WEB } from '@/lib/mooter-event';
import versionInfo from '@/app/version.json';

const HARDWARE: { id: Hardware; label: string; sub: string }[] = [
  { id: 'none', label: 'No discrete GPU', sub: 'MacBook Air, basic laptop, Chromebook' },
  { id: '8gb', label: '8 GB GPU', sub: 'RTX 3060/4060, M1 Pro 16GB' },
  { id: '16gb', label: '16 GB GPU', sub: 'RTX 4070, M2/M3 Pro 32GB' },
  { id: '24gb_plus', label: '24+ GB GPU', sub: 'RTX 4090, RTX 5090, M2/M3/M4 Max' },
];

const OS = [
  { id: 'macos', label: 'macOS', sub: 'Apple Silicon recommended' },
  { id: 'linux', label: 'Linux', sub: 'Ubuntu 22+ / Arch' },
  { id: 'windows', label: 'Windows', sub: 'WSL2 required' },
] as const;

type OsId = (typeof OS)[number]['id'];

const SUBS: { logo: Provider; name: string; plans: string[] }[] = [
  { logo: 'anthropic', name: 'Anthropic Claude', plans: ['Free', 'Pro', 'Max', 'Team', 'API'] },
  { logo: 'openai', name: 'OpenAI ChatGPT', plans: ['Free', 'Plus', 'Pro', 'Codex', 'API'] },
  // Google Gemini removed: calculator metrics fabricated; restore when backed by real data
];

const fmt = (n: number) => `$${n.toFixed(2)}`;

const TIER_META = [
  { t: 'T0', label: 'local · Ollama' },
  { t: 'T1', label: 'haiku · gpt-4o-mini' },
  { t: 'T2', label: 'sonnet · gpt-4o' },
  { t: 'T3', label: 'opus · o1-pro' },
] as const;

/**
 * Um grupo do desenho. Era um `<Card>` — fundo proprio e raio 14, ou seja uma
 * CAIXA, que e exactamente o que a direccao de 2026-08-27 tirou da linguagem.
 * O que separa passa a ser a hairline; o rotulo passa a ser mono em caixa-alta
 * (`.moo-label`) e nao o eyebrow rosa — o rosa fica reservado as cotas e ao CTA.
 */
function Grupo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
      <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>{rotulo}</div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

// reduced-motion-safe count-up: settles instantly when the OS asks for less motion.
function useCountUp(target: number, deps: unknown[]) {
  const [value, setValue] = useState(target);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setValue(target);
      return;
    }
    const from = value;
    const start = performance.now();
    const dur = 420;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(from + (target - from) * eased);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, deps);
  return value;
}

export default function MethodologyPage() {
  const [hardware, setHardware] = useState<Hardware>('24gb_plus');
  const [os, setOs] = useState<OsId>('macos');
  const [subs, toggleSub] = useReducer(
    (state: Record<Provider, boolean>, logo: Provider) => ({ ...state, [logo]: !state[logo] }),
    { anthropic: true, openai: true } as Record<Provider, boolean>,
  );
  const [promptsPerDay, setPromptsPerDay] = useState(80);
  const [pctCritical, setPctCritical] = useState(8);

  const r = calculateSavings({ hardware, promptsPerDay, pctCritical });

  const baseline = useCountUp(r.baseline_monthly, [r.baseline_monthly]);
  const withMooter = useCountUp(r.with_mooter_monthly, [r.with_mooter_monthly]);
  const saved = useCountUp(r.saved_monthly, [r.saved_monthly]);

  const stackRows: [string, string, 'ok' | 'no'][] = [
    [hardware === 'none' ? '—' : '✓', hardware === 'none' ? 'No local tier (no discrete GPU)' : `All local models (${HARDWARE.find((h) => h.id === hardware)?.label})`, hardware === 'none' ? 'no' : 'ok'],
    [subs.anthropic ? '✓' : '—', 'Sonnet & Opus (Anthropic)', subs.anthropic ? 'ok' : 'no'],
    [subs.openai ? '✓' : '—', 'GPT-4o (OpenAI)', subs.openai ? 'ok' : 'no'],
  ];

  return (
    <section style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }} className="m-pad m-pad-y">
      {/* A grelha de 8px, faint. Substitui o Dotgrid: a direccao fixada a
          2026-08-27 e papel milimetrico, e um desenho tecnico assenta numa
          grelha, nao num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />

      {/* O cartucho identifica a folha antes de qualquer conteudo. A revisao vem
          de version.json, escrito pelo version-sync a partir da tag. */}
      <Cartucho o_que="METHODOLOGY" desenho="002" revisao={`v${versionInfo.version}`} data="2026-08-27" />

      {/* O UNICO momento extremo da folha (regra 10). Um. */}
      <div style={{ position: 'relative', padding: '48px 0 0' }}>
        <h1 className="moo-h1" style={{ margin: '0 0 12px' }}>Show me my number.</h1>
        <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: 0 }}>
          Plug in your actual setup — hardware, OS, subscriptions, usage. Mooter projects your tier mix and monthly
          cost against the all-Opus baseline, computed live from the same per-tier costs as the benchmark below.
          Every routing decision is logged so you can verify it yourself.
        </p>
      </div>

      {/* A calculadora. A margem e telegrafica: o que a seccao E, o numero que a
          governa, a ressalva. Nunca prosa, e nunca dentro de um cartao. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          calculator
          <b>scenario</b>
          profile assumed by GPU class — not a measurement
        </div>

        <div className="calc-grid" style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 32, alignItems: 'start' }}>
          {/* LEFT — inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Grupo rotulo="Step 1 · Hardware">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {HARDWARE.map((h) => {
                  const sel = hardware === h.id;
                  return (
                    <label
                      key={h.id}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', cursor: 'pointer',
                        // 2026-08-28 · o estado seleccionado era um azulejo rosa:
                        // `background: var(--color-accent-12)` + `border: 1px solid
                        // var(--color-accent-25)`. Duas violações numa — fundo tingido (a
                        // direcção não tem caixas) e rosa fora dos três sítios que a regra
                        // permite: o `?` do wordmark, as cotas e o CTA. Um estado activo
                        // não é um CTA. É o mesmo padrão que saiu do RankingsExplorer nesta
                        // onda: o seleccionado diz-se com tinta e peso, e a hairline de
                        // baixo marca a linha.
                        // O `accentColor` do radio fica: é o controlo nativo a dizer que
                        // está ligado, e é a afordancia que o utilizador já conhece.
                        background: 'transparent',
                        borderBottom: `1px solid ${sel ? 'var(--color-text)' : 'var(--color-border)'}`,
                        transition: 'border-color 140ms cubic-bezier(.2,.8,.2,1)',
                      }}
                    >
                      <input
                        type="radio" name="hw" checked={sel} onChange={() => setHardware(h.id)}
                        style={{ accentColor: 'var(--color-accent)', flexShrink: 0 }}
                      />
                      <span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: sel ? 'var(--color-text)' : 'var(--color-muted)' }}>{h.label}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--color-muted)', marginTop: 2, fontFamily: 'var(--mono)' }}>{h.sub}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {hardware === 'none' ? (
                <p style={{ color: 'var(--color-yellow)', fontSize: 13, marginTop: 10 }}>
                  T0 local tier disabled. Mooter still routes T1/T2/T3 in the cloud.
                </p>
              ) : null}
            </Grupo>

            <Grupo rotulo="Step 2 · Operating system">
              <div style={{ display: 'flex', gap: 10 }}>
                {OS.map((o) => {
                  const sel = os === o.id;
                  return (
                    <button
                      key={o.id} type="button" onClick={() => setOs(o.id)} aria-pressed={sel}
                      style={{
                        flex: 1, padding: '12px 0', textAlign: 'left', cursor: 'pointer',
                        // 2026-08-28 · o estado seleccionado era um azulejo rosa:
                        // `background: var(--color-accent-12)` + `border: 1px solid
                        // var(--color-accent-25)`. Duas violações numa — fundo tingido (a
                        // direcção não tem caixas) e rosa fora dos três sítios que a regra
                        // permite: o `?` do wordmark, as cotas e o CTA. Um estado activo
                        // não é um CTA. É o mesmo padrão que saiu do RankingsExplorer nesta
                        // onda: o seleccionado diz-se com tinta e peso, e a hairline de
                        // baixo marca a linha.
                        // Aqui não há radio nativo, por isso leva `aria-pressed` — sem o
                        // azulejo, o estado tem de continuar a existir para quem não vê a
                        // tinta. O `fontWeight` do rótulo abaixo já mudava com `sel`.
                        background: 'transparent',
                        borderBottom: `1px solid ${sel ? 'var(--color-text)' : 'var(--color-border)'}`,
                        transition: 'border-color 140ms cubic-bezier(.2,.8,.2,1)',
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 600, color: sel ? 'var(--color-text)' : 'var(--color-muted)' }}>{o.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 3, fontFamily: 'var(--mono)' }}>{o.sub}</div>
                    </button>
                  );
                })}
              </div>
            </Grupo>

            <Grupo rotulo="Step 3 · Subscriptions">
              {SUBS.map((p) => {
                const on = subs[p.logo];
                return (
                  <button
                    key={p.name} type="button" onClick={() => toggleSub(p.logo)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 0', cursor: 'pointer',
                      background: 'transparent', border: 'none', borderBottom: '1px solid var(--color-border)', textAlign: 'left',
                    }}
                    aria-pressed={on}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 16, height: 16, borderRadius: 4, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, fontSize: 10, color: 'var(--color-bg)',
                        background: on ? 'var(--color-text)' : 'transparent',
                        border: on ? 'none' : '1px solid var(--color-border-light)',
                      }}
                    >
                      {on ? '✓' : ''}
                    </span>
                    <ProviderLogo provider={p.logo} size={20} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: on ? 'var(--color-text)' : 'var(--color-muted)' }}>{p.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, fontFamily: 'var(--mono)', color: 'var(--color-muted)' }}>
                      {on ? 'routing on' : 'off'}
                    </span>
                  </button>
                );
              })}
            </Grupo>

            <Grupo rotulo="Step 4 · Usage pattern">
              <label style={{ display: 'block', fontSize: 13, color: 'var(--color-muted)' }}>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                  Prompts per day <span className="num" style={{ color: 'var(--color-text)', fontWeight: 600 }}>{promptsPerDay}</span>
                </span>
                <input type="range" min={5} max={400} value={promptsPerDay} onChange={(e) => setPromptsPerDay(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
              </label>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--color-muted)', marginTop: 12 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between' }}>
                  % critical (T3) <span className="num" style={{ color: 'var(--color-text)', fontWeight: 600 }}>{pctCritical}%</span>
                </span>
                <input type="range" min={0} max={40} value={pctCritical} onChange={(e) => setPctCritical(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--color-accent)' }} />
              </label>
            </Grupo>
          </div>

          {/* RIGHT — live output. Era um cartao com gradiente rosa; passa a
              hairline, e o rosa so volta quando for cota ou CTA. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Grupo rotulo="Your monthly projection">
              <div className="calc-saida" style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>without mooter</div>
                  <div className="num" style={{ fontSize: 30, fontWeight: 600, color: 'var(--color-muted)', textDecoration: 'line-through', marginTop: 6 }}>{fmt(baseline)}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>all-Opus on every prompt</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>with mooter</div>
                  <div className="num" style={{ fontSize: 30, fontWeight: 600, color: 'var(--color-text)', marginTop: 6 }}>{fmt(withMooter)}</div>
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>mooter-routed</div>
                </div>
                <div style={{ flex: 1, textAlign: 'right' }}>
                  <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>difference</div>
                  <div className="num" style={{ fontSize: 30, fontWeight: 700, color: 'var(--color-text)', marginTop: 6 }}>{fmt(saved)}</div>
                  {/* 2026-08-28 · aqui renderizava-se `{r.saved_pct}%`. A ressalva
                      14px abaixo dizia, textualmente, «publishes no savings
                      percentage» — e a percentagem estava mesmo ali. Não é uma
                      questão de ênfase: a caixa contradizia-se a si própria em dois
                      elementos consecutivos. A diferença em dólares fica, porque é
                      a aritmética do cenário que o leitor acabou de configurar; o
                      rácio saía como conclusão sobre o produto, que é outra coisa. */}
                  <div style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 2 }}>in this scenario</div>
                </div>
              </div>
              {/*
                A ressalva vive AQUI, colada ao numero, e nao no fundo da pagina.
                Esta calculadora chegou a mostrar 92,6% enquanto o heroi da mesma
                landing publicava 47% — dois numeros para a mesma coisa, no mesmo
                site. A tabela de distribuicao por GPU que a alimenta nao vem de
                medicao nenhuma: e um cenario. Quem le o numero tem de ler isto.
              */}
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--color-border)', fontSize: 11.5, color: 'var(--color-muted)', lineHeight: 1.55 }}>
                <strong style={{ color: 'var(--color-text)' }}>Hypothetical scenario, not a measurement.</strong>{' '}
                The tier distribution above is an assumed profile per GPU class, and the per-prompt costs are token
                estimates — nothing on this panel was measured on your machine.
                {' '}We publish no savings percentage, here or anywhere — see the{' '}
                <Link href="/#honest-numbers" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>honest numbers</Link>.
                {' '}What <em>is</em> measured, on your own machine and by you:{' '}
                <code style={{ fontFamily: 'var(--mono)', color: 'var(--color-text)' }}>mooter recibo</code>{' '}
                reads the token counts Claude Code already writes to your transcripts, attributes every API call to
                the prompt that caused it, and prices it — no estimate anywhere in that number.
              </div>
            </Grupo>

            {/* tier distribution */}
            <Grupo rotulo="Predicted tier distribution">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {TIER_META.map(({ t, label }) => (
                  <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="num" style={{ width: 30, fontSize: 12.5, color: 'var(--color-muted)' }}>{t}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-muted)', minWidth: 120 }}>{label}</span>
                    <ProgressBar pct={r.tier_distribution[t] * 100} color={TIER_COLORS_WEB[t]} />
                    <span className="num" style={{ width: 44, textAlign: 'right', fontSize: 12.5 }}>{(r.tier_distribution[t] * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </Grupo>

            {/* stack compatibility */}
            <Grupo rotulo="Your stack supports">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {stackRows.map(([icon, label, kind]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                    <span aria-hidden style={{ width: 14, color: kind === 'ok' ? 'var(--color-green)' : 'var(--color-muted)' }}>{icon}</span>
                    <span style={{ color: kind === 'ok' ? 'var(--color-text)' : 'var(--color-muted)' }}>{label}</span>
                  </div>
                ))}
              </div>
            </Grupo>
          </div>
        </div>
      </div>

      {/* Concrete persona case. Era uma caixa (fundo proprio + raio 14) — a
          regra 1 bane exactamente isso. Passa a seccao com margem. */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          one case
          <b>~80 prompts/day</b>
          assumed profile, not a herd average
        </div>
        <div style={{ maxWidth: 760 }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>A concrete case</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: 15, lineHeight: 1.7, margin: 0 }}>
            <strong>Solo founder, Claude Code Max plan, RTX 4090, ~80 prompts/day, ~8% critical.</strong> Most of the day
            is renames, commits, small edits and &ldquo;explain this&rdquo; — those route to <strong>T0 local (free)</strong>.
            The ~8% that&apos;s real debugging or a cross-file refactor goes to <strong>Sonnet/Opus</strong>. Set those inputs
            above to see this profile&apos;s monthly figure — it&apos;s computed from the same per-tier costs as the N=34
            benchmark below, not a marketing number. Your mix shifts with how much you keep local.
          </p>
        </div>
      </div>

      {/* Benchmark proof */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          benchmark
          <b>N=34</b>
          3 arms · blind judge
        </div>
        <div style={{ maxWidth: 760 }}>
          <h2 style={{ fontSize: 26, fontWeight: 600, margin: '0 0 6px' }}>Benchmark proof</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: 15, marginBottom: 18 }}>
            Cost per prompt on a 34-prompt blind-judged validation set.
          </p>
          {[
            { name: 'Mooter', cost: 0.022, color: 'var(--color-accent)' },
            { name: 'Sonnet-only', cost: 0.028, color: 'var(--color-tier-2)' },
            { name: 'Opus-only', cost: 0.034, color: 'var(--color-tier-3)' },
          ].map((b) => (
            <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
              <span style={{ width: 130, fontSize: 14 }}>{b.name}</span>
              <ProgressBar pct={(b.cost / 0.042) * 100} color={b.color} height={14} />
              <span className="num" style={{ width: 64, fontSize: 13 }}>${b.cost.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Reproduce it yourself */}
      <div className="moo-secao m-stack">
        <div className="moo-marg">
          reproduce
          <b>34 × 3</b>
          pre-registered · open repo
        </div>
        <div style={{ maxWidth: 760 }}>
          <h2 style={{ fontSize: 22, fontWeight: 600, margin: '0 0 8px' }}>Reproduce it yourself</h2>
          <p style={{ color: 'var(--color-muted)', fontSize: 15, marginBottom: 14 }}>
            The benchmark is pre-registered and open. 34 prompts × 3 arms (mooter, Sonnet-only,
            Opus-only) with a blind LLM judge — design, prompts, raw rows and per-pack diagnostics
            all live in the repo. Clone it and run the harness:
          </p>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 13.5, color: 'var(--color-term-fg)', background: 'var(--color-term-bg)', border: '1px solid var(--color-term-border)', borderRadius: 8, padding: '14px 16px', whiteSpace: 'pre', overflowX: 'auto' }}>
            {`git clone https://github.com/pauloloureiroshp-ship-it/mooter
cd mooter/packages/router/scripts/wave1-benchmark
tsx run.ts            # full run: 34 × 3 arms → outputs/`}
          </div>
          <p style={{ color: 'var(--color-muted)', fontSize: 13, marginTop: 12 }}>
            See <span style={{ fontFamily: 'var(--mono)' }}>wave1-benchmark/README.md</span> +{' '}
            <span style={{ fontFamily: 'var(--mono)' }}>BENCHMARK_DESIGN.md</span> for the full method,
            confidence intervals and mis-routing analysis. Pinned to mooter v{versionInfo.version}.
          </p>
          <p style={{ color: 'var(--color-yellow)', fontSize: 13, marginTop: 12 }}>
            N=34 is a small set — only medium-to-large effects are detectable. On this cloud-only set
            mooter matches the quality bar at lower cost per prompt; the bigger effect comes from
            routing simple work to free local T0, which this set doesn&apos;t isolate.
          </p>
        </div>
      </div>
      {/* 2026-08-28 · a regra dos 900px ja colapsava a calculadora para uma
          coluna, e mesmo assim a folha media 380px num ecra de 375. A causa e a
          terceira ocorrencia do mesmo defeito nesta landing: um filho de grid tem
          `min-width: auto`, por isso a pista dimensiona-se ao min-content do
          filho mais teimoso -- aqui os dois `input[type=range]`, que o browser
          desenha a 356px e cujo cursor ainda transborda a caixa. Colapsar para
          uma coluna nao chega quando a coluna se recusa a encolher.
          Medido antes: 380px. Depois: 375px. */}
      <style>{`
        @media (max-width: 900px){ .calc-grid{ grid-template-columns: 1fr !important; } }
        .calc-grid > * { min-width: 0; }
        .calc-grid input[type=range] { width: 100%; max-width: 100%; box-sizing: border-box; margin: 0; }
        /* O trio sem-mooter / com-mooter / diferenca sao tres colunas de $30px.
           A 375 sobram ~100px por coluna, o que nao chega para o numero e ainda
           empurrava a folha para 376. Empilham. */
        @media (max-width: 640px){
          .calc-saida { flex-direction: column; align-items: stretch !important; gap: 12px !important; }
          .calc-saida > * { text-align: left !important; }
        }
      `}</style>
    </section>
  );
}
