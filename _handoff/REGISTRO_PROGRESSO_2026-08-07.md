# REGISTRO — PILOTO-1 · O dia em que chumbámos o nosso próprio benchmark
**Data:** 2026-08-07 · **Autor:** Cowork (sessão do piloto) + Paulo Loureiro (juiz humano, item 8) · **Status:** 🟡 aguarda item 8 aplicado + dossier visual
**Uma linha de pitch:** *o Mooter é o único router que se auto-mede com protocolo pré-registrado, publica o próprio chumbo — e mostra a data em que vai passar.*

---

## 1. O que existia há 10 dias vs o que existe hoje

| 2026-07-28 | 2026-08-07 |
|---|---|
| Plano dizia: "teste A/B é impossível hoje — não existe braço de controle" | Laboratório completo: 3 braços, 3 execuções cada, 9 runs válidos, painel cego de 3 juízes |
| Zero instrumentação de custo/rota por prompt | Recibo por prompt no ledger (custo, tier, motor, telemetria ollama) |
| Nenhuma proteção contra resultado falso | 10 defeitos de instrumento capturados ANTES de produzirem resultado falso |
| Opinião sobre qualidade | Rubrica congelada + pré-commitment §0 assinado antes de qualquer run |

Construído em ~72h, non-dev, com AI como multiplicador. Isto por si já é material de pitch — mas não é o headline.

## 2. O método (por que dá para confiar)

- **Pré-registro congelado ANTES de correr** (§0, sha `0737767c`): teto de custo X=40 · teto de tokens-T3 N=40 · qualidade empata se ±0.5 · amplitudes sobrepostas = inconclusivo. Ninguém move a trave depois do chute.
- **3 braços:** A = TECTO (fable-5 sempre) · B = MOOTER (router) · C = ESTÁTICO (sonnet-5 sempre). 3 execuções por braço.
- **Painel cego de 3 juízes** (codex âncora peso 1 · fable5 peso 0.5 · kimi), com sonda de proveniência contra baseline de chance — os juízes não sabiam qual braço era qual, e provámos que não adivinhavam.
- **Item 8 humano:** o Paulo jogou os 9 artefactos pessoalmente. Sem atalho.
- **Kit versionado por sha:** b62146cc → 7f78c72b → 77814da3 → mesa de jogo 317d83a6 (= origin/main). `classify.js` intocado (sha `427d8c0b…48f`). Espelho no vault: 28 ficheiros + MANIFEST.sha256, verificado IGUAL.

## 3. O veredicto — contra a régua que NÓS congelámos

| Critério §0 | Resultado | Veredicto |
|---|---|---|
| (a) Qualidade (empate se ±0.5) | +0.02, amplitudes sobrepostas | 🟡 inconclusivo |
| (b) Custo ≤ 40% do braço A | 43,7% | ❌ FAIL |
| (c) Escalada a T3 | 100% dos prompts foram a T3 | ❌ FAIL |

O §0 previu os dois modos de falha **verbatim, antes de correr**. O instrumento funciona.

**As duas réguas (o framing honesto):** pela régua do mercado (estilo RouteLLM — custo vs degradação), −56% de custo com degradação ~0 seria declarado VITÓRIA. Pela nossa régua, mais dura, chumba. Escolhemos publicar o chumbo. É exatamente isso que compra credibilidade com prazo LONGO — enganar tem prazo curto.

## 4. Os 10 defeitos que teriam produzido um resultado FALSO (o coração do pitch)

O número sozinho é meia-verdade; a história forte é esta: **cada um destes defeitos, não capturado, teria produzido um resultado falsamente favorável — e o harness abortou sozinho.** Destaques:

| Defeito | O que teria acontecido sem o guard |
|---|---|
| Driver com shell:true + espaço no path matou os braços A e C (0 bytes, 3/3) | **Falso 3-0 A FAVOR do Mooter** — abortado por `bracoSemSaida` |
| Critério "done" enganhável | Braço declarava sucesso sem payload ("✓ sobre nada") |
| Vazamento de isolamento via HOME | Runs viam builds uns dos outros — contaminação cruzada |
| Bundle instalado ≠ repo (duas verdades de versão) | Mediríamos código que não é o que está no repo |
| Juiz local = função constante (recall 0/63) | Painel aprovaria tudo — VERIFICADOR-0 reprovou-o e ele saiu do gate |
| resultado.mjs alegava prova de bundle ausente | Alegação falsa no relatório final — corrigida com precedência + 2 testes |

(+4 no registo completo do kit: contaminação de doutrina entre braços, sha misto, "✓" do moo em JSON no campo errado, timeout kimi.) Rastreio completo: `_handoff/piloto/` + `dossier-data.json`.

## 5. O achado inesperado — gap de jogabilidade humana

Harness aprovava 8-9/12 itens de DoD; o humano conseguiu jogar **~1 de 9**. O único jogável (ART-1, Moo Ranch) tem condição de vitória mecânica genuína — flood-fill topológico validado no código-fonte — e o Paulo venceu de facto (58 blocos, cerco fechado, banner disparado).

**Leitura de produto:** nenhum benchmark de router no mercado mede "um humano consegue usar isto à primeira?". Nós tropeçámos nessa métrica por honestidade — e ela vira candidata a DoD em testes de conteúdo futuros (fora do nº2, que mantém spec congelada para comparabilidade).

## 6. Diferenciação honesta vs mercado (estado em 2026-08-07)

| Capacidade | Mooter | Concorrência medida (RouteLLM/OmniRoute/survey) |
|---|---|---|
| Auto-benchmark pré-registrado e auditável | ✅ único | ❌ benchmarks próprios sem pré-registro |
| Recibo por prompt (custo/rota/telemetria) | ✅ | parcial/ausente |
| Verificação a $0 (motor local no gate mecânico) | ✅ | ❌ |
| Guards anti-fake-win (aborta o próprio resultado favorável) | ✅ | ❌ |
| Métricas honestas (n/d nunca vira 0; accuracy só com baseline+recall) | ✅ | raro |
| **Eficiência de roteamento em si** | ⚠️ **ainda não superior — declarado** | estado da arte |

A última linha é o gap declarado — e tem plano com data:

## 7. A vingança datada — CASCATA-APRENDE → teste nº2

Retro-simulação com os dados do piloto-1: o braço **B′ (Mooter + cascata mecânico-primeiro + bandit)** passaria **ambos** os critérios chumbados, a **21-35% do custo do braço A**. Regra R1 congelada no protocolo v2: *"A régua que chumbou o B é a que tem de aprovar o B′"* — X=40 · N=40 imutáveis. Sem régua nova, sem desculpa.

## 8. Rastreabilidade

Protocolo: `_handoff/PILOTO_CONVICCAO_2026-08-06.md` (§0 sha `0737767c`) · Kit: `b62146cc → 7f78c72b → 77814da3 → 317d83a6` · Dossier de dados: `_handoff/piloto/dossier-data.json` + `HANDOFF_CC-COWORK_PILOTO_2026-08-07.md` · Espelho vault: `50-lab/piloto-ab-2026-08-07/` (28 ficheiros, MANIFEST.sha256) · Protocolo nº2: `_handoff/piloto2/PROTOCOLO_v2_REGRAS_CONGELADAS.md` · Investimento do dia: ver ledger (contador entra no dossier visual).

## 9. Próximos passos

🔜 Item 8 aplicado (JOGAR.md → `aplicar-item8.mjs` → resultado.md + dossier-data.json regenerados) · 🔜 DOSSIER PILOTO-1 visual (Cowork, artifact persistido) · 🔜 Wave VANTAGEM Bloco B (casa em ordem) → Bloco C (CASCATA) → **teste nº2** · ❄️ pitch ex-sócio quando o dossier existir ("chumbámos o nosso próprio benchmark, documentado — vê-me passar no nº2").

---
*Regra da casa que este dia provou: nada entra por opinião; cada claim carrega `[medido]`, sha, ou `n/d`.*
