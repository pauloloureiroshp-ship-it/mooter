// `mooter ecosystem` — L15 Ecosystem Awareness (Wave 29, Paulo Vector B).
//
//   mooter ecosystem list [--category <c>] [--json]   browse the curated catalog
//   mooter ecosystem recommend [--limit N] [--json]   top picks for your setup
//   mooter ecosystem search <query> [--json]          substring/tag search
//   mooter ecosystem info <id> [--json]               item details
//
// Pure delegator to @mooter/synthesis.

import type { CmdResult } from "./trail.ts";
import {
  loadCatalog,
  searchCatalog,
  getCatalogItem,
  recommend,
  detectSetup,
  loadProfile,
  saveProfile,
  mooterPath,
  writeJson,
  type SetupProfile,
  type CatalogCategory,
} from "../../../synthesis/src/index.ts";

export const ECOSYSTEM_USAGE = `mooter ecosystem — L15 Ecosystem Awareness

  mooter ecosystem list [--category <c>] [--json]   browse the catalog
  mooter ecosystem recommend [--limit N] [--json]   top picks for your setup
  mooter ecosystem search <query> [--json]          search by name/tag
  mooter ecosystem info <id> [--json]               item details`;

async function ensureProfile(): Promise<SetupProfile> {
  const existing = loadProfile();
  if (existing) return existing;
  const fresh = await detectSetup();
  saveProfile(fresh);
  return fresh;
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

export async function runEcosystem(args: string[]): Promise<CmdResult> {
  const [sub, ...rest] = args;
  const json = args.includes("--json");

  if (!sub || sub === "help" || sub === "--help" || sub === "-h") {
    return { exitCode: 0, output: ECOSYSTEM_USAGE };
  }

  const catalog = loadCatalog();
  if (catalog.items.length === 0) {
    return { exitCode: 1, output: "mooter ecosystem: catalog not found (audit/ECOSYSTEM_CATALOG_v1.json)" };
  }

  if (sub === "list") {
    const cat = flagValue(rest, "--category") as CatalogCategory | undefined;
    const items = cat ? catalog.items.filter((i) => i.category === cat) : catalog.items;
    if (json) return { exitCode: 0, output: JSON.stringify({ count: items.length, items }, null, 2) };
    const lines = [`🐮 Ecosystem catalog (${items.length}${cat ? ` ${cat}` : ""} of ${catalog.count})`, "─────────────────────────────"];
    for (const i of items) {
      lines.push(`[${i.category}] ${i.name}  ·  trust ${i.trust_score}${i.verified ? " ✓" : " ?"}  ·  ${i.id}`);
    }
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "recommend") {
    const profile = await ensureProfile();
    const limit = Number(flagValue(rest, "--limit") ?? "5");
    const recs = recommend(profile, catalog.items, { limit: Number.isFinite(limit) ? limit : 5 });
    // Cache the count for the statusline line-3 chip (cheap read; no render-time ranking).
    try { writeJson(mooterPath("ecosystem", "reco_count.json"), { count: recs.length, generated_at: new Date().toISOString() }); } catch { /* non-fatal */ }
    if (json) return { exitCode: 0, output: JSON.stringify(recs, null, 2) };
    const lines = [`🐮 Top ${recs.length} recommendations for your setup (${profile.hardware.hardware_class} · ${profile.subscriptions.subscription_tier})`, "─────────────────────────────────────────"];
    recs.forEach((r, n) => {
      lines.push(`${n + 1}. ${r.item.name}  [${r.item.category}]  — ${r.reason}`);
      if (r.item.install_cmd) lines.push(`   ${r.item.install_cmd}`);
    });
    if (!recs.length) lines.push("(no compatible items — unusual; check your setup profile)");
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "search") {
    const query = rest.filter((a) => !a.startsWith("--")).join(" ");
    if (!query) return { exitCode: 1, output: "usage: mooter ecosystem search <query>" };
    const hits = searchCatalog(query, catalog.items);
    if (json) return { exitCode: 0, output: JSON.stringify({ query, count: hits.length, items: hits }, null, 2) };
    const lines = [`🐮 "${query}" → ${hits.length} result(s)`, "─────────────────────────────"];
    for (const i of hits.slice(0, 20)) lines.push(`[${i.category}] ${i.name}  ·  ${i.id}  ·  ${i.description}`);
    if (!hits.length) lines.push("(no matches)");
    return { exitCode: 0, output: lines.join("\n") };
  }

  if (sub === "info") {
    const id = rest.find((a) => !a.startsWith("--"));
    if (!id) return { exitCode: 1, output: "usage: mooter ecosystem info <id>" };
    const item = getCatalogItem(id, catalog.items);
    if (!item) return { exitCode: 1, output: `mooter ecosystem: no item '${id}'` };
    if (json) return { exitCode: 0, output: JSON.stringify(item, null, 2) };
    const lines = [
      `🐮 ${item.name}  [${item.category}]`,
      "─────────────────────────────",
      item.description,
      `trust:        ${item.trust_score}${item.verified ? " (verified)" : " (unverified)"}`,
      `install:      ${item.install_cmd || "—"}`,
      `docs:         ${item.docs_url || "—"}`,
      `source:       ${item.source_url || "—"}`,
      item.attribution ? `attribution:  ${item.attribution}` : "",
      `tags:         ${item.tags.join(", ") || "—"}`,
    ].filter(Boolean);
    return { exitCode: 0, output: lines.join("\n") };
  }

  return { exitCode: 1, output: `mooter ecosystem: unknown subcommand '${sub}'\n\n${ECOSYSTEM_USAGE}` };
}
