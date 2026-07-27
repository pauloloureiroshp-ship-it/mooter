# ⇄ COWORK → COWORK (Fable 5) · SKILLS DISTILLATION — a experiência do ciclo vira skills

> Cowork · 2026-07-17 · Budget ≤8k · Tipo: MASTERPROMPT · Consumidor: NOVA conversa Cowork/Fable 5.
> Origem: ciclo remediação+LF+mesh (2026-07-16/17) provou à mão um modelo de operação multi-agente
> que o reuse gate confirmou não existir pronto no mercado (A2A/AHP/ChainThread confrontados no P1
> da LF: nenhum cobre repo-native + 4 mensagens + verdade Git + gate humano). Destilar AGORA,
> enquanto a matéria-prima está fresca. Casa: `_handoff/`.

🎯 GOAL   Transformar a experiência operacional do Mooter em SKILLS especificadas (não implementadas):
          inventário do que existe → mapa de gaps (o que o ciclo fez à mão e não é skill) → spec das
          top-5 → decisão interno vs. publicável → masterprompt executável da wave de implementação.
📍 BOOT   Ler nesta ordem: vault `40-strategy/mooter-agentic-os-playbook` §1+§8 · vault
          `40-strategy/mooter-prioridades-2026-07-16` (com adendos) · `_handoff/MOO_LINGUA_FRANCA_
          MASTERPROMPT.md` (P1–P6) · PR #255 (o canon real: AGENT_CONTEXT_PROTOCOL "Lingua Franca v1"
          + templates + fixtures) · `_handoff/MOO_HARMONY_MESH_BLUEPRINT.md` §1.8+§3 (skills
          certificadas + mapa já esboçado) · vault `00-core/protocolo-comunicacao.md` +
          `onde-vive-o-que.md` (regra de despacho, gatilhos de registro) · `tools/handoff-preflight.js`
          (o validator vivo) · `.claude/skills/` (as 21 existentes) + `packs/` (9 domínios).
🔒 GUARD  Design-only: ZERO implementação, zero código no repo, zero colisão com executores (Fleet/
          Mesh A1 em voo) · skill = INTERFACE que aponta pro canon (#255) — NUNCA duplica o conteúdo
          do protocolo (duplicar = criar a 2ª verdade que passamos o ciclo matando) · nada ships
          antes do #255 mergeado · honest-copy em qualquer spec publicável (zero paths pessoais,
          zero segredos, zero claims não medidas) · council+CCA nos teus próprios outputs.

## 1. INVENTÁRIO (o que já existe — confrontar, não assumir)
Mapear as 21 skills de `.claude/skills/` + os 9 packs + as skills do lado Cowork do Paulo
(sync-project, notion-to-vault, boot-vault) contra as 5 experiências (Resume·Plan·Route·Watch·Review):
quais cobrem o quê, quais estão pré-tese-v2 (candidatas a refresh), quais são redundantes.

## 2. MAPA DE GAPS — o que o ciclo 2026-07-16/17 fez À MÃO (a mina de ouro)
Para cada padrão, citar o momento real do ciclo que o prova (os handoffs/scorecards são as fixtures):
| Padrão manual do ciclo | Skill candidata | Consumidor |
|---|---|---|
| Handoff tipado + preflight + rodapés | `moo-handoff` (emitir) / `moo-handoff-check` (avaliar — o scorecard 9.3/10) | todos os agentes |
| Regra de despacho 📮 (destino+sessão) | `moo-dispatch` | Cowork/brain |
| Council 8 perguntas + anti-sycophancy | `moo-council` | todos |
| Gatilhos de registro (vault/Notion/memória) | `moo-registro` | Cowork/brain |
| Composição de masterprompt (GOAL/WHERE/GUARD/GATE/STOPs + reuse + allowlist) | `moo-masterprompt` | brains |
| Decision contract tipado | `moo-decision` | brains |
| Review-no-STOP (confrontar código via refs partilhadas, diff crítico FC-8) | `moo-stop-review` | Cowork/revisores |
Completar/da cortar a partir da evidência real — a tabela acima é hipótese, não conclusão.

## 3. SPEC das TOP-5 (só as de maior alavanca — WIP baixo vale para skills também)
Por skill: nome · descrição de trigger (quando dispara — otimizada, estilo skill-creator) · o que
faz passo a passo · o que REFERENCIA do canon (path exato, nunca cópia) · fixtures (dos handoffs
reais do ciclo) · como será medida (MooterBench/local quando aplicável — blueprint §1.8: skill sem
medida não roda local) · dependências (ex.: handoff:preflight).

## 4. DECISÃO interno vs. PUBLICÁVEL (a pergunta de valor do Paulo)
Fato verificado (reuse gate LF P1): não existe solução pública para este contrato — logo o skill
pack do modelo de handoff tem potencial de DISTRIBUIÇÃO (Agent Skills = padrão aberto; marketplaces
existem; seria o Mooter exportando metodologia, não só produto). Avaliar com advogado do diabo:
o que ganha o Mooter publicando (autoridade, funil, o "melhor prompt engineer do mercado" que o
Paulo quer ser) vs. o que perde (fosso? — provavelmente nada: o fosso é motor+GPU, metodologia
publicada é marketing) · o que precisa sanitizar · qual licença · web do dia OBRIGATÓRIA: reconfirmar
estado dos marketplaces/skills públicas antes de recomendar. Entregar recomendação fundamentada
para decisão do Paulo — não decidir por ele.

## 5. ENTREGÁVEIS + STOPs
| # | Entregável | Gate |
|---|---|---|
| E1 | `_handoff/MOOTER_SKILLS_MAP.md` — inventário + gaps + top-5 escolhidas com porquê | ⛔ STOP revisão Paulo/Cowork |
| E2 | Specs das top-5 (dentro do E1 ou anexas) | mesmo STOP |
| E3 | Recomendação interno vs. publicável (§4) com evidência web do dia | mesmo STOP |
| E4 | Masterprompt executável da wave de implementação (pós-#255 merged; allowlist exata; usa skill-creator como ferramenta) | entregue junto, executa DEPOIS |

## O que NUNCA fazer
❌ Implementar skill nesta conversa · ❌ duplicar canon dentro de skill · ❌ inventar 8ª skill "porque
seria legal" (5 é o teto desta rodada — WIP) · ❌ recomendar publicação sem sanitização listada ·
❌ tocar em qualquer worktree/ficheiro dos executores · ❌ prometer measurement que o MooterBench
ainda não faz (fase B) — dizer n/d.
