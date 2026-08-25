# ⇄ COWORK→CC · WAVE LP-4.9 · Toolbar intuitiva — do painel de engenheiro ao gesto Lovable

> **Dor viva do Paulo (2026-07-07, ao vivo na LP-4.8):** a toolbar in-canvas FUNCIONA (presets,
> skills, agente todos presentes; o agente até apanhou um bug de copy real na landing) MAS:
> (1) não distingue PERGUNTA de EDIÇÃO → o Paulo fez uma pergunta, viu resposta no painel, e
> esperava mudança no preview; (2) 8+ zonas de controlo sem guia → "não sei operar"; (3) sem
> feedback de real-time claro. Objetivo: **tão intuitiva como o Lovable, sem perder o poder por
> baixo.** Alinhar com WCAG 2.2 (target size 24px, focus, dragging). Lê _handoff/LIVE_EDIT_LP47_MOO_QUALITY_UX_STUDY.md §2.3.
> R1–R6. classify.js FROZEN (427d8c0b…).

## 0. Princípio de design (o norte)
Progressive disclosure: **um gesto simples por defeito, o poder atrás de um clique.** O Lovable
mostra 1 caixa; nós mostramos uma consola. Inverter: caixa simples primeiro, "avançado" opcional.
E **nunca ambíguo**: o utilizador tem de saber, antes de carregar, se aquilo vai PERGUNTAR ou EDITAR.

## 1. As 6 correcções (commit por peça)
1. **Distinção Pergunta vs Edição — explícita.** A caixa de prompt ganha 2 modos VISÍVEIS
   (toggle ou 2 botões): **"✏️ Editar"** (escreve → diff → aplica → muda o preview) e
   **"💬 Perguntar"** (lê o repo → responde no painel, zero escrita). Label honesto por baixo:
   "Editar muda o site · Perguntar só responde". Mata o mal-entendido nº1. → COMMIT.
2. **Progressive disclosure — simples por defeito.** A toolbar abre MÍNIMA: [caixa prompt +
   toggle Editar/Perguntar] [enviar]. Um chevron **"▾ mais"** revela o avançado (presets de
   cor/tamanho/spacing, TEXTO/CLASSE crus, /skills, chips de modelo). Estado lembrado por
   sessão (localStorage do webview). → COMMIT.
3. **Feedback de real-time inequívoco.** Ao aplicar uma edição: micro-animação/realce no
   elemento + toast "✓ aplicado no preview · $0" ancorado ao nó; se for pergunta: "💬 resposta
   no painel →" a apontar para a direita. O utilizador NUNCA fica sem saber o que aconteceu. → COMMIT.
4. **Onboarding de 1ª utilização (coach marks).** Na primeira vez que o 🎯 liga: 3 tooltips
   curtos (1: "clica num elemento"; 2: "Editar muda · Perguntar responde"; 3: "cor/tamanho são
   instantâneos e $0"). Dispensável, não repete (flag em localStorage). → COMMIT.
5. **Presets como a estrela (o gesto $0 que encanta).** Subir cor/tamanho/spacing para o topo
   do modo simples com swatches maiores (**≥24×24px, WCAG 2.2 §2.5.8**), hover-preview no
   elemento antes de aplicar (como o Lovable). É o "uau" instantâneo sem escrever nada. → COMMIT.
6. **A11y WCAG 2.2 AA da toolbar** (fecha findings da auditoria CCA): target size ≥24px
   (§2.5.8), focus não obscurecido (§2.4.11), toolbar navegável por teclado, ARIA nos toggles/
   swatches, ajuda consistente (§3.2.6, o "?" abre os coach marks). → COMMIT.

7. **Botão de fechar (X) + a toolbar nunca tapa o elemento (dor viva Paulo 2026-07-07).**
   X sempre visível no canto da toolbar (≥24px, WCAG); Esc também fecha mas o X é a affordance
   óbvia. A toolbar posiciona-se com offset inteligente para NÃO cobrir o elemento pinado
   (flip acima/abaixo/lado conforme espaço); movível por arrasto (respeitar §2.5.7 Dragging —
   alternativa sem-arrasto). Estado "minimizado" (só um chip 🐮) que reexpande ao clicar. → COMMIT.
8. **Feedback de progresso vivo — 🐮 a trabalhar → pronto (dor viva Paulo).** Ao correr agente
   ou moo: a toolbar mostra a vaquinha animada + "🐮 a pensar… (local $0 / Sonnet)" com o tier
   honesto; ao terminar: "✓ aplicado no preview" (edição) OU "💬 resposta no painel →" (pergunta)
   OU "⚠️ rejeitado: <motivo>". Barra/spinner enquanto corre; nunca fica mudo. Cancela disponível
   se demorar. → COMMIT.

## Conclusões da navegação Cowork (2026-07-07, inspecção directa da toolbar)
Confirmadas ao vivo: sem X (tapa o hero) · densidade de 13 controlos · hierarquia invertida
(prompt no meio, cru no topo) · parágrafo de explicação sempre visível (deve virar tooltip "?")
· sem distinção pergunta/edição · sem feedback de progresso. A toolbar tem o PODER certo mas a
APRESENTAÇÃO de uma ferramenta de engenheiro, não de vibe coder. O norte §0 (simples por defeito,
poder atrás de um clique) resolve a raiz; as peças 1-8 são a execução.

## 2. O que NÃO mudar
Motor de edição, cerca, allowlist, agente, quality-engine LP-4.7, /skills backend — INTACTOS.
Isto é **só a camada de UX/apresentação** por cima do que já funciona. Zero deps novas.

## 3. Gate (prova viva, dev server frugal-lp48/landing:7819)
Pin → toolbar abre MÍNIMA (caixa + toggle Editar/Perguntar) · toggle "Perguntar" + "os números
batem?" → resposta no painel com aviso "💬 no painel" · toggle "Editar" + "encurta este texto"
→ diff → aplica → toast "✓ no preview" + o texto muda <2s · swatch de cor no modo simples →
hover-preview → clica → muda instantâneo $0 · "▾ mais" revela o avançado · coach marks na 1ª vez ·
axe/WCAG 2.2 AA limpo · Esc/Tab ok · 790+novos verdes · sha intacta · push só da branch · PÁRA
p/ OK.

## 3b. Fix da landing (honest-copy — decisão Paulo: SIM)
Commit à parte na MESMA branch (é a landing, não a extensão): o card "SAVED VS OPUS: $25.95"
é enganador — $25.95 é o custo PAGO, não o poupado. Poupado real = naive $48.90 − real $25.95
= **$22.95**. O `CockpitShowcase.tsx` já clarifica (real $25.95 vs naive $48.90); a strip do
hero não. Fix: ou trocar o número para $22.95 sob "saved vs Opus", ou manter $25.95 e mudar o
label para "mooter spend · vs $48.90 naive". Recomendo a 1ª (o label "saved" tem de mostrar o
poupado). Um produto de honest-copy não pode ter copy enganadora na homepage. → COMMIT próprio.

## 4. Reordenação do comboio (a intuitividade vem ANTES dos botões novos)
LP-4.8 (feito, a mergear) → **LP-4.9 UX intuitiva (esta — a dor mais aguda do Paulo)** →
LP-5 🛡 Security → LP-6 🚀 Publish. Racional: os botões novos herdam a linguagem visual/UX
que a LP-4.9 estabelece; construí-los antes = re-trabalho. A LP-4.9 é a wave MAIS importante
do funil — é a montra ("chamariz") do produto; merece max effort e um design-critique antes
do gate.

## 5. Fontes
Lovable Visual Edits (simples-por-defeito, hover-preview, presets $0): lovable.dev/blog/visual-edits ·
docs.lovable.dev/features/design. v0 Design Mode (progressive disclosure, drag handles): v0.app/docs/design-mode.
WCAG 2.2 (2.5.8 Target Size · 2.4.11 Focus Not Obscured · 3.2.6 Consistent Help): w3.org/TR/WCAG22.
Coach marks / first-run onboarding: padrão de mercado. Confrontado com a prova viva do Paulo 2026-07-07.
```
