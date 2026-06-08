// Pastor distillation — pattern extraction (Wave 31). Reads the router decisions
// log (tools/router/decisions.log) and distils the *learned* routing behaviour into
// structured patterns: which task categories route to which tier/model, language
// mix, and confidence. FEATURES ONLY — the log already stores no prompt content
// beyond a short preview, and we deliberately ignore that preview here.

export interface ClassifiedEvent {
  event?: string;
  source?: string;
  tier?: string;
  task_category?: string;
  recommended_model?: string;
  confidence?: number;
  lang_detected?: string;
  has_code_block?: boolean;
  has_file_refs?: boolean;
}

export interface RoutingPattern {
  task_category: string;
  tier: string;
  model: string; // dominant recommended_model for this (category, tier)
  count: number;
  avg_confidence: number;
  dominant_lang: string;
}

export interface DistilledPatterns {
  total: number;
  tier_distribution: Record<string, number>;
  lang_distribution: Record<string, number>;
  category_distribution: Record<string, number>;
  patterns: RoutingPattern[]; // sorted desc by count
  generated_from: number; // how many classified events were used
}

/** Parse JSONL text into classified events (skips non-JSON lines + tester events). */
export function parseDecisions(text: string): ClassifiedEvent[] {
  const out: ClassifiedEvent[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let e: ClassifiedEvent;
    try {
      e = JSON.parse(t);
    } catch {
      continue;
    }
    if (!e || typeof e !== "object") continue; // guard `null` / non-object JSON lines
    if (e.event !== "classified") continue;
    if (e.source === "mooter-tester") continue;
    out.push(e);
  }
  return out;
}

function dominant(counts: Map<string, number>): string {
  let best = "";
  let n = -1;
  for (const [k, v] of counts) {
    if (v > n) {
      n = v;
      best = k;
    }
  }
  return best || "—";
}

/** Aggregate classified events into routing patterns + distributions. Deterministic. */
export function extractPatterns(events: ClassifiedEvent[]): DistilledPatterns {
  const tierDist: Record<string, number> = {};
  const langDist: Record<string, number> = {};
  const catDist: Record<string, number> = {};

  // key = `${category} ${tier}`
  const groups = new Map<
    string,
    { count: number; confSum: number; models: Map<string, number>; langs: Map<string, number> }
  >();

  for (const e of events) {
    const tier = e.tier || "T?";
    const cat = e.task_category || "uncategorised";
    const lang = e.lang_detected || "other";
    tierDist[tier] = (tierDist[tier] ?? 0) + 1;
    langDist[lang] = (langDist[lang] ?? 0) + 1;
    catDist[cat] = (catDist[cat] ?? 0) + 1;

    const key = `${cat} ${tier}`;
    const g = groups.get(key) ?? { count: 0, confSum: 0, models: new Map(), langs: new Map() };
    g.count += 1;
    g.confSum += Number.isFinite(e.confidence as number) ? (e.confidence as number) : 0;
    const model = e.recommended_model || "—";
    g.models.set(model, (g.models.get(model) ?? 0) + 1);
    g.langs.set(lang, (g.langs.get(lang) ?? 0) + 1);
    groups.set(key, g);
  }

  const patterns: RoutingPattern[] = [...groups.entries()]
    .map(([key, g]) => {
      // Split on the LAST space: the tier is always a single token, but an
      // externally-sourced task_category could contain spaces.
      const sp = key.lastIndexOf(" ");
      const task_category = key.slice(0, sp);
      const tier = key.slice(sp + 1);
      return {
        task_category,
        tier,
        model: dominant(g.models),
        count: g.count,
        avg_confidence: Math.round((g.confSum / g.count) * 1000) / 1000,
        dominant_lang: dominant(g.langs),
      };
    })
    .sort((a, b) => b.count - a.count || a.task_category.localeCompare(b.task_category));

  return {
    total: events.length,
    tier_distribution: tierDist,
    lang_distribution: langDist,
    category_distribution: catDist,
    patterns,
    generated_from: events.length,
  };
}
