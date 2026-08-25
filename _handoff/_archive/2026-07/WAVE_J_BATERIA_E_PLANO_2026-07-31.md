# WAVE J · BATERIA MEDIDA, LOOP HOLES E PLANO DE WAVES

**Gerado:** 2026-07-31 · Cowork (Opus 5) · conector v1.29.1 · repo `~/frugal` @ `838dbe1`
**Companheiro de:** `_handoff/WAVE_J_DIAGNOSTICO_2026-07-31.md`
**Método:** tudo abaixo foi medido hoje com jobs reais. Zero estimativa apresentada como facto.

---

## 1. A bateria — pergunta de resposta conhecida, 3 braços

**Pergunta:** *"`firstFree` em `worktrees.js` verifica frescura da branch? SIM/NÃO + condições + linhas."*
**Resposta correcta (apurada independentemente por auditoria de código):** NÃO — só valida
`exists / !busy / !bare / !detached / !suspeita(%TEMP%) / avoid / requiredPaths / preferir secundária`.

| Braço | Motor | Contexto | Tempo | Tokens | Custo medido | Resposta |
|---|---|---|---|---|---|---|
| **A** | kimi-k3 | ❌ `prepare:false` | 24 s | 376 out | **n/d** | ❌ *"NÃO CONSIGO VERIFICAR — sem acesso ao ficheiro"* |
| **B** | moo→kimi-k3 | ✅ (prep morreu, ficheiro lido) | 137 s (20 s prep + 117 s) | 3 492 in / 3 641 out | **n/d** (≈ $0,065 calculável) | ✅ **CERTA — e a mais profunda**: apanhou que a única chamada git do módulo é `worktree list --porcelain` (L59) |
| **C** | qwen3.6:27b (local) | ✅ | 182 s | 5 551 out | **$0** ✅ | ✅ **CERTA**, com as 7 condições e linhas exactas |

### Leituras

- **Custo por resposta certa: `moo = $0` · `kimi ≈ $0,065`.** O moo ganha em custo; o kimi ganha
  **35% em tempo** (117 s vs 182 s) e ganha em profundidade analítica.
- **O Kimi está vivo e é honesto.** Sem contexto, recusou em vez de fabricar — comportamento melhor
  que o do moo em 07-25 (*"NAO CONSEGUI LER"* seguido de invenção).
- **O braço A não é culpa do Kimi.** É culpa do roteador (ver loop hole #1).

---

## 2. Os 6 loop holes medidos nesta sessão

### LH-1 · Não existe contrato de capacidades entre a tarefa e o motor 🔴
O conector despachou uma tarefa de **leitura de ficheiro** para um motor **sem ferramentas de leitura**
e com `prepare:false` (que desliga a injecção de contexto). No próprio payload do disparo ele declarou:

```
permissoes_efectivas: { valor: [], read_only: true,
  porque: "o Kimi corre via API de chat Moonshot e não recebe ferramentas" }
permissoes_diferenca: { diferem: true }
mapa_injectado: false
```

Tinha toda a informação para recusar ou para forçar `prepare:true`. Disparou na mesma. **24 s e 376
tokens queimados numa tarefa impossível por construção.**
O guard do H1 (`pedeLeituraDeFicheiro`) evita a *chamada* de leitura — não trava o *job*.

### LH-2 · "🐮 feito" com zero trabalho entregue 🔴
Job A fechou com `done:1 · failed:0 · exit_code:0` e `resumo: "🐮 feito"`. O conteúdo era uma recusa.
É uma **variante nova** do achado S2 do `estranho.test.js` — o guarda existente olha para `failed`, e
aqui `failed = 0`. Falta um **guarda de recusa**: reclassificar quando o resultado do agente é
"não consigo / n/d / preciso do ficheiro".

### LH-3 · Relocação silenciosa para worktree de versão anterior 🔴
Job C foi relocado para `frugal-bateria-v1280` — nome que declara **v1.28.0**, com o produto em 1.29.1 —
e leu `worktrees.js` **de lá**. O aviso completo foi:

```
· relocado para frugal-bateria-v1280 (pedida: frugal)
```

Sem ⚠️, sem branch, sem idade do commit, sem hash do ficheiro lido. **Reprodução ao vivo do bug de
30/07**, que até aqui não tinha prova independente. Agravante: os braços B e C leram de árvores
diferentes — **a régua de aferição foi contaminada pelo relocate**. Acertaram os dois, por sorte.

### LH-4 · `prep_timeout` queima 20 s e entrega zero 🟡
```
event: prep_timeout · prep_duration_s: 20.016 · prep_chars: 43 · tokens_poupados_estimados: 0
```
A GPU produziu **43 caracteres em 20 segundos** e o job seguiu para a nuvem. O job local nem sequer
contou tokens (`moo_a_zero.tokens_saida: null`). **O A/B do handoff, que estava pendente desde 07-28,
respondeu-se sozinho neste caso: o prep custou 20 s e entregou nada.** Uma amostra não é uma prova —
mas é a primeira medição real que existe.

### LH-5 · O custo do Kimi é `n/d` apesar de ser calculável 🟡
`tokens_in: 3492 · tokens_out: 3641`, preço público conhecido ($3 / $15 por milhão) → **≈ $0,065**.
O ledger grava `cost_usd: null`. **2 de 2 jobs kimi sem custo medido.** Isto arrasta a
`cobertura_custo_pct` do scorecard para baixo e torna o "custo por resposta certa" — a régua que
escolhemos — impossível de fechar para agentes de API.

### LH-6 · A verificação cruzada está morta por gestão de VRAM 🔴 (o mais estratégico)
```
event: cross_check · "sem veredicto: a verificação factual local não correu"
porque: "nenhum modelo novo cabe mantendo a folga mínima de 2.2 GB:
         qwen3.6:35b-a3b precisa de 22.3 GB, mas só há 1653 MB livres"
```
O verificador tenta carregar um **segundo modelo grande** enquanto o primeiro ocupa a VRAM da 4090.
Nunca cabe. Nos 3 jobs de hoje a `verificacao_cruzada` esteve `pendente`, `aguarda_job_pago` e
`null` — **nunca correu uma única vez**.

**Porque é o mais estratégico:** "verify" é exactamente o que o concorrente directo (Maestro) vende
como pilar. O nosso está construído e estruturalmente impedido.

---

## 3. A paisagem competitiva mudou — Julho 2026

| Concorrente | O que faz | Ameaça a que tese nossa |
|---|---|---|
| **Sakana Fugu** (lançado 22/06/2026) | **Learned router**, não if-else. Constrói scaffold agêntico, atribui papéis **Thinker/Worker/Verifier**, verifica e sintetiza. Tiers Fugu / Fugu-Ultra. Base: papers ICLR 2026 (Trinity, Conductor) | ⚠️ **Ataque frontal ao "determinístico"** — com paper. Mas é fechado e gasta um modelo a decidir |
| **Maestro** (MIT, self-host) | cheap-first → **verify** → escalate → **cost breakdown em cada resposta**. Endpoint compatível OpenAI **e** Anthropic. **Zero setup, sem GPU** | ⚠️ **É a nossa frase de vendas, já enviada.** Admite ser v0.1 não endurecido |
| **Fugusashi** (open) | Federated learning de routing com **decisões interpretáveis** | Ataca "auditável" |
| **vLLM Semantic Router** | Routes por cost, latency, **privacy, safety, modality** | Mais dimensões que nós |
| **Antigravity 2.0** | Multi-agente + browser + **scheduled background tasks** + SDK público | 🔴 **A nossa Fase 5 já é feature de produto alheio** |
| **Claude Code Agent Teams** | Multi-agente oficial (experimental, off by default) | A casca comoditiza-se, como previsto em 07-14 |
| **Cursor 3 / Windsurf Wave 13** | Parallel agents IDE-native + **worktrees** | 🔴 Worktrees paralelas = commodity |
| **Codex desktop / Nimbalyst / Ruflo (31,1k ⭐)** | Command center, kanban, file traceability, mobile | Cockpit sozinho não é fosso |

### O que sobra de fosso — e o estado real de cada peça

| Fosso candidato | Único? | Estado medido hoje |
|---|---|---|
| **GPU do próprio utilizador como T0 real ($0, não "cheap")** | ✅ sim — Maestro é explicitamente "no GPU"; Fugu é pool de frontier | 🟡 **33% dos jobs correram local** (faixa 50-100%) |
| **Aprender para sempre com telemetria local** | ✅ sim | 🔴 **`aprender.js` não escreve nada** — não aprende |
| **Recibo honesto que admite o que não sabe** | ✅ diferenciado | 🟡 admite bem (`n/d` com `porque`) mas **carimbou "feito" numa recusa** |
| **Resume / handoff — nunca acordar perdido** | ✅ ninguém vende isto | 🟡 existe, não é órgão automático |
| **Verify local a $0** | seria único (Maestro verifica **pagando**) | 🔴 **nunca correu — VRAM** |
| Worktrees paralelas | ❌ commodity | funciona |
| Scheduled loops | ❌ Antigravity já tem | 1 activa, governador desligado |

**Conclusão dura:** 3 dos 5 fossos candidatos estão **construídos mas mortos**. O fosso não é a ideia —
é a ideia a funcionar e a provar-se. Hoje o produto tem as peças certas desligadas.

---

## 4. Bateria de perguntas que nem o diagnóstico nem o master prompt respondem

**Sobre a régua**
1. Se `aprender.js` nunca escreveu, com base em que dados foi calibrada a referência de quota (4000) que
   hoje declara `pressao: 1` e força tudo para `haiku`? A calibragem crítica está a estrangular o produto
   com base num número sem origem medida?
2. "Custo por resposta certa" exige custo. Com Kimi a `n/d` e moo a `$0`, a régua só funciona para `cc`.
   Vamos **calcular** o custo por tokens×tabela ou aceitamos uma régua cega para metade da frota?
3. Qual é o **keep rate** hoje? O scorecard diz `n/d — não há jobs de escrita entregues para medir`.
   Fizemos alguma escrita medida desde que a métrica existe?

**Sobre o motor**
4. Se o `cross_check` nunca coube em VRAM, porque é que o selector escolhe um modelo de 22,3 GB para
   verificar em vez de um pequeno? Verificar é uma tarefa fácil — porquê o modelo grande?
5. `prepare:true` faz duas coisas diferentes (ler ficheiros + pré-digerir no moo). O `prepare:false`
   desliga as duas. Deviam ser flags separadas?
6. O `classify.js` está FROZEN e é o fosso declarado. Mas nos 3 jobs de hoje o routing foi
   `cli-default` e `work+classify` com `tier_pedido` a divergir do `tier_motor`. **O classify está mesmo
   no caminho, ou está a ser contornado?**

**Sobre a estratégia**
7. O Maestro oferece endpoint compatível OpenAI+Anthropic — integra com qualquer coisa sem instalar nada.
   Nós exigimos instalar um conector, um CLI e ter GPU. **A nossa barreira de entrada é o nosso maior
   fosso ou o nosso maior travão?**
8. O Fugu prova que routing *aprendido* bate routing *escrito à mão* em benchmark. Qual é a nossa
   resposta honesta: (a) determinístico é pior mas auditável e $0, (b) aprendemos por cima do
   determinístico, ou (c) não temos resposta e o site não devia insinuar que temos?
9. Se worktrees paralelas e scheduled tasks são commodity, **o que é que o Mooter faz no dia 1 que
   nenhum concorrente faz?** A resposta tem de caber numa frase e ser verdadeira hoje, não em v2.

**Sobre o processo**
10. Três waves seguidas (A4, G.3, e agora J0-A) produziram testes verdes sobre trabalho que não
    aconteceu. O que muda no gate para o quarto caso não existir?

---

## 5. Plano de waves proposto

Princípio: **cada wave fecha com uma métrica que passa a ser medida para sempre** — não com um relatório.
Ordenado por "destrava a régua" → "mata o loop hole" → "abre o fosso".

| Wave | Nome | Entrega | Métrica que passa a existir | Gate | Est. |
|---|---|---|---|---|---|
| **J-1** | **A régua** | `aprender.js` e `afericao.js` passam a escrever · sentinela invocada pelo produto · custo do kimi calculado por tokens×tabela (LH-5) | baseline persistida + `cobertura_custo_pct` sobe para 100% | nenhum | ½ dia |
| **J-2** | **O contrato** | Contrato capacidades↔tarefa (LH-1) · guarda de recusa (LH-2) · `prepare` separado em `ler` e `digerir` (Q5) | `taxa_trabalho_nulo_pct` — jobs que fecham sem entrega real | nenhum | ½ dia |
| **J-3** | **Frescura** | `firstFree` passa a medir idade/distância ao main · resumo com ⚠️+branch+idade+hash · **teste de regressão** do caso de hoje (LH-3) | `idade_da_worktree_usada_h` no recibo | nenhum | ½ dia |
| **J-4** | **Verify vivo** | Verificador passa a usar modelo pequeno com a VRAM que sobra (LH-6) · falha explícita se não couber | `taxa_verificacao_pct` — hoje 0% | nenhum | 1 dia |
| **J-5** | **A sessão-espelho** | Fase 0 do master prompt com a tarefa `install-id → ledger`, agora com régua que retém e sistema que não mente | A vs B em 5 dimensões + A/B do `prepare` com n>1 | 🚦 **NO-GO se A perde em ≥3/5** | 1 dia |
| **J-6** | **Honestidade pública** | DoRA fora do site · 4 versões alinhadas · proveniência dos 47% · tag órfã morta · `ci-validate-manifest` ligado ao CI · `cli-test` em Windows | CI que falha quando o site e o produto divergem | 🚦 Paulo publica | ½ dia |
| **J-7** | **Dieta + proveniência** | Suprimir blocos vazios do recibo (−67%) · `install_id` a carimbar ledger/journal/recibo · schema de nota | KB por chamada; % de registos com proveniência | nenhum | 1 dia |
| **J-8** | **Multi-projeto** | Perfis por root · comitar `estranho.test.js` e pô-lo em CI · bateria verde num repo que não é o frugal | nº de projetos com bateria verde | nenhum | 1-2 d |
| **J-9** | **A corporação** | Reactivar `cowork-loop-evaluator` · sentinela+aferição agendadas · auto-fix staged em PR · release train | 48 h sem intervenção, com digest diário | 🚦 Paulo aprova PRs em lote | 2-3 d |
| **J-10** | **A frase** | Decidir e provar a resposta às perguntas 7/8/9 · embalagem (conector vs plugin) | — | 🚦 **Decisão do Paulo** | 2 d |

**Caminho crítico:** J-1 → J-2 → J-5. Sem J-1 a espelho não conclui nada; sem J-2 a espelho mede um
sistema que carimba recusas como entregas.

**J-3, J-4, J-6 são paralelizáveis** e são exactamente o tipo de trabalho para despachar ao codex/kimi
enquanto o Cowork conduz.

---

## 6. Como trabalhamos daqui para a frente (o Mooter no talo)

Regra adoptada a partir de agora, com base no medido hoje:

| Tipo de trabalho | Motor | Porquê (medido) |
|---|---|---|
| Leitura, resumo, auditoria de 1 ficheiro | **moo** local | $0, resposta certa, 182 s |
| Análise profunda de código com resposta rápida | **kimi** | 35% mais rápido, mais profundo, ≈$0,065 |
| Implementação com escrita | **codex** | histórico de 1,14 M tokens sem regressão |
| Arbitragem, gates, confronto | **cc / Cowork** | quota crítica — usar com parcimónia |
| Verificação adversarial cega | **agente diferente do que produziu** | 3 falsos-verdes já pagos |

**Toda entrega passa a exigir:** artefacto + métrica medida + auditoria por motor diferente do produtor.
Nenhum "tudo verde" sem artefacto — regra reconfirmada por LH-2 hoje.
