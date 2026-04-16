# frugal — Privacy at a Glance

> **Versão curta:** frugal nunca envia os teus prompts para lado nenhum. O texto que escreves fica sempre na tua máquina.

---

## O que fica NA TUA MÁQUINA (sempre)

| Ficheiro | Conteúdo | Sai alguma vez? |
|---|---|---|
| `decisions.log` | Cada decisão do router: tier, categoria, confiança, ms | Só fragmentos anónimos via delta opt-in |
| `execution.log` | Modelo real usado por Bash call, tempo, subagent spawn | Nunca — uso local para statusline |
| `.last-classified.json` | Classificação do último turn: tier, signals, flags | Nunca — sobrescrito no próximo turn |
| `router-tuning.json` | Padrões aprendidos localmente pelo backtest | Nunca — só o delta agregado sai |
| Chaves de API | `ANTHROPIC_API_KEY`, etc. | Nunca — variáveis de ambiente |
| **Texto dos teus prompts** | Cada palavra que escreves | **NUNCA** |

---

## O que PODE sair (delta anónimo, opt-in)

Quando corres `node backtest.js --export-delta && node hub-push.js`, um fragmento agregado é enviado para o frugal-hub. Esse fragmento contém:

| Campo | Exemplo | Inclui texto do prompt? |
|---|---|---|
| Distribuição de tiers | `{T0: 0.62, T1: 0.18, T2: 0.15, T3: 0.05}` | ❌ |
| Hardware tier | `"gpu-mid"` | ❌ |
| Sinais de keywords (allow-list) | `["refactor", "test", "bug"]` | ❌ — só palavras pré-aprovadas |
| Versão do frugal | `"0.9.4"` | ❌ |
| Instance ID | `"a3f9b2c1"` (SHA-256 do machine-id, primeiros 8 chars) | ❌ — não reversível |
| Nº de eventos (bucket) | `"50-100"` | ❌ |

**O delta NUNCA contém:**
- ❌ Texto de prompts ou substrings
- ❌ Caminhos de ficheiro
- ❌ Nomes de variáveis, funções ou classes
- ❌ Stack traces
- ❌ PII (nome, email, IP, hostname)
- ❌ Timestamps exactos (só hora arredondada)

Este comportamento é aplicado em código no `event-builder.js` através do **Privacy Contract** — uma lista explícita de campos proibidos que é validada antes de qualquer envio.

---

## Como desactivar completamente

```bash
# Adiciona ao ~/.bashrc / ~/.zshrc / PowerShell profile:
export FRUGAL_TELEMETRY=off
```

Com `FRUGAL_TELEMETRY=off`, o frugal não escreve para `decisions.log` e nunca executa hub-push. O routing continua a funcionar normalmente — só perdes o statusline de poupanças e o auto-learning.

---

## O frugal-hub

O hub em `mooter-hub.frugal-hub.workers.dev` (Cloudflare Workers) recebe deltas anónimos e devolve padrões de routing melhorados. Garantias:

- **TTL 7 dias** — dados eliminados automaticamente
- **Validação de schema** — payload mal-formado é rejeitado (não truncado)
- **Threshold de privacidade** — padrão só entra no modelo se vier de ≥ 5 instâncias diferentes
- **Sem logs de IP** — o Worker não guarda o IP da ligação

---

## execution.log — uso exclusivamente local

O `execution.log` regista o modelo real que o Claude Code usou em cada Bash call:

```
[2026-04-11T14:23:01Z] sess-abc123 claude-haiku-4-5 assistant bash:npm_install 340ms inline
```

Este ficheiro **nunca sai da tua máquina**. É lido pelo `savings-tracker.js` para mostrar o painel real no statusline. Podes apagá-lo a qualquer momento sem consequências para o routing.

---

## Quality signals (v0.9.5+, opt-in separado)

Uma funcionalidade futura permitirá enviar ratings explícitos (1-3 estrelas) para o hub. Isto será **opt-in separado** com `FRUGAL_QUALITY_FEEDBACK=on`, seguindo as mesmas garantias de privacidade do delta.

---

## FAQ

**"O frugal vê o meu código?"**
Não. O `classify.js` analisa o texto do prompt apenas em memória RAM para escolher o tier. Não guarda, não loga, não envia.

**"A Anthropic vê mais alguma coisa por causa do frugal?"**
Não. O frugal emite um `<router-hint>` no contexto do Claude Code — um bloco de texto que ajuda o Claude a escolher o modelo. A Anthropic vê exactamente o mesmo que veria sem o frugal.

**"E se apagar o decisions.log?"**
O router continua a funcionar. Perdes o histórico de poupanças e o auto-learning volta ao zero. Podes apagá-lo a qualquer momento.

**"Posso ver o que um delta contém antes de ser enviado?"**
Sim. Corre `node backtest.js --export-delta --dry-run` para ver o JSON que seria enviado, sem enviar nada.

**"Como sei que o Privacy Contract está a ser cumprido?"**
O código de `event-builder.js` tem o contrato declarado no topo do ficheiro e é open source. Podes auditar cada campo que é construído antes de qualquer envio.

---

*frugal é open source (MIT). Código em https://github.com/pauloloureiroshp-ship-it/frugal*

*Última actualização: Abril 2026*
