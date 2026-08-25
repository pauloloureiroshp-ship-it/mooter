# ⇄ COWORK→CC(Fable 5) · LP-H2-FLOATING-PROMPT · Prompt ancorado à seleção — v2 (pós-advogado-do-diabo)

> **Cola este ficheiro inteiro numa janela FRESCA do Claude Code.** v2 corrige 5 riscos concretos
> encontrados numa revisão adversarial da v1 (nunca enviada) — ver secção "O QUE MUDOU" no fim. Objetivo:
> fechar o gap H2 (auditoria D-A) com uma caixa de prompt REAL, ancorada à seleção, nível Lovable/Cursor,
> reutilizando 100% do pipeline Ask→Apply já testado (COH-07). Zero backend novo. Zero regressão.

## GOAL
Prompt flutuante ancorado ao elemento pinado, visível no instante da seleção. Chama o MESMO handler host
(`_askApply`/`_taskRun`) que já existe. Bar de qualidade: critério §D-L do benchmark original —
"prompt ancorado à seleção com contexto do elemento visível" TEM, não PARCIAL.

## WHERE
`C:\Users\Paulo Loureiro\frugal-lp-coerencia` — worktree ativa (protegida pelo guard do Foundation Reset;
esse guard refere-se a OUTRAS waves tocando ficheiros partilhados, não a esta). Base: `origin/main` pós
`git fetch origin main --tags` — confirma PR #246 integrado.

## FASE 0 · INVESTIGAÇÃO OBRIGATÓRIA (faz isto ANTES de escrever uma linha — reporta no mesmo BACK, não pares a meio)

Três perguntas que TÊM de ter resposta com prova (ficheiro:linha) antes de desenhar a caixa:

1. **Como é desenhado o contorno/outline do elemento selecionado hoje?** É injetado DENTRO do DOM do
   iframe (pelo `code-inspector-plugin`/script com `data-insp-path`, manipulando o elemento em-página) ou é
   um overlay do webview PAI calculado a partir de `getBoundingClientRect()` recebido por `postMessage`?
   **Usa EXATAMENTE esse mesmo mecanismo de coordenadas para posicionar a caixa nova** — não inventes um
   segundo sistema de posicionamento. Se for in-page, confirma que é estritamente dev-only (o
   `code-inspector-plugin` normalmente só corre em dev, nunca no build de produção) — a caixa NUNCA pode
   vazar para o `next build`/produção. Prova isto explicitamente (grep pelo plugin no `next.config`, confirma
   `NODE_ENV`/`dev`-only).
2. **O que já foi investigado sobre isto?** `_handoff/LP_COHERENCE_AUDIT_REPORT.md` secção D-A já respondeu
   à pergunta "o webview do preview pode hospedar um floating input? CSP/concat-only permitem?" (foi
   literalmente perguntado ao Codex). Lê essa resposta primeiro — não reinvestigues o que já está prevado.
3. **CSP/nonce**: qualquer HTML/JS novo dentro do webview segue o padrão já existente (nonce, concat-only,
   zero backticks/`${}` nas funções serializadas) — confirma o padrão exato lendo como o toolbar/pin chip
   atual já é injetado.

Se qualquer uma destas 3 respostas contradiser o plano abaixo, ADAPTA o plano à realidade do código — não
force o desenho a caber numa arquitetura que não existe.

## GUARD (inegociável)
- `classify.js` FROZEN — sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`.
- **Zero handler host novo.** A caixa compõe a MESMA mensagem `lp-ask`/`lp-ask-apply` já existente.
- **Baseline obrigatório**: corre a suite completa ANTES de tocar em qualquer ficheiro, regista o número
  exato (`lp-*` e suite completa). No fim, compara — qualquer teste que passou a falhar é bloqueador, não
  "nit para depois".
- **Produção nunca contaminada**: a caixa é ferramenta de desenvolvimento — prova explicitamente (teste ou
  build real) que ela NÃO aparece num `next build` de produção nem seria servida a um visitante real de
  mooter.ai. Isto é P0, não polish — é o site de produção da empresa.
- **Uma fonte de verdade, decidida agora (não é decisão tua a inventar):** com seleção pinada, a caixa
  flutuante é o ÚNICO caminho ativo. A caixa do Cockpit, nesse estado, fica com `disabled` + razão honesta
  visível (ex.: "elemento selecionado — usa a caixa junto a ele") — mesmo padrão de controlo honesto
  desativado já usado no COH-04/COH-11 (nunca desaparece, sempre com causa). Sem seleção pinada, a caixa do
  Cockpit volta ao normal (comandos livres).
- COH-13 (dicionário 🐮⚡🎼🧠🌟), COH-14 (state machine + `prefers-reduced-motion`), COH-02 (nunca cobre o
  pin — testa nos 4 breakpoints 320/390/768/1024 do mock) aplicam-se aqui também.
- Tests-first. Commits atómicos `feat(live-edit): H2-<parte> — …`.
- Sem deploy, sem push automático, sem merge — só o Paulo/Cowork mergeia.

## AS WAVES

### H2.0 · Componente ancorado (usa o mecanismo de coordenadas confirmado na Fase 0)
Breadcrumb curto, input de uma linha, chips de tier, botão enviar, indicador de estado. Aparece no mesmo
evento que já dispara o log MEO `live-preview · pin`; desaparece no `unpin`/troca de origem (mesmo ciclo do
lease COH-01).

### H2.1 · Ligação ao pipeline real
Submit → `lp-ask` → CTA "▶ Aplicar com o agente" → `lp-ask-apply` com o taskId devolvido (fluxo idêntico ao
que a caixa do Cockpit já faz). Testes de contrato host reutilizados sem alteração; teste novo confirma que
o front-end compõe a mensagem certa.

### H2.2 · Cockpit em estado honesto quando há seleção
Implementa o `disabled`+razão decidido no GUARD. Testa os dois estados.

### H2.3 · Fecho e registo (para não perdermos histórico)
- Suite completa 100% verde — números antes/depois lado a lado no BACK.
- `classify.js` sha confirmada.
- CHANGELOG por COH-ID/H2-ID · `SYNC.md` atualizado · bump de versão · `vsce package`.
- Atualiza (ou cria) um `_handoff/LP_H2_FLOATING_PROMPT_ARCHITECTURE.md` curto — que mecanismo de coordenadas
  foi reusado, onde vive o componente, como se liga ao pipeline — para nenhuma sessão futura redescobrir.
- Push da branch (`wave/lp-h2-floating-prompt`) + `gh pr create` preparado (tabela parte→commit→teste,
  formato dos PRs #245/#246).

## GATE (único, no fim)
MOO HANDOFF: tabela parte→commit→teste · suite antes/depois · prova de que a caixa não vaza pra produção ·
confirmação COH-01…19 intactos · screenshot/descrição nos 4 breakpoints · **PARA antes do merge.**

## BACK
```
⇄ CC→COWORK · LP-H2-FLOATING-PROMPT · PR #<n> pronto
Fase 0 — mecanismo de coordenadas: <in-page (code-inspector-plugin) | overlay do webview pai> — prova: <file:line>
Fase 0 — D-A já respondeu isto? <sim, cita | não, tive de investigar de novo>
Fase 0 — prova de dev-only (nunca em produção): <prova>
Suite ANTES: <x>/<x> · Suite DEPOIS: <y>/<y>
COH-01…19: <intactos, prova>
classify.js sha: <intacta>
4 breakpoints testados: <resultado>
```

## O QUE MUDOU (v1 → v2, revisão adversarial do Cowork, não enviada v1)
1. v1 assumia reuso de uma função `lpRectsOverlap` específica sem confirmar que existe/serve para isto — v2
   pede investigação real do mecanismo de coordenadas ANTES de codar, em vez de adivinhar um nome de função.
2. v1 não distinguia "overlay no iframe" vs "overlay no webview pai" — risco de contaminar o site de
   produção real (mooter.ai) se a caixa fosse injetada in-page sem confirmar que é estritamente dev-only.
   v2 exige prova explícita disto como P0.
3. v1 deixava "decide a fonte de verdade Cockpit-vs-caixa" como decisão aberta do CC — risco de mais um
   round de correção se a escolha não agradasse. v2 decide isto agora (Cockpit disabled+razão quando há
   seleção) reutilizando um padrão já aprovado (COH-04/11), não inventando um novo.
4. v1 não pedia baseline explícito de testes antes de tocar em código — v2 exige números antes/depois lado
   a lado, para "não quebrar nada" ser verificável, não uma promessa.
5. v1 não pedia para reler a secção D-A do relatório de auditoria (que já respondeu à pergunta de
   viabilidade técnica) — v2 pede isso primeiro, anti-redescoberta.
