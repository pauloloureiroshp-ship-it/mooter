// Posterior store for the bandit (Wave 30 Phase G).
//
// Holds Beta(α,β) posteriors keyed by (contextKey → arm). Backed by a JSON file
// at ~/.mooter/bandit-state.json.
//
// NOTE ON BACKEND: the brief specifies SQLite (~/.mooter/bandit-state.db). We
// back it with JSON instead because (a) the validation package keeps the
// synthesis "Node-builtins-only, no native deps" doctrine, (b) Node 20 here has
// no node:sqlite, and Wave 28's better-sqlite3 is a native module we don't want
// in this hot-path library, and (c) the posterior state is tiny (a few hundred
// arm rows) so JSON is more than adequate and fully deterministic for tests.
// The `PosteriorStore` interface lets a SQLite adapter slot in later unchanged.

import { existsSync, readFileSync } from "node:fs";
import { mooterPath, writeJson } from "../../../synthesis/src/config.ts";
import { type BetaPosterior, uniformPrior } from "./thompson-sampling.ts";

export interface BanditContext {
  promptClass: string; // e.g. task_category or tier label
  hardwareClass: string; // e.g. "gpu-high" | "cpu-only"
  subscriptionTier: string; // e.g. "max" | "free"
}

export function contextKey(c: BanditContext): string {
  return `${c.promptClass}|${c.hardwareClass}|${c.subscriptionTier}`;
}

export interface PosteriorStore {
  get(ctxKey: string, arm: string): BetaPosterior;
  update(ctxKey: string, arm: string, alphaInc: number, betaInc: number): void;
  snapshot(): Record<string, Record<string, BetaPosterior>>;
  flush(): void;
}

type Snapshot = Record<string, Record<string, BetaPosterior>>;

function cloneDefault(): BetaPosterior {
  return uniformPrior();
}

abstract class BaseStore implements PosteriorStore {
  protected data: Snapshot = {};

  get(ctxKey: string, arm: string): BetaPosterior {
    return this.data[ctxKey]?.[arm] ?? cloneDefault();
  }

  update(ctxKey: string, arm: string, alphaInc: number, betaInc: number): void {
    const a = Math.max(0, alphaInc);
    const b = Math.max(0, betaInc);
    const ctx = (this.data[ctxKey] ??= {});
    const cur = ctx[arm] ?? cloneDefault();
    ctx[arm] = { alpha: cur.alpha + a, beta: cur.beta + b, pulls: cur.pulls + 1 };
    this.flush();
  }

  snapshot(): Snapshot {
    // deep-ish copy so callers can't mutate internal state
    const out: Snapshot = {};
    for (const [k, arms] of Object.entries(this.data)) {
      out[k] = {};
      for (const [arm, p] of Object.entries(arms)) out[k][arm] = { ...p };
    }
    return out;
  }

  abstract flush(): void;
}

/** In-memory store (tests, ephemeral sessions). */
export class MemoryPosteriorStore extends BaseStore {
  constructor(seed?: Snapshot) {
    super();
    if (seed) this.data = seed;
  }
  flush(): void {
    /* no-op */
  }
}

/** JSON-file-backed store at ~/.mooter/bandit-state.json (override via MOOTER_HOME). */
export class JsonPosteriorStore extends BaseStore {
  private readonly path: string;

  constructor(path: string = mooterPath("bandit-state.json")) {
    super();
    this.path = path;
    if (existsSync(this.path)) {
      try {
        const parsed = JSON.parse(readFileSync(this.path, "utf8"));
        if (parsed && typeof parsed === "object" && parsed.posteriors) {
          this.data = parsed.posteriors as Snapshot;
        }
      } catch {
        this.data = {};
      }
    }
  }

  flush(): void {
    writeJson(this.path, { version: 1, posteriors: this.data });
  }
}
