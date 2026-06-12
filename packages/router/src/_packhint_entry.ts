// Standalone axis-2 pack-hint emitter (additive). Fail-silent: never breaks Claude Code.
import { homedir } from "node:os";
import { join } from "node:path";
import { classifyDomain, loadPacks } from "./classify_domain.ts";
import { loadPackManifest, packResolve, detectEnv } from "./pack_resolve.ts";
const arr = (a: any[] | undefined) => "[" + ((a || []) as any[]).join(", ") + "]";
async function main() {
  let raw = ""; for await (const c of process.stdin) raw += c;
  let prompt = "", cwd = process.cwd();
  try { const j = JSON.parse(raw || "{}"); prompt = j.prompt || j.user_prompt || ""; cwd = j.cwd || cwd; } catch {}
  if (!prompt) return;
  const packsDir = process.env.MOOTER_PACKS_DIR || join(homedir(), ".mooter", "packs");
  const packs = loadPacks(packsDir);
  const domain: any = classifyDomain(prompt, packs);
  const conf = Number(domain.confidence ?? 0).toFixed(2);
  // No active pack = no hint (Wave A DoD): GENERAL/AMBIGUOUS and
  // missing-manifest cases stay silent so casual prompts cost zero context.
  if (domain.pack_id === "GENERAL" || domain.pack_id === "AMBIGUOUS") return;
  const manifest: any = loadPackManifest(domain.pack_id, packsDir);
  if (!manifest) return;
  const r: any = packResolve(manifest, detectEnv(cwd));
  const out: (string | null)[] = ["<pack-hint>",
    `pack=${manifest.pack_id} confidence=${conf} reason="signals: ${domain.reason}"`,
    `model_floor=${manifest.model_floor}`,
    `skills_invoke=${arr(r.skills_invoke)}`,
    `mcps_recommended=${arr(r.available_mcps)}`,
    `mcps_missing=${arr(r.missing_mcps)}`,
    `subagent_primary=${manifest.subagent_primary || ""}`,
    manifest.scaffold_url ? `scaffold_url=${manifest.scaffold_url}` : null,
    "</pack-hint>"];
  process.stdout.write(out.filter(Boolean).join("\n") + "\n");
}
main().catch(() => { /* fail-silent */ });
