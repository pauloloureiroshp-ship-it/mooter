// Wave 32 (Phase I) — Multi-LoRA serving via vLLM.
//
// vLLM can serve many LoRA adapters off ONE base model concurrently and swap
// between them per request (the swap is a pointer change, not a reload — hence
// <10ms). This loader maps the Wave 31 per-task adapter registry to vLLM LoRA
// modules and, per request, asks the Wave 31 LORAUTER which adapter to apply.
//
// The router is INJECTABLE so this stays pure and testable; the default uses the
// synthesis routeRequest. The tier the router returns is PRESERVED untouched —
// Multi-LoRA picks an adapter, never a cheaper tier (doctrine guardrail).

import { listTaskAdapters } from "../../synthesis/src/lora/adapter-registry.ts";
import { routeRequest } from "../../synthesis/src/index.ts";

export interface LoadedAdapter {
  taskType: string;
  name: string;
  /** vLLM LoRA module id (sanitized adapter name). */
  vllmModule: string;
  baseModel: string;
}

export interface RouteLike {
  adapter: string;
  task_type: string;
  tier: string;
  matched: boolean;
  confidence?: number;
}

export type RouteFn = (input: { prompt: string }) => RouteLike;

function sanitizeModule(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

/** Map the registry's task adapters into concurrently-loadable LoRA modules. */
export function loadAdapters(adapters = listTaskAdapters()): LoadedAdapter[] {
  return adapters.map((a: any) => ({
    taskType: a.task_type ?? "task",
    name: a.name ?? a.id ?? "adapter",
    vllmModule: sanitizeModule(a.name ?? a.id ?? "adapter"),
    baseModel: a.base_model ?? "qwen2.5:3b",
  }));
}

export interface ServingDecision {
  /** chosen adapter name, or null when LORAUTER matched nothing (use base). */
  adapter: string | null;
  vllmModule: string | null;
  taskType: string;
  /** UNCHANGED from the classifier — Multi-LoRA never alters the tier. */
  tier: string;
  /** true when a specialised adapter was selected and is loaded. */
  applied: boolean;
}

export class MultiLoraServer {
  private byName: Map<string, LoadedAdapter>;
  private adapters: LoadedAdapter[];
  private route: RouteFn;

  constructor(opts: { adapters?: LoadedAdapter[]; route?: RouteFn } = {}) {
    this.adapters = opts.adapters ?? loadAdapters();
    this.byName = new Map(this.adapters.map((a) => [a.name, a]));
    this.route = opts.route ?? ((input) => routeRequest({ prompt: input.prompt }) as unknown as RouteLike);
  }

  /** All concurrently-loaded adapters (vLLM keeps them resident together). */
  list(): LoadedAdapter[] {
    return [...this.adapters];
  }

  /** Per-request adapter selection — delegates to LORAUTER, maps to a module.
   *  O(1) map lookup → the hot-swap is sub-millisecond (well under the 10ms gate). */
  selectForRequest(prompt: string): ServingDecision {
    const d = this.route({ prompt });
    const loaded = d.matched ? this.byName.get(d.adapter) : undefined;
    return {
      adapter: loaded ? d.adapter : null,
      vllmModule: loaded ? loaded.vllmModule : null,
      taskType: d.task_type,
      tier: d.tier, // preserved — guardrail
      applied: !!loaded,
    };
  }
}
