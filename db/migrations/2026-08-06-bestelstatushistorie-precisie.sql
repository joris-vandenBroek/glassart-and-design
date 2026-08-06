-- Migration for bestelstatushistorie-precisie (2026-08-06)
-- Run once, in order. Fixes 2026-08-06-bestelstatushistorie.sql's tijdstip column,
-- which used plain TIMESTAMP (1-second resolution) -- multiple status changes in the
-- same request or in rapid succession landed on identical timestamps, making
-- "ORDER BY tijdstip ASC" non-deterministic for ties.
ALTER TABLE bestelstatusHistorie MODIFY tijdstip TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);
