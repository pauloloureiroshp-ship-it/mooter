# POLISH_F3 · Fase 0 — Information-Architecture Proposal (Cockpit)

> Proposta escrita. **Nenhum código foi alterado.** Toda a evidência cita `file:line` do
> worktree `frugal-polish-f3`. Os redesigns reutilizam as CSS vars já definidas em
> `extension.js:943-945` (`--g`, `--t0..--t3`, `--surface/--surface2`, `--btext/--bmuted`,
> `--r`, `--gdim/--rdim`) — não inventam tema novo.

## Mapa actual dos separadores (ground truth)

Definição em `extension.js:1473-1474`. Sete tabs:

| data-v | Label | Render (linha) | Fonte de dados |
|---|---|---|---|
| `cockpit` | 🐮 Cockpit | `1882-1929` | `s` (metrics + `s.recent` via `herdCard`) |
| `arch` | 🌳 Arquitectura | `renderArchTree(s.mc)` — `1755-1761`, `arch-tree.js` | `s.mc` (MissionControlSnapshot) |
| `setup` | ⚙️ Setup | `v-setup` (`1480`) | install/models |
| `herd` | 🧵 Sessions | `2042-2048` | `s.recent` via `sessHtml` + `s.herd.matrix` |
| `decisions` | 🔬 Decisions | `2053-2076` (insights + decs) | `s.insights`, `s.decisions` |
| `doctor` | 🩺 Doctor | `2087-2098` | `score.checks`, `s.slash` |
| `mc` | 🎛️ Mission Control | `renderMissionControl(s.mc)` — `2100-2105`, `mission-control-view.js` | `s.mc` (MissionControlSnapshot) |

Facto central que governa três das decisões abaixo: **`arch` e `mc` consomem O MESMO
snapshot `s.mc`** (`arch-tree.js:3-7` e `mission-control-view.js:4-7`). E **`cockpit` e
`herd` renderizam ambos as sessões** a partir de `s.recent`.

---

## D1 · Cockpit vs Sessions — **DIFFERENTIATE** (cortar a duplicação no Cockpit)

### Sobreposição exacta (com código)

Ambos os separadores mostram a lista de sessões vivas, a partir da **mesma fonte** `s.recent`:

- **Cockpit** monta `herdCard` em `extension.js:1858` e injecta-o no corpo em `extension.js:1912`.
  As linhas vêm de `rsess = s.recent` (`extension.js:1812`), mapeadas por `renderRow`
  (`row-renderer.js`, via `rowFor` em `extension.js:1823`). Inclui barra de filtro/procura
  (`hfBar`, `extension.js:1849-1856`), contadores por estado (needN/activeN/idleN,
  `extension.js:1842-1847`) e o botão "🧹 clear" (`extension.js:1843`).
- **Sessions** monta `sessHtml` a partir de `rs = s.recent` (`extension.js:1988-1999`) e
  injecta em `#v-herd` (`extension.js:2042-2044`), com o cabeçalho "🧵 Recent sessions ·
  by activity".

Ou seja, **a mesma `s.recent` é renderizada duas vezes** — uma vez como cards interactivos
ricos (Cockpit, com filtro/atenção/clear/click→openSession) e outra vez como lista plana
"recent by activity" (Sessions). O Sessions acrescenta só dois blocos que o Cockpit não tem:
o card **🤖 Agents — live** (`extension.js:2040`, parallel-run) e a **tabela matriz**
(`extension.js:2046`, ver D2). Tudo o resto é a mesma informação de sessões, com menos
affordances do que no Cockpit.

### O que o vibe coder precisa em cada momento

- **"Agora"** (90% do tempo): _quem precisa de mim, o que está a gerar, abre a sessão_.
  Isto é o Cockpit, e o `herdCard` já o faz melhor (atenção-primeiro, filtro, clear, click).
- **"Auditoria/histórico"**: _onde foi o meu $, quanto poupei, evolução_. Hoje o Sessions
  **não** entrega isto — entrega uma segunda lista de sessões + uma tabela de tokens ilegível.

O Sessions, tal como está, não tem papel distinto: é um Cockpit-sessions pior + uma tabela
que ninguém lê. Não há "live now vs history" — há "live now" em dois sítios.

### Recomendação concreta

**Differentiate**, com renomeação e redistribuição:

1. **Cockpit fica o único lar das sessões vivas.** O `herdCard` (`extension.js:1858`) já é o
   componente superior — mantém-se.
2. **Renomear `🧵 Sessions` → `🤖 Agents`** e reduzir o seu conteúdo a apenas o `agentsCard`
   (`extension.js:2040`, parallel-run / live agents) — o único bloco com papel próprio.
   Remover dele a lista `sessHtml` duplicada (`extension.js:2042-2044`) e a tabela matriz
   (ver D2). Se o parallel-run não estiver activo, o tab mostra o estado honesto que já
   existe em `empty` (`extension.js:2038`).
3. **Mover o histórico/auditoria** ("onde foi o $") para o **Decisions** tab, que já é o lar
   natural da telemetria (`v-insights`, `v-decisions`) — ver D2 para a visualização nova.

**Conjunto final** (de 7 → mantém 7, mas com papéis distintos; ver tabela de decisão no fim):
`🐮 Cockpit` · `🌳 Arquitectura` (ver C2) · `⚙️ Setup` · `🤖 Agents` (era Sessions) ·
`🔬 Decisions` · `🩺 Doctor` · `🎛️ Mission Control`.

Falsificável: se depois disto `s.recent` ainda for renderizado em dois `innerHTML`
distintos, a recomendação não foi aplicada.

---

## C2 · Arquitectura — **REDESIGN para o modo `wt`** (matar `tree`+`ceo`, que duplicam MC)

### Qual o ÚNICO insight que este tab dá e nenhum outro dá?

`renderArchTree` tem 3 modos (`arch-tree.js:5-7`):

- **`tree`** (`arch-tree.js:220-248`): raiz 🐮 Cowork → main → frentes (sessões clicáveis).
  Isto é **a mesma árvore de sessões** que o Cockpit/MC já mostram, mais bonita mas redundante.
- **`ceo`** (`arch-tree.js:249-304`): KPIs (`savedToday`, `pctLocal`, `tokensToday`, `needYou`,
  `commitsPending`, `pushPending` — `arch-tree.js:254-264`) + partição atenção-primeiro
  (`arch-tree.js:266-283`) + portfolio. **Isto é literalmente um subconjunto do Mission
  Control**: a banda densa de MC mostra os mesmos `totals.savedToday/pctLocal/tokensToday/needYou`
  (`mission-control-view.js:160-173`) e o agrupamento atenção-primeiro
  (`mission-control-view.js:320-385`). Ambos lêem o MESMO `s.mc`. CEO ≈ MC com menos detalhe.
- **`wt`** (working-tree, `arch-tree.js:305-391`): **AQUI está o único insight verdadeiro** —
  as **ligações/dependências estruturais**: `📜 contratos → schema §6` (`arch-tree.js:344-345`),
  `🛰 hub → devices` (`arch-tree.js:347-358`), `📝 registo → Notion/Obsidian` com contagens
  `nCount/oCount` (`arch-tree.js:360-372`), e `🔁 Loops` como fluxos (`arch-tree.js:375-386`).
  Nenhum outro tab desenha o sistema como um **grafo de contratos e integrações** — o
  Cockpit/MC mostram sessões, não a topologia entre componentes.

**Conclusão:** `tree` e `ceo` não têm insight único (duplicam MC). `wt` tem. O tab não deve
ser mantido "porque sim" com 3 modos — deve colapsar no único que justifica a sua existência.

### Redesign (uma ideia forte: "o teu sistema como um grafo vivo")

Eliminar o switcher de 3 modos (`arch-tree.js:185-215`, `switcher()`); o tab abre directo na
vista de ligações. Layout (reutilizando `arch-wtgrid`, `arch-conn`, `arch-dash`, e as vars
`--g`/`--t0..--t3`/`--surface2`/`--bmuted` já existentes):

```
🔌 frugal · system map                                    [vivo ●]
┌──────────────────────────┬──────────────────────────────────┐
│  🌿 main → frentes        │  🔗 nós & fluxos                 │
│  ●─ feat/overclock  ✎3 ↑1 │  📜 contratos ══live══▶ schema §6 │
│  ●─ feat/polish-f1  ✎0    │  🛰 hub      ──pending──▶ devices  │
│  ●─ feat/polish-f3  (here)│  📝 registo  ══live══▶ Ⓝ3 · Ⓞ1   │
│     (clicável → openSess) │  🔁 review-loop ●round 2/5 · Opus │
└──────────────────────────┴──────────────────────────────────┘
ⓘ tudo do mesmo snapshot §6 · null → "sync pending" (honesto)
```

- Coluna esquerda = `graph` (`arch-tree.js:340-342`), as frentes como spine git clicável
  (cor por estado via `gitState`, `--t3`/`--g` para dirty/clean).
- Coluna direita = `nodes` + `loopBlock` (`arch-tree.js:373-386`): contratos/hub/registo/loops
  como `arch-conn` com `arch-dash live` (verde `--g`) ou `arch-pending` (honesto) quando
  Frente F ainda não escreveu o cache (`arch-tree.js:356-357,370-371`).
- **Uma só ideia visual**: "o teu trabalho ligado ao resto do sistema" — git de um lado,
  integrações do outro, setas vivas. É o que mais nenhum tab dá.

Se o avaliador discordar e achar que nem `wt` chega para justificar um tab dedicado, a
alternativa é **remover Arquitectura por completo** e mover o bloco `wt` para dentro do
Mission Control (que já tem o git-graph spine em `mission-control-view.js:256-287`, faltando-lhe
só a coluna de contratos/integrações). Recomendação preferida: **redesign para `wt`**; fallback
aceitável: **merge do `wt` para dentro de MC e remover o tab**.

---

## D2 · Tabela "TOKENS × LLM × AGENT · LAST N DECISIONS" — **REMOVE + REPLACE**

### Onde está e o que tenta comunicar

Construção da tabela: `extension.js:2000-2002` (`mxHtml`). Render: `extension.js:2046`, dentro
do tab **Sessions**:

```
'<div class="card"><div class="lbl">Tokens × LLM × agent · last '+(h.v2count||0)+' decisions</div>'+mxHtml
```

`mxHtml` é uma `<table class="mx">` (`extension.js:2001-2002`): linhas = `via` (qual subagente),
colunas = `mx.llms` (cada LLM), células = `fmtk(c.tok)` (tokens) com tooltip "N decisions".
Fonte: `s.herd.matrix` (`extension.js:1986`).

O que **tenta** comunicar: "quantos tokens cada subagente gastou em cada LLM nas últimas N
decisões". É uma matriz N×M de números brutos de tokens. Para um vibe coder isto **não
suporta nenhuma decisão concreta** — ninguém olha para uma grelha agente×modelo de "12.4k /
3.1k / —" e age. Não responde a "onde foi o meu dinheiro?" nem "estou a poupar?". É exactamente
o tipo de "tabela que ninguém lê" que o brief manda eliminar.

### Substituição que SERVE uma decisão

Trocar a matriz por **"Onde foi o teu $ · últimas N decisões"** — um único bloco com três
peças, todas a partir de dados que já existem no snapshot (`s.herd.matrix` para agregar por
LLM, e as métricas `M.saved`/`saved_pct` já usadas no Cockpit hero, `extension.js:1893-1896`):

```
💸 Onde foi o teu $ · últimas N decisões
┌────────────────────────────────────────────┐
│ local 🦙 ████████████░░░░  78%   $0.00      │  ← barra empilhada, --t0 (verde)
│ cloud ✨ ░░░░████░░░░░░░░  22%   $1.34      │  ← --t2/--t3 segmento
├────────────────────────────────────────────┤
│ tendência local  ▁▂▄▅▆▇█  ↑ more local      │  ← reusa localSpark() (extension.js:1509)
└────────────────────────────────────────────┘
```

- **% local vs cloud** (barra empilhada com `--t0` verde para local e `--t2/--t3` para cloud)
  — derivável de `mx` agregando `c.tok`/`c.n` por `isLoc(llm)` (o helper `isLoc` já existe,
  usado em `extension.js:2037`).
- **$ por lado** — somar custo cloud; local = $0 por definição. Responde a "onde foi o $".
- **Tendência local** — reutilizar `localSpark(decScoped)` que JÁ EXISTE
  (`extension.js:1509`, sparkline ▁▂▄▅▆▇█ com "↑ more local / ↓ less local") e hoje só aparece
  no Cockpit (`extension.js:1916`). Move/replica no tab de auditoria.

Isto responde a uma pergunta real ("estou a ficar mais local? quanto gastei na cloud?") com a
estética e as vars já existentes. A matriz crua sai.

Falsificável: se a `<table class="mx">` continuar a ser renderizada, a recomendação não foi
aplicada.

---

## C1 · Candidatos (texto/caixas sem sentido ou falsos) — só lista, NÃO corrigir (Fase 1)

- **`arch-tree.js:218`** — `PORTFOLIO = ['frugal', 'Cloude Home', 'Speaker', 'Marley']`:
  identidade **mock hardcoded**. Renderiza chips `❄` de projectos pessoais do Paulo
  (Cloude Home/Speaker/Marley) que **não são dados reais do Mooter** no tab Arquitectura
  (`arch-tree.js:231-233`). Pior offender: aparenta portfolio real, é placeholder.
- **`extension.js:1902-1906`** — card "🕸 Context savings · Graphify · ~34×" com `~1781
  files · n=8` **hardcoded** no template. Número de benchmark fixo apresentado como métrica;
  o comentário admite "Not published" (`extension.js:1902`). Verificar se é honesto/atual.
- **`extension.js:2044`** — subline longa "● = active in the last 90s · ⚪ = last activity …
  it cannot tell which Claude Code tab is focused …": correcta mas **duplica** a legenda já
  presente no `herdCard` do Cockpit (`extension.js:1858`, "● working · ⬤ your turn · click a
  cow"). Redundância entre tabs.
- **`extension.js:2062`** — "Neural LoRA/DoRA training is a manual GPU job — not running here":
  honesto, mas a label do card é "🧠 Pastor learning · TF-IDF (not neural LoRA)"
  (`extension.js:2056`) — mensagem mista (diz learning + diz que não treina). Rever clareza.
- **`arch-tree.js:137`** — comentário "🟢 trabalha · 🟡 precisa-de-ti · 🔵 feito (mock
  identity)": confirma que os estados do tab podem assentar em identidade mock; auditar se em
  runtime real os dots são derivados de `s.mc` ou ficam no mock.

---

## Decision summary

| Item | Recomendação | Racional (1 linha) |
|---|---|---|
| **D1 · Cockpit vs Sessions** | **Differentiate** | `s.recent` é renderizado 2× (`extension.js:1912` e `:2042`); Cockpit é o lar das sessões, Sessions vira `🤖 Agents` (só `agentsCard`). |
| **C2 · Arquitectura** | **Redesign (modo `wt`)** | `tree`+`ceo` duplicam Mission Control (mesmo `s.mc`); só `wt` (contratos/hub/registo/loops, `arch-tree.js:344-386`) dá insight único — colapsar no grafo. |
| **D2 · Matriz tokens×LLM×agent** | **Remove + Replace** | Grelha de tokens brutos (`extension.js:2046`) não suporta decisão; trocar por "% local vs cloud + $ + tendência" reutilizando `localSpark` (`extension.js:1509`). |
| **C1 (Fase 1, não corrigir agora)** | flag | Pior offender: `PORTFOLIO` mock hardcoded (`arch-tree.js:218`) renderiza projectos falsos como portfolio. |

**Conjunto final de tabs proposto:**
`🐮 Cockpit` · `🌳 Arquitectura` (só `wt`, grafo do sistema) · `⚙️ Setup` ·
`🤖 Agents` (era Sessions; só parallel-run) · `🔬 Decisions` (+ "onde foi o teu $") ·
`🩺 Doctor` · `🎛️ Mission Control`.
