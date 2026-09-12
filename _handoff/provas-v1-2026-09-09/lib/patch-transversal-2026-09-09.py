# patch-transversal-2026-09-09.py — correccoes transversais depois da auditoria de numeros (workflow wf_0af2b7bf-deb).
# Ficheiro separado porque um heredoc na shell desta maquina come barras invertidas. Sem barras aqui.
import json, io, os, re, shutil, datetime
PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OWNER = 'C:/Users/Paulo Loureiro/frugal'
def rd(p): return io.open(p, encoding='utf-8').read()
def wr(p, s): io.open(p, 'w', encoding='utf-8').write(s)
def rep(p, pairs):
    s = rd(p)
    for a, b in pairs:
        assert a in s, (p, a[:70]); s = s.replace(a, b)
    wr(p, s); print('patched', os.path.relpath(p, PKG))

# 09 · D3 (corte e resto), D5 (v1 nao guardada), D1 (nota sobre o redireccionamento)
p = os.path.join(PKG, '09-DEFEITOS-APANHADOS.md')
rep(p, [
 ("No `decisions.log` vivo: **377 misses vs 36 hits** (292 `Invalid`, 67 `timeout_1000ms`); os hits são todos do `qwen2.5:3b`.",
  "No `decisions.log` vivo (lido a ~13:15Z de 2026-09-09; não está em `results/`): **377 misses vs 36 hits** — 292 `Invalid`, 67 `timeout_1000ms` e **18 sem `motivo`** (status 1, stderr vazio); dos 36 hits, 33 são do `qwen2.5:3b` e 3 não têm campo `model`. Às 13:55Z eram 409 misses (99 timeouts)."),
 ("`results/cloud-haiku.json` v1 do P2 (guardado no git)",
  "o registo da corrida v1 (3 de 4 chamadas com exit 1) **não ficou guardado**: o `results/cloud-haiku.json` em `f2739bcb` é uma corrida de 1 linha (L1-a, exit 0); a evidência é o transcript da sessão — auditoria de 2026-09-09"),
 ("→ `risk_level: high · tier: T0 · max_tier: T0 · escalation: budget_cap`",
  "→ `risk_level: high · tier: T0 · max_tier: T0 · escalation: budget_cap` (nota: o `MOOTER_DECISIONS_LOG=/tmp/x` desta reprodução **não** é honrado pela runtime — D6 —, a linha vai para o log vivo; o resultado da classificação é o mesmo)"),
])

# ERRATA · P1 e P3
p = os.path.join(PKG, 'ERRATA-timestamps.md')
rep(p, [
 ("| P3 | `5efd58ed` | 13:47:54 | `results/A-sonnet.json` 13:58:54 | ✓ 11 min antes |",
  "| P3 | `5efd58ed` | 13:47:54 | 13:49:33 (`decision_at_spawn.ts` escrito pelo hook na sessão n01, dentro de `results/A-sonnet.json`; o `at` do ficheiro é o da última gravação, 14:16:13) | ✓ 1,6 min antes |"),
 ("| P1 | — (primeiro commit `f2739bcb` tem protocolo e resultados juntos) | — | — | atestada só pela ordem do transcript e mtimes; declarado no veredicto |",
  "| P1 | — (primeiro commit `f2739bcb`, 13:14:20, tem protocolo e resultados juntos) | — | `results/A-key.json` 12:57:48 | **não atestada pelo git**; o `congelado_em` do protocolo (13:05:00Z) era escrito à mão e é *posterior* a todos os braços (12:57–13:04) — substituído por `n/d` com a nota; o mtime do protocolo (12:55:43) é a única marca anterior e não é prova |"),
])

# 00-preflight · timestamps escritos a mao marcados
p = os.path.join(PKG, '00-preflight.json'); j = json.load(io.open(p, encoding='utf-8'))
b = j.get('budget', {})
if 'clock_started_at' in b:
    b['clock_started_at_note'] = 'valor escrito a mao (sem segundos); a hora real do primeiro ficheiro do pacote e o generated_at deste ficheiro — auditoria 2026-09-09'
for k, c in j.get('competitors', {}).items():
    if 'started_at' in c: c['started_at_note'] = 'started_at e o generated_at do preflight copiado para as tres entradas, nao a hora de cada instalacao'
j['paid_cloud_api_note'] = 'o unico gasto de API paga e a sonda Kimi do paragrafo 1.2 (~US$ 0,0004, 137 tokens), declarada em paid_cloud_api_usd_so_far; nenhuma outra chamada paga'
json.dump(j, io.open(p, 'w', encoding='utf-8'), indent=1, ensure_ascii=False); print('patched 00-preflight.json')

# P7 · copias dos ficheiros congelados do R-24 e do diagnostico que precedeu o --correr
p7 = os.path.join(PKG, 'P7-usar-vs-nao-usar')
for f in ['r24-prereg.json', 'r24-manifest.json']:
    shutil.copyfile(os.path.join(OWNER, 'tools', 'ab', f), os.path.join(p7, f)); print('copied', f)
log = rd(os.path.join(OWNER, '_handoff', 'r24', 'correr-2026-09-09.log'))
i = log.find('=== launch'); k = log.find('=== --correr')
assert i >= 0 and k > i
wr(os.path.join(p7, 'diagnostico-no-lancamento-2026-09-09.txt'), log[i:k])
old = os.path.join(p7, 'ultimo-diagnostico.txt')
if os.path.exists(old): os.rename(old, os.path.join(p7, 'diagnostico-anterior-14-20Z.txt'))
wr(os.path.join(p7, 'ONDE-ESTAO-AS-FERRAMENTAS.md'), "# P7 · onde estão as ferramentas do R-24\n\n`tools/ab/correr-r24.mjs`, `r24-diagnostico.mjs`, `mooter-use-ab.mjs` e os testes **não estão neste branch**: vivem no checkout do dono (`~/frugal`, branch `feat/r24-controlador` @ `0575c5cc`, PR #486 por fundir). Este pacote guarda cópias dos dois ficheiros congelados (`r24-prereg.json`, `r24-manifest.json`, shas no `protocol.json`), o diagnóstico que precedeu o `--correr` (`diagnostico-no-lancamento-2026-09-09.txt`, sonda 2347 ms) e, no fim, o ledger e o log da corrida em `results/`. O `diagnostico-anterior-14-20Z.txt` é a corrida de verificação de 14:20Z (sonda 2127 ms), anterior ao lançamento.\n")
print('P7 folder updated')

# P8 · «never» -> 0/40 e configuracao; fronteira no does-not-prove
p = os.path.join(PKG, 'P8-cabeca-a-cabeca', 'slide.md')
rep(p, [
 ("**Wins by construction:** deciding never leaves the Node processes and costs 0 inference tokens; a $0 local tier is reachable by rule where LiteLLM's cost routing never picked a zero-priced one.",
  "**Wins by construction (as measured here, no key, D1):** deciding recorded no external destination in the tapped Node processes and costs 0 inference tokens; a $0 local tier is reachable by rule, where LiteLLM's cost routing selected the zero-priced deployment 0/40 times."),
 ("*Does not prove: anything outside this machine and this configuration; savings (forbidden); that any competitor \"lacks\" a feature — only that it was or was not measured here.*",
  "*Does not prove: anything outside this machine and this configuration; device-level egress (the tap sees Node processes only; with an API key the arbiter constructs a request carrying the whole prompt — 20/20 instrumented); savings (forbidden); that any competitor \"lacks\" a feature — only that it was or was not measured here.*"),
])

# 08 · cartoes P1/P3/P6, API paga, tabela do deck
p = os.path.join(PKG, '08-PACOTE.md')
rep(p, [
 ("0 inference tokens, 0 external hosts to classify (1,176 classifications, 270 tapped processes).",
  "0 inference tokens, 0 external hosts to classify (in-process http/https/fetch wrappers on 1,176 classifications; the socket tap of that run recorded only 270 tap-loaded events and no connection records — it logged only on socket close and does not establish absence of connections)."),
 ("**We print the loss.**", "**We print the loss.**") if False else ("Kappa between label engines 0.50.", "Kappa between label engines 0.50. The rule predicts T0 on 31 of the 40; 13 of those are T2/T3 for both label engines. The 40 are dated 2026-08-01 → 2026-09-04 (34 August, 6 September)."),
 ("All 35 recorded Ollama calls carry the router hook's own pre-answer signature (256-token cap), in B all before the rewrite timestamp.",
  "All 35 recorded Ollama calls are classified as the router hook's own pre-answer (30 qwen3:30b calls at its 256-token cap, 3 qwen2.5:3b, 2 gemma4 errors without counts), in B all before the rewrite timestamp."),
 ("Live ledger 2,157 events, 0 with a cost and its origin",
  "Live ledger: pre-registered cut 1,451 events (decisions.log classified + executed, ledger `done`), exploratory all-events cut 2,157 — 0 with a cost and its origin in both"),
 ("| P6 | Cada turno tem custo com origem? | **Ledger vivo: 0/2 157 eventos com custo e origem;",
  "| P6 | Cada turno tem custo com origem? | **Ledger vivo: 0/1 451 eventos com custo e origem no corte do protocolo (0/2 157 no corte exploratório);"),
 ("| P1 | Decidir custa zero? E acerta? | **0 tokens de inferência, 0 hosts externos para classificar;",
  "| P1 | Decidir custa zero? E acerta? | **0 tokens de inferência, 0 hosts externos para classificar (wrappers em processo; o tap de sockets dessa corrida não prova ausência de ligações);"),
 ("0 US$ de API paga, subscrição e Ollama,",
  "API paga ≈ US$ 0,0004 (só a sonda Kimi de 137 tokens pedida no §1.2 do MP; declarada em `00-preflight.json`), subscrição e Ollama,"),
 ("| P5: **nenhum destino externo registado** num *tap* de 75 processos Node, 20 prompts, **sem chave e com D1**; com chave o árbitro constrói pedidos com o prompt inteiro (20/20). Bytes do hook: n/d | Passar de [declared] a **[measured]** com a fronteira escrita: «no external destination recorded by a socket tap on Node processes; with an API key the arbiter sends the prompt». Retirar «0 bytes» (não medido) e «never leaves the machine» |",
  "| P5: **nenhum destino externo registado** num *tap* de 75 processos Node, 20 prompts, **sem chave e com D1**; com chave falsa o árbitro **constrói** pedidos com o prompt inteiro (20/20, instrumentado; transmissão com chave real não medida). Bytes do hook: n/d | Passar de [declared] a **[measured]** com a fronteira escrita: «no external destination recorded by a socket tap on Node processes (no API key, budget-cap defect forcing T0); with a key present the arbiter constructs a request carrying the whole prompt — instrumented, transmission not measured». Retirar «0 bytes» (não medido) e «never leaves the machine» |"),
 ("| P1: regra 0,002 ms mediana em processo; **hook 207 ms mediana / 1 272 ms p95** por prompt nesta máquina; pré-cálculo local 75/75 expirado (D3) | Substituir pelos dois números com a fonte; retirar «134 ms» |",
  "| P1: o «1,6–1,9 ms» do deck **corrobora-se** (classify em cache p50 1,53 ms, n = 132); o «134 ms quando spawna» corresponde ao classify spawnado (p50 91,9 ms, n = 57; processo filho p50 96,6 ms, n = 378); o **hook completo** custa 207 ms mediana / 1 272 ms p95 por prompt; pré-cálculo local 75/75 expirado (D3) | Manter 1,6–1,9 ms (cache) e substituir «134 ms» por «92–97 ms spawnado; hook completo 207 ms p50 / 1,27 s p95», com a fonte |"),
 ("| SYNC/01-ESTADO «91,4 % (treino)» | precisão do classificador | P1: **35 % [22, 51] em 40 prompts reais** contra rótulo cego; 88,6 % no treino; perde para juiz local e para «sempre T2» | Imprimir a derrota ao lado do 91,4 % de treino |",
  "| vault `01-ESTADO.md:124` e deck l.1235 «91,4 % … a training score» | precisão do classificador | P1: **35 % [22, 51] em 40 prompts reais** contra rótulo cego; 88,6 % no treino; abaixo do juiz local (52,5 %; McNemar p = 0,059, não significativo) e de «sempre T2» (45 %; sem teste emparelhado, observação) | Imprimir a derrota ao lado do 91,4 % de treino, com IC e p |"),
 ("| P3: **0/20 executadas** nos dois braços; 7 spawns locais sem execução; hook chega a 8/8 spawns, aplicação não verificada; decisão por máquina (D10) | Manter «advises»; acrescentar o número medido e o defeito D10 como próximo passo |",
  "| P3: **0/20 executadas** nos dois braços; 7 spawns locais sem execução; hook regista 8/8 tentativas, aplicação não verificada; decisão por máquina (D10) | Manter «advises»; **retirar «enforces once wired»** (palavra proibida e não demonstrada — o hook não força spawn nenhum); acrescentar o número medido e D10 como próximo passo |"),
 ("| P4: motor diferente **não** apanhou mais (26/28 vs 27/28, p = 1,0); 59/59 referências resolvem; autoria não testada | Reescrever como «a second engine did not catch more planted defects; every finding carries a checked file:line» — sem «provenance verified» |",
  "| P4: motor diferente **não** apanhou mais (26/28 vs 27/28, p = 1,0; 4/28 mutantes são erros de sintaxe — excluindo-os 22/24 vs 23/24); 59/59 referências resolvem para uma linha existente, relevância não avaliada; autoria não testada | Reescrever como «a second engine did not catch more planted defects; every finding carries a file:line that resolves to an existing line (relevance not assessed)» — sem «provenance verified» |"),
 ("| P6: ledger vivo **0/2 157** com custo e origem; protótipo 156/156 não integrado; SSOT sem cache (explica −94 %) | «Today: 0 of 2,157 ledger events carry cost + origin; prototype line exists, not shipped» |",
  "| P6: ledger vivo **0/1 451** (corte do protocolo; 0/2 157 no corte exploratório) com custo e origem; protótipo 156/156 não integrado; SSOT sem cache (explica −94 %). O `recibo.js` por turno que o deck cita **não foi medido aqui** | «Today: 0 of 1,451 ledger events carry cost + origin; prototype line exists, not shipped» — sem refutar o `recibo.js` (não medido) |"),
 ("| P2: sem chave a regra diz T0 em 20/20 e o local aceita 7/20; P5-D: LiteLLM nunca escolheu o deployment a preço 0 (0/40) | Ligar a frase ao P2 (7/20 vs 17/20 vs 19/20) e ao contraste com o LiteLLM, sem «$0 saved» |",
  "| P2: sem chave a regra diz T0 em 20/20 (estado sem chave + D1, não um acerto de routing) e o local aceita 7/20; a política 17/20 foi reconstruída com chave, não executada como fluxo; P5-D: o LiteLLM escolheu o deployment a preço 0 em 0/40 | Ligar a frase ao P2 (7/20 vs 17/20 vs 19/20, com as ressalvas) e ao contraste com o LiteLLM (0/40), sem «$0 saved» |"),
 ("| P5: LiteLLM reencaminha o prompt inteiro; ccr n/d; o hook do Mooter não está no caminho do tráfego (medido: 0 destinos externos ao decidir) | Manter, com a célula do P8 ao lado |",
  "| P5: o LiteLLM reencaminha o prompt (presença detectada em 20/20; igualdade de campo não demonstrada); ccr n/d; o hook do Mooter não está no caminho do tráfego (medido: 0 destinos externos registados ao decidir, nesta configuração) | Manter, com a célula do P8 ao lado |"),
])

# 10 · API paga, fronteira do tap no P1, tecto de comprimento
p = os.path.join(PKG, '10-NAO-PROVADO.md')
rep(p, [
 ("- **O Kimi** — não corrido (API paga; R7). O 2.º rotulador do P1 foi local.",
  "- **O Kimi** — não corrido como rotulador (API paga; R7); a única chamada paga do pacote foi a sonda de 137 tokens do §1.2 (≈ US$ 0,0004, `00-preflight.json`). O 2.º rotulador do P1 foi local."),
 ("- Que «o hook custa zero»: custa 207 ms de mediana / 1,27 s p95 e ~870 bytes por prompt, e 75/75 pré-cálculos locais expiraram (D3).",
  "- Que «o hook custa zero»: custa 207 ms de mediana / 1,27 s p95 e ~870 bytes por prompt, e 75/75 pré-cálculos locais expiraram (D3).\n- Que o *tap* de sockets do P1 viu «0 ligações em 270 processos»: o tap v1 só registava no `close` e não apanhou os 25 filhos do Option A nem os 63 POSTs de métricas em loopback; o «0 hosts externos» assenta nos wrappers em processo (1 176 classificações), não no tap.\n- Prompts acima de 500 caracteres (o protocolo dizia «> 4 k tokens», tecto mais largo; o corpus vai até 463 nos 40 e 604 nos 63)."),
])
print('ok')
