/* Mooter landing — sections A: flow, models, compare */

function FlowDiagram() {
  const steps = [
    { n: "01", title: "Prompt in",        desc: "Your prompt enters the Claude Code hook — intercepted locally, zero network.", badge: "hook" },
    { n: "02", title: "Classify",         desc: "167 regex patterns score complexity, risk & intent in <50ms.", badge: "classify.js" },
    { n: "03", title: "Profile match",    desc: "Your GPU, installed models, subscription tier & budget ceiling are factored in.", badge: "profile" },
    { n: "04", title: "Route",            desc: "Picks the cheapest model that meets the quality bar for this exact prompt.", badge: "T0/T1/T2/T3" },
    { n: "05", title: "Answer back",      desc: "Best model responds. Decision logged, savings tracked, community learns.", badge: "validate" },
  ];
  return (
    <section className="band" id="how">
      <div className="page">
        <div className="section-head">
          <span className="eyebrow">How it works</span>
          <h2>Five stages. One hook. Zero proxies.</h2>
          <p className="lede muted">Every prompt flows through the same pipeline before touching any model. Pure regex, no API calls to classify, no cost to route.</p>
        </div>
        <div className="flow">
          {steps.map((s, i) => (
            <React.Fragment key={s.n}>
              <div className="flow-step">
                <div className="n">{s.n}</div>
                <h4>{s.title}</h4>
                <p>{s.desc}</p>
                <div className="badge">{s.badge}</div>
              </div>
              {i < steps.length - 1 && <div className="flow-arrow">→</div>}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function ModelsSection() {
  const d = window.LANDING_DATA;
  return (
    <section className="band beige-2" id="models">
      <div className="page">
        <div className="section-head">
          <span className="eyebrow">The roster</span>
          <h2>Every model has a specialty.<br/>Opus isn't always the answer.</h2>
          <p className="lede muted">A brain surgeon shouldn't put on band-aids. Mooter evaluates {d.t0Models.length + 3} models across 4 tiers — and picks the right one per prompt.</p>
        </div>

        <div className="tiers">
          {/* T0 local */}
          <div className="tier-col t0">
            <div className="top">
              <span className="tier t0">T0</span>
              <span className="price">local · $0.000</span>
            </div>
            <h3>Local on your hardware</h3>
            <p className="desc">Free. Runs on your GPU via Ollama. Mooter auto-detects VRAM and installs the right set at setup.</p>
            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginTop: 4}}>
              {d.t0Models.map(m => (
                <div className="model-row" key={m.name}>
                  <span className="model-logo"><Logo name={m.provider} size={14}/></span>
                  <div className="grow">
                    <div className="model-name">{m.name}</div>
                    <div className="model-meta">{m.vram} · {m.role}</div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{marginTop:8, display:'flex', alignItems:'center', gap:8, fontSize:11, color:'var(--muted-ink)', fontFamily:'JetBrains Mono'}}>
              <span className="logo-chip" style={{width:18, height:18}}><Logo name="ollama" size={12}/></span> Served via Ollama runtime
            </div>
          </div>

          {/* T1 */}
          <div className="tier-col t1">
            <div className="top">
              <span className="tier t1">T1</span>
              <span className="price" title="Estimate only — varies by subscription plan and prompt length">~{d.tiers.t1.price}/prompt</span>
            </div>
            <h3>Fast & cheap models</h3>
            <div className="model-row"><span className="model-logo"><Logo name="anthropic" size={14}/></span>
              <div className="grow">
                <div className="model-name">claude-haiku</div>
                <div className="model-meta">Free · Pro · Max · Team · API</div>
              </div>
            </div>
            <div className="model-row"><span className="model-logo"><Logo name="openai" size={14}/></span>
              <div className="grow">
                <div className="model-name">gpt-4o-mini</div>
                <div className="model-meta">Plus · Codex · API</div>
              </div>
            </div>
            <div className="model-row"><span className="model-logo"><Logo name="google" size={14}/></span>
              <div className="grow">
                <div className="model-name">gemini-flash</div>
                <div className="model-meta">Advanced · API</div>
              </div>
            </div>
            <p className="desc">{d.tiers.t1.role}</p>
            <p style={{fontSize:10.5, color:'var(--faint-ink)', fontFamily:'JetBrains Mono', margin:0, letterSpacing:'0.02em'}}>
              ~ est. only — actual cost varies by subscription plan &amp; prompt length
            </p>
          </div>

          {/* T2 */}
          <div className="tier-col t2">
            <div className="top">
              <span className="tier t2">T2</span>
              <span className="price" title="Estimate only — varies by subscription plan and prompt length">~{d.tiers.t2.price}/prompt</span>
            </div>
            <h3>Balanced reasoning</h3>
            <div className="model-row"><span className="model-logo"><Logo name="anthropic" size={14}/></span>
              <div className="grow">
                <div className="model-name">claude-sonnet</div>
                <div className="model-meta">Pro · Max · Team · API</div>
              </div>
            </div>
            <div className="model-row"><span className="model-logo"><Logo name="openai" size={14}/></span>
              <div className="grow">
                <div className="model-name">gpt-4o</div>
                <div className="model-meta">Plus · Codex · API</div>
              </div>
            </div>
            <div className="model-row"><span className="model-logo"><Logo name="google" size={14}/></span>
              <div className="grow">
                <div className="model-name">gemini-2-pro</div>
                <div className="model-meta">Advanced · API</div>
              </div>
            </div>
            <p className="desc">{d.tiers.t2.role}</p>
            <p style={{fontSize:10.5, color:'var(--faint-ink)', fontFamily:'JetBrains Mono', margin:0, letterSpacing:'0.02em'}}>
              ~ est. only — actual cost varies by subscription plan &amp; prompt length
            </p>
          </div>

          {/* T3 */}
          <div className="tier-col t3">
            <div className="top">
              <span className="tier t3">T3</span>
              <span className="price" title="Estimate only — varies by subscription plan and prompt length">~{d.tiers.t3.price}/prompt</span>
            </div>
            <h3>Elite / critical</h3>
            <div className="model-row"><span className="model-logo"><Logo name="anthropic" size={14}/></span>
              <div className="grow">
                <div className="model-name">claude-opus</div>
                <div className="model-meta">Max · Team · API (limited on Pro)</div>
              </div>
            </div>
            <div className="model-row"><span className="model-logo"><Logo name="openai" size={14}/></span>
              <div className="grow">
                <div className="model-name">o1-pro</div>
                <div className="model-meta">Pro · API</div>
              </div>
            </div>
            <div className="model-row"><span className="model-logo"><Logo name="google" size={14}/></span>
              <div className="grow">
                <div className="model-name">gemini-ultra</div>
                <div className="model-meta">Ultra · API</div>
              </div>
            </div>
            <p className="desc">{d.tiers.t3.role}</p>
            <p style={{fontSize:10.5, color:'var(--faint-ink)', fontFamily:'JetBrains Mono', margin:0, letterSpacing:'0.02em'}}>
              ~ est. only — actual cost varies by subscription plan &amp; prompt length
            </p>
            <div style={{marginTop:'auto', fontSize:11, color:'#8a3a2c', fontFamily:'JetBrains Mono', background:'rgba(184,82,63,0.08)', padding:'8px 10px', borderRadius:6}}>
              Guardrail: migrations, secrets & deploys are <em>always</em> routed here.
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CompareSection() {
  const rows = [
    { f: "Works natively with Claude Code", mooter: ["yes","Hook-based, no proxy"],    litellm:["meh","Custom config"],   openrouter:["no","Different CLI"], cursor:["no","Cursor-only"],       plain:["yes","But no routing"] },
    { f: "No proxy / no interception",      mooter: ["yes","Zero MitM"],                litellm:["no","Proxy server"],    openrouter:["no","Cloud proxy"],   cursor:["no","Intercepts all"],    plain:["yes","Direct"] },
    { f: "Local model support",             mooter: ["yes","Hardware-aware"],           litellm:["yes","Manual config"],  openrouter:["no","Cloud only"],    cursor:["meh","Limited"],          plain:["no","API only"] },
    { f: "Hardware-aware routing",          mooter: ["yes","GPU probe at install"],     litellm:["no","—"],               openrouter:["no","—"],             cursor:["no","—"],                 plain:["no","—"] },
    { f: "Subscription-aware routing",      mooter: ["yes","Max · Pro · API"],          litellm:["no","—"],               openrouter:["no","—"],             cursor:["no","—"],                 plain:["no","—"] },
    { f: "Classification latency",          mooter: ["yes","<50ms · regex"],            litellm:["meh","~200ms LLM"],     openrouter:["meh","50–200ms"],     cursor:["no","n/a"],               plain:["no","n/a"] },
    { f: "Community-fed patterns",          mooter: ["yes","Weekly updates"],           litellm:["no","—"],               openrouter:["no","—"],             cursor:["no","—"],                 plain:["no","—"] },
    { f: "Price",                           mooter: ["yes","Free · MIT"],               litellm:["yes","OSS, self-host"], openrouter:["meh","5–10% markup"], cursor:["meh","$20/mo"],           plain:["yes","API cost only"] },
  ];
  const iconFor = (status) => status === "yes" ? "✓" : status === "no" ? "✕" : "~";
  const classFor = (status) => status === "yes" ? "yes" : status === "no" ? "no" : "meh";

  return (
    <section className="band" id="compare">
      <div className="page">
        <div className="section-head">
          <span className="eyebrow">vs the market</span>
          <h2>Not a proxy. Not a wrapper.<br/>A different paradigm.</h2>
          <p className="lede muted">Every other routing solution sits between you and your models. Mooter is a hook, not a proxy — runs in your process, on your machine, no network dependency.</p>
        </div>

        <div className="compare-wrap">
          <table className="compare">
            <thead>
              <tr>
                <th></th>
                <th className="mooter">Mooter<br/><span className="sub">mooter.ai</span></th>
                <th>LiteLLM<br/><span className="sub">proxy-based</span></th>
                <th>OpenRouter<br/><span className="sub">cloud proxy</span></th>
                <th>Cursor<br/><span className="sub">IDE-locked</span></th>
                <th>Plain CC<br/><span className="sub">no router</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td><strong style={{color:'var(--ink)'}}>{r.f}</strong></td>
                  <td className="mooter-col"><span className={classFor(r.mooter[0])}>{iconFor(r.mooter[0])}</span><span className="sub">{r.mooter[1]}</span></td>
                  <td><span className={classFor(r.litellm[0])}>{iconFor(r.litellm[0])}</span><span className="sub">{r.litellm[1]}</span></td>
                  <td><span className={classFor(r.openrouter[0])}>{iconFor(r.openrouter[0])}</span><span className="sub">{r.openrouter[1]}</span></td>
                  <td><span className={classFor(r.cursor[0])}>{iconFor(r.cursor[0])}</span><span className="sub">{r.cursor[1]}</span></td>
                  <td><span className={classFor(r.plain[0])}>{iconFor(r.plain[0])}</span><span className="sub">{r.plain[1]}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

Object.assign(window, { FlowDiagram, ModelsSection, CompareSection });
