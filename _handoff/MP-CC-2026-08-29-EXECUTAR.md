# MP-CC · 2026-08-29 — EXECUTAR (três escritas, zero features novas)

**Sessão:** fresca. Não retomes nada. `cd ~/frugal`, branch a partir de `main`.
**Origem:** medição feita no Cowork em 2026-08-29 (journal `~/paulo-vault/10-projects/2026-08-29-mac-magia-medida.md`).
**Roadmap vigente declarado:** `_handoff/MP-TALO-2026-08-28.md` (W0–W5). `MP-LIGAR` e `MP-MOOTER` do mesmo dia
ficam como histórico — **não os executes**.

## Constituição (vale nas três tarefas)
L1 procura antes de construir, e cita a busca vazia · L2 número não medido = `n/d` · L4 **toda ligação
precisa de teste que falha antes e passa depois** · L6 nenhuma credencial nova em texto claro ·
L7 premissa que não se confirma ⇒ **para e diz** · L8 `classify.js` FROZEN (sha `427d8c0b`), git é tua custódia.

## Recusas explícitas
❌ Não mexas em `classify.js` · ❌ não construas o produtor de `providerState` nesta sessão (só corrige
os documentos que o descrevem mal) · ❌ nenhuma feature nova · ❌ não escrevas mais documentos de estratégia ·
❌ não publiques nenhum número de poupança.

---

## T1 · `aviso_fabricacao` — o defeito de classe (prioridade 1)

**Evidência medida.** Job `job-mtea5wou-f2b3` (29/08, 64 s, $0, `qwen2.5-coder:14b`). O recibo declarou,
**antes** de o job responder:

- `permissoes_pedidas: ["Read","Glob","Grep"]`
- `permissoes_efectivas: []` — *"o moo corre via /api/chat e não recebe ferramentas"*
- `permissoes_diferenca.diferem: **true**`
- `contexto_truncado: router-execute.js — 304 de 1131 linhas`
- **`aviso_fabricacao: null`** ⬅️ o defeito

E o moo respondeu *"0 chamadores em TODO o repo — CONFIRMADO-ORFAO"*. Sem grep. Com 27 % do ficheiro.
**O conector tinha os três factos que provavam que a pergunta era impossível e não acusou.**

**O que fazer.** Em `packages/mooter-bridge` (procura onde `aviso_fabricacao` é construído — se não existir
produtor, é esse o achado, declara-o): quando **ambas** as condições se verificarem —

1. `permissoes_diferenca.diferem === true` **ou** `permissoes_efectivas` vazio, **e**
2. o `goal` contém um quantificador de varredura (`todo o repo`, `todos os`, `quantos`, `nenhum`,
   `em lado nenhum`, `0 chamadores`, `procura em`, `search the whole`, `anywhere`),

— então o resultado sai marcado `sem_ferramentas` e **não pode ser publicado como facto**. Mesma mecânica
da regra `sem_adversario` que já existe: reutiliza-a, não inventes uma segunda taxonomia.
Se `contexto_truncado` não estiver vazio, acrescenta a razão ao aviso.

**Gate de saída (L4):** um teste que reproduz o job acima e **falha em `main`**; passa depois.
Suite `router` e `cockpit` verdes (referência: router 977/0, cockpit 938/0). `classify.js` sha `427d8c0b` intacto.

---

## T2 · `tools/radar/vigia.mjs` — rever, testar com rede, agendar

**Está escrito e untracked.** Três GETs públicos, zero-LLM, $0, **zero prompts enviados**:
`ollama.com/library` · `openrouter.ai/api/v1/models` · `openrouter.ai/docs/llms.txt`.
Guarda impressão digital por alvo em `~/.mooter/radar/`, nunca o corpo. `--escrever` grava snapshot e faz
append ao radar do vault. Sem a flag é dry-run.

**Verificado no Cowork:** `node --check` OK · corrida real devolveu `n/d — fetch failed` nos 3 alvos e
**saiu 0** em vez de crashar (a VM do Cowork não tem rede — o teu Mac tem).

**O que fazer:**
1. Correr a sério: `node tools/radar/vigia.mjs` (dry-run) e depois `--escrever`. **É a primeira ronda com
   rede** — o output é a linha de base.
2. Rever o código antes de commitar (é meu, não teu — trata-o como PR externo).
3. Agendar no launchd: **segunda 09:00 BRT**, colado à rotina do pitch que já existe. Nunca `ollama pull`.
4. Commit.

**Achado a confirmar na primeira ronda:** `moonshotai/kimi-k3` devolveu **$3,00/$15,00** por MTok; o
`pricing.js` tem `$0,95/$4,00` e o comentário da linha 114 diz *"OpenRouter lista $0,68/$3,41"*.
**Três fontes, três valores.** ⚠️ O meu sinal veio de resposta truncada (88 modelos) — **não é medição
limpa**. Confirma com o JSON completo antes de tocar no `pricing.js`.

**Gate:** ronda corre e escreve o delta · entrada no launchd verifica-se com `launchctl list` · nenhum
segredo no ficheiro · sem dependências novas (só `fetch` nativo).

---

## T3 · Corrigir dois documentos que descrevem mal o mesmo órfão

**Refutação medida por grep no Cowork (29/08).** Dois documentos dizem que `providerState` "nunca é
construído" e que "os filtros `router-execute.js:187-190` são no-ops". **As duas metades estão erradas:**

| Afirmação | O que o código diz |
|---|---|
| "nunca construído" | **É construído** em `router-execute.harness.js:64` e `:135`; passado em `router-execute.test.js:794` |
| "filtros são no-ops" | `filterDegraded` (`router-execute.js:181-192`) está **correcto e testado** |

**O diagnóstico exacto:** o único sítio que preenche `providerState` está dentro de
`if (process.env.MOCK_PROVIDERS === '1')` (`router-execute.js:1067-1075`). Em produção real
`deps.providerState` é sempre `undefined` → a linha 662 aplica `|| {}` → **as quatro comparações falham
sempre e nada é excluído.**

> **O consumidor existe. Os testes existem. Falta o PRODUTOR de estado real.**
> Consequência: o item do W1 **não é escrever o filtro — é escrever quem o alimenta.** Um "ligar o órfão"
> pelo diagnóstico antigo mexia no ficheiro errado.

**Corrigir em dois sítios (só texto, sem código):**
1. `_handoff/ADENDO-MP-TALO-2026-08-28-RADAR.md` → secção **A1**, linha do `applyQuotaDefcon`/`providerState`.
2. O doc do Project `claude/ARQUITETURA_ONBOARDING_E_SAAS_2026-08-28.md`, secção "Bugs reais encontrados"
   (se não tiveres acesso ao Project, deixa nota no `SYNC.md` para o Cowork corrigir).

**Confirma tu próprio antes de escrever** (L7): `grep -rn "providerState" --include="*.js" . | grep -v node_modules`.
Se o meu grep estiver errado, **para e diz** — não escrevas a correcção da correcção.

---

## Ficheiros untracked à espera de decisão (não commitar às cegas)
`_handoff/MP-LIGAR-2026-08-28.md` · `MP-MOOTER-2026-08-28.md` · `MP-TALO-2026-08-28.md` ·
`ADENDO-MP-TALO-2026-08-28-RADAR.md` · `KICKOFF-RODAR-PERFEITO.md` · `operar/18-CC-PERFEITO.command` ·
`tools/radar/vigia.mjs`.
**Proposta:** commitar `MP-TALO` + `ADENDO` + `vigia.mjs`; mover `MP-LIGAR` e `MP-MOOTER` para
`_handoff/arquivo/` com uma linha a dizer porquê. Confirma com o dono antes de mover.

## Fecho obrigatório
1. `SYNC.md` ≤ 200 linhas com o que mudou, incluindo o que **não** passou.
2. Journal novo no vault (append-only).
3. Estado dos três gates, sem disfarce: teste do T1 · ronda do T2 · greps do T3.
4. Se algum gate não passar, **diz qual e porquê** — não baixes o gate (L5).

## Contexto que NÃO precisas de reconstruir
- Releitura de contexto **80,8 %** (era 78,2 % a 28/08). Pressão de quota **crítica**. Sê económico:
  lê só o que as três tarefas exigem.
- Latência do `classify.js` re-medida a 29/08 nesta máquina: **p50 0,0012 ms** (n=2000, decisão pura,
  quente) · **11,368 ms** a frio. O pitch diz 113 ms (abril). **São três denominadores diferentes —
  não publiques nenhum como melhoria sobre outro.** Não é tarefa desta sessão.
