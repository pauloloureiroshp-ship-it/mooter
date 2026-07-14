# ⇄ COWORK→CC(Fable 5) · LP-H2-FLOATING-PROMPT · Prompt ancorado à seleção — implementação real, sem puxadinho

> **Cola este ficheiro inteiro numa janela FRESCA do Claude Code.** Objetivo: fechar o gap H2 que ficou de
> fora do PR #246 — hoje, ao selecionar um elemento no Live Preview, não existe NENHUMA caixa de prompt
> visualmente ligada à seleção (confirmado ao vivo por testes exaustivos do Cowork: sem hover-toolbar, sem
> menu no segundo clique, sem sugestão ao focar a caixa do Cockpit). O único input existente hoje é a caixa
> genérica do Cockpit, sem qualquer pista visual de que está amarrada à seleção — isto é o próprio tipo de
> incoerência que a auditoria original apontou (D-A/H2) e que o Paulo recusa aceitar como versão final.
> **Não é para simular ou mockar** — é para implementar de verdade, reutilizando 100% do pipeline
> Ask→Apply já existente e testado (COH-07). Zero backend novo. Uma superfície nova, bem feita.

## GOAL
Uma caixa de prompt flutuante, ancorada ao elemento pinado dentro do próprio Live Preview (webview),
visível no instante em que a seleção acontece — nível Lovable/Cursor, como estava na H2 do mock v2 e no
critério §D-L do benchmark original ("prompt ancorado à seleção com contexto do elemento visível"). Ela
chama o MESMO handler host (`_askApply`/`_taskRun`, `lp-ask`/`lp-ask-apply`) que a caixa do Cockpit já usa
— não um caminho paralelo. Termina com o gate humano de sempre; sem merge autónomo.

## WHERE
`C:\Users\Paulo Loureiro\frugal-lp-coerencia` (worktree ativa — mesma do PR #246, protegida pelo guard do
Foundation Reset, "não tocar" refere-se a OUTRAS waves, não a esta). Base: `origin/main` após
`git fetch origin main --tags` (confirma que `wave/lp-coerencia`/#246 já está integrada).

## LER PRIMEIRO (não redescobrir)
1. `_handoff/mooter-live-preview-mock-v2.html` — a spec visual aprovada (a aba/anotação da H2, disposição
   final). É a fonte de verdade do layout — não inventes um novo.
2. `_handoff/LP_COHERENCE_AUDIT_REPORT.md` §D-A — veredicto H2 CONFIRMADA (prompt-de-edição = flutuante
   ancorado à seleção; thread/histórico = rail direito; cockpit esquerda = navegação, não edição).
3. Código existente do COH-02 (colisão toolbar-vs-pin, `lpRectsOverlap`, fallback dock/minimize) — a nova
   caixa REUTILIZA esta lógica de posicionamento, não reimplementa.
4. `_handoff/LP_ASK_APPLY_INPROCESS_ARCHITECTURE.md` — já escrito por ti numa sessão anterior; confirma que
   o único emissor legítimo de `lp-ask-apply` é o webview. A caixa nova é OUTRO emissor dentro do MESMO
   webview — arquiteturalmente igual à caixa do Cockpit, só noutro sítio da tela.
5. `lp-ask-apply-host.test.js`, `lp-lease-host.test.js`, `lp-publish-dest-host.test.js` — contrato que não
   pode quebrar.

## GUARD (inegociável)
- `classify.js` FROZEN — sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` intacta.
- **Zero handler host novo.** A caixa flutuante compõe a MESMA mensagem `{type:'lp-ask', ...}` /
  `{type:'lp-ask-apply', askId}` que a caixa do Cockpit já envia. Se precisares de um campo a mais no
  payload, adiciona-o ao contrato existente com teste — não crias um segundo canal.
- Preserva os 19 fixes COH-01…19 e os seus testes (394 `lp-*` + suite completa — corre e reporta números
  reais antes e depois).
- Dois caminhos para o MESMO resultado é incoerência nova: decide UMA fonte de verdade. Recomendação: com
  seleção ativa, a caixa flutuante é o caminho primário; a caixa do Cockpit mostra uma dica
  ("elemento selecionado — usa a caixa junto a ele, ou escreve aqui para algo sem seleção") em vez de ficar
  muda sobre a ligação. Não elimines a caixa do Cockpit (serve comandos sem seleção) — torna a relação entre
  as duas óbvia.
- COH-13 (dicionário visual 🐮⚡🎼🧠🌟), COH-14 (state machine idle/blocked/working/success/warning/error,
  `prefers-reduced-motion`) e COH-02 (nunca cobre o pin, teste geométrico real nos 4 breakpoints do mock:
  320/390/768/1024) aplicam-se TAMBÉM a este componente novo — não é isento por ser novo.
- Tests-first. Commits atómicos `feat(live-edit): H2-<parte> — …`. Suite completa verde antes de cada commit.
- Sem deploy, sem push automático, sem merge. Push da branch + `gh pr create` podem ser preparados; o merge
  é sempre do Paulo/Cowork no Chrome, como em #245/#246.

## AS WAVES

### H2.0 · Componente da caixa flutuante
- Monta dentro do webview do Live Preview (mesma CSP/nonce/concat-only/esc() contract já em vigor — zero
  backticks/`${}` nas funções serializadas, como sempre).
- Posição: ancorada ao bounding-rect do elemento pinado, reutilizando `lpRectsOverlap`; fallback dock/chip
  quando não há espaço (mesma regra do COH-02).
- Conteúdo: breadcrumb curto (`<p> · page.tsx:52`), input de uma linha, chips de tier (COH-13), botão
  enviar, indicador de estado (COH-14). Skills contextuais (COH-18) se já existirem para este nó — reusa,
  não reconstruas.
- Aparece IMEDIATAMENTE quando `pin` acontece (mesmo evento que já dispara o log MEO `live-preview · pin`).
  Desaparece ao `unpin`/troca de origem (mesmo ciclo de vida do COH-01 lease — reage ao mesmo invalidation).

### H2.1 · Ligação ao pipeline real (sem handler novo)
- Submit → compõe e envia `lp-ask` com a instrução; ao receber resposta, mostra o mesmo CTA
  "▶ Aplicar com o agente" já usado hoje (COH-07) → envia `lp-ask-apply` com o taskId devolvido.
- Testes: a caixa nova tem de passar pelos MESMOS testes de contrato host já existentes (lease revalidado,
  taskId inválido recusado, payload adulterado ignorado) — adiciona um teste de front-end que confirma que
  a caixa compõe a mensagem certa, e reusa os testes de host sem alteração.

### H2.2 · Coerência Cockpit ↔ caixa flutuante
- Decide e implementa a UMA fonte de verdade descrita no GUARD. Testa os dois estados (com seleção / sem
  seleção) e confirma que nunca há ambiguidade sobre onde escrever.

### H2.3 · Fecho
- Suite completa (lp-* + complementares + novas) 100% verde, números reais reportados.
- `classify.js` sha confirmada.
- Bump de versão, CHANGELOG por COH-ID/H2-ID, `SYNC.md`, `vsce package`.
- Push da branch (`wave/lp-h2-floating-prompt`) + `gh pr create` preparado, título
  "Live Preview — prompt ancorado à seleção (H2)" com tabela parte→commit→teste (formato dos PRs #245/#246).

## GATE (único, no fim)
MOO HANDOFF ao Paulo: tabela parte→commit→teste · resultado da suite antes/depois · confirmação de que os
19 COH continuam verdes · screenshot ou descrição do componente novo nos 4 breakpoints · **PARA antes do
merge** — merge é do Paulo/Cowork no Chrome, como sempre.

## BACK
`⇄ CC→COWORK · LP-H2-FLOATING-PROMPT · PR #<n> pronto · suite <x>/<x> · COH 01-19 intactos · H2 implementado
nos 4 breakpoints · aguarda merge`
