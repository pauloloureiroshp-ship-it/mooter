# Wave 26 — Prod Telemetry Day 0 Snapshot

**Captured:** 2026-06-06 (Wave 27 Phase B) · **DB:** D1 `mooter-hub` (`hub/wrangler.mooter.toml`, region ENAM/ORD) · **Mode:** readonly

> TL;DR (3 linhas):
> 1. O loop Wave 26 está **vivo e correcto end-to-end**: 1 `sync_event` real chegou (E2E 2026-06-06 21:47Z) e o **Pastor derivou dele um hint personalizado** (`high_t3`, t3_rate 0.465) em `pastor_state`.
> 2. Ainda **não há tráfego orgânico externo** — esperado, pré friends-launch. O único client é o device de teste do Paulo (`aa23e1…`).
> 3. **171 anomalias `hub_stale`** são false-positives do monitor do path `deltas` antigo (deprecado pelo `sync_events`); nenhum tocou o Paulo (`paulo_notified=0`). Recomendação: silenciar/aposentar esse monitor numa wave futura (NÃO nesta — zero código de produto).

---

## 1. Tabelas no D1 prod

`_cf_KV, aggregated_stats, algorithm_versions, anomalies, d1_migrations, deltas, device_heartbeats, feedback, frugal_events, model_signals, pastor_state, shadow_pairs, sqlite_sequence, sync_events, user_profiles`

Row counts (relevantes):

| Tabela | Rows | Nota |
|---|---|---|
| `sync_events` | **1** | path NOVO Wave 26 (CLI→/v1/events) |
| `pastor_state` | **1** | derivado do sync_event acima |
| `deltas` | 9 | path ANTIGO (delta-sync, May), deprecado |
| `device_heartbeats` | 4 | probes de audit + 1 session25-test |
| `feedback` | 4 | `mooter feedback` CLI |
| `anomalies` | 171 | quase todas `hub_stale` (ver §4) |
| `frugal_events`, `model_signals`, `shadow_pairs`, `aggregated_stats`, `user_profiles` | 0 | vazias |

## 2. O único `sync_event` real (Wave 26 E2E)

```
client_id        aa23e139fb76d0926e86288d7e49296b   (pseudónimo, 32 hex — anónimo)
schema_version   1
emitted_at_utc   2026-06-06T21:47:19.548Z
received_at      2026-06-06T21:47:19.965Z           (latência ~0.4s CLI→hub)
tiers            t0=9  t1=13  t2=1  t3=20            (total = 43)
avg_confidence   0.872
safety           applied=0 / total=43
os               windows-wsl
gpu_class        high-end
ram_class        mid
ollama_available 0
```

Tudo coarse-class (sem fingerprint de device), conforme o schema honesto do Wave 26. Sem PII.

## 3. `pastor_state` — o loop fechou

```
client_id        aa23e139fb76d0926e86288d7e49296b   (= o sync_event acima)
total_decisions  43                                 (= soma dos tiers ✓ consistente)
t0_rate          0.209
t1_rate          0.302
t2_rate          0.023
t3_rate          0.465
ollama_available 0
updated_at       2026-06-06T21:47:19.965Z           (= received_at do event ✓)
hint             {"code":"high_t3",
                  "message":"Over 25% of your prompts hit T3 Opus.
                             Consider `complexity_bias: T2` in CLAUDE.md
                             for routine work."}
```

**Validação:** `total_decisions=43` bate com `t0+t1+t2+t3` do sync_event; `updated_at == received_at`. O Pastor consumiu o event, computou as rates, e disparou correctamente o hint `high_t3` (t3_rate 0.465 > 0.25). **O learning loop está real e correcto** — não é mock.

## 4. Anomalias (171) — false-positives do path antigo

Amostra: todas do tipo `hub_stale`, severity `critical`, "No deltas received in Nh", a partir de 2026-05-03, `last_received: 2026-05-01`. `paulo_notified=0`, `resolved=0`.

Estas são geradas por um cron-monitor que vigia a tabela **`deltas`** (sistema antigo, pré-Wave 26). Como o tráfego migrou para `sync_events`, o monitor de `deltas` ficou perpetuamente "stale" e acumulou 171 alertas — todos ruído, nenhum entregue ao Paulo.

**Recomendação (não-bloqueante, fora desta wave — toca código de produto hub):** numa wave futura, ou apontar o stale-monitor para `sync_events`, ou aposentá-lo. Abrir como issue, não corrigir aqui.

## 5. Conclusão

| Pergunta | Resposta |
|---|---|
| O loop Wave 26 produz dados reais em prod? | **Sim** — 1 sync_event + pastor_state derivado. |
| O Pastor aprende e personaliza? | **Sim** — hint `high_t3` correcto a partir das rates reais. |
| Há adoção externa? | **Ainda não** — só o device de teste. Esperado pré-launch. |
| Algo partido? | Não no path novo. O monitor de `deltas` antigo gera ruído (171 anomalias) — issue futuro. |
</content>
