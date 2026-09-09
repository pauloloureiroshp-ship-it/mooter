# `conferir-cartoes.mjs` — o portão que relê os slides contra o bruto

```bash
node lib/conferir-cartoes.mjs .        # da raiz do pacote; exit 0 = tudo confere, exit 1 = diverge
```

34 verificações, `$0`, sem chamar modelo nenhum. Lê os `results/*.json` de cada cartão e confronta-os com o que os `.md` publicam. Não confia na minha memória nem na minha palavra: se um número do slide deixar de bater com o bruto, o comando reprova e diz qual.

## O que confere

- **P1** — as três precisões contra o `analysis.json`: 22,2 % nos 63 (o teste **pré-registado**), 69,8 % do juiz local, e os dois p (3,0×10⁻⁷ nos 63, 0,059 nos 40). E que o estrato dos 23 é 0/23 contra 23/23, que é a derrota mais dura do cartão.
- **P2** — o slide dá percentagens (35 / 85 / 95) e o índice dá fracções (7 / 17 / 19 sobre 20). Confere que são **o mesmo número em duas moedas**, em vez de procurar a forma literal.
- **P3** — que a métrica estrita de obediência é 0 nos três braços **e qual é o denominador de cada um**. O campo guarda `k` e o intervalo mas não guarda `n`, e o `n` lê-se do limite superior de Wilson: `hi ≈ 0,1611` é n = 20, `hi ≈ 0,4345` é n = 5. Isto importa porque «0/20» e «0/5» lêem-se iguais num slide e são coisas diferentes: os dois braços Sonnet correram 20 sessões cada, o braço Opus foi uma sonda de 5.
- **P4** — 27 e 26 acertos, 2 e 4 alarmes falsos, p = 1,0 nos dois sentidos, e que o rótulo da linha diz que o revisor **foi informado de qual linha mudou**.
- **P6** — que o corte pré-registado é mesmo **939 + 492 + 20 = 1 451**. Esse número não está guardado em campo nenhum: é uma soma, e por isso confere-se somando as três parcelas do bruto. E que as três dão zero com custo **e** origem.
- **P8 e transversais** — nenhuma célula `n/a` sem motivo; a palavra «Ties» fora; nenhum quantificador «never picked»; a legenda a distinguir `n/d` de `n/a`; nenhum slide com palavra proibida; todos os slides com a linha «does not prove».

## Teste de mordida (2026-09-09)

Uma guarda que nunca reprovou não é guarda. Três defeitos plantados, um de cada família, e o que cada um deu:

| Defeito plantado | Resultado |
|---|---|
| `22.2 %` → `22.3 %` no slide do P1 | **reprova** — «P1 acc63 regra 22.2 no slide» |
| `*Does not prove:` → `*Does not prove that the hook enforces anything:` no P6 | **reprova** — «nenhum slide com palavra proibida :: P6-custo-na-linha/slide.md» |
| uma célula `n/a` sem motivo no P8 | **reprova** — «P8 sem celula n/a sem motivo» |

Repostos os três, volta a exit 0.

**Nota honesta sobre a primeira versão deste ficheiro.** Correu com **quatro divergências** e as quatro eram do verificador, não do pacote: procurava `17/20` num slide que escreve `85 %`, procurava o literal `1451` num ficheiro onde ele é uma soma, e usava a forma errada do campo do P3. Um verificador que acusa o sujeito quando o errado é ele próprio é pior do que não ter verificador — foi corrigido caso a caso, com o bruto ao lado, antes de entrar aqui.

**O que este portão NÃO faz:** não recalcula os números a partir dos dados originais (isso é o `--analyse` de cada cartão, ver `11-REPRODUZIR.md`), não julga se a interpretação está certa, e não cobre o P5 nem o P7 — o P5 porque o titular dele já é conferido pelo bruto resgatado com um comando próprio (`P5/results/bruto-resgatado/LEIA-ME.md`), o P7 porque ainda não tem veredicto.
