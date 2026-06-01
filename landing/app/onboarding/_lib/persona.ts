// Wave 6 D1 — web onboarding persona step. Mirrors the CLI persona model
// (packages/cli/src/commands/init.ts, Wave 3 D2): the SAME four persona values
// so a web-onboarded user and a `mooter init` user land on the same profile
// shape. Pure + framework-free so it unit-tests in landing's node-env vitest.

/** The four canonical personas — values byte-identical to the CLI `Persona` type. */
export type Persona = "solo_founder" | "senior_ic" | "oss_maintainer" | "other";

export interface PersonaOption {
  value: Persona;
  title: string;
  blurb: string;
  /** Packs this persona nudges toward — mirrors CLI PERSONA_WEIGHTS[p].bonus. */
  affinityPacks: string[];
}

/** Display model for the persona chips. Order is the wizard render order. */
export const PERSONAS: readonly PersonaOption[] = [
  {
    value: "solo_founder",
    title: "Solo Founder",
    blurb: "Building products solo · pay own tokens · ROI matters",
    affinityPacks: ["code-audit", "animation-web"],
  },
  {
    value: "senior_ic",
    title: "Senior IC",
    blurb: "FAANG engineer · company pays · want speed + control",
    affinityPacks: ["code-audit", "security-review"],
  },
  {
    value: "oss_maintainer",
    title: "OSS Maintainer",
    blurb: "Big repos · refactor heavy · Dynamic Workflows fan",
    affinityPacks: ["diagram-systems", "refactor"],
  },
  {
    value: "other",
    title: "Other",
    blurb: "Something else — mooter routes sensibly either way",
    affinityPacks: [],
  },
] as const;

const VALID = new Set<Persona>(PERSONAS.map((p) => p.value));

/** Narrow an unknown value to a Persona, defaulting to "other" (CLI-compatible). */
export function coercePersona(value: unknown): Persona {
  return typeof value === "string" && VALID.has(value as Persona) ? (value as Persona) : "other";
}

/** Look up the display option for a persona value (always resolves, via coerce). */
export function personaOption(value: unknown): PersonaOption {
  const v = coercePersona(value);
  return PERSONAS.find((p) => p.value === v) ?? PERSONAS[PERSONAS.length - 1];
}

/**
 * A short, honest recommendation note for a persona — names the packs mooter
 * will nudge toward. "other" gets a neutral note (no fabricated affinity).
 */
export function personaPackHint(value: unknown): string {
  const opt = personaOption(value);
  if (opt.affinityPacks.length === 0) return "mooter recommends packs by your hardware + providers.";
  return `mooter nudges toward ${opt.affinityPacks.join(" + ")} for how you work.`;
}
