# Redacção dos prompts do dono — o que saiu, o que fica, e o que isso custa

**Decisão do dono, 2026-09-10, antes do primeiro push.** O repositório `mooter` é **público**. O pacote levava **40 prompts reais** das transcrições de Setembro do dono, verbatim, mais truncaturas dos mesmos em logs de instrumentos. Não são segredos e o revisor varreu-os por dados de terceiros sem achar nada — são conversas de trabalho dele. Uma vez num repositório público, podem ser clonadas, indexadas e cacheadas mesmo depois de apagadas. O dono mandou tirá-los.

## O que foi feito

O texto de cada prompt real foi substituído por um marcador **determinístico**:

```
[[redigido sha256:0e5eb377d72a chars:50]]
```

Doze caracteres do sha256 do texto original, e o comprimento. **Nada foi apagado**: nenhum ficheiro, nenhum campo, nenhuma linha, nenhum resultado. Só o texto saiu.

O instrumento é `lib/redigir-prompts.mjs`, e faz três passagens porque as duas primeiras versões dele **fugiram**:

| Passagem | O que cobre |
|---|---|
| 1 · campos inteiros | `prompt_preview` (truncatura de 80 chars que o hook escreve no log) e `result_text` (a resposta do modelo, que **cita** o prompt de volta). Nenhum dos dois é lido por análise nenhuma — verificado em `P1/run.mjs`, `P3/run.mjs` e `lib/conferir-cartoes.mjs` |
| 2 · prefixos | qualquer prefixo de ≥ 24 chars, do mais longo para o mais curto |
| 3 · inteiros | o prompt completo, na forma crua e na forma escapada de JSON |

**As duas fugas, porque interessam mais do que a correcção.** A v1 só fazia a passagem 3 e deixou **15 fragmentos vivos em 4 ficheiros** — o `prompt_preview` é uma truncatura e o `result_text` cita. A v2 usava `for (n = p.length; n >= 24; n--)`, que **não corre nenhuma vez** para um prompt de 22 caracteres: dois prompts curtos sobreviveram intactos. Nenhuma das duas foi apanhada a ler o código. Foram apanhadas por um teste que pega nos 40 prompts originais e os procura, um a um, no resultado.

## A verificação, e é a única que vale

```bash
# gera as agulhas do corpus ORIGINAL (fora deste repo) e procura-as no pacote
grep -rlF -f agulhas.txt _handoff/provas-v1-2026-09-09/
```

Estado no commit da redacção: **0 ficheiros**, e os 40 prompts verificados individualmente — **0 de 40 visíveis**. Os 92 ficheiros JSON e JSONL continuam todos a parsear, e `node lib/conferir-cartoes.mjs .` continua a dar **54 verificações, exit 0**.

## Duas hashes congeladas deixaram de bater, de propósito

O `P1-decidir-custa-zero/protocol.json` congelou o sha256 dos corpora a 2026-09-09. A redacção mudou-os:

| Ficheiro | Congelado no protocolo | Depois da redacção |
|---|---|---|
| `corpus-63.json` | `fba9ac4898cf…` | `8670e3a85ada…` |
| `corpus-40.json` | `761d5bb3571b…` | `b5cbc74364c7…` |
| `labels-63.json` | `0bc6edbbb5d9…` | **inalterado** — os rótulos nunca tiveram texto |

**Não corrijo o protocolo.** Um pré-registo que se reescreve deixa de ser um pré-registo, e a discrepância é exactamente o sinal que se quer: quem confrontar o hash vê que o ficheiro mudou depois de congelado, e este ficheiro diz quando, porquê e como.

**Como o dono confirma que é o mesmo corpus:** cada prompt redigido carrega o sha256 do seu próprio texto. Com as transcrições originais, recalcula-se prompt a prompt e compara-se. É mais forte do que o hash do ficheiro inteiro, porque identifica **qual** entrada mudaria, se alguma mudasse.

## O que isto custa — e custa a sério

**O P1, o P3 e o braço B do P5 deixam de ser re-mensuráveis de raiz por terceiros.** O `P1/run.mjs --arm` lê `it.prompt` e passa-o ao `classify()`; sem o texto, não há o que classificar. Quem não tiver as transcrições do dono **não pode repetir a medição**, só re-derivar os números a partir do bruto que fica publicado.

Fica publicado, e chega para verificar:

- todos os `results/*.json` com previsões, tempos, tiers e desfechos, prompt a prompt, por `id`;
- os rótulos cegos do segundo motor (`labels-63.json`), intactos;
- o `--analyse` de cada cartão, que recalcula tudo a partir desses ficheiros;
- as 54 verificações do portão, que releem os slides contra o bruto.

**Não há maneira de ter as duas coisas.** Um corpus de prompts privados não é reproduzível por estranhos sem deixar de ser privado. Escolheu-se a privacidade, e o preço está escrito aqui em vez de ficar por descobrir.

## O que **não** foi redigido, e porquê

Prompts sintéticos gerados para as provas: as 20 tarefas JSON do P2, as 28 janelas de código do P4 (repositórios MIT, por sha), os 23 prompts-tarefa do R-24 no P7 (um template com o ficheiro trocado). Não são conversas de ninguém. O `P5/results/pii-logs.json` também fica: só tem **contagens** por regex, nenhum texto.
