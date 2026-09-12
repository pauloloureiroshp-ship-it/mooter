#!/usr/bin/env python
"""tz-classify.py — braco D do P1: tzachbon/claude-model-router-hook @f687111e.

    python tz-classify.py <hooks_dir> <corpus-63.json> <out.json> [--cli]

Importa o pacote `router` do proprio plugin (nao reimplementa nada) e corre
`taxonomy.classify` + `policy.main_prompt_decision` por prompt, com o modelo
corrente fixado em `opus` (o hook sai 0 em silencio sem modelo corrente).
Com --cli, liga classifier.cli_fallback e conta quantas vezes o `claude -p`
dispara, quantas expiram (tecto de 8 s do proprio plugin) e quanto demora.
"""
import json, os, sys, time, tempfile

hooks_dir, corpus_path, out_path = sys.argv[1], sys.argv[2], sys.argv[3]
use_cli = '--cli' in sys.argv
sys.path.insert(0, hooks_dir)
from router import config, taxonomy, policy, ladder  # noqa: E402

# config isolada: nunca o ~/.claude do dono
home = tempfile.mkdtemp(prefix='provas-tz-home-')
os.environ['USERPROFILE'] = home; os.environ['HOME'] = home
os.makedirs(os.path.join(home, '.claude'), exist_ok=True)
cfg_path = os.path.join(home, '.claude', 'model-router.json')
with open(cfg_path, 'w') as f:
    json.dump({"version": 2, "apply_mode": "warn", "classifier": {"cli_fallback": bool(use_cli)}}, f)
cfg = config.load_config(global_path=cfg_path, cwd=home)

MAP_EXACT = {"mechanical": "T1", "implementation": "T3", "debugging": "T3", "architecture": "T3", "extreme": "T3"}
MODEL_TIER = {"haiku": "T1", "sonnet": "T2", "opus": "T3", "fable": "T3"}

items = json.load(open(corpus_path, encoding='utf8'))["items"]
rows = []
cli_stats = {"fired": 0, "timeouts_or_none": 0, "classes": {}, "seconds": []}
for it in items:
    p = it["prompt"]
    t0 = time.perf_counter()
    klass_h, res = taxonomy.classify_heuristic(p, cfg)
    confident = (res.margin >= cfg.get("thresholds", {}).get("confident_margin", 3) and res.scores[res.top] >= 3)
    intent = taxonomy.has_task_intent(p)
    would_cli = bool(intent and res.word_count > 0 and not confident)
    klass = klass_h
    cli_reply = None
    if use_cli and would_cli:
        from router import cli_fallback
        cli_stats["fired"] += 1
        t1 = time.perf_counter()
        cli_reply = cli_fallback.classify_cli(p, cfg, None)
        cli_stats["seconds"].append(round(time.perf_counter() - t1, 2))
        if cli_reply is None:
            cli_stats["timeouts_or_none"] += 1
        else:
            cli_stats["classes"][cli_reply] = cli_stats["classes"].get(cli_reply, 0) + 1
            klass = None if cli_reply == "abstain" else cli_reply
    dt = (time.perf_counter() - t0) * 1000
    decision = None
    if klass is not None:
        d = policy.main_prompt_decision(klass, "opus", "high", cfg, res, p)
        if d is not None:
            d = policy.apply_gates(p, d, cfg)
            decision = {"model": d.model, "effort": d.effort, "klass": d.klass, "source": d.source}
        else:
            decision = {"model": "opus", "effort": None, "klass": klass, "source": "match-current"}
    tier_mapped = MAP_EXACT.get(klass) if klass else None
    tier_by_model = MODEL_TIER.get(decision["model"]) if decision else None
    rows.append({
        "id": it["id"], "klass": klass, "klass_heuristic": klass_h, "top": res.top, "margin": res.margin,
        "scores": dict(res.scores), "word_count": res.word_count, "task_intent": intent, "confident": confident,
        "would_cli": would_cli, "cli_reply": cli_reply, "decision": decision,
        "tier_mapped": tier_mapped, "tier_by_model": tier_by_model,
        "binary": ("barato" if klass == "mechanical" else ("caro" if klass else None)), "ms": round(dt, 3),
    })
    sys.stdout.write(f"{it['id']}={klass or '-'}({res.top}:{res.margin}) ")
print()
out = {
    "arm": "D", "plugin": "tzachbon/claude-model-router-hook@f687111e", "cli_fallback_enabled": use_cli,
    "current_model_assumed": "opus", "home_isolado": home, "cfg": json.load(open(cfg_path)),
    "cli_fallback": cli_stats if use_cli else {"note": "desligado nesta passagem; would_cli por linha diz quantas vezes dispararia"},
    "would_cli_count": sum(1 for r in rows if r["would_cli"]),
    "note": "mapeamento exacto/binario e NOSSO (protocol.json); o plugin so distingue haiku de opus",
    "rows": rows,
}
json.dump(out, open(out_path, 'w', encoding='utf8'), indent=1, ensure_ascii=False)
print("->", out_path, "decided", sum(1 for r in rows if r["klass"]), "abstain", sum(1 for r in rows if not r["klass"]), "would_cli", out["would_cli_count"])
