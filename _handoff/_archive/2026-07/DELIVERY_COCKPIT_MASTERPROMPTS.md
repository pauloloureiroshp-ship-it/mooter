# MASTERPROMPTS — 🛩️ Delivery Cockpit (3 frentes paralelas · red-teamed)

O cockpit de pilotagem: forecast probabilístico honesto sobre o Ledger + timeline de waves/PRs + integração
"traz o teu PM tool". **Um red-team encontrou 18 vectores** — as defesas abaixo são obrigatórias, senão o
forecast **mente com barra de erro bonita**. Filosofia: *o Perfect Handoff não mente sobre o passado; o
Delivery Forecast não mente sobre o futuro.*

## ⚠️ Invariantes de honestidade do forecast (o red-team virou lei)
1. **Forecast POR CLASSE, nunca por "wave" genérica** (DC-01). Taxonomia declarada: `class ∈ {handoff,
   feature_impl, adapter_train, md_cleanup, audit} × mode ∈ {CC, Loop}`. Cada classe tem a sua distribuição
   empírica. Wave sem classe declarada → **"sem base comparável", sem P50/P90**. (Média de handoff-10min e
   QLoRA-8h não descreve nada.)
2. **DAG makespan, NUNCA somar P90s** (DC-06). Reusa o contrato Lineage (`task_group`+`deps`). Cada iteração:
   sorteia duração por nó → longest-path → distribui o **makespan**. `P90(A)+P90(B) ≠ P90(A+B)`.
3. **Calibration ledger + reliability score** (DC-16). Guarda cada forecast; quando a wave fecha, regista se
   o real caiu no P50/P90. Mostra "78% dos teus P90 acertaram". Cobertura empírica ≠ nominal → **auto-widen**.
   Sem isto, "learns forever" é fé, não facto.
4. **Número NUNCA-nu + hash de âmbito** (DC-14/15). Todo forecast carrega inseparável: P50 **e** P90 + premissas
   ("regime estável desde X, âmbito congelado") + meia-vida ("válido até nova wave fechar"). Banir linguagem
   de compromisso ("vai entregar") → só "distribuição *se as premissas se mantiverem*". Roadmap MD muda →
   forecast anterior fica **STALE**, a data desaparece.
5. **Cold-start gate** (DC-04). Abaixo de `k=8` eventos por classe: **não desenha cone** — mostra "a calibrar
   6/8". Nunca uma curva bootstrap com n<k. Mostrar intervalo-de-confiança-do-percentil (bandas duplas).
6. **Regime-break + janela deslizante** (DC-02). Só amostra os últimos N da classe; teste de quebra (CUSUM);
   se detecta, descarta pré-quebra. O próprio "learns forever" cria tendência — não amostrar o histórico todo.
7. **Work-time vs wall-time** (DC-07). Dois relógios: work (moos activos) e wall (inclui `awaiting-you`). O
   maior atraso do Mooter é humano. Reporta ambos: "P50 work 3h · P50 wall 2 dias".
8. **Blocker como componente separado** (DC-03). `blocker_cause ∈ {oauth, worktree_lock, mount_windows, none}`;
   modela probabilidade×duração condicionada ao ambiente da wave-alvo. Não herdar a cauda de OAuth para waves sem OAuth.
9. **Injection rate** (DC-17). Mede waves não-planeadas históricas / planeadas; infla o cone ("1.4× do que planeias acontece").
10. **Anti-gaming** (DC-08/09/10). Unidade invariante à granularidade (trabalho-substantivo: testes+, ficheiros
    non-MD, `WORK:+X/-Y` do ledger), não waves/semana. Mostra **remaining hard work** em separado. Acopla ao
    **quality-gate**: throughput↑ com gate-pass↓ → forecast **suspenso** ("a acelerar à custa de qualidade").
11. **Explicabilidade** (DC-18): drill-down — "os 3 maiores drivers de incerteza". Cada número rastreável a event-ids.

## Contrato de dados partilhado (os 3 paralelizam sem colidir)
`forecast.json` schema: `{ wave_id, class, mode, deps[], p50_work, p90_work, p50_wall, p90_wall, samples_n,
calibrating(bool), stale(bool), scope_hash, drivers[], reliability }`. O **Engine (A)** escreve; a **UI (B)**
lê; os **Adapters (C)** enriquecem `deps`/PRs. Ficheiros diferentes → 3 worktrees, paralelo real.

---

## ════ FRENTE A · Forecast Engine (local $0, o cérebro do forecast) ════
```
git worktree add ../frugal-forecast -b feat/delivery-forecast main
```
Constrói `tools/router/forecast/` (Node puro): lê o Ledger (durações por evento — **confirma que há
timestamp início+fim, senão pára e avisa: DC-01 agrava**) + o roadmap MD + o grafo `deps`. Monte Carlo
**por classe** × **DAG makespan** (N iterações, budget de CPU declarado — não recalcular a cada evento).
Emite `forecast.json` (contrato acima) + mantém o **calibration ledger**. Aplica TODAS as invariantes 1-11.
Gate: `node --test` (fixtures: cold-start recusa cone · P90s não somam · regime-break descarta · calibração
auto-widen) · classify.js sha intacta · $0 (zero cloud) · sem push sem OK.

## ════ FRENTE B · Cockpit Tab (a cabine, UI · INTERACTIVA) ════
```
git worktree add ../frugal-cockpit-tab -b feat/delivery-cockpit-ui main
```
Nova aba no plugin (`packages/vscode-extension/src/`): lê `forecast.json`. Base: timeline de waves (estado ·
P50+P90 bar · deps · "estás aqui") + 3 metric cards + banner "distribution not a promise + scope frozen since
X" + **wave calibrando mostra "3/8", não cone** + **work-time vs wall-time** + gargalo humano + PRs + rodapé.

**A feature-estrela é INTERACTIVA (o que impressiona) — segue o mockup aprovado:**
1. **Slider "you answer each gate in X days"** → recalcula o forecast **ao vivo** (Monte Carlo leve no
   cliente para preview instantâneo; o `forecast.json` do Engine é a verdade base). Mostra a linha reveladora
   `"N% do wall-time é espera por ti, não pelos moos"` — dá ao vibe coder **controlo**, não só um número.
2. **Histograma da distribuição** (canvas) com P50 (linha cheia) e P90 (tracejada) marcados — "distribution,
   not a promise" tornada visível. Reage ao slider.
3. Hover numa wave → os 3 maiores **drivers de incerteza** (drill-down do `drivers[]`).
4. Botões que chamam o Cowork (`sendPrompt`-equivalente do cockpit) para "porque é wall>work?".

**Identidade Mooter (UX/UI de especialista):** o 🐮 é a marca (header, saudação); alinha com os modos
existentes 🐢 LazyMoo · 🐮 Moo · 🔥 CrazyMoo; reusa as CSS vars e o sistema visual do cockpit (Tabler icons
para controlos + emoji Mooter pontual para marca). Sentence case, número **nunca-nu**, dark-mode nativo.
Restraint (a régua do Paulo): cada elemento é uma feature — sem poluição.

**Modo "project command" (o centro de comando — segue o 2º mockup):**
5. **Lista TODAS as waves do backlog** (lê `MOOTER_ROADMAP.md`), agrupadas por fase (now/next/frontier),
   cada uma com estado, tipo (CC/Loop/Schedule), effort, deps e forecast.
6. **Play por wave** → lança o masterprompt da wave como **Moo Loop/Schedule Session** (reusa o botão
   `New CC Moo Loop Session`). ⚠️ **Play é acção com custo** (sessão CC=limite ou schedule=GPU): confirma
   antes, e **respeita dependências** — wave bloqueada (ex.: W4 depende de W2) avisa, não lança no vazio.
7. **Barra de progresso HONESTA (o "download bar")** por wave a correr: `% = fases do masterprompt que
   passaram o gate / total` (do Ledger `kind:outcome`), com a fase actual ("phase 3/5"). **Nunca** encher por
   tempo decorativo — seria o oposto do handoff que não mente. Animação = a barra move quando uma fase fecha.
8. **`design a new wave`** → chama o Cowork para desenhar+escrever o masterprompt (o utilizador monta a
   estratégia até concluir o projeto); **`re-prioritise`** → reordena por performance-por-esforço + mostra o caminho crítico.

**Sub-sessões por wave (liga estratégia ↔ operacional — segue o 3º mockup):**
9. **Cada wave expande** (chevron) para as **suas sessões CC**. Associação sessão→wave via `kind:intent` do
   Ledger (o masterprompt que a lançou). Cada sessão mostra: título real da aba VS Code · `branch @sha7`
   (mono) · estado (running/awaiting-you/idle). **Clicar → foca a aba/terminal dessa sessão no VS Code**
   (comando nativo `workbench`/revealTerminal — não um sendPrompt).
10. **Chips operacionais do estado git REAL** (nunca inventados — lê o mesmo que o Perfect Handoff: `unpushed`,
    `uncommitted`, `PR/CI`, `merged`, `clean`, `on-main ⚠`). **`uncommitted` a vermelho** é o alerta-mãe
    (trabalho não salvo = o único que se perde — lição das branches-a-0-commits). **Glossário git** no rodapé
    (unpushed/uncommitted/CI/merged) para o vibe coder aprender. Play de wave **bloqueada por dependência**
    mostra cadeado + avisa, não lança.

Pode arrancar com `forecast.json` mock (paralelo ao Engine A). Gate: `node --check` + `node --test` (inclui
webview-syntax) + antes/depois (gif do slider a recalcular · da barra a encher ao fechar fase · do click-to-tab) + sem push sem OK.

## ════ FRENTE C · PM Adapters (integração, opt-in, seguro) ════
```
git worktree add ../frugal-pm-adapters -b feat/pm-adapters main
```
`tools/router/adapters/`: **core $0 funciona sem nenhum**. Adaptadores MCP **opt-in, zero-por-default**:
GitHub (PRs/CI — `repo:status` read only), Notion (roadmap write-back), Linear/Slack (opcional).
**Segurança (DC-12):** tokens num **broker local scoped** (não no extension storage), escopo mínimo, write-back
com **gate humano na 1ª vez por ferramenta**. **Unidireccional (DC-11):** Ledger→externo, carimbado com
`ledger_event_id`; **nunca ler de volta** para o forecast (senão o Notion vira 2ª verdade). **Debounce+coalescing**
(DC-13): 1 notificação-resumo/5min, kill-switch de loop. Gate: adaptadores desligados por default · sem push sem OK.

---

## Orquestração
As 3 frentes tocam ficheiros diferentes (forecast/ · vscode-extension/ · adapters/) → **paralelo real** em 3
worktrees, com o `forecast.json` como contrato. Ordem de valor: A (engine) desbloqueia; B (UI) com mock em
paralelo; C (adapters) por último (o core não precisa dele). Encaixa no roadmap como **W13 · Delivery Cockpit**
(Fase NEXT, partilha a aba de gestão com o Budget Cockpit W6).
