# PILOTO DE CONVICÇÃO v1.1 — "com Mooter vs sem Mooter", juiz cego, pós-G4
**Data:** 2026-08-06 · **Estado:** 🟢 CONGELADO (X=40 · N=40 fixados pelo Paulo em 2026-08-06, antes de qualquer run)
**Sha do commit de congelamento:** `<preenchido no 2º commit>`
**Decisões do Paulo (2026-08-06):** piloto já · 1 visual + 1 repo · controlo Fable 5 direto · painel cego 3 motores
**G4 corrido:** crítico de contexto fresco (mesma família — **auto-DEGRADADO**, motores externos falharam por infra: Gemini CLI morto/Antigravity, kimi-k3 timeout 240s). 8 falhas encontradas, todas incorporadas abaixo como Δ.
**Rótulo:** PILOTO NÃO-PUBLICÁVEL (G18). A versão publicável exige o gate de 11 itens do `BENCH_AB_PLANO_2026-07-28.md`.

---

## 0. Pré-commitment (preencher e commitar ANTES da primeira execução)

> "Convence-me se: (a) qualidade mediana cega de B dentro de ±0,5/10 de A ou acima, nas 2 tarefas,
> sobre as 3 execuções; (b) custo-proxy de B ≤ **40**% de A; (c) ≤ **40**% dos tokens de B saíram
> de T3 — senão o 'empate' é só o Fable/Opus a trabalhar com outro nome (tautologia por escalada).
> Amplitudes sobrepostas sem separação clara = INCONCLUSIVO, não empate.
> Resultado contra o Mooter é registado no vault na mesma; a wave seguinte é arrumar a casa."
> — Paulo · data: **2026-08-06** · X=**40** e N=**40** fixados ANTES de qualquer run [Δ F2 + Δ tautologia]

Sugestão de arranque (era X=40 · N=40): **adoptada pelo Paulo em 2026-08-06, sem alteração.**

## 1. Braços — agora 3 [Δ F8]

| Braço | Setup | Mede |
|---|---|---|
| **A — TECTO** | CC sessão fresca, modelo fixo Fable 5, worktree limpa, caches limpos | O melhor que dinheiro compra |
| **B — MOOTER** | CC sessão fresca, mooter-first, routing T0-T3 auto (T5 nunca) | O produto |
| **C — ESTÁTICO** | CC sessão fresca, modelo fixo Sonnet, mesmas condições | Se um modelo médio chegava, o router não provou nada. É o braço mais barato — corre |

## 2. Execução — driver scripted, zero teclado humano [Δ F5, F6]

1. **3 execuções por braço por tarefa** (9 por tarefa no total). Mediana + amplitude. [Δ F1]
2. Driver 100% scripted (headless): prompt colado pelo script, follow-ups pré-escritos automáticos
   ("continue" ×2 máx.), critério de paragem e tecto de tentativas fixados aqui. Transcrição completa em log.
3. Worktree limpa E caches limpos por execução; sha do commit base anotado.
4. Ordem dos braços por moeda registada no log (o mini quadrado latino com n=1 era ornamento). [Δ F6]
5. GPU aquecida; cold/warm anotado. Registrar por execução: wall-clock · tokens in/out · tiers · intervenções (=0 por construção).

## 3. Tarefas

- **T1 VISUAL:** spec congelada (§5 da v1.0 — Moo Ranch, 12 itens DoD). Prompt idêntico nos 3 braços.
- **T2 REPO:** sorteada por dado registado entre **5 candidatas listadas antes de conhecer os braços**
  (cada uma: teste vermelho→verde, sem tocar ficheiros frozen). [Δ F7]

## 4. Verificação e julgamento — funcional primeiro, juiz depois [Δ F4, estilo]

1. **DoD funcional NÃO é julgada por LLM:** harness (Playwright) ou humano marca os 12 itens S/N
   jogando o artefacto — resultado binário anexado anonimamente ao pacote do juiz.
2. **Normalização anti-sotaque antes do julgamento:** prettier + remoção de comentários + renomeação
   mecânica de identificadores. O juiz avalia comportamento (via DoD anexa + capturas do harness) e
   estrutura — não o estilo de quem escreveu.
3. Artefactos baralhados por script; mapa escondido; abre só depois dos 3 veredictos.
4. **Painel (corrigido pela infra medida hoje):** codex/GPT (outra casa, funciona) + kimi SE couber no
   timeout (senão moo local como 3ª voz, declarado) + Fable 5 contexto fresco **sub-ponderado** (mesma
   família do braço A — peso 0,5). Concordância reportada.
5. **Sonda de proveniência:** cada juiz declara de que modelo acha que veio cada artefacto; taxa de
   acerto reportada — se bater o acaso, o julgamento de qualidade desconta-se e diz-se. [Δ estilo]
6. Rubrica (fixa): DoD anexa 40% · robustez 20% · qualidade de código (normalizado) 20% · experiência
   **operacionalizada** = fluidez medida pelo harness (FPS, input lag) + acabamento visual em capturas 20%.

## 5. Custos — dois números, sempre [Δ F3]

Por braço: (1) **proxy preço-de-lista API** `[proxy declarado]` · (2) **custo marginal de subscrição**
(≈0 nos dois — dizer isso abertamente) · (3) energia local: Wh medidos × tarifa fixa declarada (R$/kWh),
senão `n/d`. O §0 diz que o critério usa o proxy (1). Nunca "$0" sem asterisco.

## 6. Saídas

- `piloto/resultado.md`: qualidade por juiz e por execução · concordância · sonda de proveniência ·
  mix de tiers de B (resultado PRIMÁRIO, não rodapé) · custos (2 números) · tempo · veredicto contra o §0.
- Vault (`mooter_journal`) + SYNC.md § Cowork→CC. Se favorável → instrumentação (11 itens) para a versão pública. Se desfavorável → arrumar a casa; o piloto pagou-se na mesma.

## 7. Bugs de infra a resolver ANTES do run (encontrados hoje, 2026-08-06, ao tentar o G4)

| # | Bug | Prova | Fix |
|---|---|---|---|
| 1 | Gemini CLI morto ("no longer supported… migrate to Antigravity") | stderr job-mshq16a6 | migrar ou tirar o gemini do painel |
| 2 | kimi-k3 excede timeout 240s em raciocínio longo sem tools | job-mshq2ggm, 240s | subir timeout p/ jobs de auditoria ou streaming parcial |
| 3 | Detector de execução recusa por substring ("run" em texto descritivo) | job kimi recusado 2× | já documentado 08-04; evitar palavras-gatilho nos goals |
| 4 | `classify_ms` MEDIDO ao vivo: **1.078 ms** — o claim "<50ms" tem finalmente 1 medição real | dispatch job-mshq16a6 | usar no vídeo; repetir n≥100 na bateria |

---
gauntlet: alto-risco · G1-G18 corridos na sessão Cowork 2026-08-06 · G4 em auto-DEGRADADO (contexto fresco, mesma família; kimi timeout + gemini morto — 8 falhas F1-F8 + tautologia por escalada, todas incorporadas) · G16: ex-sócio instala antes do vídeo · G17: mix de tiers virou resultado primário · G18: rótulo não-publicável em cima · não corridos: nenhum
