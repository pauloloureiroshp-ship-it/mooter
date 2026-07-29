# 🐮🔧 POST-MERGE AUDIT — MASTERPROMPT DE REMEDIAÇÃO (Frentes 1–7)

> Autor: Cowork · 2026-07-16 · Resposta direta a `_handoff/POST_MERGE_AUDIT_CODEX_REPORT.md`
> (auditoria contra `origin/main@71340b25ccb7eb1b27e37e02a5a5f5cf3f63d2b7`, veredicto `PARTIAL`).
> Este ficheiro NÃO repete a evidência — cita linha/ficheiro do relatório já entregue. Lê o relatório
> primeiro se precisares do porquê de cada item.
> Casa: `_handoff/` → arquivar em `_handoff/_archive/2026-07/` no PR que fechar a última frente.

🎯 GOAL   Fechar, com prova real (não "está verde"), os achados FAIL/PARTIAL do post-merge audit —
          por ordem de bloqueio real, não por ordem de aparição no relatório.
📍 WHERE  Uma worktree descartável por frente, a partir de `origin/main@71340b2...` (fetch antes — main
          local pode estar stale). Nome sugerido: `../frugal-remediation-F<n>`, branch `fix/<slug>` ou
          `chore/<slug>`. **Nunca a árvore principal** — ela é onde o Paulo trabalha.
🔒 GUARD  `classify.js` FROZEN (sha `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` —
          reverifica no fim de CADA frente) · `packages/*` engine congelado, **`packages/vscode-extension`
          NÃO é frozen** · git add seletivo, nunca `-A` · **push/merge = gate nativo do Paulo, sempre** ·
          cada frente termina em PR aberto (não mergeado) · nunca reescrever o
          `POST_MERGE_AUDIT_CODEX_REPORT.md` já entregue — ele é histórico, este ficheiro gera um novo.
✅ GATE   por frente (abaixo) + gate final = Frente 7 (reaudita as mesmas secções do relatório original,
          mesmo rubrica PASS/PARTIAL/FAIL/N-V, **nunca "perfeito"**).
⏭  NEXT   depois disto: `SETUP_RADAR_MASTERPROMPT.md` (a cabine de setup) pode assumir que a base é honesta.
📋 BACK   por frente: diff resumido + output real dos testes + link do PR + tabela de veredicto.

## Sequenciamento (evita conflito de merge)

| Ordem | Frentes | Motivo |
|---|---|---|
| **Paralelo, já** | F1, F2, F3 | Zero overlap de ficheiros entre elas |
| **Depois que F2 for MERGEADA** | F4, F5 | Ambas tocam `package.json`/`README.md` do plugin, mesmos ficheiros que a F2 reescreve |
| **Solta, qualquer momento** | F6 | Housekeeping menor, sem dependência |
| **Só no fim, tudo mergeado** | F7 | É a reauditoria — precisa do estado final real |

---

## F1 — Fechar os 5 gates P1 do Perfect Handoff (🔥 bloqueia Fase B Ledger)

**Evidência:** relatório §E3, §C1 — `PERFECT_HANDOFF_SPEC.md:23-31` lista 5 P1 abertos: (a) buffer de
contexto partilhado com eventos, (b) sem single-writer/lock transacional, (c) writers que contornam o
reducer, (d) `wave ship --force` ignora gates/SHA, (e) conductor avisa mas não bloqueia git concorrente.
`.planning/handoff-spine-v2/PHASE_A_GATE.md` (artefacto prometido no commit de #249) **não existe**.

**Ficheiros:** `docs/strategy/PERFECT_HANDOFF_SPEC.md` · `packages/vscode-extension/src/host-extra.js`
(`writeHandoffToSync`) · `packages/vscode-extension/src/agent-sync-ledger.js` (`appendEvent`/
`writeSnapshot`) · `packages/vscode-extension/src/ledger-reduce.js` · `.planning/handoff-spine-v2/
PHASE_A_GATE.md` (recriar) · `SYNC.md` (refresh — ainda aponta pra PR #246/main antigo/extensão
0.16.67-72, relatório §E1).

⛔ **STOP antes de codificar.** Isto é concorrência real (lock, single-writer) — desenha primeiro,
implementa depois. Escreve no corpo do PR (não em código ainda) um parágrafo curto por gate:
1. Onde vai viver o lock (ficheiro? mutex em memória do processo host? os 3 planos — CC/Codex/moo —
   escrevem de processos diferentes, então lock em ficheiro é o único que funciona entre planos).
2. Como o reducer vira a ÚNICA rota de escrita sem quebrar `writeHandoffToSync` (que hoje escreve direto
   em `SYNC.md`, `host-extra.js:2984-3009`) — shim que redireciona para o reducer, ou reducer chamado
   de dentro da função?
3. Como `wave ship --force` deixa de contornar o gate sem virar um bloqueio irreversível numa emergência
   real (precisa de um override explícito e auditável, não um caminho silencioso).

Só depois de escrito esse parágrafo (e — se puderes, pausa e manda pra mim revisar antes do código real,
já que é decisão de arquitetura, não só bugfix) é que implementas.

**Aceite (F1):**
- 5/5 gates fechados com teste que prova cada um (não descrição — teste que falha se o gate reabrir).
- `.planning/handoff-spine-v2/PHASE_A_GATE.md` existe, versionado, no PR.
- `SYNC.md` referencia o SHA/PR atual, não #246.
- `classify.js` sha intacto. `npm test` em `packages/vscode-extension` continua ≥1393/1394 (a mesma
  baseline do relatório — se cair, é regressão tua, não pré-existente).

---

## F2 — Corrigir a promessa pública do plugin (🔥 confiança/segurança — não é só naming)

**Evidência:** relatório §B5, §D4 — `package.json:3-4,191-212` vende "Cost Cockpit"/"Read-only cockpit";
`README.md:30-34` diz "never touches your code", "only reads", "no network calls beyond localhost". O
código real escreve ficheiros (`extension.js:3050,3211,3331,3747,4673`), faz commit/push
(`host-extra.js:1495,1651`; `extension.js:4237,4250`) e deploy Vercel (`extension.js:4443`).

**Ficheiros:** `packages/vscode-extension/package.json` (linhas 3-4, 191-212) · `README.md` (1-34) ·
`walkthrough/*.md`.

⛔ **STOP antes de publicar a cópia nova.** Isto é decisão de produto/negócio, não só correção técnica —
escreve o diff da cópia nova (o texto exato, lado a lado com o antigo) no PR e espera o meu OK antes de
mergear (nunca antes — publicar copy errada uma vez já é o problema; reescrever pra outra copy errada
duas vezes é pior). Duas opções honestas, escolhe uma e justifica:
  (a) **Copy fiel ao que existe hoje** — descreve escrita/commit/push/deploy reais, mas também os
      guardrails reais que já existem (lease de origem, SHA-guard em undo/revert, aprovação antes de
      ações destrutivas — relatório §D1, itens 3 e 5, `extension.js:1879,2350,3744,4833-4851`;
      `lp-publish-view.js:120,163-164`). Não é "perigoso"; é "age, com freio".
  (b) **Reverter comportamento para read-only** e SÓ ENTÃO manter a copy antiga — mais caro, mais lento,
      provavelmente não é isto que o Paulo quer dado o roadmap (Live Preview/Publish são produto ativo).
  Presume (a) e escreve a copy honesta alinhada à tese v2 (motor=fosso, cabine=produto, 5 experiências —
  `docs/strategy/MOOTER_ROADMAP.md:3-16`), mas deixa a escolha explícita no PR pro Paulo confirmar.

**Aceite (F2):** zero claim de "read-only"/"never touches"/"no network beyond localhost" que o código
contradiga (reverifica com o mesmo grep do relatório) · nenhuma capacidade NOVA inventada na copy — só o
que já está provado no código · walkthrough atualizado a condizer.

---

## F3 — Ratchet estrito + kill-switch real do Arbiter (não bloqueia Ledger, mas é barato e fecha 2 riscos)

**Evidência:** relatório §F (ratchet tem folga de 1 ficheiro, `COUNT > BASELINE` em vez de `==`) e §G2
(kill-switch do Arbiter no friend-build depende da AUSÊNCIA acidental de `ANTHROPIC_API_KEY`, não de um
switch dedicado — `inject_context.js:811-826`, `arbiter.js:274-280`).

**Ficheiros:** `.github/workflows/no-frugal.yml` (linhas 13-21) · `docs/rebrand/frugal-baseline.txt` ·
`tools/router/inject_context.js` (801-826) · `tools/router/arbiter.js` (274-280).

- Ratchet: comparar `COUNT` do PR head contra o merge-base (não contra uma baseline versionada estática
  que fica desatualizada), OU exigir `COUNT == BASELINE` e atualizar `frugal-baseline.txt` no mesmo PR
  sempre que cair. Cenário adversarial do relatório (176→175→176 ainda passa) deixa de existir.
- Arbiter: cria um kill-switch **dedicado, nomeado, default-off**, testado (`FRUGAL_FRIEND_BUILD=1` ou
  nome equivalente que não colida com `FRUGAL_V07_DISABLE`, que desliga mais coisa do que só o Arbiter).
  Não deve depender de `ANTHROPIC_API_KEY` ausente — uma chave herdada do ambiente não pode reativar
  Haiku silenciosamente.

**Aceite (F3):** teste que prova que 1 ficheiro extra com "frugal" FALHA o ratchet · teste que prova que o
kill-switch novo desliga o Arbiter independente de `ANTHROPIC_API_KEY` estar setada ou não.

---

## F4 — Doc canônica: SYSTEM_DESIGN.md desatualizado + tagline antiga sobrevivendo (roda depois da F2 mergear)

**Evidência:** relatório §B4 (5 afirmações do SYSTEM_DESIGN.md divergem do código real: missão antiga
`:17-27`, T5/Fable backend documentado como "Anthropic API" mas o código fixa `claude_subagent`
(`classify.js:228-229,991`), hook documentado "500ms hard timeout" mas o real é 1500ms
(`inject_context.js:651-655`), hub documentado com 4 cron jobs mas só 3 existem e estão comentados
(`hub/wrangler.mooter.toml:21-24`)) e §A3/A4 (tagline "Your LLM router. Local-first. Learns forever."
sobrevive em 17 ficheiros vivos, incluindo `.claude/skills/moo-help/SKILL.md:12`, `MEMORY.md:179`,
`docs/foundation/SYSTEM_DESIGN.md:17`, `docs/MOOTER_OPERATIONS_GUIDE_v1.0.md:9`,
`packages/cli/src/index.ts:74`).

**Ficheiros:** `docs/foundation/SYSTEM_DESIGN.md` · os 17 ficheiros do grep de A4 (roda o grep tu mesmo,
não confies numa lista velha — é exatamente o erro que causou este achado).

- Corrige as 4 divergências específicas do B4 (uma a uma, com a linha real do código como fonte).
- Varre a tagline antiga: mantém SÓ em documentos explicitamente históricos/superseded (ex. o próprio
  ADR-0001 riscado — ele DEVE preservar o texto antigo como registro). Troca nos vivos pela tese v2.
- **Antes de tocar `package.json`/`README.md` do plugin (se algum dos 17 for esse ficheiro): confirma
  que a F2 já mergeou.** Se não mergeou ainda, faz o resto da F4 e deixa esses 1-2 ficheiros para depois.

**Aceite (F4):** as 4 divergências do B4 viram PASS numa reconferência · grep da tagline retorna só
ficheiros de `_archive/`/ADRs marcados superseded/histórico de `MEMORY.md`.

---

## F5 — Dev loop real do plugin: F5 debug + runner oficial de Extension Host (roda depois da F2 mergear)

**Evidência:** relatório §H5 (91 ficheiros de teste rodam via `node:test` puro — nenhum roda dentro de um
Extension Host real; não há `@vscode/test-cli` nem `@vscode/test-electron`) e §H6 (`.vscode/launch.json`
não tem nenhuma entrada `type: extensionHost` com `--extensionDevelopmentPath` — o "aperta F5 pra testar"
não existe hoje).

**Ficheiros:** `packages/vscode-extension/.vscode/launch.json` (nova entrada) · `packages/vscode-extension/
package.json` (devDependencies) · `packages/vscode-extension/.vscode-test.js` (novo, config do
`@vscode/test-cli`).

1. `npm install --save-dev @vscode/test-cli @vscode/test-electron` no plugin.
2. `.vscode-test.js`: `module.exports = require('@vscode/test-cli').defineConfig({ files: '<pattern real dos testes existentes ou um smoke novo>' })`.
3. `launch.json`: adiciona (sem remover as entradas existentes de classifier/backtest/tracker/tests):
   ```json
   {
     "name": "Run Extension",
     "type": "extensionHost",
     "request": "launch",
     "args": ["--extensionDevelopmentPath=${workspaceFolder}"],
     "outFiles": ["${workspaceFolder}/**/*.js"]
   }
   ```
4. Não precisa migrar os 1394 testes existentes pro Extension Host — isso é desproporcional. Mínimo
   aceitável: **um teste de ativação real** (a extensão ativa sem erro dentro de um Extension Host de
   verdade, via `@vscode/test-electron`), cobrindo o mesmo caminho que a F4/H4 da auditoria já provou
   manualmente — só que agora automatizado e repetível em CI.

**Aceite (F5):** `code --extensionDevelopmentPath=<path>` (ou o teste automatizado equivalente) ativa sem
erro · `launch.json` tem a entrada nova e as antigas continuam intactas · pelo menos 1 teste roda de fato
dentro do Extension Host, não só `node:test` simulando.

---

## F6 — Housekeeping menor (solta, qualquer momento, baixo risco)

**Evidência:** relatório §G4, itens 4-5.

- `packages/worktree-conductor/package-lock.json` foi gerado não-rastreado pelo `npm install` da
  auditoria — decide: versiona (determinismo) ou adiciona ao `.gitignore` com um comentário explicando
  por quê não.
- `guardian-chip.js:19` e `guardian-prebake.js:73` importam `../../../tools/router/compaction-advisor.js`
  via fallback duplicado (o `try/catch` é intencional, ativação passa, mas há 2 cópias de thresholds que
  podem divergir com o tempo). Reconcilia numa fonte única (constante compartilhada ou um dos dois
  reexporta do outro) ou documenta explicitamente por que a duplicação é proposital.

**Aceite (F6):** decisão registrada (comentário no código ou `MEMORY.md`) — não precisa de teste novo se
for só decisão de tracking do lockfile.

---

## F7 — Reauditoria (gate final — só depois de F1-F6 mergeadas)

Reaudita, com o mesmo rigor e rubrica `PASS/PARTIAL/FAIL/N-V` do relatório original (nunca "perfeito"),
contra o novo `origin/main`:
- §A3/A4 (tagline) · §B4 (SYSTEM_DESIGN) · §B5/§D4 (promessa pública) · §E1/E3 (P1 gates + gate file) ·
  §F (ratchet) · §G2 (kill-switch) · §H5/H6 (dev loop).
- Gera **novo** relatório: `_handoff/POST_REMEDIATION_AUDIT_CODEX_REPORT.md` (não sobrescreve o original —
  os dois ficam, um é o "antes", outro o "depois").
- TL;DR obrigatório: quantos dos 9 achados FAIL/PARTIAL originais viraram PASS, quantos continuam abertos
  e por quê (achado que continua aberto não é fracasso se a razão for honesta — é fracasso se for
  reportado como resolvido sem prova).

**Aceite (F7):** `classify.js` sha intacta · zero regressão nas suites que já eram verdes (1393/1394 do
plugin, 979+/982 do router) · relatório novo com evidência linha-a-linha, mesmo padrão do original.

---

## O que NUNCA fazer

❌ Mergear ou pushar qualquer PR sem o OK explícito do Paulo (todas as 7 frentes) · ❌ implementar F1 sem
o parágrafo de design primeiro · ❌ publicar a copy nova da F2 sem o Paulo confirmar qual das 2 opções ·
❌ reescrever/apagar `POST_MERGE_AUDIT_CODEX_REPORT.md` · ❌ tocar `classify.js` · ❌ `git add -A` em
qualquer frente · ❌ rodar F4/F5 antes da F2 mergear (mesmo ficheiro, conflito garantido) · ❌ declarar
qualquer achado "resolvido" sem o teste/output que prova.
