-- 020_benchmark_ingest.sql — Rankings R2: external benchmark + pricing ingest
-- Created: 2026-06-18
--
-- CONTEXT (Rankings R2 — autonomous pipeline):
-- The daily ingestor (hub/lib/ingest.js) pulls model benchmarks + pricing from
-- Artificial Analysis and OpenRouter and stores them here so /v1/benchmarks and
-- /v1/pricing can serve fresh, cited numbers that fill the specialization matrix's
-- pending cells. Purely ADDITIVE — migrations 001-019 are untouched, no existing
-- table or column is modified.
--
-- DOCTRINE: every row carries source + as_of (provenance). Confidence is
-- 'high'|'medium'|'low'. The PRIMARY KEY (model, category, source) lets multiple
-- sources coexist per cell so the consumer can apply precedence
-- (mooter-bench > artificial-analysis > openrouter) without one source clobbering
-- another. A cell is only ever written when the source actually measured it — we
-- never fabricate a row to fill a gap.
--
-- Apply via (local first, then remote before deploy):
--   npx wrangler d1 migrations apply mooter-hub --local  -c wrangler.mooter.toml
--   npx wrangler d1 migrations apply mooter-hub --remote -c wrangler.mooter.toml

CREATE TABLE IF NOT EXISTS benchmark_cells (
  model      TEXT NOT NULL,           -- Mooter model id (from MATRIX_MODELS)
  category   TEXT NOT NULL,           -- Mooter task category (from TASK_CATEGORIES)
  score      REAL,                    -- benchmark score in [0,1] (NULL = not measured by this source)
  source     TEXT NOT NULL,           -- 'artificial-analysis' | 'openrouter' | 'mooter-bench' | ...
  as_of      TEXT,                    -- ISO date the source was fetched/measured
  confidence TEXT,                    -- 'high' | 'medium' | 'low'
  PRIMARY KEY (model, category, source)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_cells_model ON benchmark_cells (model);
CREATE INDEX IF NOT EXISTS idx_benchmark_cells_category ON benchmark_cells (category);

CREATE TABLE IF NOT EXISTS pricing_models (
  model          TEXT PRIMARY KEY,    -- Mooter model id
  input_per_mtok  REAL,               -- $/M input tokens (NULL = unknown / pending)
  output_per_mtok REAL,               -- $/M output tokens
  blended_3to1    REAL,               -- $/M at the 3:1 input:output convention
  source          TEXT,               -- where the price came from
  as_of           TEXT                -- ISO date the price was fetched
);
