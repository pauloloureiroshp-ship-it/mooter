'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import MonoNum from '@/components/MonoNum';

// Wave 5 "Rankings-as-proof" — the field, through Mooter's routing lens.
// Reads /rankings-seed.json (emitted by `mooter rankings build`). Every value is
// counted from the seed: measured/null is sacred, "—" means not-yet-measured,
// never a fabricated 0. The verdict row is the router's own pick (decideAgent),
// not a marketing choice.

interface RankingRow {
  model: string;
  provider: string;
  tier: string;
  quality: { score: number | null; source: string | null; as_of: string | null; measured: boolean };
  price: { in_per_mtok: number | null; out_per_mtok: number | null; pending: boolean };
  toks: { cloud_p50: number | null; source: string };
  tes: number | null;
  local: { is_local: boolean; cost_usd: number | null };
  subscription_zero: boolean;
  verdict: { recommended: boolean; tier: string; reason: string };
}

interface Seed {
  schema: string;
  generated_utc: string;
  pricing_snapshot: string;
  models_total: number;
  categories: string[];
  rows: Record<string, RankingRow[]>;
  savings: { measured: boolean; window_days: number; source: string; note: string; by_category: Record<string, { saved_usd: number; vs: string }> };
}

const TIER_COLOR: Record<string, string> = {
  T0: 'var(--color-tier-0)',
  T1: 'var(--color-tier-1)',
  T2: 'var(--color-tier-2)',
  T3: 'var(--color-tier-3)',
  T5: 'var(--color-accent)', // Fable — opt-in only, accent rose
};

/**
 * 2026-08-28 - era uma pilula: raio 999, fundo tingido a 12% e borda a 35%.
 * Numa folha de desenho tecnico uma pilula e o objecto mais fora de lugar que
 * ha, e um fundo tingido e exactamente o que a direccao de 2026-08-27 proibe.
 * Fica o que uma folha ja tinha para isto: a LEGENDA - quadrado de amostra na
 * cor do tier (sem raio) + o codigo em mono na mesma cor.
 *
 * O SINAL nao se perdeu: a cor continua a ser `TIER_COLOR[tier]`, o mesmo valor
 * a dizer a mesma coisa. So mudou de veiculo - o fundo a 12% era a mais fraca
 * das tres leituras, e a mais fraca era a unica que a caixa acrescentava.
 */
function TierBadge({ tier }: { tier: string }) {
  const color = TIER_COLOR[tier] ?? 'var(--color-muted)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'var(--mono)',
        letterSpacing: '0.06em',
        color,
        whiteSpace: 'nowrap',
      }}
    >
      <span style={{ width: 6, height: 6, background: color }} />
      {tier}
    </span>
  );
}

const GROUP_OF = (c: string) => c.split('.')[0];

export default function RankingsExplorer() {
  const [seed, setSeed] = useState<Seed | null>(null);
  const [error, setError] = useState(false);
  const [category, setCategory] = useState<string>('coding.backend');
  const [maxPlan, setMaxPlan] = useState(false); // false = all-cloud, true = Claude Max

  useEffect(() => {
    fetch('/rankings-seed.json')
      .then((r) => r.json())
      .then((j: Seed) => {
        setSeed(j);
        // Fall back to the first category only if the default isn't in the seed.
        setCategory((cur) => (j.rows?.[cur] ? cur : j.categories?.[0] ?? cur));
      })
      .catch(() => setError(true));
  }, []);

  const rows = useMemo(() => (seed ? seed.rows[category] ?? [] : []), [seed, category]);

  if (error) {
    return (
      // Era um <Card>. O que separa passa a ser a hairline; o texto e o mesmo.
      <div style={{ marginTop: 24, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
        <p style={{ color: 'var(--color-muted)', margin: 0 }}>
          Rankings seed not found. Run <code>mooter rankings build</code> to generate{' '}
          <code>public/rankings-seed.json</code>.
        </p>
      </div>
    );
  }
  if (!seed) {
    return <p style={{ color: 'var(--color-muted)', marginTop: 24 }}>Loading the field…</p>;
  }

  // Cost cell text, honest under the active plan toggle.
  const costCell = (r: RankingRow): { text: string; color: string; sub?: string } => {
    if (r.local.is_local) return { text: '$0', color: 'var(--color-green)', sub: 'your GPU' };
    if (maxPlan && r.subscription_zero) return { text: '$0', color: 'var(--color-green)', sub: 'to you · Max' };
    if (r.price.pending || r.price.in_per_mtok === null || r.price.out_per_mtok === null) {
      return { text: '—', color: 'var(--color-muted)', sub: 'price pending' };
    }
    return {
      text: `$${r.price.in_per_mtok} · $${r.price.out_per_mtok}`,
      color: 'var(--color-text)',
      sub: '/Mtok in·out',
    };
  };

  const measuredCount = rows.filter((r) => r.quality.measured).length;

  const th: CSSProperties = {
    textAlign: 'left',
    padding: '12px 12px',
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--color-muted)',
    borderBottom: '1px solid var(--color-border-light)',
    whiteSpace: 'nowrap',
  };
  const td: CSSProperties = { padding: '12px 12px', fontSize: 13.5, verticalAlign: 'top' };

  return (
    <div>
      {/* Category selector - eram pilulas de raio 999, e a activa vinha
          PREENCHIDA a rosa. Duas coisas erradas ao mesmo tempo: o raio nao esta
          na escala do token, e o rosa e do `?` do wordmark, das linhas de cota e
          do CTA - uma categoria seleccionada nao e um CTA.
          O estado activo diz-se agora como se diz num desenho: tinta cheia,
          peso, e uma hairline por baixo. Zero fundo, zero raio. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '20px 0 14px' }}>
        {seed.categories.map((c) => {
          const active = c === category;
          return (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={active}
              style={{
                padding: '7px 10px',
                fontSize: 12.5,
                fontFamily: 'var(--mono)',
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--color-text)' : 'var(--color-muted)',
                background: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${active ? 'var(--color-text)' : 'transparent'}`,
              }}
              title={GROUP_OF(c)}
            >
              {c}
            </button>
          );
        })}
      </div>

      {/* Plan toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        {/* Toggle de plano - era uma caixa de raio 10 com o lado activo
            preenchido a rosa. Passa a duas etiquetas mono separadas por uma
            hairline vertical, assentes numa hairline de base: o lado activo
            leva tinta cheia + peso, o inactivo fica cinzento. */}
        <span className="moo-label" style={{ color: 'var(--moo-faint)' }}>your plan:</span>
        <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
          {([['all-cloud', false], ['Claude Max', true]] as const).map(([label, on], i) => {
            const active = maxPlan === on;
            return (
              <button
                key={label}
                onClick={() => setMaxPlan(on)}
                aria-pressed={active}
                style={{
                  padding: '7px 14px',
                  fontSize: 13,
                  fontFamily: 'var(--mono)',
                  fontWeight: active ? 700 : 500,
                  color: active ? 'var(--color-text)' : 'var(--color-muted)',
                  background: 'transparent',
                  border: 'none',
                  borderLeft: i === 0 ? 'none' : '1px solid var(--color-border)',
                  borderBottom: `1px solid ${active ? 'var(--color-text)' : 'var(--color-border)'}`,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
        <span style={{ fontSize: 12.5, color: 'var(--color-faint, var(--color-muted))' }}>
          {maxPlan ? 'Claude tiers count as $0 — already covered by your subscription.' : 'pay-per-token cloud pricing.'}
        </span>
      </div>

      {/* Savings strip — honest: only show a number when measured locally.
          2026-08-28 - era um fundo tingido a verde 9% com raio 12, que e
          literalmente a faixa que a direccao proibe. Fica a hairline.
          O VERDE nao se perdeu: continua onde SIGNIFICA alguma coisa - no
          numero medido, `MonoNum color="var(--color-green)"`, logo abaixo. O
          ramo alternativo nao tem numero e agora tambem nao tem tinta verde a
          insinuar que tem; isso e menos sinal FALSO, nao menos sinal.
          ATENCAO: a CONDICAO (`seed.savings.measured &&`), o numero, a frase
          alternativa e o texto sao a excepcao declarada em `moo-tokens.json` ->
          `numero.claims_excepcoes`: ficam byte-a-byte. So mudou o involucro. */}
      <div
        style={{
          borderTop: '1px solid var(--color-border)',
          padding: '12px 0 0',
          marginBottom: 18,
          fontSize: 13.5,
          color: 'var(--color-text)',
        }}
      >
        {seed.savings.measured && seed.savings.by_category[category] ? (
          <span>
            <MonoNum color="var(--color-green)" style={{ fontWeight: 700 }}>
              ${seed.savings.by_category[category].saved_usd.toFixed(2)}
            </MonoNum>{' '}
            saved this week on <strong>{category}</strong> {seed.savings.by_category[category].vs}.
          </span>
        ) : (
          <span style={{ color: 'var(--color-muted)' }}>
            Savings are measured on <strong>your</strong> machine, never fabricated for this page. Run{' '}
            <code>mooter rankings build</code> locally to fill this strip from your own routing journal{' '}
            (vs an all-Opus baseline).
          </span>
        )}
      </div>

      {/* Table - a tabela ROLA DENTRO DE SI (`overflowX: auto` no contentor
          proprio), para que o corpo da pagina nunca role na horizontal.
          Saiu a caixa (borda em volta + raio 12): ficam as duas hairlines que
          uma tabela de desenho tecnico tem, em cima e em baixo. */}
      <div style={{ overflowX: 'auto', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        <table className="rk-tbl" style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
          <thead>
            <tr>
              <th style={th}>Model</th>
              <th style={th}>Tier</th>
              <th style={th}>Quality</th>
              <th style={th}>Cost</th>
              <th style={th}>tok/s</th>
              <th style={th}>TES</th>
              <th style={th}>Mooter verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cc = costCell(r);
              return (
                <tr
                  key={r.model}
                  /* A linha que o router escolheu. Era uma faixa tingida
                     (`--color-accent-08`) - fundo tingido E rosa, as duas regras
                     partidas de uma vez. O sinal FICA e passa a dizer-se como se
                     diz num desenho: a regua que fecha a linha e tinta cheia, em
                     cima e em baixo, contra o cinzento de borda das outras.
                     A celula «mooter routes here» continua a nomear porque.

                     Porque e `box-shadow` e nao `border`: com `borderCollapse:
                     collapse` uma borda de 1px numa <tr> PERDE o conflito de
                     colapso para a borda da celula acima (CSS 2.1 17.6.2.1 —
                     empate de largura e estilo resolve-se por celula > linha).
                     Como a linha recomendada e tipicamente a primeira, a regua
                     de cima era comida pelo <th> e ficava um sinal assimetrico:
                     um risco por baixo, que se le como separador e nao como
                     «e esta». O `inset` desenha por cima do colapso e as duas
                     reguas aparecem sempre. Medido no browser, nao deduzido. */
                  data-rec={r.verdict.recommended ? '' : undefined}
                  style={{ borderTop: '1px solid var(--color-border)' }}
                >
                  <td style={{ ...td, fontFamily: 'var(--mono)', fontWeight: 600 }}>
                    {r.model}
                    <div style={{ fontSize: 11.5, color: 'var(--color-muted)', fontFamily: 'var(--font)', fontWeight: 400 }}>
                      {r.provider}
                    </div>
                  </td>
                  <td style={td}>
                    <TierBadge tier={r.tier} />
                  </td>
                  <td style={td}>
                    {r.quality.measured && r.quality.score !== null ? (
                      <>
                        <MonoNum style={{ fontWeight: 700 }}>{r.quality.score.toFixed(3)}</MonoNum>
                        <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>
                          {r.quality.source}
                          {r.quality.as_of ? ` · ${r.quality.as_of}` : ''}
                        </div>
                      </>
                    ) : r.quality.measured ? (
                      <span style={{ color: 'var(--color-muted)' }} title={r.quality.source ?? ''}>
                        cited · qualitative
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-muted)' }}>—</span>
                    )}
                  </td>
                  <td style={td}>
                    <MonoNum style={{ fontWeight: 600 }} color={cc.color}>
                      {cc.text}
                    </MonoNum>
                    {cc.sub ? <div style={{ fontSize: 11, color: 'var(--color-muted)' }}>{cc.sub}</div> : null}
                  </td>
                  <td style={{ ...td, color: 'var(--color-muted)' }}>—</td>
                  <td style={td}>
                    {r.tes !== null ? (
                      <MonoNum style={{ fontWeight: 600 }}>{r.tes}</MonoNum>
                    ) : (
                      <span style={{ color: 'var(--color-muted)' }} title="needs a measured score AND a real price">
                        —
                      </span>
                    )}
                  </td>
                  <td style={td}>
                    {r.verdict.recommended ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          color: 'var(--color-accent)',
                        }}
                        title={r.verdict.reason}
                      >
                        ✦ mooter routes here
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-faint, var(--color-muted))', fontSize: 12 }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <style>{`.rk-tbl tr[data-rec] td { box-shadow: inset 0 1px 0 var(--color-text), inset 0 -1px 0 var(--color-text); }`}</style>

      {/* Honesty footer */}
      <p style={{ color: 'var(--color-muted)', fontSize: 12.5, marginTop: 16, maxWidth: 820, lineHeight: 1.6 }}>
        {measuredCount} of {rows.length} models have a measured score for <strong>{category}</strong>.{' '}
        <strong style={{ color: 'var(--color-text)' }}>measured</strong> = a cited public benchmark ·{' '}
        <strong style={{ color: 'var(--color-text)' }}>—</strong> = not yet measured (we never invent a 0). TES is{' '}
        quality-per-$ from the calculator; a model with no real price can&apos;t be ranked, so it shows{' '}
        <strong>—</strong> even with a high score. Refresh cadence: cost &amp; tok/s daily, quality weekly (curated
        hub-side). Sources: public benchmarks (SWE-bench, GPQA, AIME, Terminal-Bench) · prices from the frozen pricing
        snapshot (<code>{seed.pricing_snapshot}</code>) · tok/s not yet measured.
      </p>
      <p style={{ color: 'var(--color-faint, var(--color-muted))', fontSize: 12, marginTop: 8, fontFamily: 'var(--mono)' }}>
        seed generated {seed.generated_utc.slice(0, 10)} · {seed.models_total} models × {seed.categories.length} categories
      </p>
    </div>
  );
}
