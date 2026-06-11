# Wave 53 — Anthropic Alignment V2

> Reflexão por fase: o que cada peça da Wave 53 entrega, que princípio Anthropic serve, e que anti-padrão evita (sycophancy · hype · métricas fabricadas). Toda a evidência é `file:line` real desta wave.
> Companhia: [[WAVE53_BRIEF_V3.md]] · [[REFUTATIONS_LOG.md]] · [[WAVE53_DAY0_RECON.md]] · [[EMOJI_GUIDE.md]].

> **🐂 Caveat de honestidade (CCA-F weights):** o brief V2 atribuía pesos por domínio CCA-F ("Agentic Architecture 27%", "Context Mgmt 15%", "Tool Design 18%", "CC Configuration 20%", "Reliability 15%"). Nenhum rubric no repo (`ANTHROPIC_SHOWCASE_RUBRIC_V1.md`, `MOOTER_FOR_ANTHROPIC.md`) define esses pesos — são **não-fundamentados**. Por isso o mapa abaixo é **qualitativo** (que domínio cada fase serve), sem percentagens inventadas. Definir o rubric ponderado é trabalho futuro.

---

## Mapa fase → domínio → doutrina → evidência real

| Fase | Domínio CCA-F (qualitativo) | Princípio Anthropic | Anti-padrão evitado | Evidência (file:line) |
|---|---|---|---|---|
| **A′** Cross-session chip | Agentic Architecture | Observabilidade multi-agente | Duplicar código testado · fabricar campos | `tools/router/sessions-status.js`; reusa `worktree-conductor/heartbeat.ts:59` (`listHeartbeats`) em vez de criar `discovery.ts`; só campos reais de `Heartbeat` (`types.ts:16-27`) |
| **B.3** Agent-focus chip | Agentic Architecture | Observabilidade multi-agente | Métrica fabricada | `tools/router/agent-focus-status.js` (lê `subagent_tracker.snapshot().active[]` real; duração de `started_at`) |
| **B.5** Pluggable segment | Context Management | Extensibilidade do utilizador | — | `tools/router/custom-status.js` (try/catch + clamp; ficheiro local do user) |
| **B.1/B.4** (não shipados) | Context Management | Reporte honesto | Métrica fabricada | B.1 burn-rate **adiado** (sem janela temporal real); B.4 ctx% **já mostrado** por default (`statusline-multi.js:432`) — ver [[REFUTATIONS_LOG.md]] |
| **C** Bash tokens | Tool Design | Transparência da ferramenta · anti-fabricação | Atribuir tokens por-comando (impossível) | `tools/router/post_tool_badge.js:tokenSegment` (`Σ` cumulativo real **ou** `tokens?`); refutação por transcript (`usage` é por-mensagem, não por `tool_use`) |
| **D** Emoji canon + linter | Cross-cutting (clareza UX) | Anti-hyperbole explícito | Hype emojis · contradizer glyphs intencionais | `docs/EMOJI_GUIDE.md` + `tools/lint/emoji_lint.js` (denylist `🚀🎉💯🤯🔝`; `💎` mantido = glyph de modelo) |
| **E** Slash parity | CC Configuration | Reduzir custo cognitivo (familiaridade CC) | Sombrear namespace nativo · comandos inexistentes | `.claude/skills/moo-{agents,memory,init}/SKILL.md` (aditivo, "does not replace"); `moo-skills.test.js` EXPECTED 8→11 |
| **H** Bench chip | Cross-cutting (evidência empírica) | Anti-fabricação | Mostrar snapshot do README como dado live | `tools/router/bench-status.js` (`🧪 bench ?` quando ausente/stale>30d); `explain.ts` topic `bench` honesto |
| **I** CCA-F export | Cross-cutting (auditabilidade) | Anti-fabricação · privacidade por default | Campos de token/custo inexistentes · vazar prompts | `packages/cli/src/fable-observe/cca-f-export.ts` (só campos reais; `prompt_ref` ≤50 hash-by-default) |
| **F** Final ship | Reliability | Review gate antes de merge | Shippar sem rede | `final-reviewer` (Opus) gate + `tools/router/version.json` bump + PR squash→dev |

---

## Why This Matters — por fase

**A′ — Cross-session visibility.** Dá a um operador com 3 terminais a visão das sessões-irmãs activas (branch · idade), reutilizando o protocolo de heartbeat já testado do `worktree-conductor` (`tests/worktree-conductor.test.ts:149`). Serve a observabilidade multi-agente da Anthropic. Evita dois anti-padrões: (1) **duplicação** — o brief queria um `discovery.ts` novo que reimplementava `listHeartbeats`; refutámos e reutilizámos; (2) **fabricação** — o `Heartbeat` real não tem modelo/tier/tokens/$, por isso o chip mostra só branch+idade, nunca o `opus-4.6 T3 57 calls $0.33 saved` que o mockup do brief inventava.

**B — Statusline UX.** Acrescenta foco-de-agente (`🤖 model-reasoner (sonnet, 1h12m)`) e um segmento pluggable, ambos opt-in (lines 1-2 byte-idênticas). O ponto Anthropic é **reporte honesto**: o burn-rate `$/h` foi **adiado** porque o `token_tracker` não expõe janela temporal — preferimos não shippar um número do que shippar um falso; e o `ctx%` não foi duplicado porque já existe por default. Recusar uma métrica bonita-mas-sem-dados é o oposto de sycophancy de produto.

**C — Bash tokens.** A transcript do CC prova que `usage` é reportado **por mensagem-assistant**, não por `tool_use` — logo tokens por-comando-Bash são impossíveis. Em vez de inventar, o badge mostra o total **cumulativo real** do tier (`Σ`) ou um `tokens?` explícito. Transparência da ferramenta sem fabricação — e sem tocar em `~/.claude/settings.json` (config partilhada).

**D — Emoji canon.** Codifica o anti-hyperbole da doutrina V4 numa denylist executável (`🚀🎉💯🤯🔝`), mas **reconciliada com a realidade**: `💎` é glyph de um modelo local em `model-profile.json`, não hype, por isso fica de fora. Clareza de UX que não luta contra uso intencional — e que falha o CI (`MOOTER_EMOJI_STRICT=1`) se hype reaparecer.

**E — Slash parity.** Um utilizador vindo do Claude Code procura `/agents`, `/memory`, `/init`. Damos-lhe `/moo-agents` etc. — **aditivos**, cada um declarando "does not replace" o nativo, para reduzir custo cognitivo de migração **sem** colidir com o namespace que o CC possui. Honesto sobre o que mapeia para comandos reais (`mooter conductor status`, `mooter init`) vs instruções de Read (`moo-memory`).

**H — Empirical evidence.** O `RESULTS.json` não existe (o bench é stdout-only) — refutámos a premissa do brief. O chip mostra `🧪 bench ?` por default e nunca o "60%" hand-written do README como se fosse live. Anti-fabricação igual à honestidade do chip de quota (`quota ?` quando sem dados). O número real só aparece quando alguém correr o bench e persistir o ficheiro (Wave 53.x/55).

**I — CCA-F export.** Exporta o log de observações Fable como JSONL estruturado para a auditoria da Wave 54, vivendo dentro de `fable-observe` (não uma árvore `cca-f` paralela). Honesto por construção: **sem** `tokens_in/out/cost_usd/duration_ms` (o schema não os mede) e **privacidade por default** (`prompt_ref` ≤50 chars, hash-only a menos que `store_prompts` opt-in). Auditabilidade que respeita a doutrina de privacidade.

**F — Final ship.** Nenhuma destas mudanças vai a `dev` sem o gate do `final-reviewer` (Opus) — incluindo a validação `tsc`/`tsx` do código TS (H/I) que não pôde ser compilado localmente nesta máquina sem toolchain. Confiabilidade = uma rede antes do merge, não depois.

---

## Metacognição da própria wave

A Wave 53 corrigiu o seu próprio brief **antes** de tocar em código: o Day-0 recon (9 agentes adversariais) refutou 2 premissas hard-FALSE (P5 conductor-já-cross-worktree, P6 RESULTS.json-ausente), 2 PARTIAL, e quase todos os paths das fases — registado em [[REFUTATIONS_LOG.md]]. Cada fase subsequente repetiu o padrão recon→refutar→shippar-honesto. Isto **é** o alinhamento: um sistema que reconhece e corrige os seus próprios pressupostos em vez de os forçar.

*Doctrine V4 status: 9/9 ✅.*
