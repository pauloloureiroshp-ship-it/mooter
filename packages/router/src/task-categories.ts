// task-categories.ts — canonical 24-category task taxonomy (Wave 58 matrix engine).
//
// Source of truth for every consumer that needs to map a prompt or event to one
// of the 24 routing categories.  Pure: zero IO, zero network, zero deps.
//
// Exports
//   TASK_CATEGORIES    — const array of all 24 category strings, grouped
//   TaskCategory       — union type of the 24 string literals
//   CategoryGroup      — union type of the 5 top-level groups
//   categoryGroup()    — returns the group for a TaskCategory
//   parseTaskCategory() — validates membership, returns TaskCategory|null

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export const CODING_CATEGORIES = [
  "coding.frontend",
  "coding.backend",
  "coding.data",
  "coding.infra",
  "coding.security",
  "coding.competitive",
  "coding.refactor",
  "coding.test",
  "coding.debug",
] as const;

export const REASONING_CATEGORIES = [
  "reasoning.math",
  "reasoning.science",
  "reasoning.general",
  "reasoning.agentic",
] as const;

export const WRITING_CATEGORIES = [
  "writing.prose-pt-pt",
  "writing.prose-en",
  "writing.structured",
  "writing.translation",
] as const;

export const AGENTS_CATEGORIES = [
  "agents.coordinator",
  "agents.implementor",
  "agents.reviewer",
] as const;

export const CONTEXT_CATEGORIES = [
  "context.large",
  "context.small",
  "context.multimodal",
  "context.audio",
] as const;

// ---------------------------------------------------------------------------
// Master array — 24 entries, declaration order is authoritative
// ---------------------------------------------------------------------------

export const TASK_CATEGORIES = [
  ...CODING_CATEGORIES,
  ...REASONING_CATEGORIES,
  ...WRITING_CATEGORIES,
  ...AGENTS_CATEGORIES,
  ...CONTEXT_CATEGORIES,
] as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export type CategoryGroup = "coding" | "reasoning" | "writing" | "agents" | "context";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lookup set for O(1) membership validation. */
const CATEGORY_SET: ReadonlySet<string> = new Set(TASK_CATEGORIES);

/**
 * Validate that `s` is one of the 24 known categories.
 * Returns the typed TaskCategory when valid, null otherwise.
 */
export function parseTaskCategory(s: string): TaskCategory | null {
  if (CATEGORY_SET.has(s)) return s as TaskCategory;
  return null;
}

/**
 * Return the top-level group for a TaskCategory.
 * Pure — the prefix before the first '.' is the group; never throws for valid inputs.
 */
export function categoryGroup(cat: TaskCategory): CategoryGroup {
  const prefix = cat.split(".")[0] as CategoryGroup;
  return prefix;
}
