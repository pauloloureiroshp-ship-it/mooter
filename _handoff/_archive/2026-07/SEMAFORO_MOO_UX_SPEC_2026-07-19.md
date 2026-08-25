# 🚦 SEMÁFORO MOO — a linguagem visual do Agentic OS (spec + o que já funciona hoje)

> Cowork · 2026-07-19 · Origem: dor real do Paulo ("onde colo o próximo? qual aba? nunca errar").
> Casa: `_handoff/` → vira wave da Company Console. APIs verificadas na web hoje (refs no fim).
> Princípio: **o estado tem que estar no campo de visão, não na memória do humano.**

## 1. O problema (medido neste ciclo)

3+ sessões CC paralelas + Codex + Gemini + chat Cowork = o humano vira o roteador, e roteador
humano erra (aconteceu 3× em 3 dias: "colo onde?"). A informação existe (sessions.json, registry,
BOARD do Cowork) mas não está NA TELA onde a decisão acontece.

## 2. A linguagem — 6 lanes × 6 estados (curta o bastante para decorar sem querer)

| Estado | Emoji | Cor (cockpit) | Significa p/ o humano |
|---|---|---|---|
| aguarda paste | 📥 | azul pulsante | "EU devo colar algo aqui" |
| trabalhando | 🟡 | âmbar | "não mexe, deixa trabalhar" |
| parked/handoff pronto | 🅿️ | roxo | "tem resposta para RELAY ao Cowork" |
| gate humano | 🔒 | âmbar-forte | "decisão/push MEU" |
| fechado/merged | ✅ | verde | "acabou, esquece" |
| blocker | 🚨 | vermelho | "para tudo, olha isto" |

Lanes: 🌱 genesis · 🔐 registry · 🕸️ mesh · 🧾 receipts · 🗺️ context-card · 📡 schema-v11 · 🎨 bake-off

**Regra de leitura universal: `<lane><estado>` = tudo que o humano precisa.** `🌱🟡` = genesis
trabalhando, não mexe. `🔐🅿️` = registry tem handoff pronto para colar no Cowork. `📡🔒` = schema
espera gate. Zero texto necessário.

## 3. CAMADA 0 — funciona HOJE, zero código (convenção)

1. **Título da sessão via 1ª linha do dispatch**: os painéis (CC/Codex/Gemini) derivam o título da
   conversa do conteúdo colado → todo masterprompt do Cowork passa a abrir com a linha
   `🌱🟡 GENESIS-FIX · genesis-fix-h1-h5-20260719` — o emoji aterra NO TÍTULO DA ABA sozinho.
   Não controlamos a cor da aba deles, mas controlamos o texto — e emoji é cor portátil.
2. **Cabeçalho 📮 DESTINO ganha a lane**: "📮 DESTINO: CC · sessão 🔐 REGISTRY" — o humano
   casa o emoji do bloco com o emoji da aba. Erro de pareamento vira visualmente óbvio.
3. **BOARD do Cowork usa os mesmos códigos** — chat, aba e board falam a mesma língua.
Custo: zero. Adotado pelo Cowork a partir de 2026-07-19.

## 4. CAMADA 1 — cockpit Mooter (APIs reais do VS Code, verificadas)

| Peça | API (verificada) | O que faz |
|---|---|---|
| Badge+cor nas worktrees | `FileDecorationProvider` (badge ≤2 chars — emoji cabe — + cor temática, aparece no Explorer E nas abas de editor do recurso) | pasta `frugal-genesis` ganha `🟡` e cor âmbar em TODA a UI de ficheiros |
| Terminal por lane | terminal tabs suportam cor+ícone por terminal | terminal da sessão genesis = âmbar com 🌱 |
| **Paste Beacon** (status bar) | `StatusBarItem` (limitação real: backgroundColor oficial só error/warning — issue #152053 → usar warning p/ 📥 e error p/ 🚨; resto via texto+emoji) | item fixo: `📥 🔐 colar registry-fix` — SEMPRE visível, pisca quando há paste pendente |
| Contador no ícone do cockpit | `ViewBadge` (número no container da activity bar) | nº de ações humanas pendentes (pastes + gates) |
| Título da janela | `window.title` por workspace/worktree | janela da worktree mostra `🌱 GENESIS — frugal` |

## 5. O NUNCA-FEITO (a parte criativa que vira fosso de UX)

**5.1 · Semáforo como PROTOCOLO, não decoração.** O emoji de estado no título não é enfeite: é
uma PROJEÇÃO do `sessions.json` (registry). O pointer-sentinel/lint compara título-declarado vs
estado-real e acusa divergência ("aba diz 🟡, registry diz parked há 2h") — **o primeiro sistema
onde o emoji da aba é machine-checked**. Ninguém faz isso.

**5.2 · Paste Beacon + dispatch-queue.** O Cowork já gera todo dispatch; passa a escrevê-los
também em `_handoff/agent-sync/dispatch-queue.json` ({id, lane, destino, sessão, quando, corpo}).
O cockpit mostra UM botão: **"📥 próximo: colar 🔐 registry-fix → [Copiar]"** — clique copia o
bloco JÁ pré-endereçado; ao detectar o paste consumado (registry vê a sessão ativar), o beacon
avança para o próximo da fila. **O humano nunca decide para onde colar — só clica e cola.**
Fila vazia = beacon mostra o gate pendente (`🔒 3 pushes te esperam`).

**5.3 · Live Sessions vira SEMÁFORO STRIP.** Substituir os cards detalhados por UMA LINHA por
sessão: `[lane][cor-estado][verbo de 1 palavra][tempo]` → `🌱 🟡 trabalhando · 22min`.
Clique expande o detalhe atual. Regra anti-vanity mantida: a linha só existe se muda decisão
(cores dizem: colar/esperar/relay/decidir); detalhe fica a 1 clique, não na cara.

**5.4 · Handoff-back visual.** Quando um agente parqueia (registry detecta state:parked), a lane
vira 🅿️ roxa e o beacon oferece: "🅿️ 🌱 handoff pronto → [Copiar p/ Cowork]" — o relay de volta
também vira 1 clique. O ciclo inteiro (dispatch → trabalho → handoff → relay) sem o humano
memorizar NADA.

## 6. Gating honesto

Camada 0: já ativa (convenção). Camada 1 + 5.x: wave da Company Console — depende de merges
(registry/card) + allowlist do plugin; dados primeiro, UI depois (regra A10). O dispatch-queue.json
é ficheiro novo em agent-sync/ (gitignored, mesma classe do sessions.json) — sem conflito com nada
em voo.

## Refs (verificadas 2026-07-19)

FileDecorationProvider: vscode-api.js.org/interfaces/vscode.FileDecorationProvider.html ·
StatusBarItem backgroundColor limitado: github.com/microsoft/vscode/issues/152053 ·
Terminal appearance (cor/ícone): code.visualstudio.com/docs/terminal/appearance ·
Theme colors: code.visualstudio.com/api/references/theme-color
