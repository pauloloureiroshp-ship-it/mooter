-- Wave 1 Pastor benchmark — pre-canned DuckDB queries.
-- Run: duckdb -c ".read queries.sql"  (from the outputs/ dir)

-- Q1: cost + quality + latency per arm
SELECT arm, COUNT(*) n, ROUND(AVG(quality_score),3) mean_quality,
       ROUND(SUM(cost_micros)/1e6,4) total_cost_usd, ROUND(AVG(latency_total_ms)) mean_latency_ms
FROM 'RAW_RESULTS.parquet' GROUP BY arm ORDER BY arm;

-- Q2: Pastor (arm A) quality by pack
SELECT pack_routed, COUNT(*) n, ROUND(AVG(quality_score),3) mean_quality, ROUND(AVG(cost_micros)/1e6,5) mean_cost_usd
FROM 'RAW_RESULTS.parquet' WHERE arm='A' GROUP BY pack_routed ORDER BY n DESC;

-- Q3: mis-routing — routed vs expected pack (arm A)
SELECT expected_pack, pack_routed, COUNT(*) n
FROM 'RAW_RESULTS.parquet' WHERE arm='A' GROUP BY expected_pack, pack_routed ORDER BY n DESC;

-- Q4: tier distribution of Pastor + mean quality per tier
SELECT tier_routed, COUNT(*) n, ROUND(AVG(quality_score),3) mean_quality, ROUND(AVG(cost_micros)/1e6,5) mean_cost_usd
FROM 'RAW_RESULTS.parquet' WHERE arm='A' GROUP BY tier_routed ORDER BY tier_routed;

-- Q5: cost savings — Pastor vs baseline (B) vs gold (C)
SELECT
  ROUND(SUM(CASE WHEN arm='A' THEN cost_micros END)/1e6,4) pastor_usd,
  ROUND(SUM(CASE WHEN arm='B' THEN cost_micros END)/1e6,4) baseline_usd,
  ROUND(SUM(CASE WHEN arm='C' THEN cost_micros END)/1e6,4) gold_usd,
  ROUND(1 - SUM(CASE WHEN arm='A' THEN cost_micros END)*1.0/SUM(CASE WHEN arm='B' THEN cost_micros END),3) savings_vs_baseline,
  ROUND(1 - SUM(CASE WHEN arm='A' THEN cost_micros END)*1.0/SUM(CASE WHEN arm='C' THEN cost_micros END),3) savings_vs_gold
FROM 'RAW_RESULTS.parquet';

-- Q6: quality per dimension by arm (judge log, base runs only)
SELECT arm, ROUND(AVG(correctness),3) correctness, ROUND(AVG(completeness),2) completeness,
       ROUND(AVG(relevance),2) relevance, ROUND(AVG(actionability),2) actionability, ROUND(AVG(hallucination),3) hallucination
FROM 'JUDGE_LOG.parquet' WHERE is_repeat=false GROUP BY arm ORDER BY arm;

-- Q7: latency distribution per arm
SELECT arm, ROUND(MIN(latency_total_ms)) min_ms, ROUND(MEDIAN(latency_total_ms)) p50_ms,
       ROUND(QUANTILE_CONT(latency_total_ms,0.95)) p95_ms, ROUND(MAX(latency_total_ms)) max_ms
FROM 'RAW_RESULTS.parquet' GROUP BY arm ORDER BY arm;

-- Q8: where would a higher tier have helped? (arm A)
SELECT prompt_id, block, tier_routed, pack_routed, ROUND(quality_score,3) q_pastor
FROM 'RAW_RESULTS.parquet' WHERE arm='A' AND would_higher_tier_help GROUP BY ALL ORDER BY prompt_id;

-- Q9: hallucination incidents by arm
SELECT arm, SUM(CASE WHEN hallucination=1 THEN 1 ELSE 0 END) hallucinated, COUNT(*) n
FROM 'JUDGE_LOG.parquet' WHERE is_repeat=false GROUP BY arm ORDER BY arm;

-- Q10: per-prompt quality across arms (paired view)
SELECT prompt_id, block,
  MAX(CASE WHEN arm='A' THEN quality_score END) q_pastor,
  MAX(CASE WHEN arm='B' THEN quality_score END) q_baseline,
  MAX(CASE WHEN arm='C' THEN quality_score END) q_gold
FROM 'RAW_RESULTS.parquet' GROUP BY prompt_id, block ORDER BY prompt_id;
