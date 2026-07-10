# Wave — Packs/MCP Supply-Chain Hardening (KICKOFF)

> **Wave number:** TBD — assign at kickoff (não inventar; segue a numeração viva).
> **Origin:** achados F1/F2/F3 da auditoria de supply chain (2026-06-25).
> Relatório: `outputs/SECURITY_packs_mcp_2026-06-25.md`. Auditor P5 já entregue:
> `tools/router/pack-scaffold-audit.js`.
> **Estado pré-wave:** SECURITY-1 (tracker v0.8.0) + SECURITY-2 (auditor estático)
> escritos no working-tree, a aguardar verificação CC (ver `SYNC.md`).

---

## 0. Porquê esta wave (e porquê é uma wave, não um hotfix)

A auditoria confirmou que **hoje não há brecha aberta**: packs são declarativos,
não correm código no install, o comando de install de MCP vem de registry curado,
e o cockpit usa `execFile` (shell:false). Os três achados são **trabalho de design
para o futuro marketplace de packs da comunidade** + tapar um trust-gap latente.

Toca ficheiros **frozen** do engine (`packages/router/src/pack_resolve.ts`,
`packages/*`), por isso **exige uma wave com allowlist explícita** — não cabe num
hotfix. `classify.js` permanece **FROZEN** (sha CI `427d8c0b…364bc48f`).

**Factos verificados (não inventar em cima destes):**
- `packs/validate.ts` valida contra `pack.schema.yaml`; já exige `metadata.author`.
- `mcp_install_registry.json` **ainda não existe** no repo → `loadMcpRegistry()`
  devolve `null` e `suggestInstallCmd` emite hoje o fallback "manual install".
  ⇒ F1 é sobre o **modelo de confiança do loader para quando o registry/cache
  existir**, não uma exploração activa.
- `pack-scaffold-audit.js` (P5) já existe e exporta `scanScaffold` / `auditPack`.

---

## 1. Allowlist desta wave (ÚNICOS ficheiros que podem ser tocados)

| Ficheiro | Acção | Feature |
|---|---|---|
| `packages/router/src/pack_resolve.ts` | **MODIFY** (frozen → allowlisted aqui) | F1, F3 |
| `packages/cli/src/commands/pack.ts` | MODIFY (gate de install + ecrã proveniência) | F2, F3 |
| `packs/validate.ts` | MODIFY (schema de assinatura) | F3 |
| `pack.schema.yaml` | MODIFY (campos `signature`/`provenance`) | F3 |
| `packs/tests/schema.test.ts` | MODIFY (+casos) | F3 |
| `packages/router/data/mcp_install_registry.json` | **CREATE** (registry curado + versão) | F1 |
| `packages/router/data/mcp_install_registry.sig` *(ou hash embutido)* | **CREATE** | F1 |
| `tools/router/pack-scaffold-audit.js` | já existe — **wire-in**, não reescrever | F2 |
| `tools/router/pack-audit.test.js` | **CREATE** (node:test do P5) | F2 |
| `packages/router/tests/pack_resolve*.test.ts` | MODIFY/CREATE | F1/F3 |

❌ **NUNCA tocar:** `classify.js` · qualquer `packages/*` fora desta lista · sem
`git add -A` (stage selectivo) · sem novos `.md` na raiz.

---

## 2. F1 — Override de registry verificado

**Problema:** `loadMcpRegistry()` dá precedência a
`~/.mooter/cache/mcp_install_registry.json` sobre o default versionado **sem
verificação**. Quando o registry passar a existir + ser cacheado, um processo
local malicioso que escreva o cache controla o comando que `pack diff` imprime
→ engenharia social para um `claude mcp add … -- curl…|sh`.

**Design (escolher A; B é o fallback):**
- **(A, recomendado) O campo `install` é sempre autoritativo do default versionado.**
  O cache pode sobrepor só campos não-executáveis (`note`, `transport`). O comando
  de install **nunca** vem do cache. Neutraliza o vector mantendo o cache útil.
- **(B) Assinatura destacada.** O cache só ganha se trouxer `…​.sig` válido contra
  uma chave pública embutida do Mooter; senão, fallback ao default + **warn**.
- **Mínimo em ambos:** quando um override está activo, o loader regista um aviso e
  o `pack diff`/`pack install` anota a origem do comando (`source: bundled|cache`).

**Aceitação F1:**
- Cache com `install` divergente do default → comando impresso vem do **default**
  (modo A) ou é **rejeitado sem assinatura** (modo B).
- Override de campo não-executável (modo A) → aplicado, mas anotado.
- Sem cache → comportamento idêntico ao actual (default/null).

---

## 3. F2 — Sanitizador de scaffold + ecrã de proveniência (wire-in do P5)

**Problema:** o `prompt_scaffold` é injectado no prompt sem análise de conteúdo.
First-party hoje; vector directo de prompt-injection quando vierem packs de
terceiros.

**Design:**
- `mooter pack install <name>` corre `auditPack()` (de `pack-scaffold-audit.js`)
  **antes** de registar. Política:
  - finding **high** → **bloqueia** install; exige `--force` + ack explícito.
  - **med/low** → instala mas imprime aviso + resumo.
- **Ecrã de proveniência pré-install** (packs não-bundled): autor, origem, e
  resumo do audit. Confirmação obrigatória.
- Mesma chamada no caminho do cockpit (`host-extra.installPack` → já sanitiza o
  nome; acrescentar o gate de audit antes do `execMooter(['pack','install'])`).
- **Defesa em profundidade (opcional):** o hook que constrói o `<pack-hint>`
  (`inject_context.js`) marca um pack que falhou audit como `unsafe_scaffold` e
  não injecta o scaffold cru.

**Aceitação F2:**
- Pack com scaffold contendo `ignore previous instructions` → install **bloqueado**
  sem `--force`.
- Pack limpo first-party → instala sem fricção.
- `--json` expõe `audit: { ok, findings }`.

---

## 4. F3 — Assinatura/atestação + forçar `validated_against`

**Problema:** packs vivem no repo (confiança = git+review). Um marketplace precisa
de identidade do autor verificável + integridade + frescura do snapshot.

**Design:**
- **Schema (`pack.schema.yaml` + `packs/validate.ts`):** novo bloco opcional
  `signature: { algo, author_key_id, value, signed_hash }`. Para packs **bundled**
  (first-party, git-trusted) é opcional; para packs **marketplace** é **obrigatório**.
- **Verificação no install:** `mooter pack install` recomputa o hash do conteúdo do
  pack e verifica `value` contra o conjunto de chaves confiáveis. Falha → bloqueia.
- **Forçar `validated_against.mcp_registry_snapshot`:** hoje só é **mostrado**
  (`lastValidated`). Passar a **gate**: recusar/avisar se o snapshot está ausente,
  mais velho que N dias, ou não bate com a versão corrente do registry.

**Aceitação F3:**
- Pack marketplace sem `signature` → **rejeitado**.
- Pack com assinatura inválida / hash alterado → **rejeitado**.
- Pack bundled sem signature → continua a passar (git-trusted).
- Snapshot stale → warn (ou block sob flag estrita).

---

## 5. Fases (commits atómicos, stage selectivo cada um)

1. **F1-loader** — `pack_resolve.ts`: `install` autoritativo do default + anotação
   de origem; criar `mcp_install_registry.json` (+ `.sig`/hash). Testes.
2. **F2-wire** — integrar `auditPack()` em `pack.ts` install + ecrã proveniência +
   `pack-audit.test.js`. Gate high-blocks.
3. **F2-cockpit** — gate de audit no `host-extra.installPack` (additivo).
4. **F3-schema** — `pack.schema.yaml` + `validate.ts` + `schema.test.ts`: bloco
   `signature` + obrigatoriedade marketplace.
5. **F3-enforce** — verificação de assinatura + `validated_against` como gate no
   install.
6. **Docs** — actualizar `.github/SECURITY.md` (§"Scope still under review" → mover
   packs para "covered") + entrada `SYNC.md`.

> Cada fase: `node --check`/`tsc` + testes da área + **sha `classify.js` intacta**
> + stage só dos ficheiros da fase + commit. Push só com OK do Paulo.

---

## 6. Gate de saída (exit criteria)

- ✅ `node tools/router/pack-scaffold-audit.js --self-test` → 6/6 (já passa).
- ✅ Novos testes F1/F2/F3 verdes; suites existentes intactas.
- ✅ Pack malicioso sintético (scaffold injection + MCP fora do registry + sem
  signature) → **bloqueado** em todas as camadas; pack first-party limpo → instala.
- ✅ `certutil -hashfile tools/router/classify.js SHA256` == `427d8c0b…364bc48f`.
- ✅ `git status`: só os ficheiros da allowlist mudaram; nada de `landing/` (Graphify
  paralelo) nem `.md` na raiz.
- ✅ Demo real: instalar um pack first-party com o gate ligado → sem fricção; tentar
  instalar o pack malicioso sintético → recusa com razão legível.

---

## 7. Riscos & notas

- **Compatibilidade:** o gate de audit não pode partir o install de packs
  first-party existentes — correr o auditor contra todos os `packs/*` antes de
  ligar o block (espera-se 0 findings high).
- **Chaves (F3):** definir onde vive o conjunto de chaves confiáveis e o processo
  de assinatura **antes** de abrir o marketplace; sem isto, F3 fica em modo
  "schema presente, enforcement só para marketplace".
- **`MOOTER_TRACKER_ALLOW_ORIGIN`** e o guard do tracker (SECURITY-1) são
  ortogonais a esta wave; não mexer.
