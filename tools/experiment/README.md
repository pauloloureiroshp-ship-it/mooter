# tools/experiment — kit manual do experimento Prisma (P1.0)

**O que é.** Um diário à prova de reescrita para ondas de 8 posições numa superfície de IA de consumidor (ChatGPT web, primeiro), com fecho derivado do diário — nunca descrito. Zero dependências (Node ≥ 22, `node:test`). Não chama fornecedores: quem cola o prompt, carrega em enviar e copia a resposta é um **humano**; o kit guarda o que aconteceu, com hashes, e recusa o que não tem prova.

**O que não é.** Não é automação de envio, não é scraper, não é um benchmark. Não aprende nada (contrato 0.3 `learning.automatic_learning_in_cycle = false`). Não toca em `tools/router/*` nem em `packages/*`: importa **dois** módulos do motor, pinados por sha256 (`pins.json`), e lê `pricing.js` só para proveniência (sha256 + data de revisão, sem pin — decisão do dono, 16/09).

**Normas.** Contrato `contract/engine-contract-0.3-proposed.json` (sha256 `61acea27…`, pinado — outro contrato é outra versão, outra pin, outra AMENDMENT) · PROTOCOLO-PILOTO-0.2-proposed (sha256 `4564ab1d…`) · plano `cc-plan-20260916-v1` · `amendments/AMENDMENT-001.json` (001 + suplemento 001b). Semântica `0.3-proposed`; `external_review` deriva do registo de emendas.

## Invariantes (o kit recusa, não avisa)

| # | Regra | Onde |
|---|---|---|
| E-2 | `root` **obrigatório, absoluto, fora do repo** — os dados vivem em `C:/Users/<user>/prisma-data/` (nunca em `~/.mooter`, `~/.claude` ou no repositório) | `openJournal` → `root_required` / `root_inside_repo` |
| C3 | `ledger-prov.js`, `provider-health.js` e o contrato batem com `pins.json` | `openJournal`, `preflight`, `freeze`, `import` → `pins_mismatch` |
| 01 | manifesto congelado por conteúdo: `prompt_hash` = sha256 dos bytes; `manifest_hash` canónico; `wave.frozen` é o **primeiro** evento | `freeze.mjs` → `manifest_conflict` |
| 02/13/14/19 | preflight: bytes == `prompt_hash`, canário/caracteres invisíveis, condição observada ⊇ pedida, operador/autorização, `search_available=true` no primário, 1 slot em voo, `next_action_at` | `preflight.mjs` |
| 03/04 | uma intenção por slot (`.intent` O_EXCL), nunca apagada; crash pós-intent ⇒ `submission_uncertain` (nunca reenvio) | `journal.mjs` → `commitIntent`, `resume` |
| 05 | captura só sobre slot com intenção; recuperação exige prova (`provider_run_id` ou nota) e supersede sem apagar | `import.mjs` |
| 08/18/09 | falha classificada pelo literal (provider-health, pinado); custo com `basis` no enum e `coverage`; `null` nunca é 0 | `import.mjs` |
| 07/17 | `deadline_at`/`closeout_at` imutáveis; pausa que ultrapassa a janela fecha **incompleta** | `journal.mjs`, `closeout.mjs` |
| 10 | integridade recalculada no fecho; conclusão assinada; auditoria posterior lista o que mudou | `closeout.mjs` → `auditClosed` |
| 11/20 | denominadores por **posição**; observações científicas independentes (nunca promovidas); aplicável ≠ captura suficiente ≠ avaliável | `closeout.mjs`, `scores.mjs` |
| 12 | partição reservada **rejeitada** até haver custodiante (`reserved_partition_unsupported`); nenhum módulo lê `holdout/` | `freeze.mjs`, `holdout/README.md` |

## Procedimento manual para UMA superfície (chatgpt-web)

Tudo corre com `node --input-type=module -e '…'` a partir da raiz do repo, ou com um pequeno script do operador que importe os módulos. Cada passo escreve **um** evento; se algo recusar, nada é escrito e a razão vem no erro (`e.code`, `e.details`).

```js
// cabeçalho comum a todos os passos (ROOT fora do repo; WAVE_ID pré-registado)
import fs from 'node:fs';
import * as J from './tools/experiment/journal.mjs';
import { freezeWave } from './tools/experiment/freeze.mjs';
import { openFromManifest } from './tools/experiment/open.mjs';
import { preflight } from './tools/experiment/preflight.mjs';
import { importCapture, markCaptureUncertain, importFailure } from './tools/experiment/import.mjs';
import { appendScore } from './tools/experiment/scores.mjs';
import { buildConclusion, checkConclusion, closeoutWave, auditClosed } from './tools/experiment/closeout.mjs';
const ROOT = 'C:/Users/Paulo Loureiro/prisma-data';          // E-2: absoluto, fora do repo
const ctx = J.openJournal({ root: ROOT, waveId: 'W1-chatgpt-web-2026-09-XX' });
```

### 0 · Qualificação da superfície (W0, `partition: 'synthetic-qualification'`)

1. Copiar `capability-record.template.json` para `<ROOT>/meta/capability-chatgpt-web.json` e preencher **por observação** (cada essencial com `evidence_reference`). `null` num essencial ⇒ `eligible_primary: false` — e o preflight do braço primário recusa (`ineligible_surface`). Nada se presume.
2. Correr uma onda W0 com prompts `role: 'synthetic'` (fora da avaliação) para calibrar intervalo/jitter e o `deadline_rule` por superfície. W0 não precisa de `authorization_ref`/`operator_id`; o primário exige ambos.

### 1 · Congelar (freeze)

Manifesto de entrada (`prisma-experiment-manifest/0.3-proposed`): `brief_id`, `wave_id`, `condition_id`, `partition: 'primary'`, `surface`, `condition_requested` (14 chaves do contrato; `search_used`/`observed_*` a `null` — só se preenchem por observação), `prompts[]` (`id`, `text`, `role ∈ eligible|negative`, opcional `evidence: { fact_ref, asks_recommendation }` — sem isto, `new_fact_used`/`recommended_appropriately` ficam **não aplicáveis** e o fecho di-lo), `order[]` (8 = 6 eligible + 2 negative), `caps`, `queue_policy` (`interval_seconds`, `jitter_seconds`, `jitter_seed`, `wallclock_minutes` 45, `closeout_reserve_minutes` 5), `forbidden_markers`, `rubric_ref`, `authorization_ref`, `manifest_hash: null`.

```js
const f = freezeWave(ctx, { manifest: JSON.parse(fs.readFileSync('manifest.input.json', 'utf8')) });
// escreve <wave>/manifest.json + manifest.sha256 e o evento wave.frozen; idempotente para o mesmo conteúdo
```

Ids `R01`/`R02`, `role: 'reserved'` ou `partition: 'independent-reserved'` ⇒ `reserved_partition_unsupported`, nada escrito.

### 2 · Abrir

```js
openFromManifest(ctx);   // wave.opened com deadline_at/closeout_at derivados do manifesto; imutáveis depois
```

### 3 · Por posição (8×, uma de cada vez)

```js
const bytes = fs.readFileSync('to-paste/Q01.txt');      // EXACTAMENTE o que vai ser colado
const capability = JSON.parse(fs.readFileSync(`${ROOT}/meta/capability-chatgpt-web.json`, 'utf8'));
const observed = { surface: 'chatgpt-web', observed_plan: 'Plus', selected_model_label: 'GPT-5', observed_model_label: 'GPT-5', reasoning_control: 'default', auto_switch: null, personalization: 'off', search_available: true, prompt_language: 'pt-PT', capture_method: 'manual-paste', operator_id: 'op-…' };
const manifest_hash = J.waveState(ctx).manifest_hash;   // o hash gravado em wave.frozen
const pf = preflight(ctx, { slot_id: 'Q01-1', bytes, observed, capability });
if (!pf.ok) { console.log(pf.reasons); /* NÃO enviar; corrigir ou esperar next_action_at */ }
```

Se `pf.ok`: `J.commitIntent(ctx, { slot_id: 'Q01-1', prompt_hash: pf.prompt_hash, manifest_hash })` **antes** de carregar em enviar (cria `.intent`, uma vez por slot). Depois de enviar, registar `J.appendEvent(ctx, { slot_id, kind: 'submitted', payload: { ts_submitted } })`. Se o envio não chegou a sair (campo vazio, página recarregou): `J.knownNotSubmitted(ctx, { slot_id, proof: '…' })` — o slot pode voltar à fila dentro do tecto. Crash a meio: `J.resume(ctx)` ⇒ `submission_uncertain`; recuperar a **mesma** resposta com `importCapture({ …, recover: true, provider_run_id | note })` — nunca reenviar.

Resposta: copiar os bytes visíveis e importar —

```js
importCapture(ctx, { slot_id: 'Q01-1', answer_bytes: fs.readFileSync('captured/Q01-1.txt'), capture_completeness: 'full', capture_method: 'manual-paste',
  observed: { ...observed, search_used: true /* ou false | null, o que a UI mostrou */ }, citations: [{ url: '…' }],
  usage: { model_key: 'gpt-5', tokens_in: null, tokens_out: { value: 1490, basis: 'estimated', source: 'chars/4' } }, refusal: false, operator_id: 'op-…' });
// usage: cada métrica é { value, basis ∈ observed|estimated|imputed|unknown, source } ou null — um número nu é recusado.
// model_key sem linha em pricing.js (ex.: 'gpt-5' hoje) ⇒ cost_usd unknown{no_price_row}: o kit não inventa preço.
```

Condição observada ≠ pedida ⇒ `policy_review{condition_drift}` antes de `captured` e o slot sai `partial` — nada se corrige em silêncio. Captura falhada: `markCaptureUncertain(ctx, { slot_id, literal, partial_bytes })`. Erro do fornecedor: `importFailure(ctx, { slot_id, literal: 'texto exacto da UI' })` — classe e reset vêm do literal; um reset para lá da janela pausa a onda e ela fecha incompleta.

### 4 · Observações científicas (reviewer humano com acesso ao original)

```js
appendScore(ctx, { slot_id: 'Q01-1', field: 'target_mentioned', value: true, source: 'leitura integral', timestamp: new Date().toISOString(), evidence_reference: { excerpt: '…' }, reviewer: 'rev-…' });
// new_fact_used=true exige evidence_reference { diff, excerpt }; crawl_access pode existir sem resposta; null = não observado
```

### 5 · Fechar e auditar

```js
const draft = buildConclusion(ctx, { human: { hypothesis_id, expected_result, counterevidence, confounders, decision, reviewer, next_hypothesis_id } });
console.log(checkConclusion(draft));        // todos[] (<<TODO>> e «n/d» sem justificação), problems[] (regra do piloto, enum)
closeoutWave(ctx, { human, invalidated: [] });   // só depois de closeout_at, ou com reason do operador; conclusion.json assinado, wave.closed
auditClosed(ctx);                            // mais tarde: o que mudou desde o fecho, listado, nada reescrito
```

`conclusion.json` traz os 21 campos do contrato (7 humanos, 14 derivados), `per_slot[].rule` (a regra da redução que decidiu cada classe), `eligible_evaluable_denominator` por posição com `applicable_by_field` / `evaluable_by_field`, `completeness`, `amendments`, `external_review_detail`.

## Ficheiros

`journal.mjs` (diário, cadeia de hashes, intenção O_EXCL, resume/reconcile) · `freeze.mjs` · `open.mjs` · `preflight.mjs` · `schedule.mjs` (intervalo + jitter determinístico por seed) · `import.mjs` · `scores.mjs` · `closeout.mjs` · `effort.mjs` (limiar E-6 por par, sem medir nada) · `contract.mjs` + `contract/` · `pins.mjs` + `pins.json` · `amendments/` · `holdout/README.md` · `capability-record.template.json` · `tests/` (`npm run test:experiment`).

## Layout dos dados (`<ROOT>`, fora do repo)

```
prisma-data/
  meta/capability-<surface>.json
  waves/<wave_id>/
    manifest.json · manifest.sha256 · events.jsonl · scores.jsonl · citations.jsonl
    raw/<slot_id>/.intent · answer.txt · answer.sha256 · answer.partial-NN.txt
    conclusion.json (assinado) · journal.blocked (se o diário travou)
```

## Limites honestos (P1.0)

Sem CLI — módulos chamados por script do operador. Sem custódia do holdout (README + rejeição). Sem importação de cobrança real: custo em USD é sempre `estimated` de lista (`kind: api_charges_at_list_price`); tokens observados ficam à parte. Sem replays reais do ensaio de esforço: `effort.mjs` só aplica a regra a pares já medidos. Sem chamadas a fornecedores, nunca.
