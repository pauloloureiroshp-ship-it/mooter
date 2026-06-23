# Mooter — Masterprompt de Redesign (Web + Plugin VS Code)

> Gerado 2026-06-14 a partir de auditoria live do `mooter.ai` (homepage, login, `/compare`) **+ do plugin
> VS Code "MOOTER: COCKPIT" v0.8.2** (9 tabs, analisado nos prints e no código), cruzado com `SYNC.md`,
> `STRATEGY.md`, `globals.css`, `design-handoff/IMPLEMENTATION_SPEC.md`, `packages/vscode-extension/` e Notion.
> Duas versões: **A) brief para Claude Code** (executa no repo) · **B) versão portável** (qualquer agente de design).
>
> **Framing central:** web e plugin **partilham o mesmo design system** — o plugin importa `globals.css` verbatim
> (`--ink #0B0A09`, `--r #E8888A`, tiers T0–T3). Trata-os como **um sistema, dois alvos de render**
> (DOM web + webview VS Code), com regras próprias onde o contexto difere (o webview herda `--vscode-*`).

---

## 0 · Análise — visão × site real (confronto)

O design system já é maduro e honesto (dark warm, rose `#E8888A`, Space Grotesk + JetBrains Mono, tom founder-pragmatic
sem hype). Não é um problema de fundação — é de **consistência, hierarquia e conversão**. Gaps concretos encontrados na auditoria:

| # | Gap | Onde | Severidade |
|---|---|---|---|
| 1 | **Versão inconsistente** — badge home diz `v1.38.0`, `/compare` diz `v1.21.5`, repo está em `v1.38.5` | hero + compare | ⚠️ alta (credibilidade) |
| 2 | **Placeholder em prod** — "Last updated unknown" visível no fim de `/compare` | /compare | ⚠️ alta |
| 3 | **Prova social contraditória** — hero afirma "$25.95 alltime · 47%" mas o community pulse mostra "$0.00 saved · 2 devices · 61 prompts" lado a lado | homepage | ⚠️ alta (mata confiança) |
| 4 | **Bleed de layout** — no ecrã de login ("Route smarter.") o terminal mockup à direita transborda o viewport (cortado na margem) | /dashboard (login gate) | 🟡 média |
| 5 | **Densidade extrema** — `/compare` tem 2 tabelas grandes (11×8 + ~19×6); a segunda é difícil de ler e arriscada em mobile | /compare | 🟡 média |
| 6 | **Hero text-heavy** — 2 parágrafos longos + sub-bullet antes do CTA; muito a ler above-the-fold, CTA empurrado para baixo | homepage | 🟡 média (conversão) |
| 7 | **Jank de animação** — o loop do terminal mockup (cicla T1→T2→T3) congela o renderer intermitentemente | hero + login | 🟡 média (perf) |
| 8 | **Dashboard sem teaser** — visitante não-autenticado só vê o login; zero preview do valor logado | /dashboard | 🟢 baixa (oportunidade) |

**A preservar (não mexer):** paleta warm dark (`#0B0A09`, nunca `#000`), texto warm off-white (`#F2EDE6`, nunca `#FFF`),
accent rose, cores por tier (T0 verde / T1 azul / T2 roxo / T3 coral), tom honesto ("real data, not a community average"),
mark "Got Moo?", JetBrains Mono para números/código.

### 0.1 · Plugin VS Code "MOOTER: COCKPIT" v0.8.2 (gaps)

Stack: webview no sidebar, HTML/CSS/JS inline em `packages/vscode-extension/src/extension.js` (CSS ~600L num `<style>`,
sem bundler, sem React), tokens importados de `globals.css` (v0.4), sobrepostos com `--vscode-*`. 9 tabs: Cockpit · Setup ·
Install · Models · Herd · Insights · Decisions · Terminal · Doctor. Testes: `cd packages/vscode-extension && npm test`.

| # | Gap | Onde | Severidade |
|---|---|---|---|
| P1 | **Número-herói enganador** — Cockpit mostra `$0.17` grande a verde mas logo abaixo "real $0.00 vs naive $0.17"; Insights mostra `0%` cache-hit como herói verde. Verde (=sucesso) usado para valores zero/advisory | Cockpit, Insights | ⚠️ alta (credibilidade) |
| P2 | **Contradição de estado** — header diz "Claude Code ✓" mas Setup→Software diz "Claude Code missing" | header vs Setup | ⚠️ alta |
| P3 | **"50%" no header sem label** — é o Mooter Score (4/8); aparece como pill verde solta sem contexto | header | 🟡 média |
| P4 | **Redundância Cockpit↔Doctor** — a checklist do Mooter Score (4 itens "fix") está duplicada quase igual nas duas tabs | Cockpit, Doctor | 🟡 média |
| P5 | **9 tabs num sidebar estreito** — tira horizontal apertada, risco de wrap/overflow; navegação densa de mais | toda a chrome | 🟡 média |
| P6 | **Empty/first-run incoerente** — muitos "missing" a vermelho itálico (lê-se como erro, não como "a fazer"), "no run active", "no spawns yet", tabelas esparsas. Falta um first-run guiado que canalize para o Mooter Score | Setup, Herd, Decisions | 🟡 média |
| P7 | **Barra "ask mooter anything" repetida** em cada tab a consumir altura; devia sentir-se como um elemento global único e ser a interação-herói | todas as tabs | 🟢 baixa |
| P8 | **Warm-brand vs VS Code nativo** — na prática domina o cinza nativo `--vscode-*` com verde; o rose e o warm `--ink` quase não aparecem. Decidir deliberadamente o equilíbrio (lean-in à marca vs nativo + accent) e alinhar com a web | toda a chrome | 🟡 média |
| P9 | **Decisions esparsa + truncagem** — 2 linhas truncadas com muito espaço vazio; conteúdo escondido sem expandir | Decisions | 🟢 baixa |
| P10 | **"renderer warming up…" preso** — statusline live sem timeout/fallback | Terminal | 🟢 baixa |

**A preservar no plugin:** barra de comando natural-language ("ask mooter anything → command"), Mooter Score gamificado
com botões "fix", selectores de persona (🐄 LazyMoo / 🐮 Moo / 🐂 CrazyMoo) e effort (low/default/high/ultramoo),
cores por tier, paridade do statusline com o terminal, "CLI is the contract", labels honestos (TOKEN-ESTIMATED · ADVISORY),
e os tokens partilhados com a landing (a fundação de coerência já existe).

---

## A · MASTERPROMPT — Claude Code (wave brief)

> Dois briefs auto-contidos. Cola **A1** para o site, **A2** para o plugin. Cada um numa sessão fresca no repo `frugal/`.

### A1 · Web (landing/)

```
# Wave — Web Redesign & Polish (landing/)

## Papel
És o design+frontend engineer do Mooter. Objectivo: elevar o site mooter.ai de "bom e honesto"
para "perfeito e converte", sem rebrand e sem partir invariantes. Tudo em landing/.

## Contexto do produto (não inventes — isto é a verdade)
- Mooter = router LLM determinístico para Claude Code. Local-first. Classifica cada prompt em <50ms
  (regex puro, zero custo LLM) e roteia ao tier mínimo viável: T0 Ollama (free) · T1 Haiku · T2 Sonnet
  · T3 Opus. Fable (T5) só via @fable, nunca auto.
- Diferenciadores únicos (5 que mais ninguém tem): cross-session $ savings · 5h quota forecast ·
  cross-session routing learning · orchestration locks across terminals · workflow-visibility statusline chip.
  Mais: subscription-aware (moat), domain routing via Moo Packs, spawn agents com 4-layer sandbox.
- Prova honesta: 47% saved vs all-Opus em 658 calls reais do autor (1 máquina, não community average).
- Marca: "Got Moo?" · missão "Your LLM router. Local-first. Learns forever." · vibe-coder first.
- Tom: founder-pragmatic, denso em factos, terminal-first, playful no branding / sério na prova.
  PROIBIDO: "revolutionary", "game-changing", "AI-powered", "magic", claims sem baseline.

## Invariantes (CI-enforced — partir = falhar a wave)
- NUNCA tocar tools/router/classify.js (sha frozen). NUNCA tocar packages/* fora de allowlist.
- Selective git add — nunca `git add -A`. Stage só os ficheiros que mudaste.
- Sem novos ficheiros .md na raiz. Sem novas dependências npm (CSS hand-rolled, sem Tailwind).
- Stack fixa: Next.js 15 + React 19 + TS + CSS puro. Auth = GitHub OAuth via Supabase. Deploy = Vercel.
- Design tokens = SSoT em landing/app/globals.css. Não hardcodar hex; usa as CSS vars existentes.
  Se precisares de um valor novo, adiciona um token lá primeiro.
- PT-PT em conversa, EN no código/UI/identifiers.
- Suite verde obrigatória: landing 146/146 (cd landing && npm test) + npm run build sem erros.

## Tokens (já existem em globals.css — referência)
bg #0B0A09 · surface #141311 · border #252220 · text #F2EDE6 · muted #8A8076 (AA 4.1:1)
accent rose #E8888A / #F2A5A5 · tiers T0 #4CAF6A · T1 #5A9BD4 · T2 #A88BD4 · T3 #D46A5A
fonts: Space Grotesk (headings/body) · JetBrains Mono (código/números) · Caveat (accent handwriting)
H1 clamp(56px,13vw,168px)/-0.04em · max-width 1280 · band 120px vert · radius 8–14px / pill 999px

## Trabalho — 3 fases, commits atómicos por superfície

### Fase 1 — Verdade & consistência (cheap wins, fazer primeiro)
1. Versão única: deriva a versão de UMA fonte (version.json) e injecta no badge do hero E na tabela
   /compare. Eliminar "v1.21.5" e "v1.38.0" hardcoded divergentes.
2. Remover "Last updated unknown" e qualquer placeholder de /compare — ou data real ou remover a linha.
3. Coerência de prova social na homepage: o "community pulse" ($0.00 · 2 devices) contradiz o hero
   ($25.95 · 47%). Resolver: ou (a) etiquetar claramente os dois ("author's machine" vs "herd, early")
   e só mostrar o pulse quando saved>0, ou (b) esconder o pulse até haver sinal real. Nunca mostrar $0
   ao lado de um claim de poupança.
4. Sincronizar números factuais (658 calls, 47%, $25.95, packs) num único módulo de dados; sem cópias.

### Fase 2 — Hierarquia & conversão
5. Hero: encurtar para 1 frase-promessa forte + 1 sub-linha de prova; mover o parágrafo longo para
   uma secção "How it works" abaixo. CTA primário ("Install in 30s") visível above-the-fold sem scroll
   em 1440px e em mobile. Manter o terminal mockup como prova visual.
6. Install moment: garantir que o caminho install (botão → comando copiável → confirmação) é óbvio,
   com botão copy-to-clipboard e o one-liner real. É o momento de maior intenção.
7. /compare: manter a matriz 11/11 como herói (é o argumento). A 2ª tabela (vs routers) torná-la
   progressivamente revelável (toggle "Show full router comparison") ou cards agrupados, scannável em mobile.
8. Dashboard teaser: na página de login ("Route smarter.") adicionar um preview estático/anonimizado
   do que o utilizador ganha ao autenticar (savings, quota forecast, herd) — sem dados reais, ilustrativo.

### Fase 3 — Elevação visual & robustez (dentro da marca)
9. Motion: substituir o loop pesado do terminal mockup por animação leve e performante (CSS transform/opacity,
   respeitar prefers-reduced-motion, pausar quando off-screen via IntersectionObserver). Eliminar o jank.
10. Profundidade e foco: rever espaçamento vertical entre bandas, consistência de cards/borders, estados
    hover/focus, e um único ritmo tipográfico. Sem #000 e sem #FFF em lado nenhum.
11. Responsivo: auditar todas as superfícies <768px. Corrigir o bleed do terminal mockup no login (gap 4).
    Nenhum overflow horizontal em nenhuma página.
12. A11y: contraste AA em todo o texto, :focus-visible rose em todos os interactivos, alt/aria onde falta,
    navegável por teclado. Correr um check de contraste nos pares novos.

## Superfícies (prioridade)
P0: / (hero+stats+pulse) · /compare · /install · /dashboard (login gate + teaser)
P1: /conductor · /workflow · /methodology · /packs
P2: /security · /spawn · /sessions · /changelog · /privacy · /under-the-hood

## Processo
- Lê primeiro: landing/app/globals.css + landing/design-handoff/IMPLEMENTATION_SPEC.md + landing/app/page.tsx.
- 1 commit atómico por item/superfície, mensagem descritiva. Selective add.
- Não refactores o que não precisa. Mudança mínima para o efeito máximo.

## Verificação (gate da wave — tudo verde antes de "done")
1. cd landing && npm test  → 146/146 pass
2. npm run build  → sem erros nem warnings novos
3. Visual: screenshot de cada superfície P0 em 1440px e 390px; confirmar zero overflow, CTA above-the-fold,
   prova social coerente, versão única, sem placeholders.
4. classify.js sha intacta · git diff só nos ficheiros esperados · sem deps novas.
5. Lighthouse/perf rápido no hero: sem long-task do loop de animação.
```

### A2 · Plugin VS Code (packages/vscode-extension/)

```
# Wave — Cockpit Plugin Redesign & Polish (packages/vscode-extension/)

## Papel
És o design+frontend engineer do plugin VS Code do Mooter ("MOOTER: COCKPIT"). Objectivo: elevar a
webview de funcional para impecável e coerente com o site, sem partir invariantes nem mudar o contrato CLI.

## Contexto do produto (a verdade — não inventes)
- Mooter = router LLM determinístico para Claude Code. Local-first. T0 Ollama (free) · T1 Haiku · T2 Sonnet
  · T3 Opus · Fable (T5) só via @fable. Marca "Got Moo?". Tom founder-pragmatic, honesto, sem hype.
- O plugin é uma webview no sidebar (HTML/CSS/JS inline em src/extension.js, sem React, sem bundler).
  Lê decisions.log e fala com o savings-tracker local (127.0.0.1:7821). "The CLI is the contract".
- 9 tabs: Cockpit · Setup · Install · Models · Herd · Insights · Decisions · Terminal · Doctor.
- Primitivas existentes a preservar: barra "ask mooter anything" (NL → command), Mooter Score (8 checks com
  fix), persona trio (🐄 LazyMoo / 🐮 Moo / 🐂 CrazyMoo), effort (low/default/high/ultramoo), tier colors,
  statusline ANSI com paridade ao terminal, labels honestos (TOKEN-ESTIMATED · ADVISORY).

## Invariantes (partir = falhar a wave)
- NUNCA tocar tools/router/classify.js. Selective git add — nunca `git add -A`.
- Sem novas dependências e sem introduzir bundler/React: mantém HTML/CSS/JS inline com nonce CSP.
- Design tokens: o webview já importa globals.css (v0.4). Mantém UMA fonte de tokens; não hardcodes hex
  novos — usa --ink/--surface/--r/--t0..--t3 e os --vscode-* para superfícies nativas.
- Não mudar o contrato CLI nem os nomes de comandos. A UI traduz para os MESMOS comandos.
- Suite verde: cd packages/vscode-extension && npm test (node --test src/*.test.js).
- Compatibilidade: respeitar temas VS Code (dark, light, high-contrast) — nada quebra fora do dark.
- PT-PT em conversa, EN no código e na UI.

## Trabalho — 3 fases, commits atómicos

### Fase 1 — Verdade & coerência de estado (primeiro)
1. Número-herói honesto: o herói do Cockpit deve liderar com o valor REAL (real saved), não o naive estimate.
   Reservar o verde para sinal positivo genuíno; usar cor neutra/muted para zero e para advisory. Mesma regra
   no Insights (cache-hit 0% não deve ser um herói verde). Manter o badge TOKEN-ESTIMATED · ADVISORY.
2. Reconciliar deteção: header "Claude Code ✓" vs Setup "missing" não podem contradizer-se. Modelar 3 estados
   (extension detectada · CLI detectado · nenhum) e mostrar um estado coerente nos dois sítios.
3. Rotular o "50%" do header como Mooter Score (label curto + tooltip "4/8 checks"). Ligar visualmente ao
   score do Cockpit/Doctor.
4. Consolidar Cockpit↔Doctor: Cockpit = resumo do score + 1 próxima acção (top fix); Doctor = lista completa
   + sub-comandos + segurança. Eliminar a duplicação literal da checklist.

### Fase 2 — Navegação, first-run & densidade
5. Tabs: resolver a tira de 9 tabs num sidebar estreito. Opções (escolhe a mais limpa): agrupar
   (ex.: Cockpit · Setup[+Install+Doctor] · Models · Activity[+Herd+Decisions+Insights] · Terminal) com
   overflow "more", ou tornar a tira scrollável/wrap previsível. Sem labels cortadas.
6. First-run guiado: quando o profile/checks estão vazios, mostrar um fluxo de activação encorajador ancorado
   no Mooter Score. Trocar os "missing" a vermelho-itálico (lê-se como erro) por estado "to-do" neutro com a
   acção "fix". Empty states com 1 linha + 1 CTA, nunca só "no X yet".
7. Barra "ask mooter anything": fazê-la sentir-se como um elemento global único e a interação-herói (sticky no
   topo da webview), não uma repetição por tab. Mostrar exemplos/affordance do que se pode pedir.
8. Decisions & tabelas esparsas: melhor uso do espaço, linhas expansíveis (full prompt no expand), sem perder
   conteúdo por truncagem; densidade consistente com o resto.

### Fase 3 — Identidade visual & robustez (alinhar com a web)
9. Equilíbrio warm-brand vs nativo: decidir e aplicar consistentemente. Recomendado: superfícies herdam
   --vscode-* (sentir nativo), mas a identidade Mooter aparece em accents (rose --r para ênfase/acção, warm
   --ink nos cards-herói, cow mark), espelhando a hierarquia da landing. Eliminar o efeito "verde em tudo".
10. Statusline: tratar "renderer warming up…" com timeout + fallback legível; garantir ANSI→HTML correto em
    todos os temas. Sem estados presos.
11. Motion & responsividade: a webview muda de largura — auditar a 280px, 400px, 600px. Sem overflow horizontal;
    cards e tabelas reflow. Animações leves (transform/opacity), respeitar prefers-reduced-motion.
12. A11y: contraste AA inclusive em high-contrast theme; foco visível (rose) em todos os interactivos; aria nos
    selectores de persona/effort e na barra de comando; navegável por teclado.

## Superfícies (prioridade)
P0: Cockpit (herói honesto + score + próxima acção) · Setup (first-run) · Doctor (checks) · header/tabs
P1: Models (persona/effort/engine) · Insights · Herd
P2: Install · Decisions · Terminal

## Processo
- Lê primeiro: packages/vscode-extension/src/extension.js (HTML+CSS+JS do webview), host-extra.js (score,
  persona, effort, intent), data.js, e landing/app/globals.css (tokens canónicos).
- Mudança mínima para efeito máximo. 1 commit atómico por item/superfície. Selective add.
- Bump de versão no package.json + entrada no CHANGELOG.md por release.

## Verificação (gate — tudo verde antes de "done")
1. cd packages/vscode-extension && npm test → pass
2. Carregar a extensão (F5 / Extension Development Host) e screenshot de cada tab P0 em sidebar estreito (~300px)
   e largo (~560px): confirmar zero overflow, herói honesto (real primeiro), estado Claude-Code coerente,
   score rotulado, sem duplicação Cockpit/Doctor, empty states encorajadores.
3. Testar tema dark, light e high-contrast: nada ilegível.
4. classify.js sha intacta · git diff só nos ficheiros esperados · sem deps novas · CSP/nonce intactos.
```

---

## B · MASTERPROMPT — versão portável (agente de design genérico)

> Para Figma Make, v0, Cowork design skill, ou qualquer agente sem o repo. Auto-contido, sem assumir stack.

```
Redesenha e aperfeiçoa o website do Mooter — um LLM router local-first para Claude Code (mooter.ai).
Mantém a marca; eleva execução, clareza e conversão. Sem rebrand.

MARCA & TOM
- Mark: "Got Moo?" (nod a "Got Milk?"). Missão: "Your LLM router. Local-first. Learns forever."
- Público: vibe coders solo / small teams que usam Claude Code. Founder-pragmatic.
- Voz: densa em factos, honesta, terminal-first, playful no branding e séria na prova.
- PROIBIDO: "revolutionary", "game-changing", "AI-powered", "magic", hype ou claims sem baseline.

SISTEMA VISUAL (manter)
- Fundo warm dark #0B0A09 (NUNCA preto puro). Superfícies #141311 / borders #252220.
- Texto warm off-white #F2EDE6 (NUNCA branco puro). Muted #8A8076.
- Accent rose cow-muzzle #E8888A (+ #F2A5A5). Usar com parcimónia, para acção e ênfase.
- Cores por tier de modelo: T0 verde #4CAF6A (local/free) · T1 azul #5A9BD4 · T2 roxo #A88BD4 · T3 coral #D46A5A.
- Tipografia: Space Grotesk (títulos/corpo) + JetBrains Mono (código/números) + Caveat (toque manuscrito).
- H1 enorme e tight (clamp até ~168px, letter-spacing negativo). Max-width ~1280px. Cantos 8–14px, pills 999px.

O QUE COMUNICAR (mensagem)
1. Já pagas por GPU + subscriptions + modelos locais; o Claude Code usa Opus para tudo. O Mooter mapeia
   o teu ambiente e roteia cada prompt ao modelo mínimo viável — mesma qualidade no rotineiro, fração do custo.
2. Prova honesta: 47% poupado vs all-Opus em 658 calls reais de 1 máquina (não community average).
3. 5 capacidades que mais ninguém tem: cross-session $ savings · 5h quota forecast · routing learning ·
   orchestration locks · statusline HUD. Mais: local-first, subscription-aware, spawn seguro (sandbox 4-camadas).
4. Install em 30s, hook não proxy, <50ms overhead, MIT open source.

SUPERFÍCIES
- Homepage: hero "Got Moo?" + 1 promessa + prova + CTA "Install in 30s" above-the-fold; terminal mockup
  como prova viva; banda de stats (calls/saved/avg/packs); secção "porque um modelo local chega".
- Página de comparação: matriz "11/11 — Mooter is the only one" como herói; comparação detalhada vs routers
  progressivamente revelável e scannável em mobile.
- Login: "Sign in only for federated wisdom and cross-device sync — works fully offline without an account."
  Adicionar teaser ilustrativo do dashboard (savings, quota, herd).
- Dashboard (logado): métricas pessoais — savings, tier mix, quota forecast 5h, packs, herd.
- Plugin VS Code (webview no sidebar, MESMO design system): 9 áreas — Cockpit (herói de poupança honesto +
  Mooter Score + próxima acção), Setup (hardware/software/subs/budget), Install (modelos locais + packs),
  Models (persona LazyMoo/Moo/CrazyMoo + effort + engine), Herd (spawns/agents), Insights, Decisions,
  Terminal (statusline live), Doctor (checks). Barra global "ask mooter anything → command". Superfície estreita
  e redimensionável: herda o tema do editor (--vscode-*) e expressa a marca em accents (rose, warm ink, cow).
  Número-herói deve liderar com o valor real (nunca verde para zero/advisory).

PRINCÍPIOS DE EXECUÇÃO
- Hierarquia: 1 ideia por banda, CTA sempre claro, menos texto above-the-fold.
- Prova social só quando real (nunca mostrar "$0 saved" ao lado de um claim de poupança).
- Consistência total: uma única versão, zero placeholders ("unknown"/"TBD"), um ritmo tipográfico.
- Motion subtil e performante (transform/opacity, respeita prefers-reduced-motion, pausa off-screen).
- Responsivo sem overflow horizontal em nenhuma página. Acessível AA, focus-visible rose em tudo.

ENTREGÁVEL
Mockups/protótipos das superfícies acima (desktop 1440 + mobile 390), coerentes com os tokens acima,
prontos a implementar. Explica cada decisão de hierarquia/conversão em 1 linha.
```

---

## Como usar

- **Polish iterativo no repo** → versão **A**: **A1** para o site (`landing/`), **A2** para o plugin (`packages/vscode-extension/`), cada um numa sessão fresca de Claude Code, fase a fase. Começa pela Fase 1 de cada — são correcções de credibilidade baratas.
- **Explorar direcção visual nova** → versão **B** num agente de design; depois traz os tokens vencedores de volta para `globals.css` (que serve os dois alvos).
- **Coerência cross-surface:** como web e plugin partilham `globals.css`, qualquer token novo entra primeiro lá. O mesmo princípio honesto aplica-se aos dois: **liderar com o número real, verde só para sinal positivo genuíno**.
- **Ordem recomendada:** começar pelos gaps de credibilidade — web **#1/#2/#3** (versão, placeholder, prova social) e plugin **P1/P2** (número-herói honesto, estado Claude Code coerente). Estética e identidade visual depois.
