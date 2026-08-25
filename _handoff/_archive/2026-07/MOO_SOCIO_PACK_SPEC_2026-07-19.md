# 🤝 MOO-SOCIO PACK — a visão de sócio executável por QUALQUER tier (spec, design-only)

> Cowork · 2026-07-19 · Origem: doutrina sócio/skin-in-the-game (memória `user_socio_skin_in_the_game`,
> definida pelo Paulo hoje). Casa: `_handoff/` → candidata na PRÓXIMA edição da fila única (NÃO fura
> P0/P1 nem as waves VS-W* em voo). Futuro: skill pública `moo-socio` no pack moo-protocol (onda 2).
> Padrão de mercado que ancora o desenho: Agent Skills standard (Anthropic) — progressive disclosure:
> metadata sempre no contexto (~dezenas de tokens), corpo sob demanda. Mesmo princípio, aplicado à doutrina.

## 1. A correção honesta ANTES do desenho (anti-hype, doutrina nossa)

Doutrina **não transfere capacidade — transfere fronteiras.** Nenhum pack faz o Haiku raciocinar
como o Fable 5. O que um pack bem desenhado faz (e é o que importa): **sobe o PISO e limita o dano** —
o tier barato executa a tarefa rotinada dentro de fronteiras estreitas, e ESCALA quando encosta nelas,
em vez de improvisar. É a mesma tese do router (tier mínimo viável) aplicada à governança: o par
"tier mínimo + fronteira mecânica + escalação barata" ≈ resultado do tier caro NAS TAREFAS BOUNDED.
Claim de equivalência fora disso = venda de fumaça; nunca fazer.

## 2. O desenho — 3 peças (tudo projeção do canon, nunca 2ª verdade)

### P1 · Constituição destilada em 3 tamanhos (gerada por máquina, não mantida à mão)

| Pack | Budget | Consumidor | Conteúdo |
|---|---|---|---|
| **SOCIO-S** | ≤300 tokens | moo local (qwen) · Haiku/T1 · qualquer CLI em modo headless | tese em 1 linha · os 5 testes do sócio (§P2) · n/d-nunca-palpite · escala-em-dúvida · DO-NOT herdado do dispatch |
| **SOCIO-M** | ≤1k | executores T2 (CC/Codex/Gemini em wave rotinada) | S + tier ladder + regra de despacho 📮 + allowlist/frozen + council-mini (3 chaves) |
| **SOCIO-L** | ≤4k | brain (Cowork) · dispatches nível-2 | M + arco estratégico (fosso, 5 experiências, empresa-de-um) + council 8-key completo |

Geração: **distiller determinístico** (job L0/L1 — encaixe natural na Mesh fase B, custo $0 na 4090)
lê o canon (AGENTS.md + vault 00-core/40-strategy + protocolo) → emite os 3 packs com
`socio_pack: v<N>@<sha8>` + `generated_at`. Staleness: mesma regra do registry (>6h → re-verificar).
Nada é escrito à mão; editar doutrina = editar o CANON, o pack regenera. (Regra #1 do stack:
a máquina escreve os fatos.)

### P2 · SOCIO gate — os 5 testes que cabem em qualquer modelo

Todo executor fecha a entrega com um rodapé binário de ≤5 linhas (padrão council-footer):

```
🤝 SOCIO: receita? S/N/na · despesa↓? S/N/na · risco↓? S/N/na · reversível? S/N · escopo? S/N
```

Regra mecânica: `reversível=N` ou `escopo=N` (ou QUALQUER incerteza) → **PARA e escala ao brain**
com 1 linha de motivo. Nunca improvisar. É um checklist binário — barato o suficiente para um 3B
local responder; é exatamente onde modelos pequenos são confiáveis (verificação bounded, não geração).
Os 3 primeiros testes alimentam o Board/decision budget; os 2 últimos são o freio.

### P3 · Enforcement (doutrina que máquina não valida vira opinião — regra da fila §4.3)

1. Front-matter de MASTERPROMPT/HANDOFF ganha campo `socio_pack: vN@sha` (aditivo ao schema v1.1).
2. handoff-lint (Mesh, já em P1-C) valida: campo presente · versão corrente · rodapé 🤝 presente e
   bem-formado · escalação registrada quando gate reprovou.
3. moo-handoff-check confere o rodapé contra a entrega (um "reversível?S" numa entrega que fez push
   = red-flag de fabricação, mesma classe dos ids hex bonitos).

## 3. Injeção por superfície (reusa a tabela do Perfect Handoff Stack — zero mecanismo novo)

CC = hook SessionStart (S/M conforme dispatch) · Codex = AGENTS.md §boot aponta o pack · Gemini =
`.gemini/settings.json` context fileName · moos = ciclo do fleet injeta S · Cowork = boot de sessão
carrega L. Progressive disclosure na prática: **só o pack do teu tier entra no contexto; o canon
completo fica atrás de ponteiro** — é o padrão Agent Skills aplicado a governança, e é o que faz
isto ECONOMIZAR tokens em vez de gastar.

## 4. A economia (por que isto é filosofia Mooter, não burocracia)

Sem pack: tier barato erra fora de escopo → retrabalho no tier caro (o custo invisível).
Com constituição completa injetada sempre: bloat de contexto em TODA chamada (o custo visível).
O tiered S/M/L + disclosure é o ponto ótimo: ~300 tokens compram fronteiras para o tier de $0.
KPIs (todos `n/d — instrumentar via recibos P1-D`): retry-rate por tier · tokens/wave vs baseline ·
escalações corretas vs improvisos · fabricações pegas pelo cruzamento rodapé×entrega.

## 5. ♻️ REUSE — o que já existe cobre ~70%; o pack é a camada que falta

JÁ TEMOS: constituição (AGENTS.md) · língua+budgets (LF v1.1) · GPS (CONTEXT_CARD) · identidade
(registry) · envelope mecânico (preflight) · council · skills camada-1 · confronto (handoff-check).
FALTA (= este spec): a **destilação por tier** + o **gate de 5 testes** + a **versão enforced**.
Produto futuro: skill `moo-socio` no pack público moo-protocol — qualquer usuário do Mooter ganha
o mesmo efeito: prompts sempre nas melhores práticas, com o tier mínimo seguro. É o "vibe coder
opera como master sem estudar todos os dias" aplicado à própria governança.

## 6. Advogado do diabo (5 ataques, 4 procedem)

| Ataque | Veredicto | Resposta no desenho |
|---|---|---|
| "Pack não faz Haiku virar Fable 5" | ✅ procede | §1 — framing honesto: piso+fronteira+escalação, nunca equivalência |
| "Injetar doutrina em tudo = bloat, anti-Mooter" | ✅ procede | tiered S≤300/M≤1k + disclosure; medir tokens/wave antes de claim |
| "Doutrina sem lint vira opinião" | ✅ procede | P3 inteiro; sem lint, NÃO shippar o pack |
| "Já existe — é duplicação" | 🟡 parcial | §5 — é camada de destilação+versão sobre o canon, não pilar novo; se a wave achar duplicação real, corta |
| "Mais um item furando a fila" | ❌ cai | candidata para a PRÓXIMA edição; implementação = 1 wave (distiller+lint+campo no schema) APÓS VS-W0/W2 e Mesh A |

## 7. Encaixe e ⛔ STOP

Dependências: Mesh A (P1-C, lint) · recibos (P1-D, medição) · schema v1.1 aprovado. Dono provável
da wave: Codex (distiller determinístico) + CC (hooks/injeção) + Cowork (conteúdo do canon).
⛔ STOP Paulo: aprovar o conceito na próxima edição da fila → vira wave com masterprompt próprio.
📮 DESTINO: Paulo (leitura) → fila única (candidata) → wave. Registrado em memória de projeto.
