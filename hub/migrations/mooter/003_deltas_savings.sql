-- add savings_usd and profile_hash to deltas table
ALTER TABLE deltas ADD COLUMN savings_usd REAL;
ALTER TABLE deltas ADD COLUMN profile_hash TEXT;
