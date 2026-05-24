# STATUSLINE MIX TEST — MASTER PROMPT
# Teste visual da statusline v6.4 com distribuição de tiers em terminal novo

> **Objectivo**: forçar o mooter a rotear prompts para **todos os 4 tiers** numa única
> sessão, para validar que a statusline reflecte correctamente:
>
> - **●T0 rose** na legend + segmento rose na ctx bar (= mooter win)
> - **●T1 teal** Haiku
> - **●T2 gold** Sonnet
> - **●T3 red** Opus
> - Barra ctx preenche conforme conversa progride
> - Savings $ aumenta proporcionalmente
> - Linha `🧠 Claude Max` com pace real
> - Linha `🦙 Ollama local` com % routing share

---

## INSTRUÇÕES

1. **Abre um terminal NOVO** (para começar com contador session-level a zero).
2. Corre `claude` (ou o alias que usas) para entrar no Claude Code.
3. **Cola CADA um dos prompts abaixo em ordem**, um por vez. Espera a resposta antes do seguinte.
4. **Entre prompts, olha para a statusline** e confirma:
   - Os `●T*` dots vão aparecendo conforme tiers são disparados
   - A ctx bar colore-se proporcionalmente
   - Os números de `N prompts · M% local` vão subindo
5. **No fim**, corre `/mooter-summary` ou olha o resultado final.

---

## SEQUÊNCIA DE PROMPTS (12 turns)

### 🔴 T0 — Trivial / local-summarizable (Ollama)

```
1)  Resume em 3 linhas o que é `package.json` num projeto Node.
```

```
2)  Qual a diferença entre `==` e `===` em JavaScript? Responde em 1 linha.
```

```
3)  Converte esta lista de IDs "1,2,3,4,5" para um array JS literal.
```

### 🔵 T1 — Mecânico / triage (Haiku)

```
4)  Gera uma commit message curta para um fix de typo no botão de login (`"Loggin"` → `"Login"`).
```

```
5)  Escreve um docstring JSDoc para `function mergeUsers(a, b)` onde a e b são arrays de users com `{ id, name }` e o resultado deduplica por id.
```

```
6)  Dá-me uma regex para validar emails simples (sem edge cases exóticos), em JS.
```

### 🟡 T2 — Investigação / análise (Sonnet)

```
7)  Porque é que um WebSocket reconnect pode falhar intermitentemente só em Chrome mas não em Firefox? Dá-me 3 hipóteses prováveis, ordenadas por probabilidade, cada uma com 1 linha de justificação.
```

```
8)  Compara 3 abordagens para rate-limiting num Express server: (a) express-rate-limit em memória, (b) Redis bucket, (c) fastify proxy. Tabela com tradeoffs (latência, custo, complexidade).
```

```
9)  Traça um plano de 5 passos para migrar um SPA React (Create React App) para Vite, sem quebrar env vars nem rotas.
```

### 🔴 T3 — Arquitectura / refactor crítico (Opus)

```
10) Desenha a arquitectura de um sistema de autenticação que suporte SSO (Google + GitHub) + 2FA (TOTP + webauthn) + recuperação de sessão persistente. Diagrama textual, endpoints, state machine, segurança. Não implementes.
```

```
11) Refactor multi-ficheiro: quero separar business logic de presentation layer em todas as pages de uma app Next.js. Mapa de mudanças por ficheiro, ordem dos commits, plano de rollback se algo partir. Não escrevas código ainda.
```

```
12) Decide entre monorepo (Turborepo) vs multi-repo para um produto SaaS com 3 equipas e 4 serviços internos. Framework de decisão, tradeoffs operacionais, plano de migração se optarmos por monorepo no Q2.
```

---

## VERIFICAÇÃO FINAL

Depois do turn 12, espera-se que a statusline mostre algo como:

```
╭─ 🐮 mooter · ●T0 25% · ●T1 25% · ●T2 25% · ●T3 25% · ctx ███▓▓▒▒█░░░░ NN% ── cycle d19/30 ─╮
├─ 🐮 saved $X.XX (N%↓ vs all-Opus) · spent $Y.YY · 12 prompts · 25% local ──── ● healthy ─┤
├─ 🧠 Claude Max · Z%↓ · 5h W% · ▁▂▃▄▅▆▇ · quota $A/$B ──────────────────────── ● ─┤
╰─ 🦙 Ollama local · 25% routing · model qwen3:30b · p50 Ns · cost $0 ────── 🐮 mooter win ─╯
```

**Checklist visual**:

- [ ] 4 dots `●T0 · ●T1 · ●T2 · ●T3` aparecem (com percentagens ~25% cada ± 10%)
- [ ] T0 rose é **exactamente** a mesma cor das linhas `╭─ ├─ ╰─`
- [ ] A ctx bar tem 4 segmentos proporcionais (rose/teal/gold/red)
- [ ] L2 mostra "saved $X" + "spent $Y" + "12 prompts" (= número de turns efectivos)
- [ ] L3 "🧠 Claude Max" não menciona modelos locais
- [ ] L4 "🦙 Ollama local" aparece com share ≥ 20%
- [ ] Se local share ≥ 50%, vê-se `🐮 mooter win` à direita da L4
- [ ] Sem warnings `⚠ stale hooks` nem `⚠ tracker offline`

---

## SE ALGO NÃO BATER

| Sintoma | Causa provável | Fix |
|---|---|---|
| Só vê 1 ou 2 dots, não 4 | Classifier a agrupar tudo num tier só | Reporta os turns onde o tier foi "errado" — tuning necessário |
| T0 rose parece diferente do frame | Terminal com color profile custom | Confirma no screenshot com outro terminal |
| ctx bar fica toda gold | Todos os turns foram T2 (classifier não está a diversificar) | Ver `decisions.log` para debug |
| Linha `🦙 Ollama local` não aparece | Local share 0% → corretamente escondida OU tracker offline | Corre `node ~/.claude/tools/router/savings-tracker.js` e reabre |
| `no usage data` em providers extra | OAuth não configurado para aquele provider | Expected — só anthropic tem dados reais |

---

## REPORTA

Depois do teste, manda **1 screenshot da statusline final** + qual turn escalou para que tier (se souberes). Ajuda a afinar o classifier se algum caiu em tier diferente do esperado.

*Criado 2026-04-19 · v6.4 · corresponde a commit `bf86396`*
