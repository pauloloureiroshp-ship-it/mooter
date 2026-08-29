# ADENDO ao MP-TALO-2026-08-28 — o que o radar acrescenta (2026-08-28, tarde)

**NAO substitui nada.** O `_handoff/MP-TALO-2026-08-28.md` continua a ser o prompt valido.
Este ficheiro acrescenta CONTEUDO a ondas que ja existem (W1 e W2) e corrige tres candidatos de modelo.
**Motivo de existir como adendo e nao como master prompt novo:** o MP-TALO proibe produzir mais
documentos de estrategia, e hoje ja foram escritos tres master prompts (MP-LIGAR 10:39, MP-MOOTER 10:48,
MP-TALO 11:22) com **zero commits**. Um quarto seria o defeito que o proprio MP-TALO nomeia.

**Executado:** nada. Zero ficheiros do repo tocados alem deste.
**Fonte do conteudo:** `~/paulo-vault/40-strategy/2026-08-28-radar-vigia-concorrencia-e-modelos.md`

---

## A1 · O W1 ganha schema — os orfaos deixam de ser arrumacao

Cinco dos 11 orfaos tem agora um desenho de referencia validado pelo lider de mercado. **Nao muda o
que se liga; muda o formato com que se liga.** Quem executar o W1 deve ler estas cinco linhas antes.

| Orfao | Schema a adoptar | Fonte `[externo]` |
|---|---|---|
| **3 · tokens a 0** (`decisions_v2.js:66`) | Gravar **dois** pares de contagens (`tokens_*` normalizado E `native_tokens_*` do destino) e **tres relogios separados**: `decision_time` (regex, ~0), `dispatch_time`, `execution_time`. Separa-los e o que PROVA que a decisao custa $0 e ~0ms | `openrouter.ai/docs/api-reference/get-a-generation` |
| **4 · veredicto em falta** (`decisions_v2.js:25`) | Dois campos lado a lado: `mooter_outcome` (normalizado) e `native_outcome` (exit code do CLI, stderr cru). **Nunca destruir o sinal cru ao normalizar** | `openrouter.ai/docs/api-reference/overview` |
| **1 · `applyQuotaDefcon`** (`quota-live.js:263`) + `providerState` (`router-execute.js:662`) | Tres niveis de escalada, sendo o 3º **"nunca escalar para subscricao: falhar e dizer porque"**. E o nivel 3 que torna a promessa de $0 verificavel em vez de aspiracional. ⚠️ **Ver a correccao por baixo da tabela: o orfao nao e o que esta escrito.** | `openrouter.ai/docs/use-cases/byok` (shared capacity fallback) |
| **8 · capacidades** (`capacidades.js:218`) | `require_parameters`: um destino so e elegivel se suporta o que o prompt exige (ex.: prompt com tools ⇒ excluir modelo local sem tool-calling). Exige matriz de capacidades por destino | `openrouter.ai/docs/guides/routing/provider-selection.md` |
| **6 · sugestao de modelo** (`model-manager.js:194`) | Separar **modelo** (logico: `qwen3.5:9b`) de **endpoint** (executavel: esse modelo, nesta GPU, nesta quantizacao, com este tecto de VRAM). Um modelo, N endpoints na frota. Conteudo em A2 | `openrouter.ai/api/v1/models` + `/endpoints` |

### ⚠️ Correccao ao orfao 1 — verificada por grep no Mac a 2026-08-29

A descricao anterior deste orfao (aqui e no doc do Project) dizia duas coisas, e **as duas estao erradas**.
Comando corrido: `grep -rn "providerState" --include="*.js" . | grep -v node_modules`.

| O que se dizia | O que o codigo diz |
|---|---|
| `providerState` "nunca e construido" | **E construido** em `tools/router/router-execute.harness.js:64` e `:135`, e passado em `router-execute.test.js:794` |
| os filtros `router-execute.js:187-190` "sao no-ops" | `filterDegraded` (`router-execute.js:181-192`) esta **correcto e testado** — filtra `codex_cli` exhausted/unavailable, `ollama` down, `openai_api` down, `gemini` off/down |

**O diagnostico exacto.** O unico sitio que preenche `providerState` fora dos testes esta dentro de
`if (process.env.MOCK_PROVIDERS === '1')` (`router-execute.js:1067-1075`). Em producao real
`deps.providerState` chega `undefined`, a linha 662 aplica `|| {}`, e as quatro comparacoes de
`filterDegraded` falham todas — **nada e excluido, nunca**.

> **O consumidor existe. Os testes existem. Falta o PRODUTOR de estado real.**

**Consequencia para quem executar o W1:** o item **nao e escrever o filtro — e escrever quem o
alimenta**. Um "ligar o orfao" guiado pelo diagnostico antigo teria ido mexer no ficheiro errado
(`router-execute.js:181-192`, que ja esta certo) em vez do que falta (uma sonda que meca o estado
real de cada destino e o injecte em `deps`).

**Quatro regras de desenho, custo zero (sao disciplina, nao codigo) — adoptar no W1:**
1. Resposta ma mas **nao-erro** nao e gatilho de fallback. Sem isto, loop de retry por insatisfacao.
2. Cancelar nem sempre devolve quota — matar o CLI nao devolve o que ja foi consumido.
3. Threshold **suave** (deprioriza, nao exclui): uma medicao ma nao mata um destino.
4. "Nenhum destino casa os criterios" e uma **classe propria** de resultado, nao um erro.

**Fronteira declarada (o erro mais provavel):** o OpenRouter normaliza *endpoints de inferencia*; o
Mooter normaliza *agentes com loop proprio*. Transferir a camada de **metadados** (catalogo,
capacidades, recibo, politica). **Nunca** a camada de mensagem (`messages[]`/`choices[]`).

## A2 · Conteudo para o orfao 6 — tres correccoes de candidato

Hipoteses externas. **Nada medido nestas maquinas.** Detalhe e fontes no ficheiro de radar.

| Device | Estava no mapa §3 | Correccao |
|---|---|---|
| Mac mini 16GB | `gpt-oss:20b` como residente formal | ❌ **NAO CABE** — 14 GB de blob contra tecto Metal ~11-12 GB, mais o node residente. Aritmetica, nao hipotese. **Substituto: `qwen3.5:9b` (6.6 GB)** — liberta ~2.4 GB face ao 14b actual, BFCL-V4 66.1, Apache 2.0 |
| RTX 4090 24GB | `qwen3-coder:30b` (19 GB) | 🟡 Valido, mas **SWE-bench n/d (o Qwen nao publica)**. **`qwen3.6:27b` (17 GB) publica 77.2** e cabe com mais folga. Trocar o candidato do bench |
| Jetson 8GB | "nada roda, causa por medir" | 🟡 **Tecto real ~6 GB, nao 8** (SO leva 2-3 GB); KV cache do `num_ctx` default e o suspeito nº1 do OOM. **`gemma4:e2b-it-qat` (4.3 GB) tem medicao de terceiro NESTE hardware: 25.5 tok/s, 3.6 GB, GPU 100%** |

**Ordem imposta:** `4-MOTOR.sh` + `tegrastats` durante o load ANTES de qualquer bench no Jetson (regra
do mapa mantida). E `num_ctx` reduzido e a primeira variavel a testar, nao o modelo.

## A3 · O W2 ganha um mecanismo — response caching

O W2 procura "custo por tarefa aceite, pos-execucao". Falta-lhe um mecanismo que **reduza consumo de
quota sem tocar em tokens OAuth** (proibido pelos termos). Ha um, e e clonavel:

**Response caching ao nivel do router.** Prompt identico no mesmo escopo (repo/worktree, nunca global)
⇒ devolve o resultado anterior, grava **quota consumida = 0**, e aponta `cache_source_id` para o
recibo original. Tres propriedades que o tornam compativel com a regra de 24/08:
- A poupanca e a **diferenca medida** face a execucao anterior — nao e contrafactual de preco de lista.
- HIT reporta zeros em todos os contadores: nao ha como inflar.
- Cada HIT aponta para o recibo que o populou: auditavel, nao caixa preta.

**Complemento:** *zero-completion insurance* adaptado — dispatch que devolve zero output util **nao
conta como trabalho feito** no ledger. Sem isto, execucoes falhadas inflam a poupanca.

## A4 · Uma decisao de arquitectura que se toma agora ou nunca

**Semantica "so aperta, nunca afrouxa".** Um prompt pode EXIGIR "so local"; um prompt **nunca** pode
DESACTIVAR o "so local" imposto pela configuracao. E a diferenca entre um guardrail e uma sugestao —
e e a mesma linha que separa o W3.b (politica de confidencialidade por projecto) de uma preferencia.
Custo: baixo. Momento: antes do W3.b, ou o W3.b nasce sem dentes.

## A5 · A vigia — duas linhas no cron, nao um pilar

Tres GETs publicos, zero-LLM, $0, colados a rotina de segunda 09:00 BRT que ja existe:
`ollama.com/library` (catalogo) · `openrouter.ai/api/v1/models` (precos, alimenta o `pricing.js` e
fecha metade do M2a) · `openrouter.ai/docs/llms.txt` (indice de docs: pagina nova = feature nova).
Delta escreve linha no ficheiro de radar do vault. **Nunca `ollama pull` sozinho.**
**Nao criar pilar para isto** — os pilares estao 0/11 pelo proprio portao; um vigia que so faz diffs
nao precisa de LLM, e se precisar esta mal desenhado.

## A6 · Critica ao proprio roadmap (o que o gauntlet apanha no W0-W5)

| Fraqueza | Evidencia | Consequencia |
|---|---|---|
| **O caminho critico e o dono, nao o codigo** | 6 ondas, 6 gestos pendentes. W0 precisa do gesto 2 (login codex) para ter adversario; o gesto 6 (usar a serio) e habito | Nenhuma onda arranca sozinha. O roadmap esta a medir o codigo quando o gargalo e outro |
| **W2 depende de W0 que depende de uso que nao acontece** | 10 worktrees livres / 0 ocupadas · `local_share: n/d` · 0 jobs concluidos | Cadeia de tres elos onde o primeiro nunca fecha |
| **Nenhuma onda move o gate declarado** | Gate = >=250 estrelas + >=3 contribuidores externos. Repo privado | Seis ondas de engenharia, zero de distribuicao. Nomear isto e mais honesto que ignorar |
| **Tres roadmaps vivos no mesmo dia** | G0-G4 (MP-LIGAR) · G0-G4 (MP-MOOTER) · W0-W5 (MP-TALO) | Ate alguem declarar qual vale, o mais provavel e nenhum |

**Recomendacao unica deste adendo:** declarar o **W0-W5 do MP-TALO** como o roadmap vigente, arquivar
os outros dois como historico, e comecar pelo W0 — que e o unico que nao precisa de codigo novo.
