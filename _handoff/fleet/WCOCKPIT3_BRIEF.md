# Wave WCOCKPIT-3 — fechar o GAP de UI (rowFor tem de IGUALAR o mockup)

CONTINUA na branch wave-WCOCKPIT. 100% ADITIVO. Problema: rondas anteriores landaram a camada de DADOS
(mode-registry, decorate, lastActiveTs, worktrees) e os testes unitários passam, MAS a UI renderizada
no webview NÃO iguala o mockup aprovado. Esta wave fecha SÓ o gap visual no rowFor/getHtml.

REFERÊNCIA VISUAL (igualar exactamente): docs/strategy/MOOTER_COCKPIT_ARCHITECTURE.md + os 3 elementos
do mockup. Cada card de live session DEVE renderizar:
1. **Vaquinha animada por MODO da sessão**: classe na 🐮 conforme registry.mode → lazy(moolazy lenta)
   /moo(moowalk)/crazy(moocrazy rápida); modificador 💤 (lazy) / ⚡ (crazy). Animar quando working.
2. **Selector de modo POR SESSÃO** dentro do card: segmented [💤 Lazy | 🐮 Moo | ⚡ Crazy], activo = registry.mode,
   data-mode + handler setMode(sid,mode). (A barra global no topo MANTÉM-SE, mas cada card tem o seu.)
3. **Modelo POR SESSÃO**: dropdown/clicável no card (não chip estático) → setModel(sid,model); mostra o actual.
4. **Auto-pilot POR SESSÃO**: toggle no card → setAuto(sid,bool); visual on/off claro.
5. **Notion + Obsidian** como mini-LOGOS SVG (Notion=quadrado+N currentColor; Obsidian=gema roxa) + tempo
   do último sync ("3h") + botão ↺ refresh (refreshIntegrations). Amber quando por sincronizar. NÃO "link" genérico.
6. **Worktree chip** "⌥ wt:<nome>" quando a sessão está num linked worktree (já temos worktrees()).
7. **brain: <título da conversa Cowork>** (registry.brainTitle) em vez do session id quando existe.
8. **Agrupar por PROJETO Cowork** (registry.project: "Mooter.ai", "Cloude Home"...) e NÃO pelo repo ("FRUGAL").
   Header por projeto com contagem + "N needs you". Sessão sem project → grupo "Unassigned" + CTA "link a brain".
9. Estado **waiting for Cowork — <título>** (cowork-waiting.badge) já existe; garantir que renderiza no card.

TESTES (ao nível do HTML, não só dados): escrever testes que chamam rowFor(sampleRow) e fazem assert que o
HTML CONTÉM: o segmented de 3 modos com o activo correcto; a classe de animação por modo; o dropdown de modelo;
o toggle auto; os 2 SVG (Notion+Obsidian) + tempo de sync + ↺; o chip wt: quando worktree definido; o brain title;
e que a função de agrupamento usa registry.project (não o repo). Mais os unit existentes. Todos verdes.

REGRAS: classify.js FROZEN (sha 427d8c0b...364bc48f, prova no fim). Aditivo. git add selectivo. NUNCA
merge/push/tag/deploy (gate; Paulo faz a subida). Escrita JSON atómica. No fim: bloco status + Notion (sub
3876f6e4-2bc4-812b-b5d3-e6433a6cc8af) + vault. NOTA HONESTA: os nomes de projeto/brain só aparecem quando uma
conversa Cowork reclama a sessão (escreve project+brainTitle no registry); até lá mostram "Unassigned" — implementa
na mesma o agrupamento por project (com fallback) para a estrutura estar pronta.
