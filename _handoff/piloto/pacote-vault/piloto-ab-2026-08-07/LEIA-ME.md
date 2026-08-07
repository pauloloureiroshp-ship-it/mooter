# Piloto A/B/C — 2026-08-07 · pacote de evidência

**Destino:** `paulo-vault/50-lab/piloto-ab-2026-08-07/`
**Estado:** pronto a projectar. **Não foi escrito no vault pelo CC.**

> A constituição (`00-core/mooter-constituicao.md`) diz que os Solistas — Claude Code incluído —
> **nunca escrevem no vault-tree**, e o princípio 3 reserva a escrita do estado partilhado ao
> Maestro. Foi o achado #12 do G4 desta manhã e entrou no `SUPERMASTER_VANTAGEM v1.1` como regra
> inviolável. O pacote fica aqui completo; a projecção é do Maestro (Cowork).

## O veredicto, em três linhas

Medido contra o §0 congelado em `0737767c` (X=40 · N=40, fixados antes de qualquer run):

| Critério | Tecto | Medido | |
|---|---|---|---|
| (a) qualidade mediana de B vs A | dentro de ±0,5 | **+0,02** (6,66 vs 6,64) | cumpre — **mas inconclusivo** |
| (b) custo-proxy B/A | ≤ 40% | **43,7%** | **falha** |
| (c) tokens de B em T3 | ≤ 40% | **100,0%** | **falha** |

As amplitudes dos três braços sobrepõem-se por completo (A 6,48–7,9 · B 6,52–7,18 · C 6,14–7,62)
e o §0 manda ler isso como **INCONCLUSIVO, não empate**.

**O piloto não convence a favor do Mooter nesta tarefa.** O §0 previu os dois modos de falha pelo
nome: *"o 'empate' é só o Fable/Opus a trabalhar com outro nome (tautologia por escalada)"* — e B
routou 100% para T3; *"se um modelo médio chegava, o router não provou nada"* — e C custou **20,9%**
de A com a **mediana mais alta** (7,40).

O protocolo diz o que fazer a seguir, e é o que fica: *"Resultado contra o Mooter é registado no
vault na mesma; a wave seguinte é arrumar a casa."*

## O que está aqui

| Caminho | O que é |
|---|---|
| `resultado.md` | **Fonte canónica.** Gerado mecanicamente dos 9 `meta.json`; recusa-se a existir com shas mistos |
| `resultado-T2-C4.md` | O mesmo para a tarefa T2 (bateria de manhã, `base_sha 7f78c72b`) |
| `dossier-data.json` | Agregado para o relatório visual. **Apresentação, nunca substituto** |
| `protocolo-congelado.md` | O protocolo com o §0 verbatim |
| `mapa.json` | Mapeamento ART-n → braço. **Só aberto depois dos 3 veredictos** |
| `artefactos/*.html` | Os 9 jogos, um por run |
| `dod/*.json` | Os 12 itens S/N por artefacto (Playwright, determinístico) |
| `veredictos/*.json` | Os 3 juízes cegos em bruto + o painel |

## O que ler com desconfiança

- **n = 3 por braço, uma tarefa.** Não é uma régua pública.
- **Item 8 do DoD** (condição de vitória) é `n/d (humano)` nos 9 — o harness não o verifica. Os
  scores são sobre 11 itens, não 12.
- **FPS** (item 10) é a mediana de `rAF` numa corrida headless única, na mesma máquina onde a
  bateria correu. Comparável entre braços; não é benchmark de hardware.
- **4 dos 12 itens são heurísticos** por declaração do próprio `dod_checks.mjs` (2, 3, 4, 7).
- **O contexto não é neutro, é constante.** O `CLAUDE.md` do projecto foi neutralizado nos três
  braços; o `~/.claude/CLAUDE.md` do utilizador **não é removível** (`CLAUDE_CONFIG_DIR` quebra a
  autenticação — medido). Igual nos três, logo não é variável entre eles, mas o ambiente tem
  doutrina.
- **Exposição:** o Paulo viu 1 artefacto da bateria-1 (arquivada como inválida) antes deste
  julgamento. Nenhum dos 9 julgados aqui lhe foi mostrado antes de o painel fechar.
- **10 defeitos de instrumento** foram encontrados e corrigidos no caminho — a lista com commit de
  fix está no `dossier-data.json`. A bateria-1 foi arquivada como inválida por causa deles. Isto é
  o argumento mais forte a favor do método e o mais desconfortável sobre o estado do kit.

## Cegueira do painel

- Concordância de ordenação entre juízes: **94,1% a 97,0%** (acaso 50%).
- Sonda de proveniência: **45,5%** (10/22 palpites mapeáveis) contra um acaso de **33,3%**. Com
  n=22, 10 acertos contra 7,3 esperados fica dentro do ruído — **a cegueira aguentou**.
