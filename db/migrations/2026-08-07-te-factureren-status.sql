-- Migration for the "Te factureren" status feature (2026-08-07)
-- Run once against a database that still has 'Afgerond' rows from before this feature.
-- No schema change (status columns are already free-text VARCHAR(50)) -- this is a
-- pure data update: renaming the old terminal status string 'Afgerond' to the new
-- terminal status string 'Betaald en afgerond', now that 'Afgerond' has been replaced
-- in the application's status union. Without this, any existing row still reading
-- 'Afgerond' falls outside every status the UI knows about (no footer action buttons,
-- no matching quick-filter, broken customer-facing status label).
UPDATE bestelheaders SET status = 'Betaald en afgerond' WHERE status = 'Afgerond';
UPDATE bestelstatusHistorie SET status = 'Betaald en afgerond' WHERE status = 'Afgerond';
