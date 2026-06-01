// Wave 6 D1 — persona lib. landing vitest is node-env; pure logic only.

import { describe, it, expect } from "vitest";
import { PERSONAS, coercePersona, personaOption, personaPackHint } from "./persona";

describe("PERSONAS (mirror of CLI Wave 3 D2)", () => {
  it("has exactly the four canonical persona values", () => {
    expect(PERSONAS.map((p) => p.value)).toEqual([
      "solo_founder",
      "senior_ic",
      "oss_maintainer",
      "other",
    ]);
  });

  it("every persona has a title + blurb", () => {
    for (const p of PERSONAS) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.blurb.length).toBeGreaterThan(0);
    }
  });

  it("affinity packs match the CLI PERSONA_WEIGHTS bonus sets", () => {
    const byValue = Object.fromEntries(PERSONAS.map((p) => [p.value, p.affinityPacks]));
    expect(byValue.solo_founder).toEqual(["code-audit", "animation-web"]);
    expect(byValue.senior_ic).toEqual(["code-audit", "security-review"]);
    expect(byValue.oss_maintainer).toEqual(["diagram-systems", "refactor"]);
    expect(byValue.other).toEqual([]);
  });
});

describe("coercePersona", () => {
  it("passes through valid values", () => {
    expect(coercePersona("senior_ic")).toBe("senior_ic");
  });
  it("defaults unknown / non-string to 'other' (CLI-compatible)", () => {
    expect(coercePersona("ceo")).toBe("other");
    expect(coercePersona(undefined)).toBe("other");
    expect(coercePersona(42)).toBe("other");
    expect(coercePersona(null)).toBe("other");
  });
});

describe("personaOption / personaPackHint", () => {
  it("personaOption always resolves (coerces invalid → other)", () => {
    expect(personaOption("oss_maintainer").title).toBe("OSS Maintainer");
    expect(personaOption("bogus").value).toBe("other");
  });
  it("hint names affinity packs for a persona", () => {
    expect(personaPackHint("solo_founder")).toContain("code-audit + animation-web");
  });
  it("hint is neutral (no fabricated affinity) for 'other'", () => {
    expect(personaPackHint("other")).toMatch(/hardware \+ providers/);
  });
});
