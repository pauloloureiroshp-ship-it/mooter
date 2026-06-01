// Wave 6.5 D1 — admin privacy lib. node-env vitest; pure logic only.

import { describe, it, expect } from "vitest";
import { maskEmail, parseAdminEmails, isAdminEmail, buildAuditEntry } from "./privacy";

describe("maskEmail", () => {
  it("keeps only the first local char + domain", () => {
    expect(maskEmail("paulo.loureiro.shp@gmail.com")).toBe("p***@gmail.com");
    expect(maskEmail("m@faang.com")).toBe("m***@faang.com");
  });
  it("never reveals the local part beyond char 1", () => {
    expect(maskEmail("secret@x.io")).not.toContain("secret");
  });
  it("handles empty / malformed / non-string", () => {
    expect(maskEmail("")).toBe("—");
    expect(maskEmail(null)).toBe("—");
    expect(maskEmail(undefined)).toBe("—");
    expect(maskEmail("noatsign")).toBe("n***");
    expect(maskEmail("@leading.com")).toBe("@***"); // at index 0 → degenerate, no local leak
  });
});

describe("parseAdminEmails", () => {
  it("splits, trims, lowercases, drops empties", () => {
    expect(parseAdminEmails("A@x.com, b@y.com ,, ")).toEqual(["a@x.com", "b@y.com"]);
    expect(parseAdminEmails("")).toEqual([]);
    expect(parseAdminEmails(null)).toEqual([]);
  });
});

describe("isAdminEmail", () => {
  const FALLBACK = "paulo.loureiro.shp@gmail.com";
  it("uses the env allow-list when present (case-insensitive)", () => {
    expect(isAdminEmail("Boss@Corp.com", "boss@corp.com,other@x.io", FALLBACK)).toBe(true);
    expect(isAdminEmail("nope@corp.com", "boss@corp.com", FALLBACK)).toBe(false);
  });
  it("falls back to the built-in admin when the allow-list is empty", () => {
    expect(isAdminEmail(FALLBACK, "", FALLBACK)).toBe(true);
    expect(isAdminEmail("intruder@x.io", "", FALLBACK)).toBe(false);
  });
  it("empty / missing email is never admin", () => {
    expect(isAdminEmail("", "a@x.com", FALLBACK)).toBe(false);
    expect(isAdminEmail(null, "", FALLBACK)).toBe(false);
  });
  it("the env list REPLACES the fallback (does not union)", () => {
    // When ADMIN_EMAILS is set, the old hardcoded admin is NOT auto-allowed.
    expect(isAdminEmail(FALLBACK, "someone@else.com", FALLBACK)).toBe(false);
  });
});

describe("buildAuditEntry", () => {
  it("shapes a row with no PII (action + hash + metadata)", () => {
    const e = buildAuditEntry("view_user_detail", "abc123def456", { filters: ["max"] });
    expect(e).toEqual({
      action: "view_user_detail",
      target_user_id_hash: "abc123def456",
      metadata: { filters: ["max"] },
    });
  });
  it("defaults target hash to null and metadata to {}", () => {
    expect(buildAuditEntry("view_users_list")).toEqual({
      action: "view_users_list",
      target_user_id_hash: null,
      metadata: {},
    });
  });
});
