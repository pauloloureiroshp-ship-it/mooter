// embedding_store.ts — in-memory pack-embedding store (Pastor Wave 2 Day 3).
//
// Axis 2 v2: for each pack, pre-compute embeddings of N canonical "seed"
// prompts (declared as `domain_signals.embedding_seeds` in pack.yaml) using
// nomic-embed-text via Ollama. At classify time, embed the user prompt once
// and score it against every pack by max cosine similarity over seeds (best
// matching seed wins for that pack). Top-1 pack + runner-up are returned.
//
// Design choices:
//   - Lazy init: first classify call triggers init(); subsequent calls reuse
//     the cached store. init() failure leaves ready=false; classify() then
//     silently returns null and the combined classifier falls back to v1.
//   - In-memory only: 3 packs × 8 seeds × 768 dims × 4 B ≈ 74 KB. No faiss,
//     no disk cache — at this scale a linear scan + cosine is faster than
//     any index overhead and avoids a new dependency.
//   - Pure cosine sim (not unit-normalized assumed): nomic-embed-text returns
//     unnormalised vectors via Ollama; we compute proper cosine including
//     magnitudes so swapping the model later is safe.
//   - "Embedding seeds" is the ONLY new field we read; the rest of
//     domain_signals (keywords, intent_phrases, ...) keeps powering v1.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { defaultPacksDir } from "./classify_domain.ts";
import { OllamaClient } from "./ollama_client.ts";

const NON_PACK_DIRS = new Set(["node_modules", "tests", "__mock__"]);
export const EMBED_MODEL = "nomic-embed-text";

// Wave 2 Day 4 NIT 3: cap concurrent Ollama embed calls during init().
// At Wave 2 Day 5 the pack set grows to 7 × 8 seeds = 56 embeddings. Firing
// them all with a single Promise.all overloads the local Ollama instance and
// can hit socket / OOM limits. Processing in BATCH_SIZE-wide chunks keeps the
// init bounded while preserving the ≤ 5s budget. 8 is the largest size that
// stays comfortably inside the RTX 4090 + nomic-embed-text envelope in
// benchmarks (Day 3 baseline ran at ≤ 24 concurrent, scaled with no loss).
export const EMBED_BATCH_SIZE = 8;

interface PackEmbeddings {
  pack_id: string;
  vectors: Float32Array[];
}

export interface EmbeddingClassification {
  pack_id: string;
  similarity: number; // raw cosine, [-1, 1] but typically [0, 1]
  runnerUp?: { pack_id: string; similarity: number };
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Read `domain_signals.embedding_seeds` from every pack.yaml under packsDir. */
export function loadPackSeeds(packsDir: string = defaultPacksDir()): Array<{
  pack_id: string;
  seeds: string[];
}> {
  if (!existsSync(packsDir)) return [];
  return readdirSync(packsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !NON_PACK_DIRS.has(d.name))
    .map((d) => join(packsDir, d.name, "pack.yaml"))
    .filter((p) => existsSync(p))
    .map((p) => {
      const doc = yaml.load(readFileSync(p, "utf8")) as Record<string, unknown>;
      const pack_id =
        typeof doc?.name === "string" ? doc.name : p.split(/[\\/]/).slice(-2, -1)[0]!;
      const signals = (doc?.domain_signals ?? {}) as Record<string, unknown>;
      return { pack_id, seeds: asStringArray(signals.embedding_seeds) };
    })
    .filter((p) => p.seeds.length > 0);
}

export function cosineSim(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export class EmbeddingStore {
  private store: PackEmbeddings[] = [];
  private ready = false;
  private initPromise: Promise<void> | null = null;

  constructor(
    private readonly client: OllamaClient = new OllamaClient(),
    private readonly packsDir: string = defaultPacksDir(),
  ) {}

  isReady(): boolean {
    return this.ready;
  }

  /**
   * Drop all cached embeddings and re-arm the store. Wave 2 Day 4 NIT 1: test
   * suites need clean state between cases — the module-level singleton is
   * shared across files, so a leak would silently change verdicts. Also drops
   * any in-flight init promise so the next init() runs fresh.
   */
  reset(): void {
    this.store = [];
    this.ready = false;
    this.initPromise = null;
  }

  /** Pre-compute seed embeddings for every pack. Safe to call repeatedly. */
  async init(): Promise<void> {
    if (this.ready) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInit();
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async doInit(): Promise<void> {
    const packs = loadPackSeeds(this.packsDir);

    // Wave 2 Day 4 NIT 3: flatten (pack × seeds) → flat list, then process in
    // batches of EMBED_BATCH_SIZE concurrent embed calls. Within a batch we
    // Promise.all; between batches we await sequentially so the local Ollama
    // never sees more than BATCH_SIZE in-flight at once.
    const flat: Array<{ pack_id: string; seed: string }> = [];
    for (const p of packs) {
      for (const seed of p.seeds) flat.push({ pack_id: p.pack_id, seed });
    }

    const vectorsByPack = new Map<string, Float32Array[]>();
    for (let i = 0; i < flat.length; i += EMBED_BATCH_SIZE) {
      const batch = flat.slice(i, i + EMBED_BATCH_SIZE);
      const vecs = await Promise.all(
        batch.map((b) => this.client.embed(EMBED_MODEL, b.seed)),
      );
      batch.forEach((b, idx) => {
        let list = vectorsByPack.get(b.pack_id);
        if (!list) {
          list = [];
          vectorsByPack.set(b.pack_id, list);
        }
        list.push(vecs[idx]!);
      });
    }

    // Preserve the original pack order (loadPackSeeds returns dir-listing order).
    const built: PackEmbeddings[] = [];
    for (const p of packs) {
      const vectors = vectorsByPack.get(p.pack_id);
      if (vectors && vectors.length > 0) {
        built.push({ pack_id: p.pack_id, vectors });
      }
    }
    this.store = built;
    this.ready = true;
  }

  /**
   * Classify a prompt by embedding similarity. Returns null when the store
   * cannot be initialised (Ollama down) or when no seed packs are configured.
   */
  async classify(prompt: string): Promise<EmbeddingClassification | null> {
    if (!this.ready) {
      try {
        await this.init();
      } catch {
        return null;
      }
    }
    if (this.store.length === 0) return null;

    let queryVec: Float32Array;
    try {
      queryVec = await this.client.embed(EMBED_MODEL, prompt);
    } catch {
      return null;
    }

    const scored = this.store
      .map((p) => ({
        pack_id: p.pack_id,
        similarity: Math.max(...p.vectors.map((v) => cosineSim(queryVec, v))),
      }))
      .sort((a, b) => b.similarity - a.similarity);

    const top = scored[0];
    if (!top) return null;
    const runner = scored[1];
    return {
      pack_id: top.pack_id,
      similarity: top.similarity,
      runnerUp: runner ? { pack_id: runner.pack_id, similarity: runner.similarity } : undefined,
    };
  }
}

// Module-level singleton — one store per process. Tests instantiate their own.
export const embeddingStore = new EmbeddingStore();
