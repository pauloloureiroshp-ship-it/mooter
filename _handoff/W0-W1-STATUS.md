# W0+W1 "Moo Pilot Perfeito" — PONTO DE SITUAÇÃO

**Branch** `w0-w1-perfeito` · base `main` = `ac937f6b` (1.53.0) · 16 commits
**Data** 2026-09-01 (hora do dono, America/Sao_Paulo)
**Executor** Claude Code, mac-mini · **NÃO fundido — o portão é do dono**

---

## Guardrails, confrontados um a um

| Guardrail | Estado | Prova |
|---|---|---|
| `classify.js` FROZEN | ✅ intacto | sha `427d8c0b…4bc48f`, conferido no fim |
| `packages/*` congelados | ✅ zero ficheiros tocados | `git diff --name-only \| grep ^packages/` vazio |
| Loop FICA PARADO | ✅ nenhum `/play`, `/stop` ou reabertura | nada no diff toca no `STOP_FILE` |
| Número não medido = `n/d` | ✅ e refutei três premissas do próprio kickoff (abaixo) | |
| Suite completa do router não corrida às cegas | ✅ subset medido; a completa correu **com tecto**, e o que se descobriu foi que ela *pendura* | `docs/SUITE-DO-ROUTER.md` |
| Vault: só leitura | ✅ zero escritas | |
| Sem prompts/segredos/paths de utilizador em payloads | ✅ | teste em `ci-prs.test.mjs` varre os argumentos do `gh` |
| `git add` selectivo | ✅ nunca `-A` | |

Uma deriva de lockfile em `packages/router/package-lock.json` apareceu durante a
sessão (npm regenerou-a a partir do `engines.node` já allowlistado). **Revertida** —
um pacote congelado sem entrada de allowlist não se toca.

---

## FEITO — 16 de 16 itens

### 0 · Baseline congelado (M11)
`tools/cockpit/runner/baseline-2026-09-01.json`, sha256 fixado no módulo **e** no
teste. 9 testes.

> ⚠️ **Os números do kickoff não se reproduzem.** Ele pedia «kept-rate 0,26%
> (2 aceites+1 issue/782), não-discrimina 49%». Medido com o **próprio construtor
> do Ledger** contra este device: **total 1071 · aceites 3 · issue 1 → kept-rate
> 0,3735% · não-discrimina 607 → 56,68%**. Copiá-los seria inventar. Ficam
> registados em `divergencia_do_kickoff`, com a causa marcada `n/d` — não verifiquei
> qual instante produzia 782, e afirmá-lo seria adivinhar.

### W0 — higiene
| | o que | prova |
|---|---|---|
| **a** | Enter submete no Ask (Shift+Enter = linha nova, IME não submete) | 9 testes que **correm** os dois `<script>` num DOM de bolso e disparam teclas; mordida verificada (tirar as guardas reprova 2) |
| **b** | Aviso de dreno ≤1/h + calado com fila vazia | **medido: 9558 de 9784 linhas do `f10.log` eram este aviso — 97,7%.** 10 testes |
| **c** | `?capture=1` no Ledger + `capturar-ledger.mjs` | **premissa refutada**: o capture leva **148 ms**, não >5 s. O defeito real era visual e está medido (textura só nos primeiros 800 px de 5142). 13 testes, o principal de **cobertura** |
| **d** | `version-sync.yml` verde | **causa encontrada: não era YAML válido.** 60/60 corridas mortas a 0 s desde 2026-08-29T23:02Z. Corrigido + `workflow_dispatch` com ensaio + `tools/workflows-lint.mjs` para a classe |
| **e** | `nd-registry.json` + `nd-check.mjs` + launchd semanal | 18 testes. **Não corrido, não instalado** |

### W1 — instrumento
| | o que | prova |
|---|---|---|
| **f** | `receipts-check.mjs` — a citação existe, mas *diz aquilo*? | **medido sobre 1072 achados: bate 264 (24,6%) · sem-evidência 175 (16,3%) · linha-errada 202 (18,8%) · sem-alegação 431 (40,2%)**. 26 testes |
| **g** | `enrich.mjs` — contexto determinístico, `ast-grep 0.45.3` instalado | 18 testes, dois deles negativos: não julga (M2) e declara a degradação |
| **h** | `replay-sample.mjs` + **50 pacotes** em `_handoff/replay-50/` | estratificação: não-discrimina 28 · trivial 21 · não-é-problema 1. **Não rotulei nada** |
| **i** | `score` em modo sombra (M3) | limiar `n/d`; `podeFiltrar()` devolve `false` **mesmo com 100 keeps**; um teste varre o motor à procura de comparações com o score |
| **j** | Faixa OPERATE + a skill devolve o URL vivo | 13 testes |
| **k** | Beacon: chave de deploy + pasta isolada, **DESLIGADO** | `_handoff/BEACON-DEPLOY-KEY.md`. Ganho imediato: o publicador deixou de poder escrever em qualquer sítio do vault |
| **l** | `Retry-After` + backoff exponencial + `throttled` ≠ `stale` | 12 testes |
| **m** | Snapshot agendado + idade que **pinta** passadas 24 h | molde launchd, não instalado |
| **n** | `watchdog.mjs` — vê o que o `KeepAlive` não vê | 18 testes; não relança nada (teste varre `spawn`/`launchctl`/`kill`) |
| **o** | `test:router:quick` + docs do que a CI mocka | ver abaixo — **a maior descoberta da onda** |
| **p** | CI & PRs no Ledger | **decisão: alimentar**. Medido agora: 30 PRs abertos, **18 vermelhos**, 18/19 corridas verdes |

---

## As quatro premissas do kickoff que NÃO se reproduziram

1. **kept-rate 0,26% / 782 / 49%** → medido 0,3735% / 1071 / 56,68%.
2. **«screenshot CDP >5 s»** → 148 ms (mediana de 3), 1280×5142 px. A >5 s só a
   1280×60000, que é uma propriedade do instrumento, não da página.
3. **«corrigir o `version-sync.yml`, o erro é de workflow»** → certo, e pior do
   que se pensava: o ficheiro não parseava, logo o gate contra deriva de versão
   **nunca correu** desde que nasceu.
4. **«a suite do router demora 40+ min»** → ela corre em **4,3 s** (1059 testes).
   Ela **PENDURA**, e o culpado está isolado: `tools/verify/render_medir.test.js`,
   sozinho, 5 tentativas → `25,0s PENDUROU · 0,1s ok · 25,0s PENDUROU · 0,1s ok ·
   25,0s PENDUROU`. **3 em 5.** Havia um `node --test` do router vivo **há 2 h 11 m**
   de uma sessão anterior — matei-o. Causa **provável** (não provada): `await
   import()` de ESM a partir de CJS debaixo do `node --test`.

---

## POR FAZER — e cada um tem dono

| o que | porquê ficou | dono |
|---|---|---|
| **As 5 corridas de `gh workflow run version-sync.yml`** | `workflow_dispatch` só é despachável depois de o ficheiro estar no **branch por omissão**. Enquanto o PR não fundir, o GitHub não conhece o gatilho | dono (funde) → depois: `gh workflow run version-sync.yml -f tag=v1.53.0` ×5 |
| **`render_medir.test.js` pendura 3 em 5** | remendar o carregador de módulos às escuras seria trocar um defeito conhecido por um desconhecido | próxima onda |
| **Rotular os 50 do replay** | é o gesto que o M1/M2 exige — o instrumento não se auto-avalia | **dono** |
| **Ligar a chave de deploy do beacon** | gerar um segredo e registá-lo numa conta é dele | **dono** (5 passos escritos) |
| **Instalar os 4 launchd** (`nd-check`, `watchdog`, `snapshot`, `router-suite`) | são moldes; um plist com caminho absoluto falha em silêncio noutra máquina | **dono** (comando no cabeçalho de cada um) |
| **`receipts-check` a ESCREVER triagem** | fechar 175 achados sozinho no `triagem.jsonl` dele não é meu | W2, com o loop reaberto por ata |
| **2 testes vermelhos em `npm run test:design`** | `moo-tokens-build ESCREVE quando corrido` e `--ci sai 1 abaixo do limiar` — **pré-existentes**: falham com o meu trabalho em stash | não é desta onda |

---

## Auto-revisão adversarial — dois defeitos MEUS, corrigidos

1. **O registo do watchdog era um imposto crescente.** Escrevi um ficheiro
   appendado de 5 em 5 min e lido **inteiro** a cada `/saude.json` (poll de 60 s):
   ~12 MB/ano relidos a cada minuto para responder sobre 24 h. Este repositório já
   pagou esta conta (`runner-ledger` a 4,27 MB, zero rotação). Repeti o erro no
   mesmo dia em que li o comentário que o descreve. Corrigido: tecto de 3000
   linhas, sai o mais velho, leitura só da cauda.
2. **A ligação do `receipts-check` ao motor era código morto** — depois do
   `return`. Importava, corria, passava nos 112 testes do motor, e nunca escrevia
   campo nenhum. Um teste sobre o *texto* teria aprovado. Os testes novos **correm
   uma ronda**.

## Números finais

```
suite do cockpit    1273 testes · 1271 ok · 0 falhas
test:router:quick    413 testes ·  0 falhas · 2,8 s
design:check        10,00 / 10 (limiar 8)
lint:workflows      18 workflows · 0 fugas
classify.js         427d8c0b…4bc48f  (intacto)
captura do Ledger   148 ms (tecto 5000)
```

~130 testes novos. Zero números inventados; onde não medi, está `n/d` com o motivo.
