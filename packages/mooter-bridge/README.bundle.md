# mooter

A frota Mooter dentro do Cowork, sem interface propria.

## O que faz

Duas superficies nativas, nenhuma delas do Mooter:

- **Painel na conversa** (`ui://mooter/fleet`, MCP Apps) — quem esta a trabalhar agora,
  com que LLM, agrupado por wave, mais os modelos residentes na GPU local. Repolla sozinho.
- **Progress do sidebar** — uma tarefa por job, **riscada** quando o ledger disser `done`,
  com o agente que a fez. Conduzido pela skill `mooter-fleet`.

## Componentes

| Tipo | Nome | Papel |
|---|---|---|
| MCP (stdio) | `mooter` | 9 tools: sessions, run, route/dispatch/status/collect, fleet, session_bind |
| Skill | `mooter-fleet` | como operar a frota e espelhar os jobs no Progress |

## Requisitos

- **Node** no PATH do processo que lanca o servidor (Windows: `C:\Program Files\nodejs\node.exe`).
- Os CLIs `claude` e/ou `codex` instalados, para despachar.
- **Ollama** (opcional) para a seccao `Local · GPU`. Sem ele a seccao diz `n/d`, nunca zero.

## Configuracao

Nenhuma. O servidor descobre sozinho:

- **o repo** (`~/frugal`, `~/Documents/frugal`, ou a arvore acima do proprio ficheiro) para ligar o
  host-extra e mostrar o **nome concreto do modelo**. Nao encontrando, mostra o rotulo do agente — honesto.
- **o Ollama** em `127.0.0.1:11434`.

Opcional, so se a tua instalacao for fora do sitio: `MOOTER_HOME` e `OLLAMA_HOST`.
Um placeholder `${VAR}` por expandir e tratado como "nao definido" — nunca como um hostname.

## Usar

1. `mooter_session_bind` no inicio da sessao (projeto, pasta, ficheiros).
2. "mostra a frota" -> o painel aparece.
3. Despachar: uma `TaskCreate` por job antes do dispatch, `completed` so quando o ledger disser `done`.

## Limites honestos

- `moo` **nao** e um agente valido do `mooter_dispatch` (enum: `cc`, `codex`, `gemini`).
  A GPU aparece por **observacao** (`GET /api/ps`), nao por despacho.
- Subagentes vao sempre `null`: nem o ledger nem o host-extra os registam.
- Jobs sao read-only enquanto as keys/PAT nao forem rotadas.
