# Sinal event-driven: CC -> Cowork quando ha uma pergunta

O hook de **Notification** do Claude Code dispara no instante em que o CC espera input/permissao
(`permission_prompt`). Liga-o ao `signal.ps1` -> toast instantaneo + escreve `NEEDS_DECISION.json`.
Assim NAO precisas de vigiar nada: so es chamado quando ha mesmo uma decisao.

## Instalar (1x) - junta ao `~/.claude/settings.json`
```json
{
  "hooks": {
    "Notification": [
      {
        "matcher": "permission_prompt",
        "hooks": [
          { "type": "command",
            "command": "powershell -ExecutionPolicy Bypass -File \"%USERPROFILE%\\frugal\\_handoff\\loop\\signal.ps1\" -Source interactive -Note \"CC espera uma decisao\"" }
        ]
      }
    ]
  }
}
```
> Se ja tens um bloco `hooks`, junta so o array `Notification` dentro dele (nao dupliques `hooks`).

## Push no telemovel (opcional)
Define uma variavel de ambiente e o `signal.ps1` empurra para o teu telemovel via ntfy.sh:
```powershell
[Environment]::SetEnvironmentVariable('MOOTER_NTFY_TOPIC','mooter-paulo-<algo-secreto>','User')
```
Instala a app **ntfy** no telemovel, subscreve esse topico, e recebes o ping mesmo longe do PC.

## Como funciona (event-driven, sem polling teu)
1. CC (interactivo) precisa de algo -> Notification hook dispara `signal.ps1`.
2. `signal.ps1`: toast instantaneo no Windows + `NEEDS_DECISION.json` no bus (+ push opcional).
3. O Cowork (scheduled `cowork-loop-evaluator`) e' no-op enquanto NAO ha sinal; quando ve
   `NEEDS_DECISION.json`, decide pela politica (ou chama-te), responde, e apaga o sinal.

## Limite honesto
Nao ha trigger nativo que "acorde" uma sessao Cowork local de fora (so as Claude Code **Routines**
na cloud tem webhook/API). Por isso o instantaneo e' o **toast/push ao Paulo**; o Cowork actua no
tick seguinte ou quando o abres. Para zero-latencia real, migrar o avaliador para uma Routine cloud.

## Nota: no caminho headless (sdk-runner) nao ha perguntas
O `sdk-runner.mjs` resolve perguntas+permissoes via `canUseTool` (sem dialogos). So escala o
**irreversivel** -> ai escreve em `DECISIONS.md` e (futuro) chama `signal.ps1`. Os toasts acima
sao sobretudo para as sessoes **interactivas** legadas enquanto existirem.
