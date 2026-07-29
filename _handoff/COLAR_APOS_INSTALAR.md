📥 **COLAR EM:** uma **task NOVA** do Cowork, depois de reiniciar o Claude Desktop (tray incluída).
Bloco 1 primeiro. Só passa ao Bloco 2 se o Bloco 1 der verde.

# 🐮 Mooter v1.3.1 — primeiros dois prompts

---

## BLOCO 1 · Prova de vida (30 segundos, $0)

```
Estás com o conector Mooter v1.3.1 acabado de instalar. Faz só isto, sem trabalho extra:

1. mooter_cancel(sweep:true) — limpa jobs órfãos de antes do restart. Diz quantos fechaste.
2. mooter_fleet — e responde-me EXACTAMENTE a estas 7 perguntas, uma linha cada:
   · quantas tools mooter_* vês?
   · o painel apareceu na lateral, com a vaca no cabeçalho? (sim/não)
   · qual é o nome da GPU e a % de utilização agora?
   · quantos GB de VRAM livres?
   · que modelos estão residentes no Ollama?
   · o vault Obsidian foi detectado? em que caminho?
   · o rodapé mostra "cloud … out · local … out"? (sim/não)
3. mooter_session_bind com project "Mooter.ai", folder "C:\Users\Paulo Loureiro\frugal".

❌ Não despaches nada. ❌ Não escrevas ficheiros. Se algo for n/d, diz n/d — não contornes.
```

**Verde é:** 13 tools · vaca visível · nome da placa real (RTX 4090) · pelo menos um modelo no Ollama
ou "nenhum residente" · vault detectado ou `n/d` explicado.

**Se o painel não aparecer:** o Claude Desktop não foi fechado com a tray. Fecha pelo ícone junto ao
relógio → Quit, e reabre.

---

## BLOCO 2 · A magia (3 motores ao mesmo tempo, ~$2)

```
⇄ MOOTER · WAVE DE DEMONSTRAÇÃO
Tu (Cowork) és o cérebro. O Mooter roteia. A GPU local prepara. CC e Codex executam em paralelo.
Nada disto sai desta conversa.

OBJECTIVO: provar que os três motores trabalham juntos e que o painel mostra a verdade.

── 1. PLANO ──────────────────────────────────────────────────────────
mooter_plan action:"set", wave:"demo-3-motores", goal:"provar os 3 motores e o painel", steps:[
  "preparar o briefing na GPU local",
  "auditar o conector com o Claude Code",
  "analisar os buses de eventos com o Codex",
  "escrever a nota final no vault"
]

── 2. LOCAL PRIMEIRO ($0) ────────────────────────────────────────────
mooter_dispatch agent:"moo", wave:"demo-3-motores", step:"S1",
  worktree:"C:\Users\Paulo Loureiro\frugal-w2",
  masterprompt: um pedido curto para a GPU local resumir, em ≤200 palavras, o que um auditor
  deve procurar num conector MCP que despacha agentes. Inclui o cabeçalho ⇄ no topo.

Enquanto corre, mostra-me o painel e diz: que modelo local está a correr, quantos tok/s,
e quantos tokens já gerou.

── 3. OS DOIS PAGOS, EM PARALELO ─────────────────────────────────────
Assim que o moo terminar, despacha OS DOIS ao mesmo tempo (worktrees diferentes):

a) mooter_dispatch agent:"cc", wave:"demo-3-motores", step:"S2",
   worktree:"C:\Users\Paulo Loureiro\frugal-w2", allowedTools:"Read,Glob,Grep",
   handoff_from: <o job_id do moo>,
   masterprompt: auditar packages/mooter-bridge/seamless.js e dizer, em ≤300 palavras,
   as 3 coisas mais frágeis. Read-only, zero git.

b) mooter_dispatch agent:"codex", wave:"demo-3-motores", step:"S3",
   worktree:"C:\Users\Paulo Loureiro\frugal-integ", allowedTools:"Read",
   masterprompt: em ≤200 palavras, comparar ~/.mooter/ledger.jsonl com
   _handoff/agent-sync/events.jsonl e dizer que campos faltam a cada um.
   ⚠️ O Codex ignora allowedTools — escreve as proibições de forma explícita no prompt:
   ❌ não criar, alterar nem apagar ficheiros. ❌ zero git.

── 4. ACOMPANHAR ─────────────────────────────────────────────────────
A cada ~60s, mooter_status(wave:"demo-3-motores") e relata UMA linha por job:
modelo real · o que está a fazer · tokens · tok/s.
❌ Não coles JSON. ❌ Não inventes progresso que não vem do ledger ou do stream.

Confirma-me também: o painel mostra a seta de handoff (GPU local → Claude Code)?
E o cabeçalho diz quantos são de subscrição e quantos são locais?

── 5. FECHO ──────────────────────────────────────────────────────────
mooter_collect dos três. Sintetiza — não coles resultados brutos.
mooter_plan action:"get" — confirma que as etapas fecharam com um "by" real.
mooter_journal kind:"learning", wave:"demo-3-motores", com o que aprendemos.
Se o vault for n/d, diz-me em vez de escrever às cegas.

Fecha com BOARD (item × estado × próxima acção) e diz-me:
· custo real da wave
· % do output que foi local
· se o modelo que o router pediu foi o que correu

── ❌ NÃO FAZER ──────────────────────────────────────────────────────
❌ git (add/commit/push/merge/delete)  ❌ tocar em tools/router/classify.js (FROZEN)
❌ escrever fora de _handoff/, ~/.mooter/ e do vault  ❌ inventar números
Se a mesma coisa falhar 2×, PARA e diz o que houver.
```

---

## O que estás a testar em cada peça

| O que ver | Prova que |
|---|---|
| Um modelo local a gerar tok/s | o tier T0 deixou de ser decoração |
| Seta `qwen2.5:3b → claude-…` | o handoff é real, não slogan — está no ledger |
| Dois cards a andar ao mesmo tempo | paralelismo verdadeiro entre CC e Codex |
| **O Codex a TERMINAR** | o bug de stdin morreu (3 vezes pendurado antes disto) |
| Ficheiros com `✎` | sabes o que foi lido e o que foi escrito |
| Etapas com risco e autoria | o plano deixou de viver na tua cabeça |
| GPU % a mexer | podes decidir se há folga para mais trabalho local |

⚠️ **O teste mais importante é o Codex.** Nunca o vimos terminar — pendurou 3× em
`"Reading additional input from stdin..."`. A v1.3.1 fecha o stdin no spawn. Se ele terminar,
fecha meses de dúvida. Se voltar a pendurar, `mooter_cancel(job_id)` resolve em 1 segundo
(coisa que também não existia).

## Se algo correr mal

| Sintoma | Causa provável | Fix |
|---|---|---|
| Sem tools `mooter_*` | Desktop não reiniciou com a tray | Quit pelo ícone do relógio → reabrir |
| Painel não aparece | idem, ou task antiga | task **nova** |
| `worktree já tem job ativo` | fantasma de antes | `mooter_cancel(sweep:true)` |
| `spawn … ENOENT` | CLI fora do PATH | os 3 estavam OK em 25/07 — reporta o erro literal |
| Codex pendurado outra vez | fix não pegou | `mooter_cancel(job_id)` e diz-me — é dado, não falha |
