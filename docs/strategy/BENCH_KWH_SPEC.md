# SPEC — kWh por ronda: como medir, e o que NÃO se pode afirmar

**Estado:** desenho. **Não implementado. Execução precisa de GO do dono.**
**Escrito em:** 2026-08-25, `Mac-mini-de-Paulo`. Ferramentas verificadas nesta máquina.

---

## 1. Porque é que isto vale a pena, e porque é perigoso

A tese do Mooter é que trabalho feito na GPU do dono custa **$0 em API**. Isso é
verdade e está medido. Mas «$0» não é «grátis»: a máquina consome energia, e há
um número real por trás — **kWh por ronda entregue**.

Medir isto dá ao produto a única comparação que a concorrência não pode
contestar com marketing: *cloud vs local, na mesma unidade física*.

**E é perigoso pela mesma razão.** Um número de energia é fácil de produzir e
quase impossível de auditar depois. Se este bench alguma vez publicar um kWh
que não foi medido, a doutrina de honest-copy do repositório cai inteira — e o
moat do projecto é precisamente a confiança. Por isso metade desta SPEC é sobre
o que **não** se pode afirmar.

---

## 2. O que este bench mede

**Unidade:** watt-hora por **ronda entregue** (Wh/ronda), onde «ronda entregue»
é uma linha do `runner-ledger.jsonl` com `verdict` ≠ `nada-por-rever` — ou seja,
trabalho que produziu um veredicto, não tempo de relógio.

**Fórmula:**

```
Wh_ronda = (P_carga − P_repouso) × dur_s / 3600
```

O **delta contra o repouso** é a parte que torna o número honesto. A potência
absoluta de uma máquina ligada inclui o ecrã, os discos, o Wi-Fi e o que mais
estiver aberto — nada disso é atribuível à ronda. O que a ronda causa é o
**acréscimo**.

---

## 3. macOS (`Mac-mini-de-Paulo`, Apple Silicon)

### A ferramenta, e o obstáculo verificado

```sh
$ which powermetrics
/usr/bin/powermetrics          # existe
$ sudo -n true
(falha)                        # exige password
```

`powermetrics` **exige root** e nesta máquina o `sudo` pede password. Isto tem
uma consequência de desenho que não se contorna: **o bench não pode correr
dentro do loop autónomo do cockpit.** Um loop que precisasse de root seria um
loop que pede a password do dono, ou pior, um `NOPASSWD` acrescentado ao
`sudoers` para conveniência de telemetria. Nenhuma das duas se faz.

**Portanto:** o bench é um comando **manual, ocasional**, corrido pelo dono
quando quer o número. Não é uma métrica contínua do painel. Isto é uma
limitação, não um defeito — e é a razão pela qual esta SPEC existe em vez de um
PR.

### O comando

```sh
sudo powermetrics --samplers cpu_power,gpu_power -i 1000 -n <N> --format plist
```

Campos: `GPU Power` e `CPU Power` em mW. O `--format plist` é preferível ao
texto porque o formato de texto do `powermetrics` já mudou entre versões do
macOS.

### O procedimento

1. **Repouso**: 60 amostras com a fila do runner **vazia** e o STOP levantado.
   Guardar mediana, não média — um pico de indexação do Spotlight arruína a média.
2. **Carga**: correr N ≥ 30 rondas do mesmo pilar, com `powermetrics` a amostrar.
3. **Emparelhar** cada amostra com a ronda que estava em curso, pelo `ts` e
   `dur_s` do `runner-ledger.jsonl`.
4. Descartar as rondas que caem numa fronteira de amostra.

### O que NÃO se pode afirmar em macOS

`powermetrics` reporta a potência dos **blocos do SoC** (CPU/GPU), não a da
tomada. Falta-lhe a memória, o SSD, o controlador de rede e a **eficiência da
fonte de alimentação**. O número é um **piso**, e tem de ser rotulado
`Wh_SoC/ronda`, nunca `Wh/ronda da parede`.

Para o número da parede é preciso um medidor externo (§5).

---

## 4. Windows / NVIDIA (`desktop-j26409q`, RTX 4090) — **[PC], não corrido aqui**

Este device é o Mac. O que segue é desenho, não medição, e está marcado como tal.

```powershell
nvidia-smi --query-gpu=power.draw,utilization.gpu --format=csv,noheader,nounits -lms 1000
```

Vantagens sobre o macOS: **não precisa de administrador**, e o `power.draw` é a
potência da **placa inteira** (não de um bloco), o que a torna mais próxima do
consumo real do que o `GPU Power` do Apple Silicon.

Mesmo procedimento: repouso → carga → delta → emparelhar pelo ledger. Mesma
limitação: é a potência da **placa**, não da tomada. Falta-lhe CPU, memória,
ventoinhas e a eficiência da PSU (tipicamente 87-92% num 80+ Gold, e isso é uma
gama, não um número).

**A comparação Mac ↔ PC é a parte mais fácil de estragar.** `GPU Power` do
Apple Silicon e `power.draw` da NVIDIA **não medem a mesma fronteira física**.
Publicar os dois lado a lado numa tabela seria fabricar uma comparação. Ou se
mede os dois na tomada (§5), ou se publicam separados, cada um com a sua
fronteira escrita ao lado.

---

## 5. A única medição que permite comparar: a tomada

Um medidor de tomada (tipo TP-Link Tapo P110, ~20 €, expõe consumo por HTTP
local) mede o **mesmo** em qualquer máquina: watts à entrada, PSU incluída.

- Resolve a incomparabilidade do §4.
- Resolve a fronteira do §3.
- Não precisa de root, não precisa de driver, não precisa de correr no host.
- Custa uma compra e um endpoint.

**Recomendação:** se este bench alguma vez for para uma página pública, é este o
caminho. As ferramentas de software servem para *orientar* (é 2× ou 20×?); não
servem para *publicar*.

---

## 6. O que se compara com o quê (e a honestidade da comparação)

A pergunta que interessa não é «quanto gasta o local», é **«local vs cloud, por
trabalho entregue»**. E aí há uma assimetria que tem de ser dita:

| | local | cloud |
|---|---|---|
| energia medível por nós | **sim** (§3, §4, §5) | **não** |
| o que se sabe do outro lado | — | apenas estimativas públicas de Wh/token, de terceiros, para hardware que não conhecemos |

**Consequência:** uma tabela «Mooter local: X Wh · Opus: Y Wh» é **impossível de
fazer honestamente hoje**. O Y não é medível por nós, e importá-lo de um paper
é apresentar a estimativa de outra pessoa como medição nossa.

O que se pode publicar honestamente é **só o lado esquerdo**, com a fronteira
declarada: *«uma ronda de revisão neste Mac custa X Wh medidos no SoC e $0 de
API»*. Sem o Y. É menos espectacular e é verdade.

---

## 7. Gate — o bench só publica se

1. **N ≥ 30** rondas, e a **mediana** reportada, não a média.
2. **Repouso medido na mesma sessão**, não reutilizado de outro dia (a máquina
   idle de hoje não é a de ontem).
3. **Fronteira física escrita ao lado de cada número** (`SoC` · `placa` ·
   `tomada`). Um número sem fronteira é `n/d`.
4. **Nenhum número de cloud** que não tenha sido medido por nós.
5. Dispersão publicada (p10/p50/p90). Uma mediana sozinha esconde se o bench é
   estável ou ruído.
6. O script guarda as **amostras cruas** ao lado do resultado. Um bench cujo
   input se perdeu não é reproduzível, e um bench não-reproduzível é uma
   afirmação.

---

## 8. Gate de red-team (as oito perguntas)

| # | pergunta | resposta |
|---|---|---|
| 1 | **fonte de verdade** | As amostras cruas do `powermetrics`/`nvidia-smi`, guardadas. O Wh/ronda é derivado delas e recalculável. |
| 2 | **escritor único** | O bench escreve num ficheiro próprio de resultados. Não toca no ledger — misturar medição experimental com o ledger de produção seria criar uma segunda verdade. |
| 3 | **reversível vs irreversível** | Correr o bench é reversível. **Publicar um número não é** — por isso o §7. |
| 4 | **script-first** | Sim, e é a parte que ainda não existe. Esta SPEC é o desenho. |
| 5 | **projecção vs 2ª verdade** | Projecção. O Wh/ronda deriva do ledger + amostras; não é fonte de nada. |
| 6 | **degradação graciosa** | Sem `sudo`, sem `nvidia-smi`, sem medidor → o bench **recusa-se a correr** e di-lo. Nunca estima. |
| 7 | **frozen/allowlist/n-d** | Não toca em nada congelado. O lado PC é **n/d nesta máquina** — desenho, não medição. |
| 8 | **custo de reverter** | Retirar um número publicado de uma página é barato; retirá-lo da cabeça de quem o leu não é. Daí o gate. |

**Objecção real produzida:** sim, e mata a versão mais vendável do bench — a
tabela «local vs cloud» (§6) não se pode fazer honestamente, porque metade dela
não é medível por nós. O que sobra é o lado esquerdo sozinho.

---

## 9. O que pede a mão do dono

1. **GO/NO-GO** para implementar o bench de macOS (manual, com `sudo`).
2. **Decisão sobre o medidor de tomada** (~20 €) — é o que separa «orientar» de
   «publicar».
3. Confirmação de que o número **nunca** aparece numa página pública ao lado de
   um número de cloud que não tenhamos medido.
