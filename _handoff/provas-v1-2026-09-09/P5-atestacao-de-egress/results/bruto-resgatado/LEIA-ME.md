# Bruto resgatado de pastas temporárias — P5

Estes ficheiros sustentam o titular do cartão e **não estavam no pacote**. Viviam em pastas do `%TEMP%` com nomes aleatórios, citadas por caminho absoluto dentro de `results/A.json` e `results/A-block.json`, e o sistema operativo apaga-as sem avisar. Foram copiados para aqui a 2026-09-09T20:29Z, ainda a tempo. É o defeito **D13**.

| Ficheiro | Origem | O que contém |
|---|---|---|
| `tap-braco-A.jsonl` | `%TEMP%/provas-p5-gDX4oa/tap.jsonl` | 110 registos: 75 `tap-loaded` (um por processo Node com o preload) e **35 aberturas de ligação** |
| `tap-braco-A-block.jsonl` | `%TEMP%/provas-p5-RDqyFR/tap.jsonl` | 91 registos: 56 `tap-loaded` e as mesmas 35 ligações |
| `tap-braco-B-arbitro-{1,2,3}.jsonl` | `%TEMP%/provas-p5-arb-*/tap.jsonl` | 2 registos cada (corridas do braço do árbitro) |

## O que o bruto diz, verificável em uma linha

```
node -e "const r=require('fs').readFileSync('tap-braco-A.jsonl','utf8').trim().split('\n').map(JSON.parse); const c=r.filter(x=>x.host!==undefined); const h={}; for(const x of c) h[x.host+':'+x.port]=(h[x.host+':'+x.port]||0)+1; console.log('processos', r.filter(x=>x.event==='tap-loaded').length, '| ligacoes', c.length, h, '| nao-loopback', c.filter(x=>!/^127\./.test(x.host)).length)"
```

Devolve: **75 processos · 35 ligações · `{127.0.0.1:7821: 20, 127.0.0.1:11434: 15}` · não-loopback: 0**.

As 20 para a porta 7821 são o `POST /decision` e o `/metrics` do próprio hook; as 15 para a 11434 são o Ollama. Nenhuma sai da máquina.

**Porque é que isto importa mais do que um número:** o cartão podia dizer apenas «nenhum destino externo registado», que é um negativo — e um negativo de um instrumento que ninguém viu funcionar não vale nada. Foi essa a lição do D8, em que um proxy devolveu «nada» porque o meu próprio código o bloqueava. Aqui o instrumento **registou 35 ligações na mesma corrida**: é o controlo positivo, no mesmo ficheiro, e por isso o negativo é interpretável.

**O que continua fora do alcance:** filhos que não são processos Node não carregam o tap; DNS e UDP não passam por ele; o tráfego do próprio Ollama para fora não é observado; e não há inventário de rede independente. Isto é uma afirmação sobre os processos Node com tap, não uma atestação sobre o dispositivo.
