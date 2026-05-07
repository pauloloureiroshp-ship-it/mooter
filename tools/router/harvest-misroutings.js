#!/usr/bin/env node
/**
 * harvest-misroutings.js — extract Wave-1.6 adversarial corpus from
 * the continuous tester's history (Wave-1.5 task #6).
 *
 * Reads mooter-tester-history.jsonl, filters tester_misrouting events
 * where expected !== classified, dedupes by prompt_preview, and writes
 * the corpus as JSONL. Wave-1.6 retune consumes this directly.
 *
 * Flags:
 *   --input <path>    Override history path (default: tools/router/mooter-tester-history.jsonl).
 *   --output <path>   Override corpus path (default: .planning/wave-1.5/adversarial-corpus.jsonl).
 *   --min <n>         Drop entries seen fewer than n times (default 1).
 *   --tier-filter <T0,T1,...>  Only keep these expected tiers (default all).
 *   --json            Print JSON summary to stdout.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
function flag(name, def) {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  return (v && !v.startsWith('--')) ? v : def;
}

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const INPUT = flag('--input', path.join(REPO_ROOT, 'tools', 'router', 'mooter-tester-history.jsonl'));
const OUTPUT = flag('--output', path.join(REPO_ROOT, '.planning', 'wave-1.5', 'adversarial-corpus.jsonl'));
const MIN_COUNT = parseInt(flag('--min', '1'), 10) || 1;
const TIER_FILTER = (flag('--tier-filter', '') || '').split(',').filter(Boolean);
const PRINT_JSON = args.includes('--json');

function harvest() {
  if (!fs.existsSync(INPUT)) {
    process.stderr.write(`harvest-misroutings: input not found: ${INPUT}\n`);
    process.exit(1);
  }

  const dedup = new Map(); // prompt_preview → entry + count
  let scanned = 0;
  let candidates = 0;

  const raw = fs.readFileSync(INPUT, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    scanned++;
    let e;
    try { e = JSON.parse(trimmed); } catch { continue; }
    if (e.event !== 'tester_misrouting') continue;
    if (!e.expected || !e.classified) continue;
    if (e.expected === e.classified) continue;
    if (TIER_FILTER.length > 0 && !TIER_FILTER.includes(e.expected)) continue;
    candidates++;

    const key = (e.prompt_preview || '').trim().slice(0, 200);
    if (!key) continue;
    const existing = dedup.get(key);
    if (existing) {
      existing.count += 1;
      if (e.ts_ms > existing.last_seen_ms) existing.last_seen_ms = e.ts_ms;
    } else {
      dedup.set(key, {
        prompt_redacted: key,
        expected_tier: e.expected,
        predicted_tier: e.classified,
        category: e.category || null,
        first_seen_ms: e.ts_ms,
        last_seen_ms: e.ts_ms,
        count: 1,
        source: 'mooter-tester',
      });
    }
  }

  // Filter by min count and stable-sort by (expected_tier, count desc).
  const out = [...dedup.values()]
    .filter((e) => e.count >= MIN_COUNT)
    .sort((a, b) => {
      if (a.expected_tier !== b.expected_tier) return a.expected_tier.localeCompare(b.expected_tier);
      return b.count - a.count;
    });

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, out.map((e) => JSON.stringify(e)).join('\n') + '\n');

  // Also emit a frequency-weighted "full" corpus next to the deduped one —
  // Wave-1.6 retraining can choose between weighted (full) or canonical
  // (unique) depending on whether it wants to over-fit popular patterns.
  const fullPath = OUTPUT.replace(/\.jsonl$/, '-full.jsonl');
  const fullOut = [];
  for (const entry of dedup.values()) {
    for (let i = 0; i < entry.count; i++) {
      fullOut.push({
        prompt_redacted: entry.prompt_redacted,
        expected_tier: entry.expected_tier,
        predicted_tier: entry.predicted_tier,
        category: entry.category,
        source: entry.source,
      });
    }
  }
  fs.writeFileSync(fullPath, fullOut.map((e) => JSON.stringify(e)).join('\n') + '\n');

  // Summarise by misrouting pattern (expected → predicted).
  const byPair = {};
  for (const e of out) {
    const key = `${e.expected_tier}->${e.predicted_tier}`;
    byPair[key] = (byPair[key] || 0) + 1;
  }

  const summary = {
    scanned,
    misrouting_events: candidates,
    unique_prompts: dedup.size,
    written_unique: out.length,
    written_full: fullOut.length,
    by_pair: byPair,
    output_unique: OUTPUT,
    output_full: fullPath,
  };

  if (PRINT_JSON) {
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  } else {
    process.stdout.write(`harvest-misroutings: scanned ${scanned} lines\n`);
    process.stdout.write(`  candidates  : ${candidates} misrouting events\n`);
    process.stdout.write(`  unique      : ${dedup.size} prompts after dedup\n`);
    process.stdout.write(`  written     : ${out.length} unique → ${OUTPUT}\n`);
    process.stdout.write(`  written full: ${summary.written_full} weighted → ${summary.output_full}\n`);
    process.stdout.write('  by pair     :\n');
    for (const [k, v] of Object.entries(byPair).sort((a, b) => b[1] - a[1])) {
      process.stdout.write(`    ${k.padEnd(10)} ${v}\n`);
    }
  }
  return summary;
}

if (require.main === module) {
  try { harvest(); } catch (e) {
    process.stderr.write(`harvest error: ${e && e.message ? e.message : e}\n`);
    process.exit(1);
  }
}

module.exports = { harvest };
