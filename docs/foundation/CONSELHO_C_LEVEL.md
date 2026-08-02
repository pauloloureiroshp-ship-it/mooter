# CONSELHO C-LEVEL — as lentes de negócio, por rotação (não inflar o gauntlet)
> Porque isto NÃO entra no gauntlet: 6 lentes × N perguntas = checklist de 30 itens = efeito zero
> (Urbach 2014). O gauntlet (15) é o crivo de TODA entrega. Isto é um CONSELHO trimestral/por-marco:
> aplica-se ao ROADMAP e às decisões grandes, não a cada wave. Uma lente por rotação, com a métrica
> de referência de cada C-level. Verificado 2026-08-01.

## As 6 cadeiras — a pergunta-punhal e a métrica de cada uma

| C-level | A pergunta que só ele faz | Métrica de referência (benchmark de performance) |
|---|---|---|
| **CFO** | "Qual o custo unitário de servir 1 utilizador/mês, e a margem sobrevive quando a nuvem entra na conta?" | CAC:LTV ≥ 1:3 · gross margin ≥ 70% (SaaS) · burn multiple < 1.5 |
| **COO** | "Qual o passo do funil que quebra a 100 utilizadores — e é gente ou máquina que o segura?" | onboarding <10min · uptime do servidor MCP · % de waves fechadas sem gesto humano |
| **CMO** | "Qual a frase de 7 palavras que um utilizador repete — e onde os 1.000 primeiros vêm de graça?" | activation rate · viral coefficient (k) · CAC orgânico |
| **CIO/CISO** | "Onde um segredo, um prompt ou um dado do utilizador pode vazar — e quem o veria?" | 0 segredos no bundle · isolamento de sessão · SOC2-readiness quando houver B2B |
| **CRO** | "Qual o momento exacto em que o utilizador dá dinheiro — e o que o adia?" | time-to-first-paid · net revenue retention ≥ 100% · % free→paid |
| **CPO/UX** | "O que o utilizador consegue fazer SEM ler nada — e o que o faz desistir na 1ª tela?" | TTFW (time-to-first-win) · task success rate · SUS score |

## Como se comunicam (o fluxo que evita o silo)
Cada lente escreve UM número no cérebro do projecto (`~/.mooter/projectos/<slug>/`). O painel MEO
(artifact) agrega os 6 numa vista só — o "board da empresa-de-um". Divergência entre lentes (ex:
CMO quer velocidade, CISO quer trava) é decisão do MEO, registada com o porquê. **Nenhuma lente
manda sozinha; o conflito é o dado, não o problema.**

## Auto-improvement estratégico (os loops que o Mooter já pode fechar sozinho)
1. **Loop de qualidade** (existe): oráculo → `followup_quality` → learner. $0.
2. **Loop competitivo** (desenhado, espera 1 "sim"): radar semanal → delta no vault → acorda o MEO só na linha vermelha.
3. **Loop de métrica-norte** (novo, barato): scheduled task lê o ledger 1×/semana e escreve a série
   de AARRR + custo-por-resposta-certa no vault → o CFO/CRO vêem tendência sem pedir.
4. **Loop de doutrina** (o gauntlet): o log de `gauntlet:` é dado de calibração — pergunta que nunca
   muda nada sai; pergunta que muda sempre sobe. O sócio melhora a si próprio.
**Skills que viram automação:** cada skill que o Paulo repete 3× vira scheduled task ou hook.
Regra: 3 repetições manuais = candidato a automação (o gauntlet, o gate e o radar nasceram assim).

## A ÚNICA pergunta nova que entra no gauntlet (as outras ficam aqui, por rotação)
G15 (vive em `MEO_GAUNTLET.md`, não aqui) — passou a retro-prova porque a lacuna que ela apanha é ESTRUTURAL (comunicação entre
superfícies/lentes), não de uma persona só. As perguntas de CFO/CMO/etc. NÃO entram: são deste
conselho, aplicadas a marcos, porque uma pergunta de persona por entrega é o inchaço que Urbach mata.
