📥 **COLAR EM:** task **NOVA** do Cowork, pasta `C:\Users\Paulo Loureiro\frugal` ligada, conector Mooter **v1.3.5** instalado e Desktop reiniciado. Copia tudo dentro do bloco.

---

```
⇄ MOOTER v1.3.5 · VALIDAÇÃO E CAÇA A LOOPHOLES

QUEM ÉS: utilizador novo + auditor + advogado do diabo, nesta ordem de prioridade.
Não sabes o que é worktree, wave, tier ou allowedTools — se uma tool exigir isso, é defeito dela.
Elogios: uma linha, no fim. O resto é o que está errado.

❌ NUNCA me peças para descrever a UI — tu não vês o render. Julga os DADOS, a fricção e o tempo.
❌ NUNCA uses `sleep` no shell — existe `mooter_await`. Se sentires vontade, é um achado.
✅ Usa SEMPRE `mooter_work` primeiro. Descer a `mooter_dispatch` é permitido, mas REGISTA porquê.

CONTEXTO (autocontido — ❌ não vás procurar briefs no repo):
Nas últimas horas o conector foi da v1.3.1 à v1.3.5. Corrigiram-se 12 achados de auditoria e um bug
que eu próprio introduzi. Nada disto está verificado na tua máquina. É o que vais fazer.

═══════════════════════════════════════════════════════
FASE 0 · PRIMEIRA IMPRESSÃO (antes de chamar nada)
═══════════════════════════════════════════════════════
Lê só os nomes e descrições das tools `mooter_*` e responde:
0.1 Quantas vês? Quantas percebes sem manual?
0.2 Se quisesses "pedir uma auditoria a um ficheiro", qual escolherias? Porquê essa?
0.3 As três marcadas "Avançado" parecem mesmo dispensáveis a um novato?
0.4 Que parâmetro obrigatório te assusta mais?
⚠️ Guarda esta resposta antes de continuares — só se mede uma vez.

═══════════════════════════════════════════════════════
FASE 1 · A PORTA ÚNICA
═══════════════════════════════════════════════════════
    mooter_cancel(sweep:true)
    mooter_work goal:"lê o packages/mooter-bridge/worktrees.js e diz-me em 5 bullets o que faz e onde é frágil"
    mooter_await(wave:<a que o work devolveu>, timeout_s:300)
    mooter_collect(<job_id>)

MEDE: quantas tool calls do início ao resultado · segundos até saberes que algo acontece ·
que motor/modelo/pasta o `work` escolheu sozinho · a GPU local preparou o briefing antes do agente
pago entrar? (procura `chained`, `phase`, `prepare_skipped`, `downgraded`).

⚠️ Se tiveste de passar worktree/wave/step/allowedTools à mão → ACHADO GRAVE.

═══════════════════════════════════════════════════════
FASE 2 · OS GATES (sim/não + evidência ao lado)
═══════════════════════════════════════════════════════
Cada um destes foi corrigido nas últimas horas. Verifica se ficou mesmo.

 G1  O prompt chegou INTEIRO ao agente? (a v1.3.3 punha uma newline no argumento e o cmd.exe
     cortava tudo a seguir — três jobs responderam "o teu prompt chegou cortado").
     Como testar: um `mooter_work` com um goal LONGO (>400 caracteres, várias frases) e verificar
     que a resposta trata do pedido todo, não só do início.
 G2  Um job que ENTREGA texto é marcado `done`? (a v1.3.2 marcava trabalho bom como
     `failed / empty-output` porque media a telemetria em vez do resultado).
 G3  Algum motor recebeu um nome de modelo do vendor errado? Esperado: NÃO.
     Verifica `model_used` e `model_recommended` num job `moo` e num `codex`.
 G4  Lê o MESMO job terminado com `mooter_status` e com `mooter_fleet`. O `tok_s` é igual?
     E lendo outra vez 30s depois, muda? Esperado: igual e estável.
 G5  `mooter_await` sobre uma wave sem custos medidos devolve `cost_usd: null` (não `0`)
     e traz `cost_jobs_sem_medicao`?
 G6  `mooter_collect` traz `allowed_tools_effective`? Pede `allowedTools:"Read"` num job codex e
     confirma que diz `sandbox: "read-only"`. Se disser `workspace-write`, é falha de SEGURANÇA.
 G7  Quantos painéis do Mooter apareceram nesta thread até agora? Esperado: 1 ou 2.
 G8  As respostas trazem `resumo` como PRIMEIRA chave, em português legível?
 G9  `mooter_sessions_list` — os títulos são distintos e úteis? Alguma sessão diz `needs_you`
     sendo um job headless já terminado? E o `savedUsd` está oculto com nota?
 G10 Dois `mooter_work` na MESMA wave dão duas etapas em `mooter_plan action:"get"`?
 G11 `mooter_fleet` → o array `coherence` acusa alguma incoerência? Lê-a e diz se faz sentido.
     Aparecem linhas de `stderr` marcadas como "ambiente (não é do job)"?
 G12 O painel mostra `$0 · tudo local` quando o custo é zero, ou o custo desaparece?
     (responde pelos DADOS: `totals.cost_usd` é `0`, `null`, ou ausente?)

═══════════════════════════════════════════════════════
FASE 3 · A ONDA NOVA — worktrees (é a que escreve)
═══════════════════════════════════════════════════════
3.1 `mooter_worktrees` — quantas pastas tens, que branch tem cada uma, quantas livres?
    A resposta é compreensível para quem não sabe git?
3.2 Ocupa uma: despacha um job longo numa worktree. SEM esperar, pede outro `mooter_work`
    para a MESMA pasta. O conector muda-se sozinho para uma livre e diz que mudou?
3.3 Com tudo ocupado (ou simulando), o erro lista QUAIS estão ocupadas e por que jobs —
    ou volta a dizer "passa outra worktree" a quem não sabe o que isso é?
3.4 ⚠️ NÃO uses `create_worktree:true` sem me perguntares. É a única coisa aqui que escreve
    fora da pasta do job. Se achares que devias testá-lo, PERGUNTA primeiro.

═══════════════════════════════════════════════════════
FASE 4 · OS TRÊS MOTORES, AO MESMO TEMPO
═══════════════════════════════════════════════════════
Um pedido curto na GPU local · uma análise no Claude Code · uma análise no Codex, em pastas
diferentes, a correr em paralelo. Usa `mooter_await` para esperar por todos.

Responde: o Codex terminou ou pendurou? · a seta de handoff `local → cloud` apareceu? ·
o cabeçalho diz quantos são de subscrição e quantos locais? · os tokens são reais ou `n/d`?

═══════════════════════════════════════════════════════
FASE 5 · CAÇA A LOOPHOLES
═══════════════════════════════════════════════════════
Para cada um: reproduz OU explica porque não conseguiste. ❌ Nada destrutivo. ❌ Zero git aqui.

5.1 CONTRADIÇÃO — dois campos do conector que digam coisas diferentes sobre o mesmo facto.
5.2 NÚMERO INSTÁVEL — algo que mude ao ser lido duas vezes sem nada ter mudado.
5.3 SILÊNCIO — uma falha que não apareça em lado nenhum.
5.4 ARGUMENTO — um goal com aspas, `|`, `&`, `<`, `>`, acentos e emoji chega inteiro ao agente?
    (é a família do bug G1; o conector diz ter um guard — força-o)
5.5 BLOQUEIO — consegues deixar uma worktree inutilizável? Consegues sair SÓ com as tools?
5.6 CEGUEIRA — três coisas concretas que o painel não mostra e devia.
5.7 CUSTO — consegues gastar dinheiro sem perceber? Onde é que devia avisar e não avisa?
5.8 PERMISSÃO — pede `Read` e tenta confirmar, pelo `allowed_tools_effective`, se foi respeitado
    nos TRÊS motores. Algum ignora?

═══════════════════════════════════════════════════════
FASE 6 · BENCHMARK
═══════════════════════════════════════════════════════
Escolhe os TRÊS conectores mais bem desenhados que tens (Notion, Linear, Figma, Stripe, Supabase,
Slack, Sentry, Vercel…) e compara com o Mooter em: nomes · parâmetros obrigatórios · descrições ·
erros accionáveis · saída legível. Nota /10 por eixo e **o que o Mooter copiaria de cada um**.

═══════════════════════════════════════════════════════
FASE 7 · HIGIENE (isto ficou por fazer e é útil)
═══════════════════════════════════════════════════════
7.1 Despacha um job `cc` com `allowedTools:"Bash,Read"` que corra, em
    `C:\Users\Paulo Loureiro\frugal\packages\mooter-bridge`:
      node v12.test.js · moo.test.js · audit.test.js · path.test.js · worktrees.test.js ·
      seamless.test.js · fleet.test.js · server.test.js
    e reporte passados/falhados por ficheiro. **Nunca correram em Windows nesta versão.**
7.2 No MESMO job, commit LOCAL selectivo na árvore `C:\Users\Paulo Loureiro\frugal`:
    ⚠️ `git add` explícito ficheiro a ficheiro em `packages/mooter-bridge/` — **NUNCA `git add -A`**
    (há +1500 não rastreados). Confirma com `diff --cached --stat` que nada de fora entrou.
    ❌ SEM push. Mensagem: "feat(mooter-bridge): v1.3.5 - ondas C/D/E + fix do argumento multi-linha".

═══════════════════════════════════════════════════════
FASE 8 · ENTREGA
═══════════════════════════════════════════════════════
Escreve `_handoff/MOOTER_VALIDACAO_V135_<data>.md` com:
· VEREDICTO em 3 linhas: instalava isto num amigo? sim/não, porquê.
· NOTA /10 global e por eixo da Fase 6.
· TABELA DOS GATES G1-G12 com evidência literal.
· ACHADOS: | # | achado | severidade | evidência (ficheiro:linha ou saída literal) | fix numa linha |
· FRICÇÃO: tool calls até ao 1º resultado · segundos até o 1º sinal · parâmetros que inventaste ·
  vezes que precisaste do terminal.
· AS 3 QUE MAIS IMPRESSIONAM e porque não estão em destaque.
· AS 3 QUE MAIS ATRAPALHAM.
· O QUE COPIAR dos três conectores.
· PRÓXIMA WAVE: 5 fixes por impacto SENTIDO, não por dificuldade.
· BOARD e SOCIO.
Termina com UMA pergunta que precises de decidir com o Paulo.

Depois `mooter_journal` com o resumo. Se o vault não for detectado, diz — ❌ não escrevas às cegas.

═══════════════════════════════════════════════════════
REGRAS DURAS
═══════════════════════════════════════════════════════
❌ Git só na Fase 7, e só `add` selectivo + `commit`. Nunca push/merge/rebase/delete/`add -A`.
❌ Não tocar em `tools/router/classify.js` (congelado).
❌ Não escrever fora de `_handoff/`, `~/.mooter/` e do vault.
❌ Não inventar números: o que não vier do ledger, do stream ou de `nvidia-smi` é `n/d`.
⚠️ Falhou 2× seguidas → PARA e reporta o erro literal.
⚠️ Custo alvo ≤ $8. Se passares, avisa e continua com moderação.

Começa pela Fase 0. Fala comigo em português.
```

---

## Porque este prompt tem estas fases

**G1 é o gate mais importante** e é novo: a v1.3.3 pôs uma newline no argumento do prompt, e o `cmd.exe`
do Windows corta o comando aí. Três jobs receberam só o cabeçalho e responderam a pedir o brief. O fix
tem guard e teste, mas **nunca foi validado num Windows real** — e a única forma de o ver é mandar um
goal longo e confirmar que a resposta trata do pedido todo.

**A Fase 3 é a única que mexe em disco.** O `create_worktree` faz `git worktree add`, é reversível, mas é
a primeira coisa neste conector que escreve fora da pasta do job — por isso o prompt obriga a perguntar
antes de o usar.

**A Fase 7 existe porque ficou por fazer.** As suites nunca correram em Windows nesta versão, e o commit
falhou duas vezes por causa do bug do G1. Agora que está corrigido, deve passar à primeira.
