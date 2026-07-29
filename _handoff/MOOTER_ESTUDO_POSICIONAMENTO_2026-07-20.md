---
type: STRATEGY-STUDY
id: mooter-posicionamento-empacotamento-20260720
from: cowork (brain, papel de sócio)
severity: high
generated_at: 2026-07-20
socio_pack: v1@manual (tier L)
fontes: 3 pesquisas paralelas (repo+vault · teardown competitivo web · best-practices UX+rubrica) — SHAs/URLs citados
---

# MOOTER — Estudo de posicionamento e empacotamento
## "Deixar Cursor e Lovable no chinelo" — no eixo certo, com prova, não com marketing

> Pedido do Paulo (07-20): entender o Mooter a fundo, formar opinião de sócio, cruzar estratégia, avaliar
> forças/fraquezas nossas e dos concorrentes, empacotar o Mooter pra qualquer um, subir a minha nota de vibe
> coder, e fazer algo que a Anthropic ficaria impressionada. Advogado do diabo ligado do início ao fim.

---

## 1. TL;DR — a tese em 6 linhas

1. **O mercado acabou de descobrir a dor pra qual o Mooter foi construído.** Junho/2026 = "Tokenpocalypse": todos migraram pra cobrança por token, contas saltando 10–60× ("$29→$750", "$50→$3.000"). A imprensa (TechCrunch, Forbes, The Register) chama de "AI custa mais que o dev". A solução que o próprio mercado nomeia = **"measurement layer / AI FinOps"**. Essa é a categoria do Mooter, não dos incumbentes.
2. **Ninguém combina os 3 que o Mooter combina:** roteamento por custo + **custo real exposto em tempo real** + **auditoria por projeto**. IDEs/builders (Cursor, Lovable, Copilot, Windsurf, Bolt, v0) escondem custo em créditos opacos (é o modelo de negócio deles — opacidade é feature). OSS (Cline, Aider) dá multi-provider mas roteamento **manual** e sem auditoria.
3. **Minha opinião de sócio (posicionamento):** o Mooter **NÃO** é rival do Cursor/Lovable no eixo IDE — competir em UX de IDE contra players de US$9B é perder no campo deles. O Mooter é o **wedge de FinOps + confiança**: senta EM CIMA dos agentes que o dev já roda (Claude Code/Codex/Gemini/Cursor) e faz o que nenhum deles vai fazer porque a margem deles depende da opacidade. É **aí** que os deixamos no chinelo.
4. **A convergência que fecha tudo:** o gap nº1 do PRODUTO (medir → testar → shippar) é **o mesmo** gap nº1 do Paulo como vibe coder (pilares 9=4, 8=5.5, 10=3). Consertar um conserta o outro. Essa é a história que impressiona.
5. **A ameaça real não é o Cursor** — é o `llm-router` (OSS, mesmo alvo, 70–85% savings) e os gateways FinOps (Requesty/Portkey/LiteLLM). Eles falham em tempo-real + UX + auditoria. É lá que cravamos.
6. **O que fazer:** parar de vender "routing" (commoditizando) e cravar **transparência em tempo real + confiança auditável + cockpit do vibe coder**. Instrumentar o Ledger (mata o "n/d") é o primeiro dominó — é moat E é a minha nota subindo.

---

## 2. O momento de mercado — a onda a surfar

| Fato 2026 | Evidência | Implicação pro Mooter |
|---|---|---|
| Fim do flat-rate ("Tokenpocalypse") — Copilot (1/jun), Cursor, Windsurf, Codex, Claude Code migraram pra usage-based quase juntos | UsageBox · TechCrunch · The Register | A dor virou universal e aguda AGORA |
| Bill shock agêntico 10–60× ("rug pull") | UsageBox ($29→$750) · TechTimes (Copilot "10x surge") | O medo de fatura é o gatilho de compra |
| Imprensa mainstream: "agentes custam mais que o dev" | Forbes · The Register · Gartner/Computer Weekly | Legitimidade de categoria (não é nicho técnico) |
| O mercado nomeia a solução: "measurement layer / AI FinOps" | UsageBox (conclusão do artigo) | **É a definição do Mooter** |
| Custo real observado: ~US$13/dev/dia ativo em Claude Code | getDX | O ROI do Mooter é defensável com número de terceiro |

**Sócio:** não existe timing melhor. A tese do Mooter deixou de ser "premonição do Paulo" e virou manchete. A janela é agora, antes de um incumbente lançar um "cost dashboard" nativo pra desarmar a dor.

---

## 3. O que o Mooter é (destilado, pra não nos enganarmos)

**Categoria:** control plane / cockpit em VS Code + CLI (open-source, MIT) que instala, vigia e pilota projetos multi-agente, com um **router determinístico local-first ($0, <50ms, regex, sem proxy)** como motor. Mantra: *"o motor é o fosso; a cabine é o produto"*. Fonte: `frugal/README.md`, `AGENTS.md`, `paulo-vault/40-strategy/mooter-agentic-os-playbook.md`.

**A régua das 5 experiências** (uma mudança só entra se melhorar uma): **Resume · Plan · Route (invisível) · Watch · Review**.

**O que já é real (com prova):** router two-axis + classify FROZEN (sha CI-enforced) · savings medido 65–82% vs all-Opus · Lingua Franca v1 merged (#255, `d108a40`) · extensão com suites verdes (1209/1209 LP, 1176/1176 MEO) · fleet 24/7 na 4090 · dashboard real ($25.95 poupados/47%/658 calls).

**O gap que trava tudo (do próprio vault):** o **Ledger/medição (P1-D) não instrumentado** → todo KPI de eficiência é `n/d` (Resume ≤60s nunca cronometrado, tokens/wave, drift). Testes do plugin fracos (nasceu com 8). Nunca lançado (n=1). Fundação suja (12 worktrees, 426 untracked).

---

## 4. Teardown competitivo (o campo)

| Player | Categoria | Pricing 2026 | Força | **Fraqueza de custo (nossa brecha)** |
|---|---|---|---|---|
| Cursor | IDE | $20 Pro→$200 Ultra; pool+overage | UX agêntica líder | pool opaco; aumento "silencioso" 20× |
| Windsurf | IDE | $20 Pro→$200; quota diária | autocomplete ilimitado | créditos secam rápido; custo abstrato |
| GitHub Copilot | extensão+agente | $10→$100; AI Credits (jun/26) | distribuição GitHub | **bill shock 10×; créditos invisíveis no VS Code** |
| Lovable | app-builder | $25 Pro+; créditos variáveis | prompt-to-app p/ não-dev | créditos "caça-níquel"; custo invisível |
| Bolt.new | app-builder | $25; por tokens | full-stack no browser | token burn imprevisível |
| v0 | UI-builder | $20; créditos por modelo | qualidade de UI | modelo próprio; sem multi-LLM |
| **Cline** | extensão OSS | grátis + BYOK | multi-provider, sem lock-in | **sem auto-routing por custo; sem auditoria** |
| **Aider** | CLI OSS | grátis + BYOK | git-native; custo/sessão no terminal | sem atribuição por projeto; routing manual |

**O espaço vazio — CONFIRMADO:** nenhum dos 8 combina auto-routing por custo + **custo real em tempo real** + **auditoria/atribuição** sobre os agentes que o dev já roda. Nos IDEs/builders a opacidade é o modelo de negócio; no OSS o routing é manual e sem auditoria.

**⚠️ Advogado do diabo — as ameaças reais (não são o Cursor):**
- **`llm-router` (OSS, GitHub):** mesmo alvo (Claude Code+Codex+Gemini+Cursor via hooks/MCP), alega 70–85% savings. **Falha em:** custo em tempo real na UI (só logs SQLite retrospectivos) e UX (é CLI cru). ← é aqui que ganhamos.
- **Gateways FinOps (Requesty, Portkey, LiteLLM, OpenRouter):** roteamento+dashboards, mas mirados em produção/apps, não em "cockpit do dev sobre coding agents". Risco de descerem pro nosso caso.
- **Cline** já prega "never locked in" + custo estimado por tarefa. Se somar auto-routing por custo + auditoria, vira rival frontal **com a distribuição de extensão que já tem.** Vigiar de perto.

---

## 5. A tese de posicionamento (minha opinião de sócio — a resposta que pediste)

**Mooter = a camada de FinOps + confiança auditável para vibe coders, sobre os agentes que eles já usam.**

Não é "mais um router" (commoditizando) nem um "IDE rival" (campo perdido). É a **camada de honestidade** que os incumbentes estruturalmente **não podem** entregar — porque a margem deles vive da opacidade que causou a Tokenpocalypse. O Mooter transforma a maior dor de 2026 (medo de fatura + desconfiança do que o agente fez) em **feature**: custo real na tua cara em tempo real, roteado pro tier mínimo, e cada ação do agente auditável e reversível.

**"No chinelo" — no eixo certo (honesto):**
- ❌ NÃO "melhor IDE que o Cursor" (perde).
- ✅ "O Cursor te esconde quanto gastou; o Mooter te mostra em tempo real e ainda corta 65–82%."
- ✅ "O Lovable queima créditos que você não vê; o Mooter te dá o recibo por tarefa."
- ✅ "O `llm-router` te dá um log SQLite depois; o Mooter acende o semáforo na hora."

**A frase de venda (uma):** *"Você não sabe quanto seu agente de IA gastou nem o que ele fez. O Mooter sabe, corta o custo, e te deixa auditar tudo — sem trocar de ferramenta."*

**Por que a Anthropic se impressiona:** o Mooter faz o Claude Code parecer *responsável e barato* — reduz o atrito nº1 (bill shock) que faz gente cancelar, sem competir com a Anthropic. É um multiplicador de retenção do Claude Code, construído por um não-dev em 50 dias, com um protocolo de handoff (Lingua Franca) à frente do OpenAI Agents SDK. Isso é uma história de plataforma, não de plugin.

---

## 6. O moat honesto (o que é defensável × o que já commoditiza)

| Camada | Defensável? | Leitura de sócio |
|---|---|---|
| Roteamento multi-LLM | 🟡 commoditizando | llm-router/gateways já fazem. NÃO é o pitch. |
| Router determinístico local-first $0/<50ms | ✅ forte | difícil de replicar bem; mas prova-se com o Ledger, não com slide |
| **Custo real em tempo real na UI (semáforo/statusline)** | ✅✅ o mais forte | é o que TODOS evitam; é o "no chinelo" |
| **Auditoria/atribuição + trust UX (decision packet, gates, undo)** | ✅✅ forte | vira confiança; o vault já pratica confront-before-accept |
| Fleet local rendendo 24/7 (custo afundado) | ✅ forte | vendors não têm incentivo de copiar (vendem token) |
| Lingua Franca (handoff tipado) | ✅ à frente | OpenAI Agents SDK só tipifica metadados |
| Cabine/UX polida | 🟡 replicável | é a última milha; não é o fosso — mas é o que faz "qualquer um" adotar |

**Devil's advocate:** metade do pitch do motor ("learns forever") **não está provado** (#239), e a "percepção de produtividade mente 39 pontos" (METR RCT). Regra-mãe: **nenhuma claim de eficiência sem Ledger medido.** Por isso o Ledger é o primeiro dominó — sem ele, o moat é narrativa.

---

## 7. O plano de empacotamento "pra qualquer um" (UX/UI) — as 5 experiências × best-practices

Best-practices confirmadas (2026): time-to-first-value hands-on move adoção (**63% vs 42%** de produtividade plena); o inimigo é **complexidade, não preço** (27% desalinhamento / 26% complexidade / 15% custo); **integração nativa VS Code** (não UI paralela); não-intrusão; comunidade retém. Trust-UX = "decision packet" (ação+params exatos, delta antes/depois, reversibilidade explícita, comandos além de sim/não). Fontes: instruqt · VS Code UX Guidelines · getDX · Edilec.

| Experiência | Hoje | Alvo "pra qualquer um" | Best-practice que aplica |
|---|---|---|---|
| **Route** (invisível) | funciona | deve permanecer invisível + 1 clique pra "ver por quê" | defaults sensatos > features (P2) |
| **Watch** | semáforo/statusline | **custo real em tempo real** = o "aha moment" nº1 (não um tour) | hands-on TTFV (P1); cost-per-outcome transparente (getDX) |
| **Review** | confront/gates | **decision packet** em toda ação de risco (push/deploy/merge): params exatos, delta, reversibilidade, undo | Edilec approval screens; trust UX |
| **Resume** | existe, `n/d` | cronometrar (≤60s) e mostrar — vira prova | Ledger P1-D; baseline desde o deploy |
| **Plan** | masterprompts | walkthrough de onboarding multi-step (VS Code walkthroughs API) | onboarding hands-on (P3) |

**O "primeiro momento mágico" (first-magic onboarding):** a instalação tem que, em <2 min e sem docs, produzir **um recibo real de economia** ("você acabou de rotear isto pra Haiku e economizou $X"). Esse é o hands-on aha que a literatura aponta como alavanca nº1. Já existe branch `feat/first-magic-onboarding` — é P0 de empacotamento.

---

## 8. A convergência (o insight que amarra o produto e o Paulo)

O gap nº1 do **produto** e o gap nº1 do **Paulo como vibe coder** são o **mesmo trio, na mesma ordem de dependência**:

| Ordem | Produto (vault prioridades) | Paulo (vibe-coder score) | Um conserto, dois ganhos |
|---|---|---|---|
| 1º | **Medir** — Ledger P1-D, matar `n/d` | Pilar 9 = **4** (trava os outros) | instrumentar = moat provado **E** nota sobe |
| 2º | **Testar** — plugin nasceu com 8 testes | Pilar 8 = **5.5** (gap técnico) | "toda wave nasce com teste" = qualidade **E** pilar sobe |
| 3º | **Shippar** — nunca lançado, n=1 | Pilar 10 = **3** (gap nº1) | teste do amigo/F5 = distribuição **E** pilar sobe |

**Sócio:** isto é ouro narrativo. O Mooter não é um produto que o Paulo constrói — é o **espelho auditável** da evolução dele. É literalmente a tese do "RH Vibe Score / Currículo Vivo" aplicada a si mesmo. Instrumentar o Ledger é o único movimento que avança produto, moat e nota ao mesmo tempo. **É o primeiro dominó, sem ambiguidade.**

---

## 9. Plano de subir a minha nota de vibe coder (Paulo: 7.2 → alvo)

Já sênior em orquestração/governança/economia (pilares 3-4-5 = 8-9; = o próprio fosso do Mooter aplicado a ti). O caminho é fechar os 3 baixos, **nesta ordem** (dependência real):

| Pilar | Hoje | Movimento concreto | Vira "medido" quando |
|---|---|---|---|
| Medição & honestidade (9) | 4 | instrumentar Ledger (tokens/tempo/savings/Resume) | KPIs deixam de ser `n/d` |
| Testes & qualidade (8) | 5.5 | regra universal "toda wave nasce com teste"; subir cobertura do plugin | suite do plugin cresce com evidência |
| Ship & distribuição (10) | 3 | first-magic onboarding + teste do amigo (F5 real com 1 pessoa externa) | 1 usuário externo instala e usa |
| (novo sub-pilar) Segurança | n/d | checklist SQLi/CORS/auth-bypass + scan de deps por default | — (a web aponta como separador sênior; não está no teu score ainda) |

**Vantagens injustas a explorar** (do vault): domínio jurídico/compliance/RH (fosso onde regulação de IA em contratação é barreira — EU AI Act/LGPD/EEOC), mentalidade de sócio (skin in the game), RTX 4090 24/7, disciplina de documentação. **Trap a evitar (vault):** dispersão / começar um 5º projeto. ❄️ Foco.

---

## 10. Próximas waves (mapeadas a masterprompts — prontos, segurados até o CC v2 fechar)

| # | Wave | LLM (papel) | Entrega | Estado |
|---|---|---|---|---|
| A | **Ledger/medição P1-D** — instrumentar tokens/tempo/savings/Resume, matar `n/d` | **Codex** (dados/determinístico) | KPIs medidos, honest-copy | 🔜 masterprompt pronto |
| B | **Realtime cost transparency + first-magic onboarding** — o aha de <2min + decision packet no Review | **CC** (plugin/UX) | Watch/Review/Plan no alvo | 🔜 masterprompt pronto |
| C | **Verificar as claims** — o Ledger não fabrica? o savings bate? | **Gemini** (verify working-tree) | confront read-only | 🔜 masterprompt pronto |
| D | teste do amigo / F5 real (distribuição) | **Paulo** (é gate humano) | 1 usuário externo | 🟡 depende de A+B |

**Regra:** não disparar A/B/C enquanto o CC trabalha no integ-g1 v2. Assim que ele fechar e o bus for único, o Ledger (A) assenta sobre o bus único — ordem correta.

---

## 11. O que faria a Anthropic impressionar (o ângulo de plataforma)

1. **Retenção do Claude Code:** o Mooter ataca o atrito nº1 (bill shock) que faz gente cancelar — faz o CC parecer barato e responsável, sem competir com a Anthropic.
2. **Trust layer nativo:** decision packets + auditoria = a resposta de segurança/governança que a Anthropic prega, implementada por um usuário.
3. **Lingua Franca à frente do mercado:** protocolo de handoff mais completo que o OpenAI Agents SDK — construído por um não-dev.
4. **Prova viva de "AI como multiplicador":** 4 produtos em produção em 50 dias, com um Ledger auditável do próprio processo (o Currículo Vivo). É o case de estudo do que a Anthropic vende.

**O que falta pra virar essa história:** o Ledger medido (mata o `n/d`) + 1 usuário externo (mata o n=1). Ambos no plano acima.

---

## 12. Riscos / advogado do diabo (o que pode nos derrubar)

| Risco | Mitigação |
|---|---|
| **Gargalo = atenção do Paulo** (todo irreversível passa por ti) | manter gates, mas automatizar o reversível; não escalar tudo pro humano |
| **Claim sem medição = teatro** (METR: percepção mente 39pts) | Ledger primeiro; "n/d nunca palpite" (já é doutrina) |
| **`llm-router`/Cline nos alcançam** | cravar tempo-real + auditoria + UX (onde eles falham), não "routing" |
| **Incumbente lança cost dashboard nativo** | velocidade + o fleet local + auditoria (que eles não copiam) |
| **Fundação suja atrasa o ship** | consolidar árvore antes do teste do amigo |
| **Dispersão (5º projeto)** | ❄️ foco no trio medir→testar→shippar |
| **Bus factor 1** (1 Paulo, 1 4090, 1 casa) | risco estrutural aceito; documentar pra transferibilidade |

---

📮 **Fonte única deste estudo.** Espelho: vault `40-strategy/mooter-posicionamento-empacotamento-2026-07.md` + Notion Mooter HQ. Os masterprompts A/B/C ficam prontos e segurados até o `integ-g1-cc-v2` fechar.
