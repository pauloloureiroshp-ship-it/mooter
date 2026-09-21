// lib-common.mjs — corpus, labels, metricas partilhadas pelos bracos.
import fs from 'node:fs'; import path from 'node:path';
import { fileURLToPath } from 'node:url'; import { createRequire } from 'node:module';
export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');

// OLLAMA_HOST nesta maquina e `127.0.0.1:11434` — SEM esquema, que e o formato
// canonico do Ollama. `fetch('127.0.0.1:11434/api/version')` atira
// `Failed to parse URL`, o catch engole, e o probe declarava «SEM logprobs» com
// o Ollama 0.34.2 vivo a responder — falso negativo que mandava o braco D para
// amostragem e reprovava o gate de ECE por nada. Importamos (so leitura) o
// normalizador canonico do motor em vez de inventar a 8a verdade sobre isto.
const _require = createRequire(import.meta.url);
const { ollamaHostFromEnv } = _require(path.join(ROOT, 'tools', 'router', 'ollama-host.js'));
export const OLLAMA_HOST = ollamaHostFromEnv();
export const P1 = path.join(ROOT, '_handoff', 'provas-v1-2026-09-09', 'P1-decidir-custa-zero');
export const TIERS = ['T0', 'T1', 'T2', 'T3'];
export const args = process.argv.slice(2);
export const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };

// --corpus <path|gold>   corpus {items:[{id,prompt}]} NAO redigido; 'gold' usa gold-labels.json (TREINO)
// --labels <path>        {labels:[{id,tier}]}; com 'gold' os rotulos vem do proprio ficheiro
export function loadCorpus() {
  const c = opt('--corpus', 'gold');
  if (c === 'gold') {
    const g = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'router', 'gold-labels.json'), 'utf8'));
    const items = Array.isArray(g) ? g : (g.labels || g.items || Object.values(g));
    return { name: 'gold-84 (TREINO da regra)', items: items.map((x) => ({ id: x.id, prompt: x.prompt })), labels: Object.fromEntries(items.map((x) => [x.id, x.expected_tier])) };
  }
  const corpus = JSON.parse(fs.readFileSync(c, 'utf8'));
  const items = (corpus.items || corpus).filter((x) => x.prompt && !/^\[\[redigido/.test(x.prompt));
  if (items.length === 0) throw new Error(`corpus ${c} so tem prompts redigidos — precisa do corpus NAO redigido (ver README §corpus)`);
  const lp = opt('--labels', path.join(P1, 'labels-63.json'));
  const L = JSON.parse(fs.readFileSync(lp, 'utf8'));
  const labels = Object.fromEntries((L.labels || L).map((l) => [l.id, l.tier]));
  return { name: path.basename(c), items, labels, labels_path: lp };
}

export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 0]; const p = k / n; const d = 1 + z * z / n; const c = p + z * z / (2 * n); const s = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [(c - s) / d, (c + s) / d];
}
// ECE em 10 bins sobre a prob da classe escolhida
export function ece(rows) {
  const bins = Array.from({ length: 10 }, (_, i) => ({ lo: i / 10, hi: (i + 1) / 10 + (i === 9 ? 1e-9 : 0), n: 0, ok: 0, sumP: 0 }));
  let total = 0;
  for (const r of rows) { const p = r.p_max; if (!Number.isFinite(p)) continue; const b = bins.find((b) => p >= b.lo && p < b.hi); if (!b) continue; b.n++; b.sumP += p; total++; if (r.correct) b.ok++; }
  let e = 0; for (const b of bins) if (b.n) e += (b.n / total) * Math.abs(b.ok / b.n - b.sumP / b.n);
  return { ece: total ? e : null, n: total, bins: bins.filter((b) => b.n).map((b) => ({ bin: b.lo.toFixed(1), n: b.n, acc: b.ok / b.n, conf: b.sumP / b.n })) };
}
export function summarise(rows, labels) {
  const scored = rows.map((r) => ({ ...r, expected: labels[r.id], correct: r.tier === labels[r.id] }));
  const n = scored.filter((r) => r.expected).length; const k = scored.filter((r) => r.correct).length;
  const conf = {}; for (const r of scored) if (r.expected) { const c = `${r.expected}->${r.tier}`; conf[c] = (conf[c] || 0) + 1; }
  const lat = scored.map((r) => r.ms).filter(Number.isFinite).sort((a, b) => a - b);
  const q = (x) => lat[Math.min(lat.length - 1, Math.floor(lat.length * x))] ?? null;
  const [lo, hi] = wilson(k, n);
  return { k, n, p: n ? k / n : null, ci95: [lo, hi], confusion: conf, latency_ms: { p50: q(.5), p95: q(.95), max: lat.at(-1) ?? null }, calibration: ece(scored), abstain: scored.filter((r) => r.abstain).length, rows: scored };
}
