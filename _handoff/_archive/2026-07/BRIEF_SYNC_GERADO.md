# BRIEF — o SYNC.md deixa de ser escrito e passa a ser projectado

**O problema, medido hoje.** O `SYNC.md` diz *"Última actualização Cowork:
2026-07-26 · Estado: 🟡 Por ler"* e a última entrega que regista é a v1.17.0.
Entretanto saíram a v1.20.0 (sentinela + aferição), a v1.21.0 (aplicar
assíncrono), a v1.22.0 (14 loopholes), a v1.23.0 (Onda 1 "parar a mentira") e a
ETA v1. **Seis versões de dívida.**

**A causa não é distracção.** É que actualizar o SYNC.md é manual, e num sistema
que se diz automático tudo o que é manual diverge. Reescrevê-lo à mão hoje repõe
a dívida na próxima sessão. Por isso não o vamos actualizar — vamos deixar de o
escrever.

Toda a informação já existe noutro sítio, medida:

| O que o SYNC.md diz | De onde sai, hoje |
|---|---|
| que versão está lá fora | `packages/mooter-bridge/manifest.json` |
| o que cada versão entregou | `packages/mooter-bridge/entregas-por-versao.json` |
| o que foi feito e quando | `git log` do branch |
| quem fez, com que agente, quanto custou | `~/.mooter/ledger.jsonl` |
| o que está por fazer | a única parte genuinamente humana |

---

## S1 — `sync.js` na bridge

Uma função que **projecta** o SYNC.md a partir das fontes acima e escreve o
ficheiro. Estrutura:

- **cabeçalho** — versão instalada, HEAD, branch, se está à frente/atrás do
  remoto, e `gerado_em`. Nunca "Por ler": ou está gerado, ou diz porque não deu.
- **entregas** — uma linha por versão, com o que entregou (do
  `entregas-por-versao.json`) e o commit que a trouxe (do `git log`).
- **trabalho recente** — os jobs do ledger agrupados por wave: agente, duração,
  desfecho, custo. Toda a métrica ausente sai `n/d` **com o porquê**, nunca 0.
- **zona humana** — um bloco delimitado por marcadores
  (`<!-- HUMANO:INICIO -->` … `<!-- HUMANO:FIM -->`) que o gerador **preserva
  byte a byte**. É onde vivem decisões, bloqueios e o próximo passo. Se o
  gerador algum dia apagar esta zona, destrói o único conteúdo que não sabe
  recriar — trata isto como invariante e prova-o com um teste.

## S2 — Onde é chamado

- `mooter_journal` com `status_only:true` passa a regenerar o SYNC.md.
- Modo `--check`: recalcula e **compara sem escrever**, saindo diferente de zero
  se o ficheiro estiver desactualizado. Serve de gate.
- **Não** o pendures no fecho de cada job. Um ficheiro reescrito 40 vezes por dia
  polui o `git status` e faz exactamente o ruído que hoje nos obriga a distinguir
  alterações reais de lixo.

## S3 — Gerar o SYNC.md real agora

Correr o gerador e commitar o resultado — a dívida das seis versões paga-se com
a primeira execução, não à mão. Preservar o que existe na zona humana.

## S4 — Testes em `sync.test.js`

1. a zona humana sobrevive a duas gerações consecutivas, byte a byte;
2. uma versão em `entregas-por-versao.json` sem commit correspondente aparece
   assinalada, não silenciada;
3. métricas ausentes saem `n/d` com `porque`, nunca `0`;
4. `--check` devolve código diferente de zero quando o ficheiro está velho, e
   **não escreve nada** nesse caso;
5. gerar duas vezes seguidas sem factos novos produz ficheiro idêntico
   (idempotência) — senão suja o `git status` a cada corrida.

## Regras da casa

- `git add` **selectivo**. Nunca `git add -A`. Sem push, sem PR.
- Não tocar em `tools/router/classify.js` (FROZEN) nem em `landing/app/page.tsx`.
- Português nos comentários, inglês nos identificadores.
- Nenhum número sem origem. Se não foi medido, é `n/d` com o porquê.
