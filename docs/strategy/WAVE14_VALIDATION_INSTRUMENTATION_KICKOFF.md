# Wave 14 — Validation Week Instrumentation

> **Goal**: instrumentar a Mooter validation week (5 vibe coders × 7 dias) com
> tracking quantitativo + dashboard interno + summary emails diários. Sem isto,
> Paulo só vai ter feedback anedótico das 5 calls. Com isto, tem dados duros
> sobre o que cada tester pediu, qual o tier predominante, savings reais por
> persona, retention 7-day, drop-off pontos.
>
> **Trigger**: validation outreach arrancou 2026-06-04 (Wave 13.1 day). 5 testers
> esperados a entrar até 2026-06-11. Gate week 2026-06-04 → 2026-06-11 (NPS≥8 de
> ≥3 testers + ≥250 GH stars + ≥3 contributors externos).
>
> **Scope (Balanced)**: hub-side new endpoints + landing-side admin tab +
> daily email digest. NÃO blockingmente urgente para o user (não muda CLI).
> Pode ser executado em paralelo enquanto testers correm.
>
> **Non-negotiables**:
> - `classify.js` byte-identical (P11)
> - Zero PII em todos os dados (continua privacy-first)
> - `mooter_event` schema NÃO muda (só agregados novos no admin)
> - Hub deploy zero-downtime (rate-limits intactos)
> - Tests routing surface mantidos 110/110

---

## 0. Contexto + estado actual

| Item | Estado pré-Wave-14 |
|---|---|
| Validation testers entrando | 0-5 esperados próximos 7 dias |
| `mooter_event` aggregation no hub | Existe `/aggregate-stats` + `/api/community/pulse` (Wave 10 Phase B.1a) |
| Admin tab landing | Existe `/admin` (W6.5 D1 hardening) com basic charts |
| Per-tester tracking | ❌ Não existe — todos os events são anonymous-pseudonymous |
| Daily email digest | ❌ Não existe — `mooter feedback` só guarda em D1 |
| Tester onboarding workflow | ❌ Só Tally form externo |
| NPS / retention tracking | ❌ Não existe |

### Constraint privacidade

**Não podemos identificar testers individualmente em telemetry**. Mooter é
anonymous-by-design. Mas durante validation week, **podemos pedir aos testers
para opt-in via flag local CLI** (`mooter validation join --tester-id X`) que
adiciona um `tester_cohort_id` opcional no payload. Privacy preservada (opt-in
explícito), mas permite distinguir os 5 testers do restante community pulse.

---

## 1. 5 Sub-features (priorizados por valor para gate decision)

### Sub-feature 1 — `tester_cohort_id` opt-in (CLI + hub)

**O quê**: novo flag CLI `mooter validation join --cohort <id>` que persiste
`tester_cohort_id` em `~/.mooter/config.json`. Quando enviar `mooter_event`s
ou feedback, adiciona o cohort_id no payload. Hub guarda no D1.

**Por quê primeiro**: sem isto, todos os outros sub-features falham — não
conseguimos distinguir tester 1 vs tester 5 nos agregados.

**Anti-pattern**: NÃO fazer cohort_id obrigatório, NÃO fazer login-gated.
Continua opt-in completo. Tester pode parar dando `mooter validation leave`.

### Sub-feature 2 — `tester_dashboard` admin tab (landing)

**O quê**: nova tab `/admin/validation` que mostra:
- Lista 5 testers (cohort_id, OS, GPU, persona)
- Per-tester: tier distribution (% T0/T1/T2/T3) · savings $/dia · feedback count · last seen
- Aggregate: tier mix, average savings, NPS médio (de Tally responses)
- Drop-off: testers que pararam de enviar events há >24h
- "Reproduce instructions" link para Paulo replicar setup

**Por quê**: dashboard tem que estar pronto antes dos testers começarem.

**Anti-pattern**: NÃO mostrar dados de outros users (community pulse) na mesma
tab — mantém validation isolada. NÃO infer persona dos events — usa o que tester
disse no Tally form.

### Sub-feature 3 — Daily digest email (hub-side)

**O quê**: cron job CF Worker que corre 09h Lisbon todos os dias:
- Compila stats últimas 24h dos 5 testers
- Envia email para `paulo.loureiro.shp@gmail.com` (via Resend/Postmark) com:
  - Top 3 mudanças notáveis ("tester 2 mudou de T2 para T0 70% das vezes — savings 3x")
  - Drop-off alerts ("tester 5 não enviou events há 36h")
  - Quote of the day (1 random feedback recent)

**Por quê**: Paulo vai ter dados todos os dias sem ter de abrir dashboard.

**Anti-pattern**: NÃO enviar email aos testers (continua silent). NÃO incluir
quote of the day se for negativo (evita "naming and shaming" — só feedback
construtivo é citado).

### Sub-feature 4 — NPS+retention micro-survey (Tally Day 7)

**O quê**: Tally form auto-trigger Day 7 (CRON ou n8n external) que envia
email aos testers com mini-survey:
- "Would you recommend Mooter to a friend who's a vibe coder? 0-10"
- "What's the single biggest issue you hit?"
- "Will you keep using Mooter after this week? Y/N + why"

**Por quê**: NPS gate (≥8 de ≥3 testers) precisa de números reais, não
guess work.

**Anti-pattern**: NÃO usar o mesmo form do onboarding — é um Tally separado
para fechar o ciclo limpo.

### Sub-feature 5 — `/validation-report` public page

**O quê**: página pública landing que (após Day 7) mostra:
- Aggregate stats: median savings, NPS, retention %
- 2-3 testimonials anonymizados (opt-in via Tally)
- "If you want to be a v2 tester, sign up here"

**Por quê**: gate week pública — outros vibe coders veem dados reais e querem entrar para Wave 15.

**Anti-pattern**: NÃO publicar antes de Day 7 (precisa dados de uma semana). NÃO
mostrar nomes ou handles (anonimizado por respeito).

---

## 2. Sequência (1 wave, 5 sub-features, ~3-4 dias CC)

### Day 1 (paralelo com validation outreach)
- Sub-feature 1: `mooter validation join` CLI + hub schema migration
- Stub Sub-feature 2: admin tab placeholder

### Day 2 (testers começam a chegar)
- Sub-feature 2: admin dashboard completo
- Smoke test com cohort_id falso

### Day 3
- Sub-feature 3: daily digest cron + email integration
- Resend/Postmark setup (Paulo provisiona key)

### Day 4-5 (testers a usar Mooter)
- Sub-feature 4: NPS survey Tally form
- Bug fixes baseados em feedback real

### Day 6-7 (gate decision)
- Sub-feature 5: public validation report
- Paulo analisa dashboard + decide continue vs pivot

### Day 7+ (post-gate)
- Wave 14 closure
- Wave 15 kickoff: Adapter Forge OR pivot

---

## 3. Risk + dependencies

### Riscos

- **R-1** (medium): testers não querem opt-in cohort_id porque sentem que perde
  anonimato. **Mitigação**: explicar opt-in claro no Tally + Calendly call;
  oferecer "Skip cohort, send anonymous" path como fallback.
- **R-2** (low): Resend/Postmark setup atrasa daily digest. **Mitigação**: começar
  com simple SMTP via SES (Paulo já tem AWS account?). Ou skip Day 1 digest,
  só ter Day 2-7.
- **R-3** (medium): cohort_id payload increase hub D1 size. **Mitigação**: o que
  já guardamos é minimal (4-8 bytes per event); 5 testers × 100 events/dia × 7 dias
  = 3,500 events tagged. Trivial em D1 quotas.
- **R-4** (low): testers pararem antes de Day 7. **Mitigação**: drop-off alerts
  Day 3 detect early; Paulo manda DM "Hey, ainda comigo?" via Calendly history.

### Dependencies

- Tally form arrumar antes de Day 1 (Paulo)
- Calendly slots disponíveis (Paulo)
- Resend ou similar provisioned (Paulo, $0-19/mês)
- 5 testers respondem o form (no control)

---

## 4. Non-negotiables (re-confirmados)

| # | Item | Como verificar |
|---|---|---|
| 1 | classify.js byte-identical | sha256sum check no PR de cada sub-feature |
| 2 | Zero PII (nem cohort_id é PII — é UUID random) | grep payload schema |
| 3 | mooter_event schema imutável | inspect migrations diff |
| 4 | Hub deploy zero-downtime | rate-limits Wave 10 C.1 intactos |
| 5 | Tests routing 110/110 mantidos | CI gate |
| 6 | Opt-in only (cohort_id) | review CLI flag UX |
| 7 | Tester drop-out path (`mooter validation leave`) | review CLI flag UX |

---

## 5. Definition of Done (Wave 14)

1. ✅ `mooter validation join --cohort <id>` e `mooter validation leave` shippados
2. ✅ `/admin/validation` tab live com 5 testers tracked
3. ✅ Daily digest email a chegar 09h Lisbon todos os dias úteis Day 1-7
4. ✅ NPS survey Tally Day 7 a chegar aos 5 testers
5. ✅ `/validation-report` public page live Day 7
6. ✅ Tag prod `v1.9.0-validation-instrumentation`
7. ✅ Memória `project_mooter_wave14_validation.md` actualizada

---

## 6. Master prompt para CC (paste when Wave 13.1 EM PROD confirmed)

```
Inicia Wave 14 Validation Instrumentation conforme docs/strategy/WAVE14_VALIDATION_INSTRUMENTATION_KICKOFF.md.

Pré-flight: Wave 13 v1.8.0 + Wave 13.x v1.8.1 + Wave 13.1 v1.8.2 ambas EM PROD. Validation outreach arrancou 2026-06-04 (3 DMs enviadas).

Scope: 5 sub-features alinhadas com validation week (5 testers × 7 dias). Backwards-compat. Privacy-first opt-in.

Lê PRIMEIRO:
  - docs/strategy/WAVE14_VALIDATION_INSTRUMENTATION_KICKOFF.md inteiro
  - hub/wrangler.mooter.toml + hub/routes/* (schemas hub)
  - landing/src/app/admin/* (dashboard pattern existente)
  - tools/router/classify.js (P11 — confirma byte-identical antes e depois de cada sub-feature)

Non-negotiables:
  - classify.js byte-identical
  - Zero PII (cohort_id é UUID random, NÃO email/handle)
  - Hub deploy zero-downtime (rate-limits W10 C.1 intactos)
  - Tests routing 110/110 mantidos
  - Opt-in only (mooter validation join — não auto)
  - Tester drop-out path (mooter validation leave)

Sequência (1 wave, 5 sub-features, ~3-4 dias autonomous):
  Day 1 — Sub-feature 1 (CLI + hub schema migration cohort_id) + Sub-feature 2 stub
  Day 2 — Sub-feature 2 complete (admin dashboard + smoke test cohort fake)
  Day 3 — Sub-feature 3 (daily digest cron + Resend/Postmark email)
  Day 4-5 — Sub-feature 4 (NPS survey Day 7 trigger)
  Day 6-7 — Sub-feature 5 (public validation-report page) + Paulo gate

Final-reviewer T3 gate obrigatório antes de cada sub-feature merged. PR squash→dev por sub-feature.

Tag `v1.9.0-validation-instrumentation` no Day 7 quando todas as 5 sub-features em prod.

Reporta WAVE14_DAY_X_FINDINGS.md após cada sub-feature se houver decisões.
```

---

**Composed by Cowork, 2026-06-04 afternoon. Wave 14 ships validation week
instrumentation paralelo com gate week. 5 sub-features, ~3-4 dias autonomous CC.
Tag v1.9.0. Foundation para Wave 15 (Adapter Forge OR pivot).**
