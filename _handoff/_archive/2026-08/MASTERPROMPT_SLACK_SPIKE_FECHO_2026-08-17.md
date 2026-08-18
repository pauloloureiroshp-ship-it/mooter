# 🧨 MASTERPROMPT — FECHO DO slack-spike (3 baldes, um só documento)
**Criado:** 2026-08-17 · **Origem:** COW · slack-spike · **Consolida:** handoff + auditoria +
decisões de maestro do Cowork. É o único documento a seguir daqui para a frente.

📥 COLAR EM: **Claude Code** · path verificado hoje: worktree
`C:\Users\Paulo Loureiro\frugal\.claude\worktrees\slack-spike-masterprompt-82c108`
(branch `claude/slack-spike-masterprompt-82c108` @ `29ace5ee` · 18 commits ahead ·
172/172 · classify.js `427d8c0b…` intacto) · âncora de sessão: `/rename slack-spike` ·
fallback: se a sessão fechou, abre fresca na worktree acima e relê este ficheiro +
`_handoff/HANDOFF_SLACK_SPIKE_COWORK_2026-08-17.md`.

## ACK obrigatório (bloco `[medido]` antes de agir)
1. `git -C <worktree> rev-parse --short HEAD` = `29ace5ee`? · `git rev-list --count origin/main..HEAD` = 18?
2. `cd packages/slack-spike && node --test` = 172/172?
3. daemon: está a ouvir? com que sha de código (o do fix de fecho de thread, ou o anterior)?
4. `git -C ~/frugal status --porcelain SYNC.md` — ainda modificado em `onda-q`? (é o risco B2)
5. pendente `e13c` — ainda silenciado e intacto na fila?
Divergência de qualquer linha → escreve e PÁRA (C5: o campo manda, não o plano).

---

## 🎯 BALDE 1 — VER A MAGIA (a única coisa que o dono quer agora)
Objectivo: um pedido real, do princípio ao `🏁`, na máquina do dono, com recibo.
1. Reinicia o daemon com o código do fix de fecho de thread (o actual em HEAD). Confirma no
   arranque que carregou `29ace5ee`, não o anterior.
2. Avisa o dono: "estou a ouvir com o fix — manda `@Mooter lê o README do slack-spike e resume
   em 5 linhas` no #mooter-demo".
3. **NÃO toques no `e13c`** (ciclo mau, ~US$0,63, re-pede). O pedido novo é outro thread.
4. Resultado esperado: thread abre `⚙️ Recebido` → ~20s → `🏁 Trabalho concluído · ~US$0,11`.
   Se o thread NÃO fechar, é regressão do fix — grava o ledger do job e PÁRA.
Este balde NÃO precisa da auditoria nem da rotação: é teste-fumo privado do dono, não é
mostrar a estranho. Bar diferente (decisão de maestro, no SYNC de main).

## 🔒 BALDE 2 — NÃO PERDER O DIA (30s, urgente, ANTES de qualquer git checkout)
A autorização (linha `kimi-egress FECHADA — slack-spike destravado` + bloco `GO CONDICIONADO`
+ decisões de maestro) vive **uncommitted** no working copy de `~/frugal` no branch
`onda-q/m1-fechar-o-laboratorio`. É o único trabalho da frente que se perde num checkout.
- `git -C ~/frugal add SYNC.md && git -C ~/frugal commit -m "chore: autorizacao slack-spike + decisoes cowork (destrave, GO condicionado, veredictos UX)"`
- Confirma com `git -C ~/frugal log -1 --stat` e reporta o sha.
Nada de push. Só protege o disco.

## 🚪 BALDE 3 — PORTÃO DO ESTRANHO (sem pressa; nada aqui vai a main sem o dono)
Ordem obrigatória — cada passo destranca o seguinte:

**3a · Auditoria pelo crítico certo.** Despacha `_handoff/AUDITORIA_SLACK_SPIKE_2026-08-17.md`
INTEIRO ao **codex** (read-only, vendor diferente — autor≠crítico é a doutrina; nem tu nem o
Cowork a corram). Anexa o veredicto do codex sem o filtrar. Partes A–H, com foco em:
A4/A6 (custo real declarado bate?), Parte B (a 4ª instância do viés teste-vs-código), Parte C
(as 4 barreiras do egress + o `.env` nunca imprime tokens), Parte D (é produtivo?).

**3b · Correcções pós-auditoria (só o que o codex marcar ALTO + as 3 decisões de maestro já tomadas):**
- **Botão PARAR** no cartão de estado, ligado a `mooter_cancel`/`toolCancel`, com o MESMO
  CAS/anti-stale do Aprovar (clique atrasado sobre job terminado = no-op, não erro). [APROVADO]
- **Matar os 20s de `prep_timeout`** neste caminho: skip da preparação local no dispatch Slack
  (ou timeout curto), nunca decorar latência. [APROVADO]
- **Sinais honestos H5**: reacção ⏳→✅/❌ na mensagem do utilizador · heartbeat SÓ se demorar,
  com números reais do ledger (nunca % nem ETA inventada) · suprimir o push da msg de estado.
- **Barra de progresso: NÃO** (sem denominador honesto — recusada por decisão de maestro).
- **assistant.threads.setStatus**: fica opção DOCUMENTADA, não construída (puxa p/ assistant-
  surface com risco de gate pago; a reacção emoji já dá o sinal "está a trabalhar").
- **Kimi excluído por construção** (allowlist de motores sem kimi + teste que prova a recusa) —
  condição do GO, se ainda não estiver feita.

**3c · Rotação dos tokens (C6, limpeza de segurança).** O ficheiro original expôs o token no
NOME em OneDrive/Desktop + num transcript. Risco real baixo (app throwaway, 1 workspace, scopes
mínimos) mas o princípio manda. O dono regenera (botão do Slack — acção dele), o Cowork
re-injecta no `.env`. Fazer ANTES de mostrar a um estranho, não antes do teste-fumo do balde 1.

**3d · Ensaio do infeliz contra o Slack REAL** (hoje só provado em dry-run): recusa · clique
atrasado (STALE com o hash à vista) · daemon offline (pendente sobrevive). Grava os 3.

**3e · Teste 2-devices**: aprovar do telemóvel com a frota no desktop — a cena da demo. Avisa
o dono ANTES para ele estar com o telemóvel na mão.

**3f · final-reviewer** antes de qualquer push/merge.

## ❌ GATES DE MERGE (nenhum negociável — condições de sócio)
1. **Demo AGENDADA com ≥1 estranho** — sem data marcada, o spike NÃO fecha. Fecha-se a agenda
   primeiro. (Bloqueia o merge, não o teste-fumo.)
2. Auditoria do codex sem ALTO em aberto.
3. Tokens rodados · autorização committed (balde 2).
4. final-reviewer verde.
Só com os 4 é que se faz push/merge — e o merge arquiva este masterprompt e o de origem para
`_handoff/_archive/2026-08/` no MESMO PR.

## ❌ NÃO FAZER
- Push/merge sem os 4 gates · clicar no `e13c` · correr a auditoria tu mesmo ou pelo Cowork ·
  tocar em `classify.js` (FROZEN) ou nos `packages/*` das waves 28–34.5 · usar os tokens
  actuais depois da rotação · construir barra de progresso · construir assistant-surface ·
  decorar o prep_timeout em vez de o matar · `git add -A` (só adds selectivos).

---
`gauntlet (do emissor Cowork, 2026-08-17): consolida handoff+auditoria+3 decisões de maestro
(D3 produtivo=SIM · H2 barra=NÃO · H3 Parar>progresso=SIM) · autor≠crítico preservado (audit→codex) ·
paths verificados por device_bash · números com fonte ou n/d · 3 baldes por urgência, gates de
merge explícitos e inegociáveis · o teste-fumo do dono é bar diferente do portão do estranho.`
