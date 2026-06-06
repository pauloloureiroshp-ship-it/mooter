# Tweet thread — DRAFT (Paulo approval required before posting)

1/ We used Mooter to audit Mooter. 372 files of our own codebase, summarized → validated → ranked → reported, by four model tiers. Here's what we found. 🧵

2/ Method: T0 (local qwen2.5-coder, $0) summarized every file. T1 (Haiku) validated each summary against the real code. T2 (Sonnet) ranked the issues. T3 (Opus) wrote the report.

3/ Cost: $2.04 total vs $11.78 if we'd run the whole thing on Opus. That's 82.7% saved — the entire point of tiered routing.

4/ The honest discovery: our "local-summarizer" subagent actually runs on cloud Haiku when an API key is present. We don't hide it — the statusline shows ⚠ exec T1 haiku live. Intent ≠ execution, and we surface the gap.

5/ Brutal honesty: judged by Haiku, our local Q4 model scored just 5.2 /10 on these summaries (2% zero-drift). We publish the unflattering number — no FP16 weights to fake a "Q4 vs FP16" delta. This is the gap a fine-tuned adapter is meant to close.

6/ Top actionable finding: classify.js local summary catastrophically wrong (score=1) — core routing logic undocumented

7/ Byproduct: 212 high-quality (score≥8) instruction→summary pairs — 560 total tiered — exported for LoRA adapter training. Wave 24 trains on real, self-generated data, tagged by quality.

8/ The meta-point: Mooter validated itself on its own code. Synthetic tests tell you the happy path works. Running the tool on the tool tells you the truth.

9/ Try it: mooter.ai

10/ Open source + full report: github.com/pauloloureiroshp-ship-it/mooter — AUDIT_REPORT.md & AUDIT_BENCHMARK.md in the repo.
