# 🖥️↔️💻 CROSS-DEVICE RECON — porque é que o Live Preview falhou no MacBook

> **Frente 1 do §7** do `LIVE_PREVIEW_FABLE5_MASTER_HANDOFF.md`. Recon **read-only** sobre o código
> SERVIDO (`main @ 84871dc`, vsix `v0.16.59`), não sobre a árvore suja de `~/frugal`.
> **Regra-mãe respeitada: PROVA, não afirmo.** O que está marcado ✅ PROVADO tem repro executável;
> o que está 🟡 tem mecanismo provado mas gatilho por confirmar no Mac (só o Paulo tem o MacBook).
> **Data:** 2026-07-08 · Autor: Cowork (Opus, beast) · Estado: **recon completo, fix por aplicar (aguarda OK)**.

---

## 0. TL;DR (uma tabela)

| # | Causa candidata | Evidência | Prob. de ser o gatilho no Mac | Onde |
|---|---|---|---|---|
| **C1** | **Tree-gate case-sensitive no posix** — `path.relative` é *case-insensitive* no Windows e *case-sensitive* no Mac/Linux. Qualquer diferença de maiúsculas entre o workspace e a árvore servida → gate FAIL-CLOSED só no Mac | ✅ **PROVADO** (repro Node, §2) | 🟡 **Alta** (mecanismo certo; falta confirmar que há mismatch de casing no setup do Paulo) | `extension.js` `_treeConfirmed` L1320-1326 + 6 write-paths |
| **C2** | **Não existe launcher para Mac** — `prove-live-edit.cmd` é Windows-only **e nem sequer está no git** (untracked, só em `~/frugal`). Sem `.sh`/`.command`, o fluxo "armar preview" nunca arranca da forma documentada | ✅ **PROVADO** (`git ls-files` vazio; nenhum `.sh` equivalente) | 🟡 **Alta** (bloqueia o onboarding; pode ser o "não funcionou" literal) | `_handoff/prove-live-edit.cmd` |
| **C3** | **realpath fallback não canonicaliza casing** — em `_setServedRoot`, se `realpathSync` falha, cai para `path.normalize` que **preserva** o casing → alimenta C1 | ✅ código lido (L1306-1312) | 🟢 Média (amplifica C1) | `extension.js` L1309 |
| **C4** | Detector de porta / iframe / CSP | ✅ lido — `lp-stage.js` é **puro e cross-platform** (regex + portas comuns + origin-lock localhost). **Ilibado.** | 🔴 Baixa | `lp-stage.js` |
| **C5** | Paths absolutos hardcoded (`C:\…`) no host | ✅ lido — os únicos `C:\` são o *finder* do binário `claude` (L164-173), que **já tem ramos Unix** (`/opt/homebrew/bin/claude`). **Ilibado.** | 🔴 Baixa | `extension.js` L164-173 |

**Leitura honesta:** há **duas** causas de alta probabilidade (**C1** código + **C2** onboarding), e são **independentes** — podem ter mordido as duas ao mesmo tempo. Nenhuma delas é observável no Windows (por isso "só funcionou no Windows"). O fix tem de fechar ambas.

---

## 1. O caminho do sinal (mapeado ponta-a-ponta, com citações)

```
landing/next.config.ts  resolveServedRoot() = realpathSync(process.cwd())   [L41-47]
      │  (só em DEV; env NEXT_PUBLIC_LP_ROOT tree-shake p/ undefined em prod)   [L57]
      ▼
landing/app/_components/lp-error-tap.ts  lê process.env.NEXT_PUBLIC_LP_ROOT   [L267-274]
      │  post({ type:'lp-ready', servedRoot })                                  [L807]
      ▼
extension.js (webview relay)  m.type==='lp-ready' → postMessage lp-tree{servedRoot}  [L4043]
      ▼
extension.js (host)  m.type==='lp-tree' → _setServedRoot(m.servedRoot)          [L1442]
      │  next = realpathSync(raw)  ||  path.normalize(raw)  → this._servedRoot   [L1306-1312]
      ▼
extension.js  _treeConfirmed():  wsReal = realpathSync(_wsRoot())               [L1320-1326]
      │  if (sr === wsReal) return true;               ← strict-eq, case-sensitive no posix
      │  within(parent,child) = !path.relative(...).startsWith('..')  ← case-sensitive no posix
      ▼
_treeGateBlocked()  → bloqueia os 6 caminhos $0 (edit/delete/prompt/…)          [L1333-1334]
```

O gate é **fail-closed by design** (`_servedRoot=null` no ctor → bloqueado até um `lp-tree` válido confirmar
a linhagem). Isso é correto para segurança (evita o incidente 06:49 das twin-worktrees). **O problema não é
o design — é a comparação de paths ser case-sensitive no Mac.**

---

## 2. ✅ PROVA EXECUTÁVEL da C1 (o núcleo)

Copiei o miolo EXATO de `_treeConfirmed` (L1320-1326) e corri-o com as duas semânticas de path na mesma máquina:

```
SCENARIO A: served = workspace/landing, casing IDÊNTICO (happy path)
win32    -> CONFIRMED (edit allowed)
posix    -> CONFIRMED (edit allowed)

SCENARIO B: casing difere em UM componente (VS Code guardou "frugal", cwd do dev-server realpath "Frugal")
win32    -> CONFIRMED (edit allowed)          ← Windows TOLERA
posix    -> BLOCKED  (clico e nada visível)   ← Mac/Linux FALHA

SCENARIO C: casing da raiz difere (realpath devolve outro casing na raiz)
win32    -> CONFIRMED (edit allowed)
posix    -> BLOCKED  (clico e nada visível)

VERDICT: Scenario B/C => DIVERGENCE PROVEN
Windows path.win32.relative é CASE-INSENSITIVE; macOS/Linux path.posix.relative é CASE-SENSITIVE.
```

> Repro guardado no scratchpad (`gate-proof2.js`) — 30 linhas, reproduz em qualquer máquina. A divergência
> é do **Node `path`**, não de teoria: é a assinatura exata de "só funcionou no Windows".

**Porque é que isto é subtil:** ambos os lados passam por `realpathSync`, e no macOS o `realpath(3)` normalmente
canonicaliza o casing on-disk — **quando o path existe**. Mas basta um dos dois cair no **fallback**
(`_setServedRoot`: `catch { next = path.normalize(p) }`, L1309) ou o `_wsRoot()` do VS Code chegar com casing
diferente do on-disk, para o casing divergir e o gate fechar. **É latente, mas o mecanismo está provado.**

**Agravante — a MESMA comparação está nos 6 write-paths**, não só no gate:
`_openSourceFile` (L1524), `_applyEdit` (L1569), `_deleteNode` (L1735), `_resolveContainedFile` (L1781),
`_openErrorFile` (L1480), prompt-apply (L2074). Todos usam
`const contained = (root, abs) => { const r = path.relative(root, abs); return !!r && !r.startsWith('..') && !path.isAbsolute(r); }`.
Ou seja: mesmo que o gate passasse, cada abertura/escrita de ficheiro volta a falhar no Mac sob mismatch de casing.

---

## 3. 🔬 O PROBE do Mac (isto é o que confirma o gatilho — instrumentar, não adivinhar)

Não consigo reproduzir no Mac a partir do Windows. Este probe de **3 comandos** no MacBook do Paulo diz-nos
**exatamente** qual causa mordeu (correr na raiz do repo, com o dev server do `landing/` a correr):

```bash
# 1) O que o dev server realmente serve (o valor que vira _servedRoot):
cd landing && node -e "console.log('servedRoot =', require('fs').realpathSync(process.cwd()))"

# 2) O que o VS Code guardou como workspace (o valor que vira wsReal):
#    (correr no MESMO Mac, com a pasta aberta no VS Code — ver em Command Palette > "Copy Path" da raiz)
node -e "const p=process.argv[1]; const fs=require('fs'); console.log('wsRoot   =', p); console.log('wsReal   =', fs.realpathSync(p))" "<COLA-AQUI-O-PATH-DA-RAIZ-DO-WORKSPACE>"

# 3) O veredito (cola os dois valores acima):
node -e "const path=require('path'); const [sr,ws]=process.argv.slice(1); const within=(a,b)=>{const r=path.relative(a,b);return !!r&&!r.startsWith('..')&&!path.isAbsolute(r)}; console.log('CONFIRMED =', sr===ws || within(ws,sr) || within(sr,ws))" "<servedRoot>" "<wsReal>"
```

- Se (3) imprimir `CONFIRMED = false` **→ C1 confirmado** (é o casing/lineage). Compara (1) e (2) a olho: onde diferem?
- Se o dev server nem sequer arrancou / não há porta → **C2** (falta launcher) foi o gatilho primário.
- Guardar o output no fim deste ficheiro (secção 6) fecha a incerteza 🟡→✅.

---

## 4. 🛠 FIX proposto (desenho — NÃO aplicado; aguarda OK + resultado do probe)

**Princípio:** endurecer a comparação de paths para ser **robusta a casing e a separadores** SEM enfraquecer
a propriedade de segurança do gate (não pode passar a aceitar árvores irmãs por acaso).

### 4a. Um helper único de comparação canónica (novo, aditivo)
```js
// Canonicaliza um path absoluto para comparação cross-device: resolve, e SÓ em filesystems
// case-insensitive (Windows, macOS-APFS default) baixa para lowercase. Em Linux (case-sensitive)
// NÃO baixa — preservar a semântica real do FS mantém o gate honesto e não o enfraquece.
function _canonRoot(p) {
  let r = p;
  try { r = fs.realpathSync(p); } catch { r = path.resolve(p); }
  const CI = process.platform === 'win32' || process.platform === 'darwin';
  return CI ? r.toLowerCase() : r;
}
// within() passa a comparar canónicos:
const within = (parent, child) => {
  const r = path.relative(_canonRoot(parent), _canonRoot(child));
  return !!r && !r.startsWith('..') && !path.isAbsolute(r);
};
// e a strict-eq: if (_canonRoot(sr) === _canonRoot(wsReal)) return true;
```
> **Nota de segurança (importante):** baixar para lowercase SÓ em Win/macOS espelha o comportamento REAL do
> filesystem (que trata `frugal`/`Frugal` como o mesmo diretório) — **não** abre um buraco: no Mac essas
> duas pastas SÃO a mesma. Em Linux (case-sensitive) mantemos a comparação exata. O gate continua fail-closed
> para árvores genuinamente distintas (twin-worktrees em paths diferentes continuam BLOCKED).

### 4b. Aplicar o mesmo helper aos 6 write-paths
Substituir os 6 `contained = (root, abs) => …` inline por uma chamada ao mesmo `_canonRoot`, para o
select-to-edit / delete / prompt-apply deixarem de falhar no Mac sob casing.

### 4c. Banner honesto que MOSTRA o mismatch (em vez de bloquear em silêncio)
Hoje `_treeBanner` (L1340) diz "vem de outra árvore (basename)". Sob C1 o basename é IGUAL (só muda o casing),
por isso o banner parece absurdo ("vem de landing… mas eu estou em landing"). Enriquecer o banner com os dois
paths realpath'd quando diferem só em casing → o utilizador vê a verdade em vez de um clique morto.

### 4d. Launcher para Mac (fecha a C2)
Criar `_handoff/prove-live-edit.command` (bash) espelhando o `.cmd`: arranca `cd landing && npm run dev`
(→ 7819), limpa versões antigas do vsix, instala, reabre na árvore servida. **Committar** (o `.cmd` nem está no git).

### 4e. Teste de regressão (obrigatório, cross-platform)
Adicionar a `lp-tree-host.test.js` casos que exercitam casing-mismatch com as duas semânticas de `path`
(o repro de §2 vira teste). **Gate: Windows continua a passar (prova aqui) + o caso Mac passa a CONFIRMED.**

---

## 5. Blast radius & guardrails

- Toca `extension.js` (host) — **perto do gate de segurança FIX-MP-1**. Alto risco → **T3, precisa OK do Paulo**.
- `classify.js` FROZEN — **não tocado** (nada disto lhe mexe). ✅
- Aditivo: um helper novo + 6 substituições pontuais + 1 launcher + testes. Sem reescrita.
- **Não valido no Mac a partir do Windows** — por isso o fix fica "escrito + provado no Windows + a aguardar
  validação no MacBook do Paulo". Aplicar às cegas um gate de segurança na plataforma que falha, sem o probe,
  seria violar a regra-mãe.
- Worktree própria off `origin/main` (§7) quando o Paulo autorizar.

---

## 6. Resultado do probe do Mac (a preencher pelo Paulo)

```
servedRoot (dev) = 
wsRoot (VS Code) = 
wsReal (realpath)= 
CONFIRMED        = 
→ Causa confirmada: [ C1 casing | C2 launcher | outra ]
```
