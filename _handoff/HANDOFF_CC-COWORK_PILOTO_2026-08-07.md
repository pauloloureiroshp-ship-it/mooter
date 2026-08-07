⇄ CC → COWORK · piloto de convicção fechado — resultado NÃO favorável ao Mooter

🎯 GOAL   O `resultado.md` e o `dossier-data.json` existem. O dossier visual é teu.
📍 WHERE  `_handoff/piloto/` · repo `~/frugal` · nada empurrado ainda (8 commits locais)
📅 QUANDO 2026-08-07 · bateria T1 `base_sha e8f9b25c` · prova de bundle IGUAL 198/198

---

## O veredicto, contra o §0 congelado em `0737767c`

| Critério (X=40 · N=40, fixados antes de qualquer run) | Tecto | Medido | |
|---|---|---|---|
| (a) qualidade mediana de B vs A | ±0,5 | **+0,02** (6,66 vs 6,64) | cumpre — **mas inconclusivo** |
| (b) custo-proxy B/A | ≤ 40% | **43,7%** | **FALHA** |
| (c) tokens de B em T3 | ≤ 40% | **100,0%** | **FALHA** |

```
braço                 mediana  média   amplitude    custo_proxy   T3
A TECTO (fable-5)      6,64    7,007   6,48–7,90       8,94        0%
B MOOTER               6,66    6,787   6,52–7,18       3,91      100%
C ESTATICO (sonnet-5)  7,40    7,053   6,14–7,62       1,87        0%
```

Amplitudes **totalmente sobrepostas** → o §0 manda ler como **INCONCLUSIVO, não empate**.

**O §0 previu os dois modos de falha pelo nome:**
- *"senão o 'empate' é só o Fable/Opus a trabalhar com outro nome (tautologia por escalada)"* — B
  routou **100% para T3**.
- *"Se um modelo médio chegava, o router não provou nada"* — C custou **20,9% de A** e tem a
  **mediana mais alta**.

**O que o protocolo manda:** *"Resultado contra o Mooter é registado no vault na mesma; a wave
seguinte é arrumar a casa."*

## Cegueira do painel — aguentou

- Concordância de ordenação entre os 3 juízes: **94,1% – 97,0%** (acaso 50%).
- Sonda de proveniência: **45,5%** (10/22 palpites mapeáveis) vs acaso **33,3%**. Com n=22, 10
  acertos contra 7,3 esperados está dentro do ruído.
- Juízes: codex (âncora, outra casa, peso 1) · Fable 5 (peso 0,5, mesma família do braço A) ·
  kimi-k3 (peso 1). Os três parsearam.

## Para o dossier visual

`_handoff/piloto/dossier-data.json` — um só JSON, tudo lá dentro: pré-commitment verbatim, 5 shas
resolvidos, 9 runs (wall, custo, usage/modelUsage, mix de tiers, onde o artefacto apareceu,
critério de paragem), DoD por artefacto, 3 veredictos + concordância + sonda, linha temporal dos
defeitos de instrumento com commit de fix, totais do ledger, caminhos relativos dos 9 HTML.
**Campo sem medição = `null` com `_porque`.**

⚠️ É **apresentação**. A fonte canónica é `resultado.md`, gerado mecanicamente dos `meta.json` e que
se recusa a existir com shas mistos.

## Pacote de evidência — pronto, NÃO projectado

`_handoff/piloto/pacote-vault/piloto-ab-2026-08-07/` · 28 ficheiros · 489 KB · destino
`paulo-vault/50-lab/piloto-ab-2026-08-07/`.

**Não o escrevi no vault.** A constituição (`00-core/mooter-constituicao.md`) diz que os Solistas
nunca escrevem no vault-tree e o princípio 3 reserva a escrita do estado partilhado ao Maestro —
foi o achado #12 do G4 desta manhã e entrou no `SUPERMASTER_VANTAGEM v1.1` como regra inviolável.
**A projecção é tua.** Pelo mesmo motivo não usei o `mooter_journal`.

## O que ler com desconfiança

- n=3 por braço, **uma tarefa**. Não é régua pública.
- **Item 8 do DoD** (condição de vitória) é `n/d (humano)` nos 9 — os scores são sobre 11 itens.
  Fica à espera de o Paulo jogar os 9 jogos.
- **O contexto não é neutro, é constante.** O `~/.claude/CLAUDE.md` não é removível
  (`CLAUDE_CONFIG_DIR` quebra a autenticação — medido). Igual nos três braços, mas há doutrina.
- **Exposição:** o Paulo viu 1 artefacto da bateria-1 (inválida). Nenhum dos 9 julgados aqui.
- **10 defeitos de instrumento** encontrados e corrigidos hoje; a bateria-1 foi arquivada como
  inválida por causa deles. É o argumento mais forte a favor do método e o mais desconfortável
  sobre o estado do kit.

## Também neste fecho

`docs/foundation/MEO_GAUNTLET.md` ganhou duas candidatas **só na fila de espera**, com 3
retro-provas reais cada: **C1 "o ✓ tem corpo?"** e **C2 "congelaste todas as superfícies?"**.
**Tecto 18 intocado**, zero G19/G20. A entrada é decisão do Paulo.

⏭ NEXT   dossier visual (teu) · projecção do pacote ao vault (tua) · Bloco B da wave VANTAGEM
         (push com payload, auditoria de worktrees, re-empacotar o mcpb) — o Bloco B estava
         trancado pela Regra 0 até o `resultado.md` existir, e agora existe.
📋 BACK  se o dossier precisar de um campo que não está no JSON, diz qual — acrescento-o ao
         `dossier.mjs` em vez de o escreveres à mão.
