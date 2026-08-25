# 🐮 MOOTER PROJECT ZERO — o Mooter como meta-produto que deixa QUALQUER projeto novo perfeito

> Cowork · 2026-07-17 · Tipo: DESIGN (estende `_handoff/MOOTER_SKILLS_MAP.md`) · Design-only, zero
> implementação, zero colisão com Fleet/Mesh/#255. ⛔ STOP: revisão Paulo antes de virar wave.
> Origem: pergunta do Paulo "transformar o Mooter em skills p/ deixar perfeito para qualquer usuário" +
> validação com evidência web 2026-07-17 (Vercel evals + SkillsBench). Casa: `_handoff/`.

## 0. A pergunta reformulada (o que o Paulo realmente está a pedir)

Não é "transformar o Mooter EM skills". É: **o Mooter é um meta-produto — o valor construído com muito
dinheiro e token tem de RENDER em cada projeto novo (dele → amigos → clientes), e a experiência do
usuário-de-projeto tem de ser perfeita, autônoma e impressionante.** Skills são um dos veículos, não o fim.

Regra que atravessa tudo: separar **como eu CONSTRUO o Mooter** (3 agentes + gate humano) de **como um
usuário USA o Mooter** (1 agente + a malha por baixo). Confundir as duas topologias = construir
complexidade que o usuário nunca precisa. Ver §4.

---

## 1. O VÍDEO — validado com evidência do dia (a resposta direta, com correção que poupa dinheiro)

**Claim do vídeo:** "pega todo o projeto/código e cria skills do próprio projeto → melhor performance."
**Veredicto: PARCIALMENTE VERDADE — e a parte falsa é exatamente a que queima token à toa.**

| Fonte (web 2026-07-17) | O que prova | Consequência p/ o Mooter |
|---|---|---|
| **SkillsBench** (arxiv 2602.12670) | skills curadas: **+16.2pp** média; ganho maior em domínios sub-representados no pretraining (healthcare +51.9, manuf +41.9, cyber +23.2) | skill de projeto AJUDA — mas só quando é conhecimento que o modelo não tem de fábrica. "Melhores práticas de React" que o modelo já sabe → ganho ~zero |
| SkillsBench | **16 de 84 tarefas NEGATIVAS** (taxonomy-merge −39.3pp) | skill pode PIORAR quando o modelo já resolve. "Pega TUDO e vira skill" = injetar ruído que degrada |
| SkillsBench | **skills auto-geradas pelo modelo: −1.3pp** — "requerem curadoria humana que o modelo não gera sozinho" | ⚠️ a parte MAIS CARA do vídeo (auto-gerar skills do codebase) DÁ NEGATIVO. Não fazer |
| SkillsBench | ótimo = **2-3 skills (+18.6pp)**; 4+ = retornos decrescentes (+5.9pp) | teto de curadoria por projeto é 2-3, não "todo o projeto" |
| **Vercel evals** (27-01-2026) | AGENTS.md passivo (índice 8KB) = **100%**; skills = **79%** com instrução explícita, **53%** (=baseline) sem | conhecimento do projeto rende MAIS como contexto passivo (AGENTS.md) do que como skill |
| Vercel | **56% das vezes o agente NUNCA invocou a skill** — falha de ativação; wording da trigger é frágil | skill que não dispara = dinheiro gasto a 0% de retorno. É o fracasso nº1 do formato |

**Tradução para a régua do Paulo (honest-copy):**
- ✅ Vale a pena: conhecimento **específico e não-óbvio** do projeto (arquitetura, invariantes, gotchas,
  domínio) → **AGENTS.md/CLAUDE.md passivo** (o canal que VENCE) + **2-3 skills curadas** para o que é
  procedural e sub-representado.
- ❌ Não vale: "auto-gerar skills do codebase inteiro" (dá negativo) · empilhar 10+ skills (ruído) ·
  duplicar em skill o que o modelo já sabe · confiar que a skill dispara sozinha (56% não dispara).

O vídeo acertou o instinto (contexto do projeto melhora o agente) e errou o método (quantidade +
auto-geração). O método certo o Mooter **já acredita**: a doutrina "skill sem medida no MooterBench não
roda local" É a disciplina "skills without evals are just markdown and hope" — antes do mercado a nomear.

---

## 2. O MOAT AFIADO PELA EVIDÊNCIA (o insight criativo — e é defensável)

O mercado acabou de descobrir, em público, os **dois fracassos** do formato skill:
1. **Ativação** — 56% das skills nunca disparam (Vercel). O agente tem de "decidir" carregar; frágil.
2. **Auto-geração** — o modelo não gera skills boas sozinho (−1.3pp, SkillsBench).

O Mooter tem resposta arquitetural para **os dois** — e é a própria frase-produto virando técnica:

| Fracasso do mercado | Resposta que só o Mooter tem | Por quê é fosso |
|---|---|---|
| Skill não dispara (56%) | **injeção determinística pelo router** — o `classify.js` já classifica TODO prompt; o hook injeta a skill/contexto certo passivamente (router-hint), não "espera o agente decidir" | "torna impossível não seguir, sem bronca" deixa de ser slogan e vira mecanismo. É EXATAMENTE o que a Vercel diz que vence (retrieval-led, sempre-ligado) — mas por-prompt e local |
| Modelo auto-gera lixo (−1.3pp) | **certificação MooterBench + fixtures de falhas reais + gate humano** — skill só entra medida, curada, com proveniência | ninguém no mercado mede skill em modelo local com score; a curadoria vem de falhas reais (FC-1..8, council-8/8-falso, fabricação Gemini), não de teoria |
| Skill de projeto envelhece / mente | **a Mesh mantém AGENTS.md/skills verdadeiros** (pointer-sentinel, doc-drift, projection-drift) | AGENTS.md vence só enquanto é verdadeiro; a malha é o que o mantém verdadeiro sozinho — o kit público não faz isso |

**Consequência estratégica:** o Mooter para de se vender como "router mais barato" (wedge que erode) e
passa a ser **"a camada que faz o conhecimento do teu projeto RENDER em cada prompt — de graça, sempre,
sem tu gerires isso"**. Custo afundado (assinatura+GPU) + agora **conhecimento afundado** (a doutrina que
já pagaste em tokens) rendendo em todo projeto novo. É o mesmo fosso, estendido do compute para o saber.

---

## 3. AS 3 CLASSES DE ATIVO QUE TRANSFEREM (o "vale para outros projetos")

Tudo que foi construído com dinheiro/token cai numa destas — e cada uma tem um veículo de transferência
diferente. Misturar veículos foi o que quase criou a 2ª verdade.

| Classe de ativo | Exemplos do que já existe | Veículo p/ o projeto novo | Ativação |
|---|---|---|---|
| **A. Motor** (routing $0, mesh, GPU-turbo, Ledger) | classify.js, fleet, gpu-stream, agent-sync-ledger | roda POR BAIXO, invisível | automática (hook) |
| **B. Doutrina passiva** (invariantes, git discipline, honest-copy, onde-vive-o-que, protocolo) | AGENTS.md, os `00-core` do vault | **AGENTS.md/CLAUDE.md scaffolded pelo `init`** — o canal que a Vercel prova vencer | passiva, sempre-ligada |
| **C. Skills curadas** (procedural, sub-representado) | moo-verify, moo-handoff-check, pricing/honest-copy, day-0 recon | **2-3 por projeto**, certificadas, **injetadas pelo router** | determinística (não "torcer") |

O loop de composição (o que faz render, honesto): projeto real do usuário gera **fixtures de falhas
reais** → alimentam a certificação → skills melhoram → "learns forever" vira honesto **cross-projeto**,
não só dentro de um. É o compounding do meta-produto: cada projeto que o Mooter toca deixa o próximo Mooter
melhor. Isto NÃO é auto-geração (que falha) — é curadoria alimentada por evidência real.

---

## 4. TOPOLOGIA DE BUILD ≠ TOPOLOGIA DE PRODUTO (a clareza que evita construir complexidade inútil)

| | Como eu CONSTRUO o Mooter | Como um USUÁRIO usa o Mooter |
|---|---|---|
| Agentes | Cowork (arquiteto) + CC (executor) + Codex (paralelo) + Gemini (crítico) + gate Paulo | **1 agente** (o que ele já usa: CC, Cursor, o que for) + a malha Mooter por baixo |
| Handoffs tipados | sim — é a camada 1 (protocolo), entre OS MEUS agentes | o usuário **nunca vê** — é infra dele, não interface |
| O que ele instala | — | `mooter init --auto`: motor + AGENTS.md + 2-3 skills + mesh + hooks |

**Implicação:** CC/Codex/Gemini são a MINHA fábrica. O produto que impressiona o amigo é **Mooter
debaixo de um agente só**. Não vender/expor a orquestração de 3 agentes ao usuário comum — é a minha
cozinha, não o prato. (A orquestração multi-agente pode virar um tier "pro/team" muito depois — não agora.)

Papéis, agora, sem colisão:
- **CC** — executa a wave moo-skills (camada 1) pós-#255; depois implementa a destilação da camada C.
- **Codex** — Fleet/Mesh A em voo (não tocar); depois auditor read-only das skills + implementador da Mesh C (o `init --auto`).
- **Gemini** — READ-ONLY; **admissão = primeiro uso real do `moo-handoff-check`** (a skill nasce validando quem fabricou prova). Estreia como crítico externo na F7.
- **Moos locais** — executores bounded das skills certificadas, só pós-certificação.

---

## 5. PROJECT ZERO — a experiência do projeto novo (o "wow" medível, do Paulo → amigos → clientes)

O gate de aceite é o próprio Paulo começando um projeto novo. A sequência que impressiona:

**Minuto 0-3 — `mooter init --auto` numa pasta nova:**
detecta stack + GPU/keys → escreve AGENTS.md (doutrina passiva, o canal que vence) + SYNC/MEMORY/LOOP +
hooks + registra a mesh conforme a GPU → **cura 2-3 skills** casadas ao tipo de projeto (não 10) →
`doctor` prova com Radar verde só com prova. Diff mostrado antes de escrever (nada às cegas).

**Primeiro prompt que o Paulo digita:**
- roteia local $0 (<50ms) quando dá — recibo visível
- o contexto/skill certo **já injetado** pelo router (sem falha de ativação — a resposta ao 56% da Vercel)
- `moo-verify` como stop-gate determinístico → **não sobe código que quebra teste/type** ("sem erros" vira mecânico, não promessa)
- Cockpit mostra o recibo ("$0 · GPU pagou X% · skill Y injetada")

**Dia seguinte:**
Morning Brief pré-cozido pela GPU ociosa (custo afundado rendendo de madrugada) → Resume de 60s.

**Por que impressiona (e é honesto):** o usuário não estudou vibe coding, não configurou skills, não
geriu ativação — e mesmo assim saiu com estrutura de topo, best-practices aplicadas, custo $0 e prova.
É a frase-produto executada ponta-a-ponta. **Token/tempo-eficiente por construção:** doutrina no canal
passivo barato (AGENTS.md), só 2-3 skills (SkillsBench), transforms no local $0, cloud só no que exige.

---

## 6. O QUE FAZER — sequenciado, sem furar a fila (WIP baixo)

| # | Passo | Depende de | Custo | Nota honesta |
|---|---|---|---|---|
| 1 | ⛔ Paulo aprova §1 (a correção do método) + a direção meta-produto | — | 0 | é a decisão que evita gastar token na parte errada do vídeo |
| 2 | Merge #255 (protocolo) | — | — | gate de tudo; já pronto |
| 3 | Wave moo-skills camada 1 (as 5 skills do mapa) | #255 | dias | interfaces finas; CC; já tem masterprompt (E4) |
| 4 | **Curadoria Project Zero:** decidir as 2-3 skills que o `init` instala num projeto novo (candidatas: moo-verify + honest-copy + 1 do stack) | SkillsBench aplicado | horas de design | **isto é novo — o coração do produto**; ver §7 |
| 5 | AGENTS.md-template genérico (a doutrina passiva sanitizada, sem paths Mooter) — o canal que vence | curadoria | design | reusa `00-core` do vault (já generalizados) |
| 6 | Mesh C = `mooter init --auto` liga tudo (SCAFFOLD) | Mesh A/B em voo | wave | já na fila (P2-10); é onde Project Zero aterra |
| 7 | Onda 2 público (pack `moo-protocol`) | uso interno real | decisão pendente | mattpocock#306 é o relógio (§4 do mapa) |

**Não fazer agora:** auto-gerar skills do codebase (evidência: negativo) · empilhar skills · construir
UI nova · expor a orquestração de 3 agentes ao usuário · publicar sem sanitização.

---

## 7. CURADORIA PROJECT ZERO — quais 2-3 skills (aplicando SkillsBench à régua do Paulo)

Critério mecânico: entra a skill que é **procedural + sub-representada no pretraining + previne falha real
+ dispara determinística pelo router**. Sai o que o modelo já sabe (React genérico → vai pro AGENTS.md).

| Candidata | Entra no Project Zero? | Porquê (SkillsBench + falha real) |
|---|---|---|
| `moo-verify` | ✅ nº1 | crítico externo $0 determinístico; previne "código que quebra"; nenhum modelo faz isto sozinho |
| honest-copy / `pricing-correto-2026` (generalizada) | ✅ nº2 | "toda métrica com fonte ou n/d" — disciplina que o modelo NÃO tem de fábrica; previne fabricação |
| 1 skill do STACK do projeto (curada, não genérica) | ✅ nº3 (variável) | o único slot "domínio"; só se for gotcha real do stack, não best-practice óbvia |
| handoff/protocolo (camada 1) | ❌ no produto | é topologia de BUILD, não do usuário-1-agente (§4) |
| resto das 21 | ❌ | interfaces do motor (rodam por baixo) ou pré-LF (housekeeping) |

Teto = 3. Se um projeto "precisa" de mais, o excedente vai para AGENTS.md passivo (mais barato, sem
falha de ativação, e a Vercel prova que rende mais). **Menos skills, melhor curadas, injetadas
determinísticamente** — é a tese do produto e é o oposto do "pega tudo" do vídeo.

---

## O que este blueprint NÃO faz
❌ implementar · ❌ auto-gerar skills (evidência: negativo) · ❌ decidir pelo Paulo (é recomendação) ·
❌ tocar em voo (Fleet/Mesh/#255) · ❌ prometer número não medido (MooterBench fase B = n/d) ·
❌ confundir topologia de build com produto.

🔍 council 8/8 · objeção mais forte: "isto reposiciona o produto (router→camada-de-conhecimento) — é
mudança de tese, não só de skills; risco de dispersar o foco da fila atual" · resolvida: NÃO é tese nova
— é a MESMA tese (custo/saber afundado rendendo) estendida do compute para o conhecimento, e aterra na
Mesh C que JÁ está na fila (P2-10); nada de novo se cria fora dela. O reposicionamento é de narrativa, não
de roadmap.
