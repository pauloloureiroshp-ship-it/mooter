# ADDENDUM — "MOO RUN": a série, os dois formatos e o vídeo auditável · 2026-08-08
**Estado:** ❄️ desenho aprovado pelo dono em conversa — entra no §0 do POKÉ (F4 do maestro) quando a vez chegar. NÃO altera a fila (F1→F5) nem a REGRA 0.

## 1. Série episódica (substitui o "um vídeo do zerar")
Episódio quinzenal por marco: E1 = Brock · E2 = Misty · … · finale = "A Captura do Moo" (Mew via glitch do treinador — sequência finita de menus, planejável, nunca GameShark). Cada episódio: 2-3 min acelerado, arco completo, cartão final de métricas. O "zerar" é o final da temporada, não pré-requisito do primeiro filme.

## 2. Dois formatos PRÉ-REGISTRADOS no §0 (ambos publicam-se sempre — anti-cherry-pick)
- **Corrida ao marco:** mesmo marco, quem chega com menor custo (métrica primária: custo por badge; tempo decomposto como secundária).
- **Mesmo orçamento:** $X iguais para A e B′ — quem vai mais longe. Visual: tela do braço que esgota congela com "ORÇAMENTO ESGOTADO"; o outro continua. Progresso medido por RAM (mapa/flags), nunca por opinião.

## 3. Vídeo auditável (diferencial mundial)
Cada frame carimbado com game_step_idx + record_hash do recibo daquele lance (cadeia C0, tamper-proof provado 08-08). QR no canto → jsonl publicado + âncora externa do hash. Claim: "pausa em qualquer segundo e verifica o recibo daquela decisão." Versão publicável: HUD-only até parecer jurídico; versão com frames: privada do dono / demo ao vivo.

## 4. Aceleradores de caminho (avaliar na F5, não antes)
Baselines open-source do PokeAgent Challenge (speedrun track, vencedor 40:13 até Roxanne) como scaffold ÚNICO para os dois braços — mesmo scaffold, só o motor muda (mata a crítica "harness diferente"). Verificar licença + encaixe com o C0 antes de adotar. Alternativas já pinadas: pokemon-agent (MIT), llm_pokemon_scaffold, GamingAgent.

## 5. Marca
Série = "Moo Run" · universo visual Moo Ranch (HUD, leaderboard, cartões) · referência ao jogo por estrutura, nunca assets Nintendo em material público · disclaimer nominativo onde aplicável.

## O que isto NÃO muda
A fila do maestro (F1 ROM → F2 cascata → F3 nº2 → F4 §0 → F5 M1) · REGRA 0 · a garantia honesta: garantimos o TESTE e o FILME qualquer que seja o resultado; o resultado é mérito do produto — se o B′ perder, publica-se e conserta-se.

## 6. DEMO-AO-VIVO (acrescentado 2026-08-09, gesto do dono em conversa Cowork)
Entregável nomeado da F5: **launcher de um comando** que sobe os dois braços em paralelo com dashboard aberto — o "play" do dono, executável a qualquer momento com a versão ATUAL do Mooter contra a régua congelada do §0. Racional (do dono): vídeo é adulterável; demo ao vivo na frente do cético não. Especificação mínima: (a) demo ao vivo = SEGMENTO curto pré-registrado no §0 (~10-15 min assistíveis; ex.: largada→1º marco intermédio, ou formato mesmo-orçamento com teto baixo), run completo fica para replay+vídeo; (b) toda demo é um run numerado normal — entra no ledger e publica-se como qualquer outro (anti-cherry-pick vale para demos); (c) cada edição regista a versão do Mooter (sha/bundle) → o leaderboard longitudinal vira a curva pública de evolução; (d) custo real do braço A exibido ao vivo no odômetro — declarado, nunca escondido. Hierarquia de prova declarada nos materiais: vídeo (alcance) < replay bit-idêntico (verificação offline $0) < demo ao vivo (versão atual, na hora).

---

## 6. DEMO-FORMATO v0.1 — o painel de raciocínio (2026-08-09)

Desenho aprovado pelo dono, detalhado em `DEMO_FORMATO_2026-08-09_v0.1.md`. Resumo: thread com
**as mesmas seis etapas nas duas telas** (PERCEBER → PLANEJAR → ROTEAR → GUARDRAIL → AGIR →
VERIFICAR), com `ROTEAR` e `GUARDRAIL` **vazias** no braço de modelo único — a simetria é o
argumento · painel de **context engineering** por lance (tokens por componente do prompt) ·
**drill-down** para prompt exato + resposta bruta + `record_hash` · **banner de escalada** com
o motivo lido do ledger.

### 6.1 O que NÃO entra na tela do jogo (G18)

**Pastas, skills e schedules ficam de fora.** Não existem no loop do jogo, e pô-los ali seria
vender maquinaria que não está a correr naquela tela. Essa camada mostra-se no
**cockpit/desktop** (mock v3), **cena 2 do pitch**. Esta separação é dura: a tela do jogo só
mostra o que o `steps.jsonl` daquele run consegue provar.

### 6.2 A factura, que não é decorativa

Auditado em 2026-08-09 contra `poke_lab/recibo.py:20-53`: **o `StepReceiptV1` não tem um único
campo de prompt, contexto ou objetivo.** Metade do painel não teria dado medido por trás — e o
próprio pedido proíbe painel fake. O documento lista os campos em falta e propõe o
**`StepReceiptV1` v2**.

**Consequência para a fila:** o brief congela o schema **antes dos adapters** (C0.a), e os
adapters são a **F4b**. A janela para a v2 é **antes da F4b** — se os adapters nascerem contra
a v1, a F5 vira reescrita dos dois braços. Não fura a REGRA 0 (é schema, não é run) e dá
conteúdo ao `E3` do §0, que já pedia "`StepReceiptV1` versionado".
