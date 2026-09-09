# P5 · braço C · claude-code-router 3.0.22 — `n/d` com o bloqueio literal

**O que se conseguiu (2026-09-09, ~60 min de tecto):**

- Instalação isolada: `npm install --prefix <scratch>/ccr @musistudio/claude-code-router@3.0.22` → exit 0 (npm, publicado 2026-08-24; upstream `5ad5083b`, 2026-09-01; 37 151 ★).
- Arranque headless com `APPDATA` isolado: `node dist/main/cli.js start --no-open --port 3477` → `CCR service started at http://127.0.0.1:3477/?ccr_web_token=… (pid 56432)`; cria `%APPDATA%\claude-code-router\config.sqlite` (+ `-wal`, `-shm`) e `service.json` com `serviceToken`. Parado com `cli.js stop` → «CCR service stopped».
- Documentação lida (`docs/src/content/docs/en/configuration/{routing,configuration-file}.md`): a configuração vive em **SQLite editado pela UI**; «Use the desktop UI to change configuration»; um `config.json` legado só é lido uma vez como migração «when no SQLite config exists».

**O bloqueio:** o gateway (`:3456`) só responde depois de existir **um provider e uma API key de cliente**, criados pela UI ou pelo RPC `/api/ccr/rpc`. Esse RPC exige o token web (`{"error":{"message":"CCR web authentication token is missing or invalid."}}` com `Authorization: Bearer` e com `x-ccr-web-token`), e o catálogo de métodos não está documentado nem é legível no bundle minificado (`dist/main/cli.js`, 2,3 MB; `dist/renderer/*` só expõe `method:"GET"|"POST"`). Não se testou o caminho legado `config.json` (arrancar com o ficheiro antes do primeiro `start`) porque o tecto de 60 min do R8 acabou — fica como o próximo comando a tentar.

**Célula no P8:** `n/d — configuração headless não conseguida em 60 min; serviço arranca, configuração é UI/SQLite`. Nunca «não tem».

**Comando para retomar:**
```
# 1) antes do primeiro start, colocar %APPDATA%\claude-code-router\config.json no formato v2 (Providers + Router) e verificar se migra;
# 2) senão, abrir http://127.0.0.1:3477/?ccr_web_token=<token> num browser, criar provider = mock-llm (loopback) + API key, e repetir a corrida A com o cliente a apontar para :3456.
```
