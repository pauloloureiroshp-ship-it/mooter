# 🖥️ Auditoria UX/UI do plugin Mooter — V2 CORRIGIDA (cockpit visto ao vivo)

> Cowork · 2026-07-19 · SUPERSEDE a V1 (que auditei sem abrir o cockpit — subestimei).
> Agora com o Cockpit + Fleet + Live Preview vistos ao vivo (computer-use). Lente: vibe coder
> de alta performance decide se adota. Correção de sócio: reconheço que a V1 foi injusta.

## 0. O que a V1 errou (honestidade primeiro)

Auditei a activity bar de uma janela ERRADA e concluí "o Mooter se perde / descoberta é o problema
nº1". FALSO: aberto, o 🐮 está ativo e destacado, e o cockpit é rico. A lição registrada
(protocolo item 5): **não auditar UX de produto sem abrir o produto.** Nota revista: **6.5/10**
(não 5.5) — e o teto está mais alto do que eu disse.

## 1. O que o cockpit REALMENTE entrega (visto ao vivo)

| Superfície | O que vi | Veredicto |
|---|---|---|
| **Header** | Mooter · Claude Code ✓ · +New · **CrazyMoo 57%** (modo+contexto) · chips `8 merge gate` `459 frugal` | 🟢 denso mas informativo; estado real na cara |
| **Tabs** | Cockpit · Control · Waves · Mapa | 🟢 navegação clara (progressive disclosure correto) |
| **Pipeline** | spec 0→plan 0→exec 0→review 0→**ship 8** · "8/8 sessões derivado de git/estado" | 🟢 excelente — o funil de trabalho como primeiro-classe |
| **Savings** | **$0.05 · 18.3% below all-Opus · "real executed $0.00 · 0 local dispatches yet"** | 🟢🟢 HONESTO ao extremo — mostra $0 real e marca "advisory". Isto é o fosso e a doutrina visíveis |
| **Modos** | LazyMoo · Moo · **CrazyMoo** (ativo) + "Next prompt model: Auto — let Moo decide" | 🟢 o routing como controle do usuário, claro |
| **Local Moo Fleet** | **"8 MOOS LOCAIS A TRABALHAR · ~206.1 tok/s local (qwen3:30b, medido) · $0 · paralelo ao CC · GPU live"** — 8 rollups qwen2.5:3b @241.7 tok/s $0 | 🟢🟢🟢 ISTO é o diferencial que NINGUÉM tem: GPU rendendo 24/7, medido, $0, visível |
| **Live Sessions** | filtro + Atenção/Precisam/Activas/Idle/Todas 8 | 🟢 gestão por exceção (o que a Agents window nativa NÃO faz) |
| **Live Preview** | localhost:7819 · **probe HTML 2xx validado** · landing "Got Moo?" renderizada ao vivo | 🟢 feature real e polida, não mock |

**Reação honesta:** isto NÃO é o cockpit 4.5/10 que eu esperava. O Fleet local medido ($0, qwen3:30b, 8 moos) e o savings honesto ($0 real, "advisory") são **exatamente as 4 coisas do fosso** (routing $0 · custo honesto · neutralidade local · gestão por exceção) — e estão na tela, visíveis. Um vibe coder de alta performance olha isto e entende o valor em 5 segundos.

## 2. As tensões REAIS que ainda seguram a nota (honesto, com o que vi)

| # | Tensão observada | Impacto | Fonte |
|---|---|---|---|
| 1 | **`hardware n/d · média-em ausente`** no header | bug antigo (07-13) ainda vivo — mina a credibilidade "tudo medido" | visto ao vivo |
| 2 | **Densidade extrema** numa coluna estreita — Cockpit+Fleet+LiveSessions empilhados, scroll longo | power-user adora; amigo novo pode afogar. Falta um "modo simples/compacto" default | visto ao vivo |
| 3 | **Tensão savings vs fleet:** "0 local dispatches yet · $0.00" no topo, mas "8 moos a trabalhar" logo abaixo | confunde — são métricas diferentes (CC cloud vs fleet local) sem rótulo que reconcilie | visto ao vivo |
| 4 | **`459 frugal` / `459 uncommitted · não fechar`** no cockpit | honesto, mas é ruído de higiene do repo dentro do produto — polui a primeira impressão | visto ao vivo |
| 5 | **2 webviews** (Cockpit + Live Preview em janelas separadas) | competem por tela; o vibe coder gere 2 painéis do MESMO produto | package.json + ao vivo |
| 6 | **Tudo é webview HTML-string** — o estado vive DENTRO do painel; se não olhas o cockpit, não sabes o estado | é PRECISAMENTE o que a VS-W1 corrige (estado no Explorer/statusbar) | synergy map |

## 3. O CRUZAMENTO — como VS-W1 + synergy map fecham o outcome

O cockpit é ótimo **quando olhas para ele**. O problema estrutural que sobra: **exige foco dedicado.** O vibe coder de alta performance vive nos ficheiros e no terminal, não num painel lateral. É aqui que o synergy map + VS-W1 fecham o círculo:

| Dor do cockpit | Peça que resolve | Estado |
|---|---|---|
| Estado só existe DENTRO do webview | **FileDecoration** (semáforo nas worktrees) — estado no Explorer onde já olhas | ✅ VS-W1 |
| "Onde colo o próximo?" exige abrir o cockpit | **Paste Beacon** (status bar sempre visível) | ✅ VS-W1 |
| Placar de pendências some quando fechas o painel | **ViewBadge** no 🐮 (número mesmo com painel fechado) | ✅ VS-W1 |
| `sendText` cego nos terminais das sessões | **shellIntegration** (exit code real) | ✅ VS-W2 |
| hardware n/d, controlos mortos, tensão savings | **F0 não-mentir de UX** (higiene de confiança) | ❌ wave a compor |

**Conclusão do cruzamento:** VS-W1 não é feature nova competindo com o cockpit — é a **projeção do cockpit para fora do painel**, exatamente onde a doutrina VS Code manda (estado na UI nativa). O cockpit continua sendo o "raio-x completo"; o semáforo é o "periférico" que te chama sem exigires foco. Juntos = o cockpit fica para quando queres o detalhe, o semáforo trabalha o tempo todo. É o outcome certo.

## 4. Nota corrigida e o caminho para 9+

**Hoje: 6.5/10.** Adotaria? **Sim** — o Fleet local medido e o savings honesto já me convencem do valor; a densidade eu tolero como power-user. O que separa 6.5 de 9+:

1. **VS-W1 merge** (estado fora do painel) → +1.0 · em PR #260 ✅
2. **F0 não-mentir de UX** (matar hardware n/d + reconciliar savings/fleet + tirar ruído do repo do cockpit) → +1.0 · wave a compor
3. **Modo compacto default** (o amigo novo não afoga; power-user expande) → +0.5 · design
4. **Fundir/clarificar os 2 webviews** (1 produto, 1 navegação) → +0.5 · god-mode F2

## 5. Recomendação de sócio (o outcome de tudo que falámos)

O produto está **muito mais perto do "melhor do mundo" do que a minha V1 dizia** — o motor visível (fleet $0 medido) é algo que nem Microsoft nem CodeSignal nem ninguém mostra. O que falta é **confiança na primeira impressão**: hardware n/d e a tensão savings/fleet são pequenos, mas um vibe coder cético fisga neles. Ordem: **merge VS-W1 → F0-UX (higiene) → modo compacto → teste do amigo.** Nenhuma dessas é feature grande; são polimentos de confiança que pegam a nota de 6.5 para 8.5+ com esforço baixo. O semáforo (VS-W1) e o cockpit não competem — casam.

📮 SUPERSEDE MOOTER_UX_AUDIT_2026-07-19 (V1). Alimenta: fila (F0-UX candidata) · Currículo Vivo
(auditoria de produto ao vivo, com autocorreção — isso É competência) · masterprompts do round.
