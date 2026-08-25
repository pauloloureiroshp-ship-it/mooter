📥 **COLAR EM:** uma **task NOVA** do Cowork, com a pasta `C:\Users\Paulo Loureiro\frugal` ligada e o conector Mooter v1.3.2 instalado. Copia tudo dentro do bloco.

---

```
⇄ MOOTER · AUDITORIA DE PRODUTO PELA EXPERIÊNCIA
Versão sob teste: conector Mooter v1.3.2 (MCP local, painel MCP Apps).

QUEM ÉS NESTA SESSÃO — três papéis ao mesmo tempo, sem os misturar:
  1. UTILIZADOR NOVO. Nunca viste este conector. Não sabes o que é uma worktree, uma wave,
     um tier ou um allowedTools — e não vais aprender: se uma tool exigir isso, é um defeito
     dela, não teu.
  2. AUDITOR DE UX. Mede a experiência com números, não com adjectivos.
  3. ADVOGADO DO DIABO. O teu trabalho é encontrar falhas. Elogios só no fim, uma linha.

REGRA DE OURO: usa SEMPRE a porta mais simples primeiro (`mooter_work`). Só desces a
`mooter_dispatch` quando a porta simples falhar — e quando desceres, isso é um ACHADO, regista-o.

❌ Nunca me peças para descrever a UI: tu não vês o render. Avalia o que TE chega — o texto no
chat, os campos dos resultados, quantas chamadas foram precisas, quanto tempo até saberes algo.
O visual é o Paulo que julga; tu julgas a substância e a fricção.

═══════════════════════════════════════════════════════════════════════
FASE 0 · PRIMEIRO CONTACTO (não toques em nada ainda)
═══════════════════════════════════════════════════════════════════════
Antes de chamar QUALQUER tool, lê apenas os nomes e descrições das tools `mooter_*` que tens
disponíveis e responde:

0.1 Sem executar nada: o que achas que este conector faz? Em 2 frases.
0.2 Se quisesses "pedir uma auditoria a um ficheiro", qual tool escolherias e porquê?
0.3 Quantas das tools tu, como utilizador novo, NÃO percebes para que servem?
0.4 Que parâmetros obrigatórios te assustam? Lista os que exigem conhecimento interno.

⚠️ Isto é a primeira impressão e só se mede uma vez. Guarda a resposta antes de continuares.

═══════════════════════════════════════════════════════════════════════
FASE 1 · A PORTA ÚNICA (o teste que importa)
═══════════════════════════════════════════════════════════════════════
Faz exactamente isto, sem inventar parâmetros:

    mooter_work goal:"lê o packages/mooter-bridge/telemetry.js e diz-me em 5 bullets o que
    este ficheiro faz e onde é frágil"

E depois:
    mooter_await(wave:<a wave que o work devolveu>, timeout_s:300)
    mooter_collect(<job_id>)

MEDE E REGISTA:
· quantas tool calls precisaste do início ao resultado?
· quantos segundos até saberes que ALGO estava a acontecer?
· o `mooter_work` escolheu sozinho o motor, o modelo e a pasta? Que valores escolheu?
· a GPU local preparou o briefing antes do agente pago entrar? (procura `chained` ou `phase`)
· o texto que te chegou no chat era legível como prosa, ou era JSON?

⚠️ Se tiveste de passar `worktree`, `wave`, `step` ou `allowedTools` à mão — ACHADO GRAVE.
A tese do produto é "o vibe coder não estuda". Regista-o com essas palavras.

═══════════════════════════════════════════════════════════════════════
FASE 2 · OS TRÊS MOTORES (e o gate da v1.3.2)
═══════════════════════════════════════════════════════════════════════
Agora prova que os três executores trabalham. Usa `mooter_work` sempre que der; só usa
`mooter_dispatch` para forçar o motor quando o `work` não te deixar escolher.

2.1 GPU local — um pedido de raciocínio curto, sem leitura de ficheiros.
2.2 Claude Code — uma análise de um ficheiro real do repo, read-only.
2.3 Codex — uma análise curta, read-only, em worktree DIFERENTE da do CC.

Lança 2.2 e 2.3 de forma a correrem ao mesmo tempo. Usa `mooter_await` para esperar — ❌ NUNCA
uses `sleep` no shell; se sentires necessidade disso, é um achado.

GATE DA VERSÃO — responde sim/não a cada um, com a evidência ao lado:
 G1. Algum job recebeu um nome de modelo do vendor errado? (a v1.3.1 mandou "opus" ao Ollama e
     "sonnet" ao Codex, e ambos morreram). Esperado: NÃO.
 G2. Algum job terminou com `exit 0` mas sem produzir output? Esperado: NÃO — e se acontecer,
     tem de aparecer como `failed` com `exit_code:"empty-output"`.
 G3. O Codex terminou, ou voltou a pendurar em stdin? (pendurou 3× em versões anteriores).
 G4. Lê o MESMO job com `mooter_status` três vezes seguidas, com 20s de intervalo. O `tok_s`
     mudou entre leituras? Esperado: NÃO, depois de o job acabar.
 G5. O custo do mesmo job é igual em `mooter_collect` e no ledger? E o `sessions_list` ainda
     expõe um `costUsd` que contradiz? Esperado: uma só fonte.
 G6. `mooter_sessions_list` — quantas sessões têm títulos distintos e úteis? Alguma diz
     `needs_you` sendo um job headless já terminado? Esperado: títulos úteis, zero falsos.
 G7. Quantos painéis do Mooter apareceram nesta thread até agora? Esperado: 1 ou 2, não 20.

═══════════════════════════════════════════════════════════════════════
FASE 3 · SABER O QUÊ, ONDE E POR QUEM (em tempo real)
═══════════════════════════════════════════════════════════════════════
Enquanto os jobs da Fase 2 correm, chama `mooter_fleet` UMA vez e responde só com os DADOS:

3.1 Consegues dizer, sem adivinhar: que wave está viva, que agente faz o quê, em que pasta,
    com que modelo REAL, quantos tokens, e a que ritmo?
3.2 O campo `model_source` diz de onde veio o nome do modelo? Algum job tem modelo sem
    proveniência declarada?
3.3 Os ficheiros lidos e os escritos vêm separados? (procura `files_read` vs `files_written`)
3.4 O array `coherence` acusou alguma incoerência? Lê-a em voz alta e diz se faz sentido.
3.5 O array `handoffs` prova quem preparou o trabalho de quem? Aparece a nota de $0?
3.6 O `totals` separa output de nuvem e local? A percentagem local é credível ou é `null`?
3.7 A GPU: nome, utilização, VRAM, e o veredicto de folga. O veredicto bate com os números?

⚠️ Para CADA campo que devolva `null` ou `n/d`: diz se é honestidade legítima (não há dado) ou
buraco (o dado existe e não foi ligado). Esta distinção é o núcleo desta auditoria.

═══════════════════════════════════════════════════════════════════════
FASE 4 · BENCHMARK CONTRA OS MELHORES CONECTORES
═══════════════════════════════════════════════════════════════════════
Tens outros conectores nesta máquina (Notion, Linear, Figma, Stripe, Supabase, Slack, Gmail,
Cloudflare, Sentry, Ahrefs, Vercel, Canva, Context7). Escolhe os TRÊS que te parecem melhor
desenhados e compara o Mooter com eles em cinco eixos. Usa as descrições e schemas das tools —
não precisas de as executar.

| eixo | pergunta |
|---|---|
| Nomes | um nome diz o que faz sem manual? |
| Parâmetros obrigatórios | quantos, e exigem conhecimento interno? |
| Descrições | ensinam quando usar, ou só descrevem? |
| Erros | são accionáveis (dizem o que fazer a seguir)? |
| Saída | legível por humano, ou JSON cru? |

Dá ao Mooter uma nota /10 por eixo, e diz **o que ele copiaria de cada um dos três**.
❌ Não sejas simpático. Se o Mooter perder em quatro eixos, diz.

═══════════════════════════════════════════════════════════════════════
FASE 5 · CAÇA AOS LOOPHOLES
═══════════════════════════════════════════════════════════════════════
Procura activamente por estas classes de falha. Para cada uma: reproduz OU explica porque não
conseguiste. ❌ Nada destrutivo, nada de git, nada fora de `_handoff/`.

5.1 CONTRADIÇÃO — dois campos do conector que digam coisas diferentes sobre o mesmo facto.
5.2 NÚMERO INSTÁVEL — algo que mude ao ser lido duas vezes sem nada ter mudado.
5.3 SILÊNCIO — uma falha que não apareça em lado nenhum (job que morre sem rasto no painel).
5.4 PERMISSÃO — pede `allowedTools:"Read"` num dispatch e verifica no comando construído se o
    sandbox é mesmo read-only. Um pedido de permissão ignorado é falha de segurança.
5.5 BLOQUEIO — consegues deixar uma worktree inutilizável? Consegues sair dessa situação
    usando SÓ as tools (sem terminal)?
5.6 CEGUEIRA — o que é que o painel NÃO mostra e devia? Nomeia três coisas concretas.
5.7 CUSTO — consegues gastar dinheiro sem perceber? Onde é que o conector devia avisar e não avisa?

═══════════════════════════════════════════════════════════════════════
FASE 6 · FECHO E ENTREGA
═══════════════════════════════════════════════════════════════════════
6.1 `mooter_plan action:"get"` da wave — cada etapa fechou com um `by` real (agente + modelo)?
6.2 `mooter_journal` com o resumo da auditoria. Se o vault não for detectado, diz-me — ❌ não
    escrevas às cegas.
6.3 Escreve o relatório em `_handoff/MOOTER_UX_AUDIT_V132_<data>.md` com esta estrutura:

  · VEREDICTO em 3 linhas: instalava isto num amigo? sim/não, e porquê.
  · NOTA GLOBAL /10 e a nota por eixo da Fase 4.
  · TABELA DOS GATES G1-G7 com evidência.
  · TABELA DE ACHADOS: | # | achado | severidade | evidência (ficheiro:linha ou saída literal) |
        fix numa linha | — ordenada por severidade.
  · MÉTRICAS DE FRICÇÃO: tool calls até ao primeiro resultado · segundos até o primeiro sinal ·
        parâmetros que tiveste de inventar · vezes que precisaste do terminal.
  · AS 3 COISAS QUE MAIS IMPRESSIONAM (se existirem) e porque não estão em destaque.
  · AS 3 COISAS QUE MAIS ATRAPALHAM.
  · O QUE COPIAR dos três conectores da Fase 4.
  · PRÓXIMA WAVE: os 5 fixes por ordem de impacto sentido pelo utilizador — não por dificuldade.
  · BOARD (item × estado × próxima acção) e SOCIO (receita/despesa↓/risco↓/reversível/escopo).

6.4 Termina com UMA pergunta: a coisa que precisas de decidir com o Paulo e não podes decidir
    sozinha.

═══════════════════════════════════════════════════════════════════════
REGRAS DURAS
═══════════════════════════════════════════════════════════════════════
❌ Zero git (add/commit/push/merge/rebase/delete).
❌ Não tocar em `tools/router/classify.js` — está congelado.
❌ Não escrever fora de `_handoff/`, `~/.mooter/` e do vault.
❌ Não inventar números: o que não vier do ledger, do stream ou de `nvidia-smi` é `n/d`.
❌ Não usar `sleep` no shell — existe `mooter_await`. Se precisares mesmo, é um achado.
❌ Não pedir ao Paulo para abrir o VS Code. Se algo só lá for possível, explica porquê.
⚠️ Se a mesma coisa falhar 2× seguidas, PARA e reporta o erro literal.
⚠️ Custo alvo desta auditoria: ≤ $6. Se passares, diz e continua com moderação.

Começa pela Fase 0 e não saltes fases. Fala comigo em português.
```

---

## Porque este prompt está desenhado assim

Três lições da auditoria anterior, que custaram caro:

1. **Nunca pedir para descrever a UI.** Na corrida da v1.3.1, três de sete perguntas voltaram `n/d`
   por construção — a sessão não vê o render. Aqui pede-se a **substância** (dados, fricção, tempo),
   e o visual fica para ti.
2. **Pedir o resultado, não o percurso.** O prompt anterior ditava as chamadas exactas e por isso a
   demo nunca usou `mooter_work` — construiu-se a porta e mandou-se entrar pela janela. Aqui a Fase 1
   obriga à porta única, e **descer a `dispatch` é registado como defeito**.
3. **`mooter_await` em vez de `sleep`.** A sessão anterior dormiu quatro vezes no shell para seguir
   uma wave. Aqui isso é explicitamente um achado.

E a Fase 4 é nova: comparar com Notion, Linear, Figma e companhia dá uma régua externa. Até agora o
Mooter só foi julgado contra si próprio.
