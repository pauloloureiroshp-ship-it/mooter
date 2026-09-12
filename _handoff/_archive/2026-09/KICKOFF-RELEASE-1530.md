# KICKOFF — Release Mooter 1.53.0 «Moo Ledger» · 2026-09-01

És o Claude Code no mac-mini, custódia do git. O PR #461 (Ledger v4 em main, fc5cff28) fechou a
fundação; esta release fecha o produto. Branch `mac/release-1530`, nunca main direto. NUNCA
`add -A` / `--force` / `--admin`. classify.js FROZEN. Runner e kill-switch intocados.

## Escopo (1 PR; corta com motivo o que não couber com qualidade)
1. **Bump 1.53.0** (plugin.json + onde a versão viver) e build `_handoff/mooter-v1530.mcpb`.
2. **Endpoints que tiram os badges "proposed" do Ledger** no f10-server:
   - `POST /triage {chave, decisao, motivo}` — grava na triagem.jsonl assinado; o Ledger confirma
     por repoll (nunca sucesso otimista — o contrato já está no shell).
   - `POST /assist {mensagem}` — relay ao Ollama local (modelo residente ou o configurado), resposta
     texto puro; SEM tool-calls nesta versão; o Moo dock do Ledger liga aqui.
   - `POST /update` — devolve instrução com o path do mcpb mais novo (o install continua gesto do dono).
   Todos com origin-allowlist (G8: rejeitar Origin de site; aceitar sem-Origin/file://) + `lsof -i :4290`
   verificado no arranque e escrito no log (bind 127.0.0.1 provado, não presumido).
3. **G6 — fleet-state/ledger ganham** `finding_id` estável, `triage.items[]`, `route`, `publish`,
   `feed[].device` — e o build-ledger-snapshot passa os threads/stories de heurística a dado real.
4. **G3 — beacon que não apodrece**: renovação/re-assinatura automática do beacon (launchd/cron
   horário, zero-LLM) + `seq` monotónico; a "assinatura expirada" que hoje esconde os outros devices
   passa a ser exceção, não regra.
5. **Perf do Ledger**: o screenshot CDP expira em página longa — trocar o fundo pontilhado por
   textura mais barata (ou `content-visibility:auto` nos capítulos) mantendo a estética; validar
   com um capture local antes do merge.
6. **Skill /moo-pilot**: confirmar que o snapshot do sidebar sai do build-ledger-snapshot (uma
   fonte só) e que a nota vivo-vs-snapshot está na skill.
7. **Docs/coerência**: SYNC (≤200 linhas), journal no vault, e CHANGELOG da 1.53.0 com o que entrou
   e o que ficou de fora.

## Portões
Testes 0 fail antes do push · PR `gh pr create` citando este kickoff · merge squash SÓ com CI verde
(usa update-branch se a main andar) · pós-merge: main puxado + `node tools/cockpit/runner/build-ledger-snapshot.mjs` limpo + `curl -s 127.0.0.1:4290/ledger | head -c 200` a responder após reinício do painel.

## Fora do escopo (dono decide depois)
G4 instrumento/rotação · G7 residente+MooterBench · inscrição do Jetson · frota remota (cada device
puxa main e reinstala conector quando o dono lá estiver).
