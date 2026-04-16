export default function MethodologyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '3rem 1.5rem', fontFamily: 'var(--sans)' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: '0.5rem' }}>
        How frugal measures savings
      </h1>
      <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>
        Last updated: April 2026
      </p>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2>The short version</h2>
        <p>
          frugal compares what you <em>actually spent</em> (with routing) against
          what you <em>would have spent</em> if every prompt had been processed by
          Claude Opus 4.6. The difference is your saving.
        </p>
        <p>
          Because frugal cannot intercept real API billing, it estimates costs from
          the number of tokens in each prompt. Numbers marked with <strong>~</strong>
          are estimates. Numbers without ~ are verified.
        </p>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2>The two numbers</h2>

        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem 1.25rem', marginBottom: '1rem' }}>
          <h3 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--muted)', fontSize: '1.2rem' }}>~</span>
            Advisory savings
          </h3>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            <code>advisory_saved = naive_opus_cost - estimated_real_cost</code>
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Assumes frugal&apos;s routing recommendation was followed. If Claude Code
            processed a T0 prompt in Opus anyway, this number is still counted &mdash;
            making it optimistic.
          </p>
        </div>

        <div style={{ background: 'var(--surface)', border: '1px solid color-mix(in srgb, var(--t0) 40%, var(--border))', borderRadius: 8, padding: '1rem 1.25rem' }}>
          <h3 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: 'var(--t0)', fontSize: '1.2rem' }}>&#x2713;</span>
            Guaranteed savings
          </h3>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            <code>guaranteed_saved = option_a_hits x avg_naive_cost_per_prompt</code>
          </p>
          <p style={{ margin: '8px 0 0', fontSize: '0.85rem', color: 'var(--muted)' }}>
            Only counts Option-A hits: prompts where a local Ollama model generated
            the answer inside the hook and Opus output it verbatim &mdash; zero Opus
            reasoning tokens spent. These are auditable in <code>decisions.log</code>.
          </p>
        </div>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2>Pricing baseline</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'left', padding: '6px 0' }}>Model</th>
              <th style={{ textAlign: 'right', padding: '6px 0' }}>Input ($/MTok)</th>
              <th style={{ textAlign: 'right', padding: '6px 0' }}>Output ($/MTok)</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Claude Opus 4.6 (baseline)', '$15.00', '$75.00'],
              ['Claude Sonnet 4.6 (T2)', '$3.00', '$15.00'],
              ['Claude Haiku 4.5 (T1)', '$0.80', '$4.00'],
              ['Ollama local (T0)', '$0', '$0'],
            ].map(([model, input, output]) => (
              <tr key={model} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '6px 0' }}>{model}</td>
                <td style={{ textAlign: 'right', padding: '6px 0', fontFamily: 'var(--mono)' }}>{input}</td>
                <td style={{ textAlign: 'right', padding: '6px 0', fontFamily: 'var(--mono)' }}>{output}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 8 }}>
          Prices from Anthropic&apos;s API pricing page. frugal uses token-estimated
          costs, not real API billing. Session context base: 8,000 tokens per turn.
        </p>
      </section>

      <section style={{ marginBottom: '2.5rem' }}>
        <h2>Known limitations</h2>
        <ul style={{ fontSize: '0.9rem', lineHeight: 1.7 }}>
          <li><strong>Routing compliance:</strong> frugal emits hints; it cannot enforce them. Advisory savings assume 100% compliance.</li>
          <li><strong>Sub-agent overhead:</strong> When Opus spawns a Sonnet sub-agent, Opus still pays tokens to delegate and integrate. This round-trip is not measured.</li>
          <li><strong>Context variability:</strong> Real sessions with many MCP servers can have 12,000&ndash;18,000 base tokens, not 8,000. Savings may be understated.</li>
          <li><strong>No real billing access:</strong> frugal does not connect to Anthropic&apos;s billing API. A future version will use the OAuth usage endpoint to cross-reference estimates with real spend.</li>
        </ul>
      </section>

      <section>
        <h2>Verify yourself</h2>
        <pre style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '1rem', fontSize: '0.8rem', overflowX: 'auto' }}>{`# Real-time metrics from your local tracker
curl -s http://127.0.0.1:7821/metrics | jq '{
  advisory: .saved,
  guaranteed: .guaranteed_saved,
  prompts: .prompts,
  pct: .saved_pct
}'

# Human-readable summary
curl -s http://127.0.0.1:7821/summary

# Raw decisions log (local, never uploaded)
tail -20 ~/.claude/tools/router/decisions.log | jq .`}</pre>
      </section>
    </main>
  );
}
