// Pastor v2 trainer interface (Wave 31). HONEST STUB: this never runs training —
// LoRA fine-tuning is the user's overnight `train_lora.sh` job (Python/PEFT, GPU).
// Here we (a) describe the spec a given task adapter would train against, and
// (b) read the status the shell script writes back, so `mooter pastor train-status`
// can report progress without this package taking any Python dependency.

import { mooterPath, readJsonSafe } from "../config.ts";
import { getTaskAdapter, type TaskType } from "../lora/adapter-registry.ts";

export interface TrainSpec {
  task_type: TaskType;
  adapter_name: string;
  base_model: string;
  dataset_path: string; // where train_lora.sh expects the JSONL corpus
  output_path: string; // where the trained adapter will be materialised
  method: "lora";
}

/** Describe (do not run) the training spec for a task adapter. Null if unknown type. */
export function trainSpec(type: TaskType): TrainSpec | null {
  const adapter = getTaskAdapter(type);
  if (!adapter) return null;
  return {
    task_type: type,
    adapter_name: adapter.name,
    base_model: adapter.base_model,
    dataset_path: mooterPath("pastor", "train", `${type}.jsonl`),
    output_path: mooterPath("adapters", adapter.name),
    method: "lora",
  };
}

export type TrainPhase = "none" | "pending" | "running" | "done" | "failed";

export interface TrainStatus {
  phase: TrainPhase;
  adapter?: string;
  task_type?: TaskType;
  samples?: number;
  started_at?: string;
  finished_at?: string;
  detail?: string;
}

export function trainStatusPath(): string {
  return mooterPath("pastor", "train-status.json");
}

/**
 * Read the status train_lora.sh wrote (if any). Missing file → { phase: "none" } —
 * never invents progress. The shell script is the only writer.
 */
export function trainStatus(): TrainStatus {
  const s = readJsonSafe<TrainStatus | null>(trainStatusPath(), null);
  if (!s || typeof s.phase !== "string") return { phase: "none", detail: "no training run recorded yet" };
  return s;
}
