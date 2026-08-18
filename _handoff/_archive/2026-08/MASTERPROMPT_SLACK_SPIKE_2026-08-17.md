# 🎬 MASTERPROMPT `slack-spike` — DEMO DE BOLSO NO SLACK (throwaway declarado)
**Criado:** 2026-08-17 · **Origem:** COW · estudo-slack-multiuser · **G4 pré-entrega:** kimi-k3
(job-msx255a9-cd52, 168s, $0,088 — 4 ALTO + 5 BAIXO, TODOS incorporados abaixo)

📥 COLAR EM: **Claude Code** · sessão FRESCA em `C:\Users\Paulo Loureiro\frugal` · gesto 0:
`/rename slack-spike` · fallback: se existir, retoma.

⚠️ **GATE EM DOIS MODOS (v1.1, 17/08 — o dono não espera parado):**
- **MODO CONSTRUÇÃO — permitido JÁ, em paralelo com o G4 #9b:** worktree própria, escrever o
  adapter, testes unitários com broker em dry-run (nenhum dispatch real), ensaio das 3 falhas
  com pendentes SIMULADOS. Zero sobreposição de ficheiros com a kimi-egress (o adapter vive
  em pasta nova e só IMPORTA APIs existentes).
- **MODO VIVO — só quando o SYNC.md disser "kimi-egress FECHADA — slack-spike destravado":**
  primeiro dispatch real, primeiro pendente real, teste 2-devices. Verifica essa linha no
  SYNC ANTES de cada arranque do daemon; sem ela, o daemon recusa arrancar (é um if, escreve-o).

## O que isto É e o que NUNCA será
É uma **demo de bolso**: app Slack custom, Socket Mode, UM workspace (o do Paulo), canal
`#mooter-demo`, timebox **2 dias de frota**. Nasce com data de morte: `SPIKE_MORRE_EM` no
topo do daemon (default: +30 dias) — passado o prazo sem piloto pago, o branch arquiva-se.
NUNCA será: marketplace, HTTP, multi-tenant, ou código copiado para o produto sem frente
própria com G4 (o adapter é marcado THROWAWAY em todos os ficheiros — kimi #2).

## Loop da demo (completo, incluindo o infeliz)
1. Paulo menciona `@Mooter <goal>` em `#mooter-demo` → goal aceite APENAS se `user.id` ∈
   allowlist de UM id · thread-context NUNCA entra no prompt.
2. Dispatch pela porta única (`mooter_work`) com `actor:{id:"slack:U<paulo>", origem:"slack"}` →
   status no thread.
3. Capacidade sensível → pendente com botões: diff-stat, custo, modelo, autor — NUNCA conteúdo.
4. **Clique valida a MESMA allowlist no handler de interacções (kimi #1 — ALTO):** clique de
   terceiro → ignora + regista; pendente já decidido → resposta efémera "já decidido".
5. Aprovar → `broker.decide({idem_key, expected_state_hash, actor})` → re-despacho → confirmação
   **+ a entrada de auditoria do ledger publicada no thread (kimi #8 — é ISSO que prova custódia
   ao estranho)**. Recusar → `approval_rejected`, dito no thread.

## Regras duras (as correcções do G4, executáveis)
- **Dia 0 (kimi #3):** ANTES de escrever o adapter, verifica que custo/modelo/autor são LEGÍVEIS
  do ledger de hoje. Campo em falta → corta do pendente ou mostra "estimativa" rotulada —
  NUNCA tocar no núcleo para o obter (zero mudanças em packages/mooter-bridge; consumo por
  import das APIs existentes, embrulhado num adapter THROWAWAY único).
- **Publicação por UMA função (kimi #6):** `publicar()` única que REJEITA payload com
  `visibilidade: local_only` — nenhum chat.postMessage fora dela.
- **Teste denylist (kimi #5):** repo de ensaio com `segredo.env` → provar que o NOME nunca
  aparece em nenhum pendente/mensagem.
- **Tokens Slack (kimi #7):** `.env` + entrada no .gitignore verificada no setup, antes do 1º token.
- **Ensaio do infeliz (kimi #4):** antes de mostrar a alguém, gravar as 3 falhas a funcionar:
  recusa · clique atrasado (STALE visível — mostrar o hash a trabalhar) · daemon offline
  (pendente sobrevive e aparece ao religar).
- Teste 2-devices: aprovar do telemóvel com a frota a correr no desktop — é a cena da demo.
- Suite do spike: `node --test` no dir do adapter; prova vermelho→verde; custo/tokens no fecho.

## Condições de sócio (fora do código)
1. A demo nasce AGENDADA: antes do merge do spike, o Paulo marca data com ≥1 estranho
   (Gesto 1). Sem data marcada, o spike não fecha — fecha-se a agenda primeiro.
2. Registo no SYNC + MASTERPROMPTS_INDEX no fecho, com custo medido.
3. ❌ NÃO FAZER: tocar no bridge core · classify.js · endpoint HTTP · 2º workspace ·
   qualquer coisa da lista ❌ das frentes anteriores.

`gauntlet: ALTO-RISCO (masterprompt) · G4 kimi-k3 pré-entrega, 4 ALTO+5 BAIXO incorporados ·
G18: campos do pendente condicionados a leitura real do ledger (dia 0) · quem-mede-o-medidor:
o pendente só mostra o que consegue DERIVAR.`
