# ⚠️ `@mooter/slack-spike` — THROWAWAY, com data de morte

**Isto não é produto.** É uma demo de bolso: app Slack custom, Socket Mode, **um**
workspace (o do Paulo), canal `#mooter-demo`, **um** id na allowlist.

- **Morre em:** `2026-09-16` (ver `morte.js` — o daemon lê a data e recusa arrancar
  depois dela). Passado o prazo sem piloto pago, o branch arquiva-se.
- **Nunca será:** marketplace · HTTP · multi-tenant · segundo workspace.
- **Não copiar para o produto** sem frente própria com G4. Todos os ficheiros levam
  o aviso no topo.

Origem: `_handoff/MASTERPROMPT_SLACK_SPIKE_2026-08-17.md` (v1.1, 4400 bytes,
sha256 `7a608ed2…`). G4 pré-entrega: kimi-k3 (job-msx255a9-cd52, $0,088) — 4 ALTO
+ 5 BAIXO incorporados.

## Dois modos

| Modo | Quando | O que corre |
|---|---|---|
| **CONSTRUÇÃO** | já, em paralelo com a kimi-egress | adapter + suite em dry-run. **Zero dispatch real.** |
| **VIVO** | só quando o `SYNC.md` tiver a linha `kimi-egress FECHADA — slack-spike destravado` | 1º dispatch real, 1º pendente real, teste 2-devices |

O gate é um `if` real, não uma nota: `gate.js` lê o `SYNC.md` e `daemon.js` recusa
arrancar sem a linha exacta. Fail-closed em todos os ramos (ficheiro ausente,
ilegível, ou frase apenas parecida ⇒ trancado).

## Dia 0 — o que o ledger REALMENTE dá (kimi #3)

Auditoria de **2026-08-17** sobre o ledger real: 4757 eventos, **12 pendentes**
(`exit_code=agent-awaiting-approval`). A regra do masterprompt é campo em falta ⇒
cortar ou rotular, **nunca** tocar no núcleo para o obter.

| Campo do cartão | Presença real | Decisão |
|---|---|---|
| `cost_usd` | 12/12 presente · **6/12 não-nulo** | mostra-se **só com fonte**; sem fonte ⇒ `n/d`, nunca um número |
| `cost_usd_fonte` | 12/12 preenchido | o ledger **já se auto-rotula** — 4 valores reais, incluindo `"calculado a partir de tokens e tabela de precos"` ⇒ marca-se **ESTIMATIVA** |
| `model_used` | 6/12 | `n/d` quando falta. **O tier nunca vira modelo.** |
| `files_touched` | 6/12 presente · **0/12 não-nulo** | **CORTADO do cartão.** Nunca esteve preenchido num pendente. |
| `actor` | 9/12 · **sempre `system`** | o autor humano é **`n/d` hoje**. O Slack é quem passa a declará-lo (`slack:U…`). O `agent` mostra-se à parte, rotulado **motor**, nunca disfarçado de autor. |

## A objecção ao masterprompt (levantada no Dia 0, com números)

O kimi #6 pede uma `publicar()` que «REJEITA payload com `visibilidade: local_only`».
**Lido à letra, isso é fail-open.** No ledger de 08-17:

```
visibilidade:"local_only"  ->   118 eventos
visibilidade:"shareable"   ->     0 eventos
SEM o campo                ->  4640 eventos   <-- inclui `dispatched`, que carrega `goal`
```

`actor.js` só etiqueta `EVENTOS_RESULTADO` — e faz bem, porque só esses carregam
resultado. Mas um gate que apenas recusa `local_only` **bloqueia 100% do que está
etiquetado e deixa passar 100% do que não está**, incluindo texto do utilizador.

Por isso `publicar.js` tem **duas** barreiras: (1) a recusa de `local_only` que o MP
pede, e (2) uma **allowlist de campos** — só saem valores derivados; `goal`, `prompt`,
`worktree`, `mp_hash` e `files_touched` não estão nela. A ausência de rótulo não é
permissão. O cartão não herda o `local_only` do evento porque **o cartão não é o
evento**: é um artefacto novo feito só de campos que atravessaram a allowlist.
Se isto virar produto, a decisão de publicar tem de passar a ser um `shareable`
explícito gravado no ledger — não esta allowlist. Fica dito.

## Ficheiros

| Ficheiro | Papel |
|---|---|
| `morte.js` | a data de morte, lida pelo daemon |
| `gate.js` | o `if` do MODO VIVO (linha no `SYNC.md`) |
| `allowlist.js` | **um** id, usado nos **dois** caminhos (kimi #1) |
| `denylist.js` | o nome de um segredo nunca sai (kimi #5) |
| `leitura.js` | o Dia 0 em código: `{valor, rótulo, fonte, porquê}` |
| `publicar.js` | **a única** porta de saída (kimi #6) |
| `adapter.js` | menção → despacho → cartão → clique → decisão + auditoria (kimi #8) |
| `daemon.js` | as 4 razões para não arrancar (prazo · gate · `.env` · token) |

**Nada aqui altera o núcleo.** `broker.js` e `actor.js` são importados como qualquer
consumidor; a porta de despacho é **injectada** (duplo em construção, `toolWork` em vivo).

## Testes

```bash
cd packages/slack-spike && node --test
```

47/47 a passar. Inclui o **ensaio do infeliz** (kimi #4) contra o broker **real** em
dry-run (`MOOTER_HOME` numa pasta temporária, dispatcher duplo):

1. **recusa** → `REJECTED` gravado e dito no thread;
2. **clique atrasado** → `STALE` com **os dois hashes à vista** (o CAS a trabalhar) e o
   pendente **continua** na fila;
3. **daemon offline** → instância nova, mesmo ledger: o pendente **sobrevive e reaparece**.

Mais: clique de terceiro é ignorado, registado e **não chega ao broker**; pendente já
decidido responde efémero; e o thread-context **nunca** entra no prompt.

## O que falta para o MODO VIVO

1. A linha no `SYNC.md` (depende da kimi-egress fechar).
2. App Slack + `SLACK_BOT_TOKEN` num `.env` — o `daemon.js` verifica com
   `git check-ignore` **antes** de tocar no token (kimi #7).
3. Ligar `despachar` ao `toolWork` real e `enviar` ao `chat.postMessage`.
4. Teste 2-devices (aprovar do telemóvel com a frota no desktop).
5. **Condição de sócio:** a demo nasce agendada — data marcada com ≥1 estranho
   **antes** do merge do spike.
