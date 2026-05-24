# Master Prompt — Mooter A/B Test Suite

> **Para colar num terminal Claude Code** no directório `C:\Users\Paulo Loureiro\frugal`.
> **Objectivo:** Validar que o Mooter router entrega respostas de qualidade equivalente ao Opus baseline, com savings reais e latency delta medido.
> **Criado:** 2026-04-16 (Sessão Sprint B)

---

## Contexto

O Mooter router classifica cada prompt num tier (T0 Ollama / T1 Haiku / T2 Sonnet / T3 Opus) e recomenda o modelo mais barato que entrega qualidade equivalente. Este teste compara:

- **Run A (Control):** Opus 4.6 puro — sem router, sem delegação, tudo inline. Mede o custo e tempo do "naive baseline".
- **Run B (Mooter):** Router activo — delega para o tier recomendado. Mede custo real, latência, e qualidade da resposta.

Para cada prompt, regista-se: tier escolhido, modelo usado, tempo de resposta, custo estimado, e avaliação de qualidade (1-5).

---

## Instruções de execução

### Pré-requisitos
1. Confirma que o router está funcional: `node ~/.claude/tools/router/shadow-mode.js --status`
2. Confirma Ollama online: `ollama list`
3. Sync runtime: `bash tools/router/sync-to-runtime.sh`

### Protocolo

Para CADA prompt na suite abaixo, executa em 2 passagens:

**Passagem A (Baseline Opus):**
```
Ignora o <router-hint>. Responde tu mesmo inline em Opus sem delegar.
Antes de responder, regista: start_time = Date.now()
Depois de responder, calcula: elapsed_ms = Date.now() - start_time
```

**Passagem B (Mooter):**
```
Lê o <router-hint> e segue a doutrina: delega para o tier recomendado.
Se T0 → spawn local-summarizer/local-transformer
Se T1 → spawn cheap-triage
Se T2 → spawn model-reasoner
Se T3 → inline (tu és Opus)
Regista: tier, modelo, elapsed_ms, subagent usado
```

**Depois de ambas as passagens**, avalia:
- Qualidade A (1-5): correctness, completeness, conciseness
- Qualidade B (1-5): mesmos critérios
- Veredicto: A_BETTER | B_BETTER | TIE
- Saving real: custo_A - custo_B (estimado via pricing.js)

### Output format

Depois de correr TODOS os prompts, gera um relatório em formato tabular:

```markdown
## Mooter A/B Test Report — [data]

| # | Prompt (30 chars) | Tier B | Model B | Time A (ms) | Time B (ms) | Δ latency | Quality A | Quality B | Verdict | Saving $ |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | fix typo in README... | T0 | qwen3:30b | 2100 | 1800 | -300ms | 4 | 4 | TIE | $0.05 |
| ... |

### Summary
- Total prompts: N
- A better: X (Y%)
- B better: X (Y%)
- Tie: X (Y%)
- Total saving: $X.XX
- Avg latency delta: +/-Xms
- Quality retention: X% (prompts where B >= A)
```

---

## Test Suite — 10 prompts (5 categorias × 2 complexidades)

### Categoria 1: Trivial / T0 territory

**Prompt 1 (trivial-edit):**
```
Rename the variable `userId` to `accountId` in this snippet:

const userId = req.params.id;
const user = await db.users.findById(userId);
return res.json({ userId, name: user.name });
```

**Prompt 2 (summarize):**
```
Resume em 3 bullets o que faz este código:

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
```

### Categoria 2: Light tasks / T1 territory

**Prompt 3 (commit message):**
```
Gera uma commit message para estas mudanças:
- Added validation-set.json with 60 gold labels
- Created validate-set.js drift detector
- Updated replay.js with --gold-labels mode
- Revoked 30-rating gate in master prompt
```

**Prompt 4 (regex):**
```
Build a regex that matches valid IPv4 addresses (0.0.0.0 to 255.255.255.255) but rejects things like 999.999.999.999 or 1.2.3.
```

### Categoria 3: Reasoning / T2 territory

**Prompt 5 (bug investigation):**
```
Tenho um WebSocket server em Node.js que desconecta clientes depois de ~60 segundos de idle. O servidor usa ws@8.x e está atrás de um nginx reverse proxy. O cliente reconecta mas perde mensagens durante o gap. Qual é a causa mais provável e como resolvo?
```

**Prompt 6 (comparison):**
```
Compare Redis vs Memcached for a session store that handles 50k concurrent users. Consider: persistence, memory efficiency, clustering, and operational complexity. Recommend one with rationale.
```

### Categoria 4: Architecture / T3 territory

**Prompt 7 (architecture):**
```
Design the schema and API for a multi-tenant SaaS billing system that supports:
- Per-seat pricing with annual/monthly toggle
- Usage-based add-ons (API calls, storage)
- Proration on mid-cycle plan changes
- Stripe integration for payment processing

Give me the data model (tables/relations) and the 3 most critical API endpoints.
```

**Prompt 8 (security review):**
```
Review this authentication middleware for security issues:

app.use((req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  const decoded = jwt.decode(token);
  req.user = decoded;
  next();
});
```

### Categoria 5: Mixed / Edge cases

**Prompt 9 (quality intent + reasoning):**
```
Pensa bem nisto: qual a melhor estratégia para migrar uma base de dados PostgreSQL de 500GB para uma nova região AWS sem downtime? Considere replicação lógica, pglogical, DMS, e pg_dump. Qual recomendas e porquê?
```

**Prompt 10 (beast mode signal):**
```
Não me importo com o custo — preciso da melhor análise possível: este sistema de rate limiting baseado em token bucket está correcto ou tem race conditions?

class RateLimiter {
  constructor(capacity, refillRate) {
    this.tokens = capacity;
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.lastRefill = Date.now();
  }
  
  tryConsume() {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
  
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
    this.lastRefill = now;
  }
}
```

---

## Métricas esperadas (targets)

| Métrica | Target | Rationale |
|---|---|---|
| Quality retention (B >= A) | ≥ 90% | 9 de 10 prompts com qualidade igual ou melhor |
| Tie rate | ≥ 60% | Maioria das respostas são equivalentes |
| A better rate | ≤ 20% | Máximo 2 de 10 onde Opus inline ganha claramente |
| Total saving | > $0.50 | Poupança real medida nos 10 prompts |
| Avg latency delta | < +15s | Latência extra aceitável |
| T0 routing rate | ≥ 20% | Pelo menos 2 prompts correctamente locais |
| T3 routing rate | ≤ 40% | Não mais que 4 prompts em Opus |

---

## Depois do teste

1. Grava o relatório tabular como `docs/AB_TEST_REPORT_[data].md`
2. Corre `/mooter-good` ou `/mooter-bad` para CADA prompt baseado no veredicto
3. Corre `node tools/router/signals.js` para capturar implicit signals
4. Actualiza `SYNC.md` com resultados
5. Cria página Notion com o relatório sob o HQ (ID: `33d6f6e4-2bc4-816b-977a-fe84bbe912c9`)

---

## Notas para quem executa

- **Não** uses este prompt como input para o classifier (ele vai classificar este texto como T3 architecture por causa dos code blocks e security keywords). Cola os prompts individuais um a um.
- Se o router estiver desligado (hook não correu), a passagem B equivale à A. Nesse caso, regista e explica.
- Se Ollama estiver offline, T0 degrada para T1. Regista.
- Sê honesto na avaliação de qualidade. O objectivo é validar, não confirmar bias.
- Tempo de resposta inclui TUDO: tool calls, reads, edits, subagent spawn + response.

---

**Este master prompt é a ponte entre "construímos a infra" e "provámos que funciona".**
O relatório A/B é a primeira evidência empírica de que o Mooter entrega o que promete:
**respostas equivalentes ao melhor modelo, por uma fracção do custo, com latência extra explícita.**
