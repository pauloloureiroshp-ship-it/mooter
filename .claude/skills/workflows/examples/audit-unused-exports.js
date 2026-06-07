// audit-unused-exports — a Mooter dynamic workflow.
//
// Finds exported symbols that look unused across a codebase. The HOST gathers the
// files (it has the filesystem; the sandbox does not) and hands them in as
// INPUT.files = [{ path, content }] — e.g. `mooter workflow run audit-unused-exports --target src/`.
//
// Shape (all globals; see WRITER_SYSTEM_PROMPT): the bulk runs on FREE local
// Ollama workers in parallel(); exactly ONE cloud (Opus) call synthesises the
// messy per-file notes into a clean JSON report. checkpoint() after each phase so
// the run is resumable cross-session.

const files = (INPUT && INPUT.files) || [];
await log("auditing " + files.length + " files for unused exports");
if (files.length === 0) {
  return { files_audited: 0, summary: "no files provided (use --target <dir>)", candidates: [] };
}

// Phase 1 — one local worker per file extracts the symbols it exports.
const perFile = await parallel(
  files,
  async (f) => {
    const r = await agent({
      model: "qwen2.5-coder:7b",
      prompt:
        "List the top-level EXPORTED identifiers (functions, classes, const, type, interface) " +
        "declared in this file. Reply with a bare comma-separated list of names, nothing else.\n\n" +
        "FILE: " + f.path + "\n\n" + String(f.content).slice(0, 6000),
    });
    return { path: f.path, exports: (r.result || "").trim() };
  },
  { concurrency: 4 },
);
await checkpoint("per-file-exports", perFile);

// A plain-JS corpus of every file — the cross-reference the workers consult.
const corpus = files.map((f) => f.content).join("\n");

// Phase 2 — one local worker per file flags exports that appear only in their
// own file (a usage heuristic over the corpus).
const flagged = await parallel(
  perFile,
  async (pf) => {
    const r = await agent({
      model: "qwen2.5-coder:7b",
      prompt:
        "File " + pf.path + " exports: " + pf.exports + "\n\n" +
        "Of those names, which appear ONLY inside their own file and are never referenced " +
        'elsewhere in the codebase index below? Reply with the suspected-unused names ' +
        'comma-separated, or "none".\n\nCODEBASE INDEX (truncated):\n' + corpus.slice(0, 8000),
    });
    return { path: pf.path, suspected_unused: (r.result || "").trim() };
  },
  { concurrency: 4 },
);
await checkpoint("flagged", flagged);

// Phase 3 — ONE cloud pass turns the worker notes into a strict JSON report.
const synth = await agent({
  model: "claude-opus-4-8",
  max_tokens: 1500,
  prompt:
    "You are auditing a codebase for unused exports. Below are per-file notes from local workers. " +
    "Produce a STRICT JSON object only:\n" +
    '{"summary": string, "candidates": [{"file": string, "symbol": string, "confidence": "high"|"medium"|"low"}]}\n' +
    "Only include genuinely suspicious unused exports; drop framework/entrypoint exports. " +
    "Reply with JSON, no prose, no code fences.\n\nNOTES:\n" + JSON.stringify(flagged, null, 2),
});
await checkpoint("synthesis", synth.result);

let report;
try {
  report = JSON.parse(String(synth.result).replace(/^```json\s*|\s*```$/g, "").trim());
} catch (e) {
  report = { summary: String(synth.result).slice(0, 500), candidates: [] };
}

const n = Array.isArray(report.candidates) ? report.candidates.length : 0;
await log("audit complete: " + n + " candidate(s)");
return { files_audited: files.length, summary: report.summary, candidates: report.candidates || [] };
