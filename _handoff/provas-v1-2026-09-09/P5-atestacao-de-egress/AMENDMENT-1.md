> **SUPERADA pela AMENDMENT-2:** a afirmação «o claude.exe não honra HTTPS_PROXY» era um defeito do meu instrumento (D8); o braço E foi re-medido pelo proxy.

# P5 · AMENDMENT-1 — três alterações de instrumento, nenhuma de métrica (2026-09-09)

**Regra:** o protocolo (`22388a20`, commitado 13:40:15Z antes da primeira corrida) não muda; muda-se o instrumento onde ele falhou, escreve-se aqui, re-corre-se só o braço afectado.

## 1 · Braço E (referência nativa): do counting-proxy ao `netstat` amostrado

- **O que falhou:** o protocolo previa medir o `claude.exe -p` através do `counting-proxy` (HTTPS_PROXY em loopback, conta CONNECT + bytes do túnel). A sonda `e-probe.mjs` mostrou que o `claude.exe` **não honra `HTTPS_PROXY`** nesta máquina: com a variável definida fica pendurado (exit `null` aos 90 s, **0 ligações ao proxy**); sem ela responde em 8 s (defeito D8 em `09-DEFEITOS-APANHADOS.md`; não é do Mooter).
- **O que se faz em vez disso:** o próprio protocolo já declarava o limite («um processo que não é Node e não honra HTTPS_PROXY não é observado por nenhum destes; nesse caso a célula é n/d, com Get-NetTCPConnection amostrado como controlo grosseiro»). `arm-e.mjs` amostra `netstat -ano -p tcp` a cada 150 ms durante cada chamada, filtrado pelo pid do `claude.exe` e dos filhos (`Win32_Process ParentProcessId`), e resolve os IPs remotos por DNS inverso.
- **O que a célula passa a dizer:** ligações externas por prompt e destinos (**medido, grosseiro**); **bytes = n/d**; «o prompt saiu» atestado pelo próprio host (`usage.input_tokens` no JSON de saída — por desenho, 100 % do prompt vai para a API).
- **O que NÃO se pode afirmar:** bytes por prompt do nativo; qualquer comparação de bytes entre E e os outros braços.

## 2 · Braço B (árbitro instrumentado): a verificação «prompt cru no corpo» era literal

- **O que falhou:** `raw_prompt_in_body` procurava o texto do prompt tal-e-qual no corpo do pedido; o corpo é JSON, e 2 dos 20 prompts têm aspas/quebras de linha que vão escapadas → contavam como «não está lá», o que era falso.
- **Correcção:** procura-se também a forma JSON-escapada (`JSON.stringify(prompt).slice(1, -1)`).
- **Re-corrida:** 20/20 com o prompt cru no corpo (era 18/20 por defeito do instrumento). Bytes médios de corpo 2 162. Continua **[instrumented]**, não [network-observed]: nada saiu da máquina.

## 3 · Braço C (claude-code-router): `n/d` com o bloqueio literal

Não é uma emenda ao instrumento — é a aplicação do R8 (60 min) e da regra de paragem do protocolo. O `--analyse` passa a imprimir `C_ccr: { status: 'n/d', blocker: … }` quando não há `C-ccr.json`. Detalhe, comandos tentados e comando para retomar em `ccr.md`.

## O que não mudou

Corpus (n01–n20), braços A/A-block/D/PII e os seus resultados de 13:42Z–13:5xZ, métricas, regra de paragem, `nao_prova`.
