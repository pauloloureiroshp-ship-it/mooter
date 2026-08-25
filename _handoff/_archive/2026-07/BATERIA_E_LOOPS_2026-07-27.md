# Bateria multi-LLM, loops de self-learning e um bug de actualização
**Data:** 2026-07-27 · **Repo:** v1.20.0 (`44c9a80`) · **Conector em execução:** v1.19.0

---

## 1. A bateria — o número que define o produto

Mesma pergunta factual, quatro motores, resposta **verificável** contra `localfirst.js`
(6 regras em `SO_NUVEM` · `CONTEXTO_MAX_LOCAL_CHARS = 18000` · campo `forcado_por_quota`).

| Motor | Modelo | Acerto | Tempo | Custo | Custo por resposta certa |
|---|---|---|---:|---:|---:|
| **moo** | qwen2.5-coder:14b | **3/3** | **7 s** | **$0** | **$0** |
| codex | default CLI | **3/3** | 69 s | n/d | n/d |
| cc | claude-sonnet-5 | n/d honesto | 40 s | $0,44 | — |
| gemini | default CLI | ❌ exit 1, saída vazia | 6 s | n/d | — |

**A GPU local ganhou nas três dimensões** — mesmo acerto, 10× mais rápida que o Codex, e $0,44
mais barata que o Sonnet. Não é "quase tão boa"; foi melhor.

**O `cc` comportou-se de forma exemplar e ainda assim custou dinheiro:** estava numa worktree
antiga sem o ficheiro e **disse `n/d` em vez de inventar**. O erro foi da orquestração, não dele.

---

## 2. Bug apanhado pela própria bateria

O Codex foi **automaticamente relocalizado** ("a pasta pedida não tem
packages/mooter-bridge/localfirst.js") e o `cc` **não foi**. A mesma protecção existe para um
motor e não para outro — e custou **$0,44 reais** para receber um `n/d`.

**Dono:** MTO. **Correcção:** o relocate por ficheiro-em-falta tem de valer para todos os motores.

---

## 3. Os dois loops entregues (v1.20.0, `44c9a80`)

### Sentinela — o loop horário
`sentinela.js` corre o scorecard, compara com o snapshot anterior e regista **só transições**
(`entrou_fora`, `recuperou`) em `~/.mooter/sentinela/<data>.jsonl`. Custo $0, sem LLM, sem rede.

> **Regra de desenho inegociável, escrita no topo do ficheiro: a sentinela escreve, não grita.**
> Um alarme de hora a hora seria a maneira mais rápida de destruir a confiança no painel. O aviso
> é do Conselho, uma vez por dia. Repetir "continua fora" todas as horas é ruído.

### Aferição — o benchmark interno
`afericao.js` + `afericao-tarefas.json`: tarefas com resposta conhecida, avaliação tolerante a
formatação (`"6"`, `"6 regras"`, `"São 6."` acertam; `"algumas"` devolve **`null`**, nunca `false`
por preguiça), e a métrica que nos define: **custo por resposta certa** por motor.

Testes: sentinela 3/3 · aferição 6/6 · board 14/14 · fleet 25/25 · **23 suites verdes no nativo**.

---

## 4. Contra que benchmark nos medimos (e contra qual não)

Números públicos de Julho/2026: Terminal-Bench 2.1 — Codex CLI+GPT-5.5 **83,4%**, Claude
Code+Fable 5 83,1%; SWE-bench Pro — Fable 5 **80,3%**.

⚠️ **Estes benchmarks medem o motor, e nós não somos um motor.** Copiá-los seria competir na
dimensão errada e perder sempre. A régua que nos favorece — e que é honesta — é **custo e latência
por tarefa resolvida, com a fatia feita a $0**. Hoje: $0 e 7 s contra $0,44 e 40 s.

---

## 5. 🔴 Bug novo: a actualização deixou de caber no timeout do host

`mooter_setup({atualizar:'aplicar'})` estoura os 30 s do host desde que o bundle passou a 32
ficheiros (563 KB). Nas versões anteriores completava *apesar* do erro; **nesta deixou de
completar** — o conector continua em 1.19.0 com a 1.20.0 no disco.

**Uma actualização que só funciona enquanto o produto é pequeno não é uma actualização.**

**Correcção proposta:** tornar o `aplicar` assíncrono — devolver imediatamente `{estado:'a
instalar', job}` e deixar o painel/`ver` reportar a conclusão. **Dono:** MTO.

**Entretanto:** a v1.20.0 instala-se pelo **botão Actualizar do painel** ou no próximo arranque.

> Nota de honestidade sobre um erro meu: escrevi um script para aplicar o bundle por fora e ele
> reportou "instalada: 1.20.0". Era falso — o script carregou o `update.js` do **repo**, e por isso
> mediu a pasta do repo em vez da pasta de instalação. O conector vivo é quem sabe, e diz 1.19.0.
> Fica registado porque é exactamente a classe de erro que este produto existe para não cometer.
