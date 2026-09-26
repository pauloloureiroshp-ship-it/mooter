# B2 — Pré-registo: aderência ao hint e custo de delegar (v1 · 2026-09-26)

> Escrito **antes** de qualquer dado do B2. Commit deste ficheiro = carimbo do pré-registo.
> Emendas só por commit novo, antes dos resultados, com a razão escrita.

## 0. Porquê

Medido a 26/09 com `tools/p0` @630ed8c6 (pós-codex):
- aderência ao `<router-hint>` de **2,9 %** no histórico (962 hints) e de **0 %** na janela do 60d (52 hints);
- cada delegação arranca com 35–90 mil tokens de contexto.

O decisor (0,62 de concordância com rótulos cegos) não se converte em execução. A hipótese de trabalho é que o hint é **condicional** ("If this is a trivial local task, delegate…") e que o host (Opus) decide responder ele próprio.

## 1. Hipóteses

- **H1 (primária):** um hint **imperativo** aumenta a aderência nos turnos que exigem acção (tier do hint ≠ tier do host).
- **H2 (secundária):** nos turnos triviais (output do host < 2 000 tokens), delegar a um subagente gasta **mais** quota do que responder no host.

## 2. Desenho

| Item | Definição |
|---|---|
| Braços | **A** = hint actual (controlo) · **B** = hint imperativo: `ACÇÃO OBRIGATÓRIA: delega este pedido ao subagente <sub> via Task antes de responderes. Só respondes tu se o pedido for HIGH_RISK ou se o utilizador fixou um modelo.` |
| Alocação | Por **sessão**: `sha256(session_id)`, último dígito hexadecimal par → A, ímpar → B. Nunca muda dentro da sessão |
| Unidade de análise | Turno com hint e com tier do hint ≠ tier do host ("exigia acção") |
| Instrumento | `tools/p0/medir-p0.mjs` @630ed8c6 ou posterior **sem** alteração à classificação; o braço é gravado no hint (`ab_braco: A\|B`) |
| Tamanho | Mínimo **30 sessões e 100 turnos que exigiam acção por braço**. Nunca parar antes por resultado |
| Janela | Arranca **depois** do veredicto do 60d (≥ 05/10) e do F2; o decisor activo fica gravado em cada evento |
| Guardas | HIGH_RISK nunca é despromovido · override do utilizador respeitado · kill-switch `MOOTER_AB_B2=off` |

## 3. Métricas e gate (congelados)

| Métrica | Tipo | Gate |
|---|---|---|
| **Aderência B − A** | primária | **≥ 20 pp** e teste exacto de Fisher p < 0,05 |
| Quota por turno que exigia acção (input + cache write + output; cache read à parte) | guarda | B não pior que A em mais de 10 % (mediana) |
| Qualidade: 20 turnos por braço, cegos, julgados pelo codex **e** pelo dono (escala 1–5) | guarda | Não-inferioridade: margem 0,5; κ entre juízes impresso |
| Retrabalho: turnos seguidos de "desfaz", "não era isso" ou revert | guarda | B ≤ A + 5 pp |
| H2: quota do turno trivial delegado vs respondido no host (pares por categoria) | secundária | Só descritivo; sem gate |

**Decisão:**
- B passa todos os gates → B é o default.
- B falha a primária → o hint não é a alavanca; abrir desenho de **delegação automática** (subagente com `model:` disparado por skill/hook).
- B passa a primária mas falha uma guarda → não entra; os números são impressos.

## 4. O que NÃO se pode afirmar com o B2

Poupança em USD. Qualidade geral do produto. Nada sobre concorrentes.

## 5. Riscos conhecidos

- O dono sabe o braço (não cego para o utilizador); mitigado pela alocação automática e porque a métrica é de comportamento do host.
- Deriva do modelo host durante a janela: o modelo fica gravado por turno, com estratificação por modelo.
- O hint B pode aumentar a delegação a subagentes com cache frio, o que é exactamente o que a guarda de quota mede.
