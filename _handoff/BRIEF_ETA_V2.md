# BRIEF — ETA v2: os estimadores, com o E3 no papel certo

**Onde estamos.** A ETA v1 (commit `84792f5`) já entregou a fundação: os três
agentes declaram `steps_total` e emitem eventos `step`, e o `eta.js` mantém
`~/.mooter/eta-index.json` com percentis por agente × categoria × faixa de
contexto, janela deslizante de 200, interrupções fora dos percentis e `n/d`
abaixo de 5 observações.

Falta transformar isso numa resposta.

---

## A correcção de desenho (ler antes de codificar)

O plano original tinha três estimadores de tempo. Estava errado.

**Bytes de log não medem trabalho.** Um job que lê 50 ficheiros produz log a
rodos e entrega pouco; um job que pensa muito produz pouco log e entrega muito.
Como estimador de duração, o crescimento do log é ruído com ar de sinal.

Mas é o **único** que responde a uma pergunta que os outros dois não respondem.
Então cada um fica com o seu papel, e são independentes:

| | Estimador | Responde a | Nunca é usado para |
|---|---|---|---|
| **E1** | passos declarados | **onde vai** — `3 de 4` | estimar tempo por si só |
| **E2** | percentil histórico | **quanto falta** — `~7 min` | dizer se está vivo |
| **E3** | crescimento do `out.log` | **está vivo** — `cresceu há 4 s` / `parado há 6 min` | **estimar tempo. Nunca.** |

É a anatomia de um download: percentagem **e** velocidade actual. Quando a
velocidade é zero vê-se logo, mesmo com a barra a 60%. É exactamente o caso que
nos escapou hoje — um job ficou 30 min e saiu `timeout` com o trabalho todo
feito, e ninguém soube distinguir "a trabalhar" de "preso".

---

## S1 — `eta.js`: guardar bytes, mas só para vivacidade

Estender a amostra existente (**não** criar um segundo índice — duplicaria
janela, dedupe e I/O, e reintroduziria o custo que a janela existe para evitar):

- `recordObservation` passa a aceitar `bytes_finais` ao lado de `duration_s`.
- `recompute` calcula percentis das duas séries **na mesma janela de 200**.
- Os percentis de bytes servem **só** para normalizar o sinal de vivacidade.
  Não entram em nenhum cálculo de tempo. Deixa isto escrito num comentário,
  para que ninguém os ligue à ETA daqui a três meses.
- Sem 5 observações com bytes medidos ⇒ `n/d` com o porquê, e a vivacidade
  degrada para o sinal cru ("o log cresceu há N s"), que é honesto e chega.

## S2 — `estimativa.js`: a resposta composta

Uma função que, dado um `job_id` vivo, devolve:

```
{
  progresso: { passo: 3, de: 4, fonte: 'passos declarados' } | { valor: null, porque },
  falta_s:   { valor: 412, base: 'p50 de 9 jobs codex|codigo|4-32k', percentil_actual: 'p60' } | { valor: null, porque },
  vivo:      { estado: 'a-trabalhar'|'parado'|'n/d', ultimo_crescimento_s: 4, porque },
  manda:     'E1'|'E2',
  aviso:     null | 'passou o p90 — o máximo histórico foi X min'
}
```

Regras, sem excepção:

1. **`falta_s` sai sempre do estimador mais conservador** de entre os que têm
   base. Se o E1 diz "passo 3 de 4" e o E2 diz "faltam 12 min", ganha o que
   projecta mais tempo. Nunca a média — a média inventa um número que nenhum
   dos dois defendeu.
2. **A ETA nunca encolhe abaixo do já decorrido.** Uma barra que salta para trás
   destrói mais confiança do que barra nenhuma.
3. **Passar o p90 avisa e continua.** Nunca cancela, nunca sugere cancelar.
4. `manda` é obrigatório: quem lê tem de poder ver qual estimador está a falar.
5. Sem base nenhuma ⇒ tudo `null` com `porque`. A UI mostrará barra
   indeterminada, que é a convenção universal para "não sei quanto falta".

## S3 — Ligar ao `mooter_check` e ao `mooter_fleet`

- `mooter_check` de um job vivo passa a devolver o bloco `estimativa`.
- `mooter_fleet view:'jobs'` devolve o mesmo bloco por job vivo.
- **Uma linha por job/agente. Nunca uma barra agregada da wave** — o denominador
  de uma wave é a soma de estimativas, e o erro compõe-se.
- Custo de leitura: um `eta-index.json` + um `stat` ao `out.log`. **Nunca**
  varrer o `ledger.jsonl` no caminho quente.

## S4 — Testes em `estimativa.test.js`

1. o conservador ganha: E1 projecta 3 min, E2 projecta 12 min ⇒ `falta_s` = 12 min, `manda: 'E2'`;
2. a ETA não encolhe abaixo do decorrido;
3. passado o p90, `aviso` aparece e o job **não** é cancelado;
4. sem histórico, tudo `null` com `porque` legível — e nenhum campo numérico inventado;
5. bytes nunca influenciam `falta_s`: duplicar os bytes de uma amostra não muda a estimativa de tempo em nenhum caso;
6. o caminho de leitura não abre `ledger.jsonl` (espiar o `fs`, como no `eta.test.js`).

## Regras da casa

- `git add` **selectivo**, ficheiro a ficheiro. Nunca `git add -A`.
- Não fazer push. Não abrir PR. Não tocar em `tools/router/classify.js` (FROZEN).
- Não tocar em `landing/app/page.tsx` — tem uma alteração por decidir.
- Comentários e mensagens em português; identificadores em inglês.
- Se um passo não puder ser feito com honestidade, **parar e escrever o porquê**
  em vez de entregar um número plausível.
