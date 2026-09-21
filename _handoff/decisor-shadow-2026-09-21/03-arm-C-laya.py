#!/usr/bin/env python
"""03-arm-C-laya.py — braco C: Laya zero-shot (e, se existir, checkpoint fine-tuned) no MESMO corpus/rotulos do braco D.
   python 03-arm-C-laya.py [--corpus <path>|gold] [--labels <path>] [--model convaiinnovations/laya] [--subfolder laya-typed-decisions]
   Saida: results/C-<model>-<corpus>.json com o MESMO schema de linhas do braco D (id, tier, p_max, abstain, ms, answers).
   Aviso do autor do Laya: zero-shot ~0.36 (aleatorio). Este braco existe para IMPRIMIR isso no nosso corpus e para servir de base ao fine-tune (README §F1c).
"""
import json, os, sys, time, math
from pathlib import Path
HERE = Path(__file__).resolve().parent; ROOT = HERE.parent.parent
P1 = ROOT / '_handoff' / 'provas-v1-2026-09-09' / 'P1-decidir-custa-zero'
def opt(k, d=None):
    a = sys.argv[1:]; return a[a.index(k) + 1] if k in a and a.index(k) + 1 < len(a) else d
RUBRIC = (P1 / 'label-rubric.txt').read_text(encoding='utf-8')
TIERS = ['T0', 'T1', 'T2', 'T3']
QUESTIONS = {
    'tier': {'type': 'choice', 'instructions': 'Which routing tier does this software-task prompt need? Ladder:\n' + RUBRIC,
             'criteria': {'T0': 'trivial, mechanical, one file, no risk', 'T1': 'small text or short explanation',
                          'T2': 'reasoning: investigate, compare, plan, decompose, interpret', 'T3': 'architecture, multi-file, security, production, irreversible'}},
    'complexity': {'type': 'score', 'instructions': 'How complex is the task?', 'criteria': ['simple, one step', 'moderate, a few steps', 'demanding, investigation or design']},
    'high_stakes': {'type': 'noul', 'instructions': 'Would a wrong or sloppy answer be costly (security, data loss, production, architecture)?'},
    'needs_repo': {'type': 'noul', 'instructions': 'Does answering well require reading or changing several files of the repository?'},
}
def load_corpus():
    c = opt('--corpus', 'gold')
    if c == 'gold':
        g = json.loads((ROOT / 'tools' / 'router' / 'gold-labels.json').read_text(encoding='utf-8'))
        items = g if isinstance(g, list) else (g.get('labels') or g.get('items') or list(g.values()))
        return 'gold-84', [{'id': x['id'], 'prompt': x['prompt']} for x in items], {x['id']: x['expected_tier'] for x in items}, 'gold'
    corpus = json.loads(Path(c).read_text(encoding='utf-8'))
    items = [x for x in (corpus.get('items') or corpus) if x.get('prompt') and not x['prompt'].startswith('[[redigido')]
    if not items: raise SystemExit(f'corpus {c} so tem prompts redigidos — precisa do corpus NAO redigido (README §corpus)')
    lp = opt('--labels', str(P1 / 'labels-63.json')); L = json.loads(Path(lp).read_text(encoding='utf-8'))
    return Path(c).name, items, {l['id']: l['tier'] for l in (L.get('labels') or L)}, lp
def wilson(k, n, z=1.96):
    if not n: return [0, 0]
    p = k / n; d = 1 + z*z/n; c = p + z*z/(2*n); s = z*math.sqrt(p*(1-p)/n + z*z/(4*n*n)); return [(c-s)/d, (c+s)/d]
def main():
    import laya
    model = opt('--model', 'convaiinnovations/laya'); sub = opt('--subfolder')
    t0 = time.time()
    try: agent = laya.load(model, subfolder=sub) if sub else laya.load(model)
    except TypeError: agent = laya.load(model)  # versao sem subfolder
    load_s = time.time() - t0
    name, items, labels, lp = load_corpus()
    rows = []
    for it in items:
        t = time.perf_counter(); res = agent.predict(it['prompt'][:4000], QUESTIONS); ms = (time.perf_counter() - t) * 1000
        a = res['answers'] if isinstance(res, dict) else res.answers
        tier = a['tier'].get('choice'); conf = float(a['tier'].get('confidence', float('nan')))
        probs = a['tier'].get('probabilities') or a['tier'].get('probs') or {}
        rows.append({'id': it['id'], 'tier': tier, 'p_max': conf, 'abstain': conf < 0.4, 'ms': ms,
                     'answers': {k: {kk: (float(vv) if isinstance(vv, (int, float)) else vv) for kk, vv in v.items()} for k, v in a.items()}, 'probs_tier': probs})
        sys.stderr.write(f"{it['id']} {tier} p={conf:.2f} {ms:.0f}ms\n")
    for r in rows: r['expected'] = labels.get(r['id']); r['correct'] = r['tier'] == r['expected']
    n = sum(1 for r in rows if r['expected']); k = sum(1 for r in rows if r['correct'])
    conf = {}
    for r in rows:
        if r['expected']: key = f"{r['expected']}->{r['tier']}"; conf[key] = conf.get(key, 0) + 1
    lat = sorted(r['ms'] for r in rows); q = lambda x: lat[min(len(lat)-1, int(len(lat)*x))] if lat else None
    bins = [{'lo': i/10, 'n': 0, 'ok': 0, 'sp': 0.0} for i in range(10)]; tot = 0
    for r in rows:
        p = r['p_max']
        if not (p == p): continue
        b = bins[min(9, int(p*10))]; b['n'] += 1; b['sp'] += p; tot += 1; b['ok'] += 1 if r['correct'] else 0
    ece = sum((b['n']/tot)*abs(b['ok']/b['n'] - b['sp']/b['n']) for b in bins if b['n']) if tot else None
    summary = {'k': k, 'n': n, 'p': k/n if n else None, 'ci95': wilson(k, n), 'confusion': conf, 'latency_ms': {'p50': q(.5), 'p95': q(.95), 'max': lat[-1] if lat else None},
               'calibration': {'ece': ece, 'n': tot}, 'abstain': sum(1 for r in rows if r['abstain']), 'load_s': load_s}
    out = {'arm': 'C-laya', 'model': model, 'subfolder': sub, 'corpus': name, 'labels': lp, 'questions': QUESTIONS, 'policy': 'v0-argmax-tier', 'at': time.strftime('%Y-%m-%dT%H:%M:%S'), 'summary': summary, 'rows': rows}
    f = HERE / 'results' / f"C-{(sub or model).replace('/', '_')}-{name.split(' ')[0]}.json"; f.parent.mkdir(exist_ok=True)
    f.write_text(json.dumps(out, indent=1), encoding='utf-8')
    print(json.dumps({'arm': 'C-laya', 'model': sub or model, 'acc': summary['p'], 'ci95': summary['ci95'], 'n': n, 'ece': ece, 'p50_ms': summary['latency_ms']['p50'], 'file': f.name}, indent=1))
if __name__ == '__main__': main()
