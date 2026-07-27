# AUDITORIA UX DO MOOTER — 27-07-2026

**Sessão:** Cowork · projecto Mooter.ai · auditoria pura (zero correcções aplicadas)
**Conector:** v1.19.0 (run 1, 11:06) → **v1.22.0** (run 2, 11:49, após reinício)
**Custo total da auditoria:** $0,605405 · 3 jobs · pressão de quota 0,709 → 0,710
**Método:** medir em vez de assumir · cada afirmação com número e fonte · `n/d` com porquê

---

## 0 · TL;DR PARA QUEM DECIDE

Três frases:

1. **A v1.22.0 instalou-se sem a entrega que a define.** O bundle é de 08:46; a wave que devia
   escrever o `recibo.js` correu às 10:55 e morreu aos 613 s. O conector diz *"estás na versão
   mais recente"* — verdade sobre o número, falsa sobre o produto.
2. **A honestidade de dados deu um salto real** entre 1.19.0 e 1.22.0: **10 dos 14 loopholes**
   da primeira corrida fecharam, incluindo os três piores (`cost_usd: 0`, `cloud_in: 0`,
   frescura por bloco). O padrão certo está implementado — falta cobertura.
3. **O que resta a corrigir divide-se em duas famílias:** (a) bugs que produzem uma **resposta
   certa sobre a coisa errada** — os únicos que te podem fazer decidir mal; (b) bugs de
   **relato** que confundem mas não enganam. Trata (a) primeiro, sempre.

**A decisão que bloqueia todas as outras:** ❌ **não construir o recibo de fecho antes de
corrigir o `custo_por_tarefa_entregue_usd`.** O brief do recibo manda-o reaproveitar
`board.scorecardAsync`; se for construído hoje, **nasce a reportar $0 numa wave que custou
$0,61**. Ordem invertida = o recibo herda a mentira e passa a legitimá-la.

---

## 1 · O QUE FOI FEITO (execução real, com números)

### 1.1 · Duas corridas de abertura

| Marco | Run 1 (v1.19.0) | Run 2 (v1.22.0) |
|---|---|---|
| T0 (relógio, antes de tudo) | 11:06:29.513Z | 11:49:23.804Z |
| Primeiro painel (`ts`/`gerado_em`) | 11:06:35.914Z → **6,40 s** (`view:'tudo'`) | 11:49:26.127Z → **2,32 s** (`view:'board'`) |
| `bound_at` (roots/list) | 11:06:18.077Z (−11,4 s antes do T0) | 11:49:06.396Z (−17,4 s antes do T0) |

⚠️ **Os dois valores são o melhor caso.** Em ambas as corridas o `roots/list` já estava quente
antes do T0 — o arranque frio não está instrumentado em lado nenhum.
⚠️ **Custo não medido:** as tools do Mooter são *deferred* no host e exigem uma chamada
`ToolSearch` antes da primeira invocação. Esse round-trip existe e não aparece em número nenhum.

**Conclusão de tempo:** `board` cumpre o alvo <5 s com folga; `tudo` falha por 28%. Não é acaso —
`board` devolve 12 métricas, `tudo` devolve o repositório inteiro.

### 1.2 · Wave `auditoria-ux` — 3 jobs despachados às 11:53:07

| # | Job | Roteamento | Desfecho | Tempo | Custo |
|---|---|---|---|---|---|
| ① | Ler `AGENTS.md`, listar secções | **moo · T0 · qwen3.6:27b** ✅ | done | 120 s | **$0** |
| ② | Analisar `board.js` (desenho de correcção) | **RECUSADO** `sem_worktree_viavel` | nunca correu | — | — |
| ③ | Auditoria de segurança (segredos + .gitignore) | **moo prep 7 s → cc · sonnet** ✅ | done | 72 s | **$0,6054** |

- **Wave total:** 107 s de parede · `$0,605405` · **3/3 com custo medido, 0 sem medição** ✅
- ① confirmou a previsão: leitura → local → $0.
- ③ confirmou a recusa local: `motivos_nao_local` disparou em
  `"é trabalho onde um erro custa caro (b(audita|auditoria|seguran…)"`.
- ② não é ruído — é o achado B1 (ver §3.1).

### 1.3 · Progresso observado (2× `mooter_check`, ~30 s de intervalo)

| | check #1 (≈11:53:52) | check #2 (11:54:22) |
|---|---|---|
| Job ① | `🤔 a raciocinar · 2351 caracteres` | `· 6919 caracteres` |
| Job cc | `steps_done: 5` · `a ler .gitignore` · `[Read,Bash,Grep]` | idem |

### 1.4 · Fase 3 (recibo) — impossível

`mooter_fleet({view:'recibo'})` → `MCP error -32602`.
Enum real: `tudo · board · afericao · jobs · pastas · sessoes · plano`. **`recibo` não existe.**

---

## 2 · O QUE JÁ ESTÁ RESOLVIDO — ❌ NÃO REFAZER

A 1.22.0 fechou **10 dos 14** loopholes da run 1. Quem pegar nisto não deve reabrir nenhum:

| Buraco (run 1) | Estado | Prova na 1.22.0 |
|---|---|---|
| `totals.cost_usd: 0` com 2 jobs sem medição | ✅ | `{valor: null, porque: "não há jobs desta origem no retrato", jobs_medidos, jobs_sem_medicao}` |
| `cloud_in/cloud_out: 0` impossível | ✅ | idem, null + porquê + contagem |
| Dois valores para o mesmo número (`totals` vs `arvore`) | ✅ | ambos null, mesma estrutura |
| `local_share`/`quota_local_pct` null sem porquê | ✅ | `porque: "nenhum job trouxe tokens de saída medidos"` |
| Blocos vazios que apareciam na mesma | ✅ | `waves`,`jobs`,`handoffs`,`sessions`,`coherence`,`active_wave` desaparecem |
| `worktrees: total 37 / free 35` com 37 `busy:false` | ✅ | `total 37 · occupied 0 · free 37`, cada um com `porque` |
| `live_preview` de −14,7 h vestido de actual | ✅ | `fresco: false · idade_h: 15.45` |
| `session_model` de outra sessão (−9,5 h) | ✅ | `sessao: {fresco: false, idade_h: 10.31}` |
| `suspeitas: 1` sem dizer qual | ✅ | campo ausente |
| "frota parada" + `active_wave` falhada | ✅ | `active_wave` ausente quando não há jobs |

**A recomendação transversal da run 1 — `medido_em` + `fresco` + `idade_h` por bloco — está
implementada** em `sessao`, `live_preview`, `capacidades`, `combustivel`, `gpu`, `vault`.
Matou uma classe inteira de erros. É o padrão a estender, não a reinventar.

### Honestidade que já existe e deve ser preservada

- `permissoes_efectivas`: *"--allowedTools apenas permite/preaprova; sem --tools e
  --disallowedTools não prova tudo o que o agente pode usar"* — o conector **sabe** que não
  pode garantir e diz.
- `keep_rate_pct: null` · *"nenhum job de escrita entregue correu numa worktree criada de
  fresco com base limpa provada"*.
- `poupanca_estimada` com a base à vista e etiqueta `ESTIMATIVA`.
- `cross_check` a admitir *"sem veredicto: a verificação factual local não correu"*.
- A mensagem de recusa do job ② (`faz_assim` com 3 saídas concretas) é das melhores do produto.

---

## 3 · O QUE FOI ANALISADO — ACHADOS POR FAMÍLIA

### FAMÍLIA A — respondem certo sobre a coisa errada (só estes te fazem decidir mal)

#### A1 · Relocação silenciosa 🔴🔴
O job ③ pedia *"os ficheiros por commitar **nesta** worktree"*. Foi executado em
`C:/Users/Paulo Loureiro/frugal-cockpit-polish` — outra branch. A resposta devolvida:

> *"Nenhum encontrado nos 18 ficheiros por commitar **nesta worktree** (16 modificados + 2
> novos: `mooter-visual-language.js`, `mooter-visual-language.test.js`)"*

O texto diz "nesta worktree" e **nunca nomeia qual**. Lê-se como atestado de que o `frugal`
está limpo. Não é. **Duas políticas para a mesma restrição:** o job ② foi recusado em voz alta,
o ③ foi desviado em silêncio. O silencioso é o perigoso.

#### A2 · O board é estruturalmente incapaz de mostrar gasto 🔴🔴
`custo_por_tarefa_entregue_usd: 0`, estado **"dentro de [0, 0.6]"**, gerado 55 s depois de uma
wave que custou **$0,6054** — acima do limite superior da própria faixa.
Causa: é **mediana** sobre 57/72 entregas; a maioria corre no moo a $0, logo a mediana é 0 e
**fica 0 para sempre**. As 15 entregas sem custo são excluídas em silêncio.
**Não existe campo de custo total em lado nenhum do board.**

#### A3 · Versão cortada sem a entrega dentro 🔴🔴

| Facto | Valor | Fonte |
|---|---|---|
| Conector diz | `versao_instalada: "1.22.0"` · *"estás na mais recente que encontrei"* | `view:'tudo'` 11:51 |
| `manifest.json` | `1.22.0` | `grep` |
| Bundle | `_handoff/mooter-v1220.mcpb` · 586.512 B · **27-07 08:46** | `ls` |
| `packages/mooter-bridge/recibo.js` | **NÃO EXISTE** | `ls` |
| Wave `recibo-de-fecho` | **falhou** às 11:05, 613 s, `orphaned-by-restart` | ledger |

O bundle foi cortado às **08:46**, quase 2 h **antes** de a wave sequer arrancar.

### FAMÍLIA B — relato partido (confundem, não enganam)

| # | Achado | Prova |
|---|---|---|
| B1 | **Job só-leitura a $0 tranca o repositório inteiro.** O ① leu 1 ficheiro (14 KB) e marcou `frugal` ocupada; o ② foi recusado porque as outras 34 worktrees não têm `board.js`. | `erro: "sem_worktree_viavel"`, `ocupadas: [frugal → job-ms364bff-33b4]` |
| B2 | **Mesmo job, dois tiers — e um é o proibido.** `mooter_work` diz `tier_pedido: T0`; `mooter_check` diz `T5` (Fable, *NEVER auto-routed*) em 2 chamadas consecutivas. Execução correu local a $0 ✅ — é o **relato** que mente. | ambas as respostas |
| B3 | **Tools inexistentes recomendadas 3×.** `note: "usa mooter_await… e mooter_collect"` e `"recolhe com mooter_collect"`. O servidor expõe 6 tools; nenhuma se chama assim. | `mooter_work`, `mooter_check` |
| B4 | **`view:'sessoes'` morta e culpa o utilizador.** `Error: host-extra unavailable — run this server from inside the mooter repo (packages/vscode-extension present)`. **Medido: `packages/vscode-extension` EXISTE** e o conector está bound a essa pasta. | `ls` + `roots/list` |
| B5 | **`view:'tudo'` sem guarda de tamanho.** Com `windowMinutes:10080` devolve **284.710 caracteres**, acima do limite do host: não trunca, não resume, não avisa — **o painel não aparece de todo**. | erro do host |
| B6 | **Contagens não batem entre `check` e `board`.** | tabela abaixo |
| B7 | **Sem ETA em lado nenhum.** `steps_done: 5` de quantos? O ① esteve 120 s com `steps_done: 0`. | 2× `mooter_check` |
| B8 | `model_recommended: "opus"` vs `model_used: "claude-sonnet-5"` **sem `porque`**. O tecto de quota funcionou ✅, mas quem lê não sabe disso. | `mooter_check` |
| B9 | **Bash usado fora da lista pedida.** `permissoes_pedidas: [Read, Glob, Grep]` · `tools_used: [Read, Bash, Grep]`. | `mooter_check` |
| B10 | **`verificacao_cruzada` prometida no dispatch, morta no fim.** *"o job pago nasce automaticamente"* → `cross_check: "sem veredicto: a verificação factual local não correu"`, `verificado: 0`. | eventos do job |
| B11 | `verificacao_cruzada.custo_usd: 0` **antes de o job existir** (devia ser n/d). | dispatch do ③ |
| B12 | `tokens_in: 2, tokens_out: 18` no cc **depois de 5 passos** com Read/Bash/Grep — impossível. | check #2 |
| B13 | **Regex cru truncado à vista do utilizador:** `"é trabalho onde um erro custa caro (b(audita\|auditoria\|seguran…)"`. | `board.motivos_nao_local` |
| B14 | `resumo: "frota parada · frugal / frugal"` — projecto e pasta repetidos como se fossem dois. | `view:'tudo'` |

#### B6 em detalhe — números que não batem

| Grandeza | `mooter_check` | `board` antes → depois | Bate? |
|---|---|---|---|
| Jobs concluídos | **3** | 94 → **96** (+2) | ❌ falta 1 |
| Jobs no `aprender` | 3 | 94 → **97** (+3) | ✅ |
| Entregas | 3 | 70 → **72** (+2) | ❌ falta 1 |
| Jobs no moo | **2** | 34 → **35** (+1) | ❌ falta 1 |
| Custo da wave | **$0,605405** | **campo inexistente** | ❌ |

---

## 4 · O QUE PRECISA DE SER FEITO — SEQUÊNCIA

**A ordem não é arbitrária.** É derivada de três regras:
1. Primeiro o que **impede uma decisão errada** (Família A).
2. Depois o que **impede a repetição** (gates de processo) — barato e composto.
3. Só no fim o que **melhora a experiência** (Família B) e, por último, **construir o recibo**,
   porque o recibo consome tudo o que estiver acima dele.

### 🔥 ONDA 1 — parar a mentira (bloqueia tudo o resto)

| Ordem | Item | Porque é aqui | Esforço |
|---|---|---|---|
| **1.1** | **`custo_total_usd` + `cobertura` no board**, ao lado da mediana. A mediana fica, mas deixa de ser o único número; e entregas sem custo aparecem no titular, não no `porque`. | ⚠️ **Bloqueador duro do recibo.** O bloco ③ do recibo reaproveita `board.scorecardAsync` por contrato. Construir o recibo antes disto = recibo nasce a mentir. | S |
| **1.2** | **Nomear sempre a worktree na resposta do job.** Toda resposta traz `worktree_usada` no texto, não só no JSON. | A1 deixa de ser silencioso ao custo de uma linha. | XS |
| **1.3** | **Recusar em vez de relocar quando o goal é dêictico** ("esta/nesta/aqui/a worktree actual"). Reaproveitar a mensagem `faz_assim` do job ②, que já é boa. | Fecha A1 na raiz. Sem isto, 1.2 só torna o erro legível depois de acontecer. | S |
| **1.4** | **Gate de CI: `manifest.version` não sobe sem os ficheiros da entrega dessa versão.** Mapa versão→ficheiros esperados; falha o pack se faltar. | Fecha A3 e impede que volte a acontecer. Sem isto, a Onda 4 pode repetir exactamente o mesmo. | S |

**Critério de saída da Onda 1:** correr uma wave paga e ver o custo real no board; pedir uma
auditoria "nesta worktree" e ou ela corre na worktree certa, ou é recusada com o nome à vista.

### 🛠 ONDA 2 — parar de bloquear o trabalho

| Ordem | Item | Porque aqui | Esforço |
|---|---|---|---|
| **2.1** | **Tirar o lock exclusivo aos jobs só-leitura.** Lock partilhado para leitura, exclusivo só para escrita. | B1. Multiplicador de throughput em **todas** as waves futuras — quanto mais cedo, mais rende. | M |
| **2.2** | **Guarda de tamanho no `view:'tudo'`.** Tecto de caracteres; acima disso, degradar para resumo + apontar `view:'jobs'`/`view:'board'`, com aviso explícito do que foi cortado. | B5. Hoje o painel **desaparece** — falha total, não degradação. | S |
| **2.3** | **Corrigir `tier_pedido` no `mooter_check`** (T0 relatado como T5). | B2. É o campo onde uma leitura errada sugere auto-routing para o tier proibido. | XS |
| **2.4** | **Reconciliar as contagens `check` ↔ `board`** (3 jobs → +2 entregas / +1 moo). | B6. Enquanto não bater, nenhum número do board é citável. | M |

### 🧹 ONDA 3 — limpar o que confunde

| Ordem | Item | Esforço |
|---|---|---|
| **3.1** | Substituir `mooter_await`/`mooter_collect` pelas tools que existem (`mooter_check`) em todos os `note`. | XS |
| **3.2** | `view:'sessoes'`: ou reparar a detecção do host-extra, ou dar um erro que não culpe o utilizador. | S |
| **3.3** | `passos_totais` + `eta_s` no `mooter_check`. **A única pergunta que o painel não responde.** | M |
| **3.4** | `porque` no downgrade `model_recommended` → `model_used`. | XS |
| **3.5** | Formatar `motivos_nao_local` em linguagem humana (esconder o regex). | XS |
| **3.6** | `resumo`: parar de repetir `frugal / frugal`. | XS |
| **3.7** | `verificacao_cruzada`: ou entregar veredicto, ou não prometer no dispatch. `custo_usd: 0` → `n/d`. | S |
| **3.8** | Investigar `tokens_in: 2` a meio de um job com 5 passos. | S |

### 🎯 ONDA 4 — construir o recibo de fecho (só agora)

Retomar a wave `recibo-de-fecho` **sem alterar o brief**, com três emendas:

- ③ passa a consumir `custo_total_usd` **e** a cobertura (saída da 1.1), não só a mediana.
- ⑤ nomeia sempre a worktree auditada (saída da 1.2).
- O corte da versão passa pelo gate da 1.4.

**Pré-condição de arranque:** 1.1, 1.2, 1.4 e 2.4 fechadas e provadas. ❌ Não arrancar antes.

⚠️ **Nota de execução:** as duas tentativas anteriores morreram por causas de ambiente, não de
desenho — `orphaned-by-restart` aos 613 s e `cancelled-by-user` aos 908 s, com
`EPERM: operation not permitted, open 'C:\tmp\mooter-v1210.mcpb'` no stderr. Antes de relançar,
resolver o `C:\tmp` e não reiniciar o Desktop a meio.

---

## 5 · RESSALVAS DESTA AUDITORIA (para não a citar acima do que vale)

- **Três erros do auditor, corrigidos:** (a) descrevi o enum de `view` com 6 opções — tem **7**,
  omiti `afericao`; (b) afirmei que o bundle 1.22.0 "não existe em lado nenhum" — existe, mtime
  **08:46**, anterior à minha verificação das 11:07 (ou o mount serviu conteúdo stale — gotcha
  conhecido — ou o ficheiro foi copiado preservando mtime; **não consigo distinguir**);
  (c) desperdicei 45 s num `find` recursivo sobre 37 worktrees que rebentou o timeout.
- **Amostra pequena:** 3 jobs, 1 wave, 107 s. Chega para provar a existência dos bugs, **não**
  para medir frequência.
- **Fase 3 não corrida:** 0 de 7 blocos do recibo verificados. Tudo o que digo sobre o recibo é
  inferência a partir do brief, não medição.
- **Arranque a frio nunca medido:** os dois tempos de abertura têm o `roots/list` já quente.
- **`n/d` honestos que ficam por fechar:** `keep_rate_pct` (nenhum job de escrita em worktree
  limpa), capacidades MCP `resources`/`prompts`/`elicitation`/`sampling`/`logging` (o cliente
  não as declara — ausência não prova falta de suporte).

---

## 6 · SCORECARD NO FIM DA AUDITORIA (11:55:57)

400 eventos no ledger · 97 jobs no `aprender` · **1 excepção**:

| Métrica | Valor | Faixa | Estado |
|---|---|---|---|
| `trabalho_zero_pct` | **36,46%** | [45, 100] | ❌ **fora há 8,65 h** (desde 03:17:04) |
| `entregas_por_dia` | 18 | [4, 100] | ✅ |
| `lead_time_primeiro_token_s` | 17,654 | [0, 45] | ✅ |
| `taxa_falha_pct` | 15,29 | [0, 20] | ✅ |
| `taxa_interrupcao_pct` | 9,57 | [0, 25] | ✅ |
| `tempo_recuperacao_min` | 0,785 | [0, 20] | ✅ |
| `pressao_quota` | 0,710 | [0, 0.85] | ✅ (nível **alto**, tecto em sonnet) |
| `wip_actual` | 0 | [0, 3] | ✅ |
| `keep_rate_pct` | n/d | — | ✅ n/d com porquê |
| `custo_por_tarefa_entregue_usd` | 0 | [0, 0.6] | ⚠️ **"dentro" mas cego — ver A2** |

Dono da excepção: **MOO**. Consequência declarada se ninguém agir: *"mais trabalho continua a
sair da GPU local para subscrições"*. `pode_ir_dormir: false`.

---

## 7 · NOTAS 0-10 (com a razão, não com adjectivos)

| Fase | v1.19.0 | v1.22.0 | Razão da nota actual |
|---|---|---|---|
| **Abertura** | 4/10 | **7/10** | 10 dos 14 buracos fechados; `fresco/idade_h` implementado; `board` a 2,32 s. Perde por `tudo` a 6,40 s e por rebentar sem aviso em janela larga. |
| **Progresso** | n/d | **5/10** | Quem trabalha é exemplar (agente, modelo, worktree, ferramentas, actividade em português). Quanto falta **não existe**: sem ETA, sem total de passos. |
| **Fecho** | n/d | **0/10** | Não existe. E se for construído sobre o board actual, nasce a mentir. |

---

*Auditoria pura — nenhuma correcção foi aplicada nesta sessão. Este ficheiro é o único
artefacto produzido.*
