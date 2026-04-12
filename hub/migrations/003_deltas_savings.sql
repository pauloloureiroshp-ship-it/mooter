-- MP-18: add savings_usd and profile_hash to deltas table
-- Execute via: wrangler d1 execute frugal-events --remote --file=migrations/003_deltas_savings.sql
ALTER TABLE deltas ADD COLUMN savings_usd REAL;
ALTER TABLE deltas ADD COLUMN profile_hash TEXT;
