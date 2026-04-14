-- 004_mooter_events_alias.sql — backward-compat view alias (frugal → mooter rebrand)
--
-- Creates a `mooter_events` VIEW over the existing `frugal_events` TABLE so
-- downstream consumers (dashboards, exports, BI) can reference the new name
-- without a data migration. NO writes are redirected here — the canonical
-- write path in hub/routes/events.js continues to INSERT into frugal_events.
--
-- Do NOT drop frugal_events. A future migration will rename the physical
-- table once all consumers have switched to mooter_events reads.

CREATE VIEW IF NOT EXISTS mooter_events AS
  SELECT * FROM frugal_events;
