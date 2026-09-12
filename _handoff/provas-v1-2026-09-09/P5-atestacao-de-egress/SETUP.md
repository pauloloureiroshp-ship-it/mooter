# P5 · SETUP — braço D (LiteLLM) — o que os ficheiros do pacote registam

Só o que `00-preflight.json` e `run.mjs` afirmam. O que nenhum dos dois regista está marcado **n/d**.

## Ambiente (`00-preflight.json → versions`, `machine`)

- Windows 11 Pro 10.0.26200 · python 3.12.10 · pip 26.2.1 · node v24.14.0

## Instalação (`00-preflight.json → competitors.LiteLLM`)

- `python -m venv` falhou (ensurepip) → instalado com `pip --target`.
- Versão: **1.100.0**; campo `version`: «1.100.0 (pip --target scratchpad/litellm-site)».
- Comando reconstruído a partir desses dois campos (a linha exacta não ficou registada em nenhum ficheiro do pacote — **n/d**):

  ```
  pip install --target <site> litellm==1.100.0
  ```

- Executável: `<site>/bin/litellm.exe` (`python -m litellm` não tem `__main__`).
- O banner precisa de `PYTHONIOENCODING=utf-8`.

## Onde o `run.mjs` procura o site (`armD`)

- Variável `P5_LITELLM_SITE`; por omissão `C:/Users/Paulo Loureiro/AppData/Local/Temp/provas-litellm` — o caminho constante em todas as versões commitadas do `run.mjs` (desde `72762f2f`); para as duas corridas D anteriores ao primeiro commit (13:50/13:56Z) o caminho efectivo é n/d (`at` dos ficheiros: `D-litellm-v1-costs-in-litellm_params.json` 13:50:50Z, `D-litellm.json` 13:56:32Z, `D-litellm-invert.json` 14:25:50Z, `D-litellm-tiny.json` 14:27:28Z).
- **Nota:** o preflight nomeia `scratchpad/litellm-site`; o `run.mjs` aponta para `.../Temp/provas-litellm`. Os dois nomes estão nos ficheiros; a relação entre eles (o mesmo directório? uma cópia?) não está registada — **n/d**.

## Como o `run.mjs` arranca o proxy (`armD`)

- `<site>/bin/litellm.exe --config <tmp>/config.yaml --port <4000–4499, aleatório> --host 127.0.0.1`
- Ambiente (além do herdado): `PYTHONPATH=<site>` · `LITELLM_TELEMETRY=False` · `DO_NOT_TRACK=1` · `PYTHONIOENCODING=utf-8` · `PYTHONUTF8=1`
- Espera até 90 s por `GET /health/liveliness` → 200; sem isso a corrida grava `litellm_up: false`.
- `config.yaml`: dois *deployments* com `model_name: router` — `ollama/qwen2.5:3b` → `mock-llm` barato e `openai/mock-cloud` → `mock-llm` caro (`api_key: provas-fake`), ambos em loopback; `routing_strategy: cost-based-routing`; `drop_params: true`; `telemetry: false`. Preços em `litellm_params` **e** `model_info` (v2; a v1 só em `litellm_params` está guardada em `results/D-litellm-v1-costs-in-litellm_params.json`).
- Preços: barato `0.0/0.0` (ou `1e-9/3e-9` com `--tiny`), caro `1e-5/3e-5`; `--invert` troca-os mantendo portas e identidades.
- 20 pedidos `POST /chat/completions` com `model: router`, `max_tokens: 8`, `authorization: Bearer anything`, timeout 30 s.

## Reproduzir

```
P5_LITELLM_SITE=<site> node _handoff/provas-v1-2026-09-09/P5-atestacao-de-egress/run.mjs --arm D
P5_LITELLM_SITE=<site> node _handoff/provas-v1-2026-09-09/P5-atestacao-de-egress/run.mjs --arm D --invert
P5_LITELLM_SITE=<site> node _handoff/provas-v1-2026-09-09/P5-atestacao-de-egress/run.mjs --arm D --tiny
# (sintaxe POSIX/git-bash; em PowerShell: $env:P5_LITELLM_SITE='<site>'; node _handoff/provas-v1-2026-09-09/P5-atestacao-de-egress/run.mjs --arm D)
```

Sem `P5_LITELLM_SITE` o `run.mjs` usa o caminho desta máquina, que noutra não existe.
