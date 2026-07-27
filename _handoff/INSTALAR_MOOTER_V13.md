📥 **COLAR EM:** nada — este é o guia. Os blocos marcados `⌨️` são para colar onde diz cada um.

# 🐮 Instalar o Mooter v1.3 no Cowork — 2 minutos

> ✅ **Já feito por mim, autonomamente (2026-07-25):**
> · suite completa corrida **no teu Windows** — 33/33 verdes (`audit` 11 · `v12` 17 · `moo` 5)
> · GPU confirmada ao vivo: **RTX 4090**, driver 610.62, 38 % · 6144/23028 MB · 54 °C · 101 W
> · `claude`, `codex` e `gemini` **todos no PATH** (`AppData\Roaming\npm\`)
> · caminho com espaço validado (`buildCommand` devolve argv, não quoting de shell)
> · sha256 do bundle **confere na tua máquina**
> · **commit local feito**: `d5c6360` em `chore/mooter-20-h0`, 17 ficheiros, +3945/−37 — **sem push**
> · o caminho do `.mcpb` já está **na tua área de transferência**
>
> Falta-te **só o Passo 2**. Os passos 1 e 5 já não são necessários.

Está tudo empacotado. `_handoff/mooter-v130.mcpb` · 197 931 bytes · 14 ficheiros ·
sha256 `f81c7123e6f1d066f694cac92a6ffdf9c15503a2c8de2962ba5ab3a00273c9b9` · **75 testes verdes**.
O `pack-mcpb.mjs` usa timestamps fixos, por isso reconstruir dá **sempre o mesmo sha** — é assim que
sabes que o que instalas é o que foi testado.

---

## Passo 1 · Pré-voo (1 min, duplo clique)

Abre o Explorador em `C:\Users\Paulo Loureiro\frugal\_handoff\` e faz **duplo clique** em
**`RUN-MOOTER-V13-PREFLIGHT.bat`**.

Só lê. Diz-te, numa página: se o bundle é o testado (sha), que versão está instalada agora, se o Ollama
responde, qual é a GPU, se `claude`/`codex`/`gemini` estão no PATH, **quantos jobs ficaram presos**, e se
o vault é detectável. Grava `_handoff/mooter-v13-preflight.log`.

⚠️ Se disser `sha diferente do testado`, para e avisa-me — não instales.

## Passo 2 · Instalar (2 min, é o único passo que só tu podes fazer)

`Settings` → **Desktop app → Extensions** → `mooter` → **Uninstall**
→ **Advanced settings → Install Extension…** → escolhe:

```
C:\Users\Paulo Loureiro\frugal\_handoff\mooter-v130.mcpb
```

→ confirma que diz **Version 1.3.0** → **fecha o Claude Desktop por completo, tray incluída** → reabre.

❌ Não uses: `claude_desktop_config.json` · `Add ⌄` em Plugins · Settings → Developer.
Nenhuma delas é a superfície certa — já foi provado em 24/07.

## Passo 3 · Verificar (30 s, numa task NOVA)

⌨️ **Cola isto numa task nova do Cowork:**

```
Corre mooter_fleet e diz-me, em 5 linhas: a versão do servidor, quantas tools vês,
o nome da GPU e a utilização, se a vaca aparece no painel, e se há jobs presos.
Depois corre mooter_cancel(sweep:true) e diz quantos fechaste.
```

**Está bem se:** aparecem **13 tools** (eram 9) · o painel tem a **vaca** no cabeçalho · o rodapé diz
`cloud … out · local … out` · e existe `mooter_work`.

## Passo 4 · A primeira magia (2 min)

⌨️ **Na mesma task:**

```
mooter_work com goal "lista os 5 ficheiros maiores de packages/mooter-bridge e diz para
que serve cada um", prepare:true. Depois mostra-me o painel enquanto corre.
```

Devias ver: a GPU local a escrever o brief primeiro (**$0**), e o agente pago a arrancar **sozinho** já
com esse trabalho dentro do prompt — com a seta `qwen2.5:3b → sonnet` na secção **Handoffs**.

## Passo 5 · Commit (gate teu)

⌨️ **Cola numa sessão Claude Code nativa** (não aqui — git irreversível é sempre nativo):

```
cd ~/frugal
git add packages/mooter-bridge/telemetry.js packages/mooter-bridge/moo.js \
        packages/mooter-bridge/plan.js packages/mooter-bridge/journal.js \
        packages/mooter-bridge/gpu.js packages/mooter-bridge/pack-mcpb.mjs \
        packages/mooter-bridge/icon.png packages/mooter-bridge/manifest.json \
        packages/mooter-bridge/bundle-package.json \
        packages/mooter-bridge/seamless.js packages/mooter-bridge/fleet.js \
        packages/mooter-bridge/server-apps.js packages/mooter-bridge/fleet-ui.html \
        packages/mooter-bridge/v12.test.js packages/mooter-bridge/moo.test.js \
        packages/mooter-bridge/audit.test.js packages/mooter-bridge/fleet.test.js
git status --short packages/mooter-bridge
git commit -m "feat(mooter-bridge): v1.3 — router liga ao CLI, tier local, telemetria real, painel honesto

- --model passa ao CLI (T1 haiku / T2 sonnet / T3 opus; T5 nunca auto)
- adapter moo: Ollama despachavel, tokens e tok/s medidos, custo de API = 0
- stdin fechado no spawn (ressuscita o codex) + taskkill /T no Windows
- telemetria por stream-json: modelo real, tokens, accao em curso, ficheiros tocados
- painel: wave activa, plano com risco e autoria, GPU real, handoffs provados, auto-auditoria
- 12 achados de auditoria adversarial corrigidos, 11 com teste de regressao
- 75 testes verdes"
```

⚠️ **Nunca `git add -A`** — há 1500+ ficheiros não rastreados nessa árvore.
❌ Não commitar: `.pre-cw0/`, `README.bundle.md`, `README.md.bundle-src` (resíduos do CW0).
Push é decisão tua, depois de veres o diff.

---

## Depois disto — a ordem que eu seguiria

| # | O quê | Porquê agora | Onde |
|---|---|---|---|
| 1 | **Correr a suite no Windows** | 75 testes verdes... **em Linux**. `taskkill`, `shell:true` e caminhos com espaços são exactamente onde parte | `cd packages\mooter-bridge && node audit.test.js` |
| 2 | **Provar o codex** | corrigido, **nunca visto a funcionar**. Um dispatch codex fecha 3 meses de dúvida | `mooter_work goal:"…" agent:"codex"` |
| 3 | **Apagar o parasita do vault** | o bug #2 deixou lá um ficheiro meu | `30-learnings/2026-07-25-nota-da-wave*.md` |
| 4 | **Wave real com o super masterprompt** | é o teste do produto, não do código | `_handoff/MOOTER_V13_DRYTEST_E_MASTERPROMPT_2026-07-25.md` §6 |
| 5 | **Prova do Live Preview (2 h)** | declarar `frameDomains` e ver se o host aceita `localhost` no iframe. Passa → wave própria. Falha → screenshot por job | wave nova |
| 6 | **Adapter do codex + allowedTools** | hoje o codex corre `--sandbox workspace-write` e **ignora a matriz de permissões** — o masterprompt é a única barreira | wave nova |
| 7 | **`SYNC.md`** | parado em **13/07**; não conhece M1/M2/M3 nem a v1.3 | gate teu |

**O que continua fora de alcance, e é honesto dizer:** a instalação será sempre manual
(`%APPDATA%\Claude\Claude Extensions` não é concedível ao Cowork), o `sessions_fresh` é `false` em todas
as chamadas nesta máquina, e o `moo` não lê ficheiros — prepara bem, mas às cegas.

🤝 **SOCIO:** o passo 1 custa 1 minuto e evita instalar um bundle errado; o passo 5 é o único
irreversível e fica todo do teu lado. Nada aqui toca `classify.js` (FROZEN) nem `packages/*` congelados.
