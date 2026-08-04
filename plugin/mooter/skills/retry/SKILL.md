---
name: mooter-retry
description: Diagnosticar e re-despachar jobs falhados ou presos do Mooter usando o MEO Gauntlet como régua — usar quando o Paulo disser "/mooter-retry", "tenta outra vez", "resolve os jobs presos", "porque é que este job falhou?", "limpa a frota", ou quando o Cockpit mostrar n/d, falhou ou awaiting approval.
---

# Mooter Retry — o gauntlet aplicado a um job que falhou

Um job falhado não é um botão *tentar outra vez*. É um **diagnóstico com receita**.
Repetir o mesmo disparo repete a mesma falha e paga outra vez por ela.

Esta skill corre o motor determinístico em `packages/mooter-bridge/retry.js`: 10 assinaturas
de falha, cada uma reconhecida por uma **regra sobre um campo medido do ledger**, cada uma
citando a pergunta do `MEO_GAUNTLET.md` que produz a correcção. Nenhum diagnóstico é gerado
por modelo — um LLM a adivinhar porque é que um job falhou é exactamente o erro que o
Cockpit inteiro existe para não cometer.

## O fluxo — 5 gestos, por esta ordem

### 1 · ler a frota

```js
mooter_fleet({ view: "jobs", windowMinutes: 2880 })
```

### 2 · planear

```js
const retry = require("<repo>/packages/mooter-bridge/retry.js");
const { planos, resumo } = retry.planearTodos(payload.jobs, { coerencia: payload.coerencia });
```

Cada plano traz `assinaturas[]` (com `evidencia` campo-a-campo), `gauntlet[]`, `mudou[]`
(de → para → porquê), `pre[]` (gestos antes) e `accao`.

`accao` só tem três valores, e nenhum deles é ambíguo:

| accao | significa | o que fazer |
|---|---|---|
| `despachar` | assinatura conhecida, receita nova, goal não escreve | disparar |
| `confirmar` | falta o confronto anti-stale, **ou** a assinatura exige gesto do dono | ver passo 3 |
| `parar` | assinatura desconhecida · receita já gasta · tecto de tentativas · trabalho já feito | **não disparar** — devolver o motivo ao Paulo |

### 3 · o portão anti-stale — o gesto que poupa dinheiro

Todo o goal que **escreve** (git, commit, push, editar, corrigir, aplicar…) fica em
`confirmar` até alguém confrontar o repositório. Confronta:

```bash
git log --all --oneline -20 -- <ficheiros do goal>
git status --porcelain
```

Depois volta a planear com a prova:

```js
retry.planear(job, { jaFeito: { feito: false, fonte: "git log --all" } })   // falta mesmo fazer
retry.planear(job, { jaFeito: { feito: true, porque: "o A5 está em efce500c", fonte: "git log" } })
```

`feito: true` devolve `accao:'parar'` com o commit citado — e é isso que se diz ao Paulo.

> Isto não é hipotético. Em 2026-08-04, **2 dos 3 jobs presos já tinham o trabalho em `main`**
> (`efce500c` e `1cfd4837`), um deles sobre um ficheiro entretanto renomeado. Um botão de
> retry ingénuo pagava dois jobs para refazer o que estava feito, e arriscava um commit
> duplicado. É a regra 5 do protocolo de interacção.

### 4 · executar os `pre[]`

| tipo | gesto | nota |
|---|---|---|
| `mover-lock` | `mv .git/index.lock _to_delete/…` | **`mv` passa, `rm` é recusado** pelo mount. E o lock stale nasce de correr `git` pelo mount do Cowork: o git cria o lock e não o consegue apagar. Corre git pela frota nativa, não por `device_bash`. |
| `cancelar` | `mooter_cancel({ job_id })` | **Não é precondição.** Medido 3/3 em 2026-08-04: devolve `"já estava terminado"` e o job continua `running`. Verifica sempre relendo `view:jobs`; escada é `mooter_cancel({sweep:true})`. Um dispatch novo entra na worktree à mesma. |
| `confrontar-git` | passo 3 | bloqueante |

### 5 · despachar e registar

```js
mooter_work(plano.dispatch)
```

O `dispatch` já vem com as correcções aplicadas. Regista depois:

```js
mooter_setup({ sessao: "registar", note: "retry <job_id> · assinatura <id> · tentativa N" })
```

## Os travões — porque é que isto não entra em loop

1. **3 tentativas** por job, tecto duro.
2. **Receita já gasta não se repete.** Assinatura igual duas vezes = a receita está errada.
   Isso é um **achado para o Paulo decidir**, não um terceiro disparo.
3. **Assinatura desconhecida pára**, e diz o `exit_code` real. Ausência de receita nunca é
   ausência de problema.
4. **À segunda tentativa escala o motor** (moo/kimi/gemini → cc → codex), porque repetir o
   mesmo motor é apostar que desta vez corre melhor, e não há medição que o suporte.
5. **`cancelled-by-user` nunca é automático** — foi decisão do dono; desfazê-la sozinho seria
   passar por cima dela.

## As 10 assinaturas

| id | reconhece-se por | gauntlet | corrige com |
|---|---|---|---|
| `lock-git-preso` ⛔ | `index.lock` no activity/commands | G11 | mover o lock (mv) antes de tudo |
| `aprovacao-presa` | `exit_code: agent-awaiting-approval` | G3 · G9 | `write:true` + `allowedTools` explícito |
| `prep-estoura-sempre` | `exit_code: prep-timeout` | G3 · G12 | `pre_digest:false` |
| `vram-nao-chega` | `modelo_porque` com a aritmética da VRAM | G12 | fixar o modelo que cabe |
| `timeout-motor` | `excedeu o timeout de N ms` | G6 · G10 | escalar de motor |
| `parado-fora-do-historico` | log sem crescer **E** passou o p90 | G10 · G11 | cancelar + re-despachar |
| `orfao-de-reinicio` | `exit_code: orphaned-by-restart` | G11 | repetir tal e qual |
| `caminho-com-espaco` | stderr cortado em `C:\Users\Paulo:` | G6 · G11 | injectar a regra das aspas |
| `codex-worktree-windows` | `restricted-token sandbox` | G6 | `cc` + `create_worktree:false` |
| `cancelado-pelo-dono` | `exit_code: cancelled-by-user` | — | nunca automático |

⛔ = bloqueio: resolve-se antes de todas as outras.

**Um job pode ter várias assinaturas ao mesmo tempo** e o motor devolve-as todas, bloqueios à
frente. Tratar só a primeira é o erro que o teste-controlo de vizinhos (regra 12 do protocolo)
existe para impedir: falha de 1 entrada ≈ bug da entrada; falha de todas ≈ bug da superfície.

## No Cockpit

O mesmo motor está colado dentro de `cockpit.html` — **inline no build**, a partir do ficheiro
real, para não haver duas tabelas de falhas que divergem. Abre o drawer de um job e o bloco
`RETRY · GAUNTLET` mostra tudo isto, com um botão que executa.

Depois de mexer em `retry.js`:

```bash
node packages/mooter-bridge/patch-cockpit-retry.js
node packages/mooter-bridge/retry.test.js            # 30 testes, fixtures reais
node plugin/mooter/skills/cockpit/cockpit-invariants.test.js
```

⚠️ O botão de executar só funciona se o artifact tiver os grants de `mooter_work` e
`mooter_cancel`. Sem eles degrada para escrever o prompt — e diz que degradou, em vez de
fingir que despachou.

## O que reportar ao Paulo

Uma tabela, não prosa: job · assinatura(s) · o que mudou · acção · resultado. E o `parar` é
tão bom resultado como o `despachar` — foi dinheiro que não se gastou a refazer trabalho feito.
