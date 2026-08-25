# MP_ADDENDUM — F10 · MOO VIGIA (endpoint local $0 → artifact Cowork)

> Adendo ao MP_HIPER. Colar no fim. F10 depende de F-anteriores só no que já existe no host:
> `~/.mooter/ledger.jsonl` (append por device), `eta-index.json`, `jobs/<id>/`, `cowork-session.json`.
> Lição Live Preview: iframe local no Cowork carrega em 5ms (ui-probe.json) — polling local é viável e barato.

## F10 — VIGIA: servidor loopback que alimenta o artifact "Moo Vigia"

### DO
1. **Comando**: `mooter vigia --serve` (ou módulo do bridge Node já residente — preferir módulo: zero processo extra). Bind **exclusivo** em `127.0.0.1:4290` (flag `--port`, default 4290). Nunca `0.0.0.0`, nunca `::`.
2. **GET /fleet.json** — agregado composto a partir de ledger/disco (a mesma composição do painel `mooter_fleet`, extraída para função partilhada, não duplicada):
   - `jobs`: live em `jobs/<id>/` (id, pilar, modelo, início, estado);
   - `recibos_janela`: recibos das últimas 24h (passa/falha, por pilar);
   - `erros_rota`: misroutes/erros de despacho na janela;
   - `p8`: interrupções/dia (contador do ledger);
   - `bateria_p4`: último resultado da bateria L0 (verde/alerta + limiar violado);
   - `gauntlet`: estado por pilar P1–P6 (última ronda, resposta L0 ou `n/d`).
3. **GET /events** — SSE opcional (push de novas linhas do ledger via fs.watch); o artifact degrada para polling se ausente.
4. **Contrato JSON** (regra dura em TODOS os campos, incluindo aninhados):
   ```json
   { "schema_version": "1.0", "device": "<hostname>", "medido_em": "<ISO8601>",
     "p8": { "valor": 2, "fonte": "ledger.jsonl" },
     "poupanca_liquida": { "valor": null, "nd_porque": "janela sem par A/B re-executado" } }
   ```
   Doutrina **n/d-com-porquê**: campo sem medição L0 → `valor: null` + `nd_porque` obrigatório. Proibido inventar, interpolar ou omitir o porquê.
5. **CORS**: `Access-Control-Allow-Origin: *` é aceitável **apenas** porque o bind é loopback-only; alternativa mais estrita: refletir só origens `https://claude.ai` / app desktop. Métodos: `GET, OPTIONS`. Sem cookies, sem credenciais.
6. **Artifact "Moo Vigia"** (Claude desktop, via create_artifact): HTML self-contained, `fetch("http://127.0.0.1:4290/fleet.json")` a cada **5s**; banner MODO VIVO com `medido_em` visível; falha de fetch → banner "OFFLINE — servidor vigia parado" (nunca dados stale sem carimbo).
7. **Multi-device**: cada device serve o **seu** vigia com os **seus** ficheiros `~/.mooter/`; o artifact aponta sempre para o localhost do device onde o desktop app corre. Sem federação em F10 — visão de frota agregada continua a ser do `mooter_fleet`/digest (prev_hash por device fica para o passo 5 do roadmap).
8. **Custo**: processo Node ocioso ≈ 0% CPU (leitura lazy no request; SSE via watch, não poll interno), **zero tokens, zero LLM**. Regra-mãe do recibo aplica-se: o /fleet.json é **composição** de ledger/git/disco, nunca redação de LLM.

### GUARD
- **Zero LLM no caminho do dado** — qualquer campo que exigisse julgamento vira `n/d` com porquê; composição, não redação (antídoto fábrica-de-recibos).
- **Zero dados sensíveis**: nunca segredos, tokens, env, nem prompts completos — só ids, contadores, estados, hashes truncados. Ledger contém prompt? → servir apenas resumo estrutural (pilar, modelo, tamanho).
- **Zero auth** aceite SÓ enquanto as duas condições valem: bind loopback + payload não-sensível. Quebrou uma → F10 para e volta ao gate.
- `classify.js` **FROZEN** — F10 não toca no router; sha256 confere antes e depois.
- **PR sim, merge não** — código do vigia entra por PR (`feat/vigia-serve`), review Paulo; merge/push/porta nova: sempre gate humano.
- **Evidência-ou-n/d** em cada campo do contrato; recibo da fase lista "o que NÃO verifiquei".
- Porta ocupada → falhar alto com mensagem, nunca fallback silencioso para outra porta/interface.

### GATE (os 4, todos verdes, evidência colada no recibo)
1. `curl -s http://127.0.0.1:4290/fleet.json | jq .schema_version,.medido_em` → responde <100ms com contrato válido (validar contra schema com `ajv` ou equivalente).
2. Artifact "Moo Vigia" em **MODO VIVO comprovado**: screenshot com `medido_em` a avançar entre dois polls de 5s + um job live real refletido.
3. **Porta NÃO exposta fora do loopback**: `curl --max-time 2 http://<IP-LAN-do-device>:4290/fleet.json` → connection refused; confirmar com `ss -tlnp | grep 4290` (Linux/mac: `lsof -iTCP:4290 -sTCP:LISTEN`) mostrando `127.0.0.1:4290` e não `*:4290`.
4. Custo: processo em idle 60s → CPU ~0% (`top`/`ps`), zero linhas novas no ledger de tokens.

Falhou qualquer gate → F10 fecha em vermelho com recibo, sem merge, sem "quase".

### F10.b — O BOTÃO ▶ (controle do runner pelo artifact — a única mutação permitida)
9. **POST /play** e **POST /stop** — as ÚNICAS rotas de mutação do vigia: `/play` manda o runner drenar as filas dos pilares elegíveis deste device (jobs bounded, mutex de GPU, folga ≥2,2 GB — as regras do runner, não do endpoint); `/stop` escreve o estado STOP no motor (mesmo estado do F3 — um só kill-switch, não dois). Proteções: bind loopback + validação de `Host`/`Origin` (mata DNS rebinding) + token aleatório por device no path (`/t/<token>/play`), gerado no primeiro `--serve` e embutido no shell do artifact. Sem token válido → 403. O drill do F3 passa a incluir o caminho artifact→/stop→fila parada, cronometrado.
10. **Honestidade do botão**: em modo SNAPSHOT o ▶ fica desabilitado com o porquê no tooltip ("runner não aterrado — F2"). O botão nunca simula. "Play" que não despacha job real em 10s → o artifact mostra o erro, não um spinner eterno.

## F11 — FILA DE APROVAÇÃO DO MEO (o clique que substitui a reunião)

### DO
1. **Descoberta ($0, GPU):** o runner, além de drenar filas, roda por pilar o job de descoberta bounded: moo local lê charter do pilar + últimas medições L0 + gauntlet e devolve PROPOSTAS em schema fixo `{id, pilar, titulo, texto, evidencia (comando L0 ou ficheiro:linha — sem evidência a proposta morre no filtro), reversivel, custo, fsm:"drafted"}`. Vocabulário: termos oficiais de vibe coding do repo (`docs/strategy/PILARES_VIBE_CODING.md`) — nada de jargão inventado.
2. **Fila:** propostas `drafted` que passam o scorer do P2 entram em `~/.mooter/propostas.jsonl` e aparecem no `/fleet.json` (campo `propostas`). Cap: **≤5 na fila** (H1); cheia → runner só mede.
3. **POST `/t/<token>/aprovar` e `/rejeitar`** `{id, motivo?}`: grava evento `approved|rejected` no ledger (com ts + device) → runner aplica a proposta APROVADA **no worktree/branch do pilar** (nunca main), roda TESTA, gera recibo, avança FSM `approved→applied→measured`. Rejeição com motivo vira dataset (regra da casa). **Merge/push/delete/segredos NUNCA passam por este botão** — continuam gate humano no GitHub.
4. **Artifact:** aba ✋ Aprovações renderiza `propostas[]` com botões; em SNAPSHOT os botões ficam desabilitados com o porquê. Contagem no badge da tab. Recibo de cada clique aparece na timeline na ronda seguinte.
5. **Registro:** todo `approved→measured` gera nota de evolução (composição de ledger, zero LLM) que o `mooter_journal` leva ao vault; digest diário agrega para o Notion (auditoria Cowork).

### GUARD
- Proposta sem evidência L0 = morta no filtro (antídoto fábrica-de-mentiras). Proposta `reversivel:false` NUNCA entra na fila do botão — vai para o digest com aviso.
- O clique é autorização de **aplicar em branch**, não de publicar. Cap de fila ≤5 e P8 contam cada interação.
- Mesmo modelo de segurança do F10: loopback + Host/Origin + token no path; payload de propostas sem prompts/segredos/paths com username.

### GATE
1 proposta real percorrendo drafted→(clique ✅)→applied→measured→recibo no vault, cronometrada, com o clique dado no artifact em modo VIVO.
