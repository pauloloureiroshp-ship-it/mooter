# MASTER PROMPT — A camada MEO, de M0 a M3
**Base:** `chore/mooter-20-h0` @ v1.15.0 · **Doutrina:** `docs/strategy/GOVERNANCA_MEO.md`
**Regra que atravessa tudo:** cada fase entrega **uma coisa que o MEO sente**. Se não reduz
interrupções, não aumenta trabalho a $0 ou não apanha um erro que passaria — não entra.

---

## A regra de ouro deste master prompt

> **Nenhum M-level nasce como agente novo antes de existir o scorecard que ele lê.**
> A ordem é: primeiro os números, depois as vozes. Ao contrário, ficamos com seis agentes a
> opinar sobre um JSON vazio — que é exactamente o teatro que este desenho quer evitar.

Sequência obrigatória:

```
M0 (sondar o que o cliente aguenta)  →  M1 (scorecard + excepções, ZERO agentes)
                                              ↓
                    M2 (as vozes: skills por cargo + conselho a $0)
                                              ↓
                    M3 (distribuição: plugin) ···· M4 (mesh multi-GPU, só se houver fila)
```

---

## M0 · Sondar antes de desenhar (1 job, meio dia)

**Experiência-alvo:** deixamos de adivinhar o que o Cowork suporta.

| # | Tarefa | Critério de aceitação |
|---|---|---|
| 0.1 | Sonda de capacidades do cliente MCP: tentar `elicitation`, `sampling`, `resources`, `prompts`, `roots` e registar o que o cliente aceita | `~/.mooter/mcp-capabilities.json` no formato do `ui-probe.json`: `{capacidade, suportado, porque, medido_em, ms}`. **Nunca `true` sem ter tentado** |
| 0.2 | Expor o resultado no painel e no `mooter_setup` | O painel diz "onboarding no Cowork: suportado/n/d" com a razão |
| 0.3 | Escrever o resultado em `INFRA.md` | Uma tabela com data. Se a spec mudar, sabemos contra o que testámos |

**Porquê primeiro:** metade do desenho de M2 e do onboarding depende disto. Testar custa um job;
assumir custa uma onda inteira mal desenhada.

---

## M1 · O scorecard e as excepções (o coração — sem um único agente novo)

**Experiência-alvo:** o MEO abre uma coisa só e sabe o estado da empresa. E deixa de ser chamado
para o que está dentro da faixa.

Ficheiro novo: `packages/mooter-bridge/board.js` (+ `board.test.js`).

| # | Tarefa | Critério de aceitação |
|---|---|---|
| 1.1 | `scorecard()` — consolida, **sem LLM**, a partir do ledger + `quota.js` + `aprender.js` + `gpu.js`: entrega/dia, lead time até 1º token útil, taxa de falha, tempo de recuperação, keep rate, custo por tarefa, % a $0, pressão de quota, WIP | Cada métrica traz `{valor, fonte, medido_em, faixa:[min,max], estado:'dentro'|'fora'|'n/d'}`. **`n/d` é estado de primeira classe**, nunca 0 |
| 1.2 | Faixas configuráveis em `~/.mooter/preferences.json → board_faixas`, com defaults declarados como defaults | O painel diz de onde veio cada faixa (default vs calibrada), como já faz a referência de quota |
| 1.3 | `excepcoes()` — só o que está fora de faixa, com dono (M-level), há quanto tempo, e o que muda se ninguém agir | Uma excepção sem dono é um bug: o teste falha |
| 1.4 | Persistência em `~/.mooter/scorecard.json` + histórico diário em `~/.mooter/board/<data>.json` | Idempotente; reescrever o mesmo dia não duplica |
| 1.5 | **Assíncrono e barato**: `scorecardAsync()` que cede o event loop (lição da Onda 2: 209 ms de bloqueio) | Teste que mede o pior gap do event loop < 120 ms com 5 000 eventos |
| 1.6 | Expor no `mooter_fleet` como `view:'board'` e, se M0.1 disser que dá, também como **MCP resource** | O MEO lê o scorecard sem gastar uma tool call |

**Prova de fim de M1:** um número real por métrica, ou `n/d` com o porquê. E a pergunta que o
scorecard tem de responder sozinho: *"posso ir dormir?"*

---

## M2 · As vozes (skills por cargo + conselho a $0)

**Experiência-alvo:** cada departamento tem uma conversa própria, e o MEO só ouve as excepções.

| # | Tarefa | Critério de aceitação |
|---|---|---|
| 2.1 | Seis skills: `meo-moo`, `meo-mto`, `meo-mfo`, `meo-mio`, `meo-mro`, `meo-mcc`. Cada uma lê **só a sua fatia** do scorecard e responde às perguntas-âncora do §3.2 da doutrina | Cada resposta tem evidência (ficheiro:linha, comando, valor do ledger) ou `n/d`. Um M-level que gera um número que não está no scorecard **falha o teste** |
| 2.2 | `_boardroom/<cargo>-<data>.json` com `{gerado_em, ledger_offset, hash_scorecard, respostas[], excepcoes[], recomendacoes[{o_que, quem_decide, custo, reversivel}]}` | `quem_decide` é obrigatório (RAPID). Recomendação sem dono não é aceite |
| 2.3 | Skill `meo-conselho`: consolida os artefactos por `ledger_offset`, não por hora | Entrega **uma página**: scorecard, ≤3 excepções, ≤1 decisão pedida ao MEO. Se não houver excepção, escreve "sem excepções" e **não pede nada** |
| 2.4 | **Custo declarado e local por omissão**: o conselho corre no `moo`; só sobe de tier na divergência entre M-levels ou quando o MEO está presente | O artefacto traz `custo_usd` medido (0 no local) e `tier_usado`. Teste: um conselho sem divergência nunca chama a nuvem |
| 2.5 | Níveis de autonomia L0–L3 do §7, calculados pelo `aprender.js` por (cargo × categoria) | Um incidente de risco desce um nível **no mesmo evento**, com registo. Teste com ledger sintético |
| 2.6 | Orçamento diário por cargo; ao estourar, continua em local e **informa** (não pede) | Teste: com orçamento a 0, o M-level entrega na mesma, com nota |
| 2.7 | Se M0.1 confirmar `prompts`: expor `/conselho` e `/mfo`… como **prompts MCP** em vez de só skills | Se não confirmar, ficam skills — e o `n/d` fica escrito |

**❌ Proibições explícitas nesta fase**
- Um M-level **não** fala com outro (hub-and-spoke).
- Um M-level **não** executa nada irreversível, seja qual for o nível de autonomia.
- Nenhum cargo novo além dos seis. `MPO` **não existe** — produto é do MEO.
- Nenhum M-level pode inventar uma métrica: só lê as do `board.js`.

**Prova de fim de M2:** durante 5 dias reais, contar quantas vezes o MEO foi chamado. A meta é
**≤1 por dia**, e a contagem tem de estar no scorecard — senão estamos a acreditar, não a medir.

---

## M3 · Distribuição (o plugin)

**Experiência-alvo:** alguém que não te conhece instala a empresa num comando.

| # | Tarefa | Critério de aceitação |
|---|---|---|
| 3.1 | Empacotar como plugin: conector + skills M-level + comandos + agentes | Instalação num comando, num ambiente limpo, sem passos manuais |
| 3.2 | Onboarding dentro do Cowork — por `elicitation` se M0.1 confirmar; senão, painel de setup no MCP Apps (o mesmo mecanismo do Live Preview) | Um utilizador novo chega ao primeiro job sem abrir um terminal |
| 3.3 | `README` que mostra um número medido nos primeiros 30 segundos | Ex.: a inflação de quota medida **na máquina de quem instala**, não na nossa |
| 3.4 | Demonstração sem chaves de API (só GPU local) | Corre em máquina sem Ollama? Então diz `n/d` com elegância e mostra o resto |
| 3.5 | Candidatura ao directório oficial de plugins | Critérios cumpridos e verificados um a um |

---

## M4 · Mesh multi-GPU (só quando houver fila que o justifique)

**Não começar sem este gate:** *nos últimos 14 dias, ≥20% dos jobs esperaram por GPU ocupada.*
Se o número não existir, a resposta é `n/d` e M4 não abre. Hoje o gargalo é decisão e verificação,
não silício.

Quando abrir: registo de nós (VRAM, modelos, latência) · fila com afinidade de modelo quente ·
transporte do ledger entre nós · jobs assinados. Nada disto depende da Anthropic.

---

## Como se executa (o método que já provou dar resultado hoje)

1. **Cowork conduz e verifica.** Briefs curtos, diffs lidos por inteiro, gates.
2. **Codex implementa** (quota separada). Jobs de ≤30 min: se a entrega for maior, parte-se.
3. **`moo` local analisa a $0** — leitura, mapeamento, comparação.
4. **Runner nativo** (`.ps1` + `.bat`, **só ASCII**) corre as suites e faz o commit selectivo.
5. Nada entra sem: suites verdes **no nativo**, diff lido, e o guard de coerência do bundle.

**Cinco armadilhas já pagas nesta sessão — não repetir:**
- O sandbox dá **falsos-verdes** (testes saltados sem git). O gate é o runner nativo.
- Um commit pode chamar uma função que não incluiu (`quota.estadoAsync`). Verificar sempre.
- Ficheiro novo obriga a entrada no `pack-mcpb.mjs`, senão o bundle sai partido.
- Acrescentar campos a um objecto pode empurrar outro para fora da janela de um teste (guard A4):
  campos que provam honestidade vão **primeiro**.
- PS 5.1: `Start-Process -PassThru` devolve `ExitCode` nulo; acentos num `.ps1` sem BOM rebentam o
  parse **antes** do transcript.

---

## O critério final, e é um só

> Ao fim de M2, o Paulo deve conseguir passar um dia inteiro sem abrir o Mooter — e no dia
> seguinte, em duas páginas, saber tudo o que aconteceu, o que foi decidido sem ele, e as três
> coisas que só ele pode decidir.

Se isso acontecer, temos uma empresa. Se não, temos um painel — e um painel já tínhamos.
