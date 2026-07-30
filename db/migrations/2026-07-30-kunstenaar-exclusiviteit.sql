-- Migration for kunstenaar-exclusiviteit-herontwerp (2026-07-30)
-- Run once, in order, against a database still on the pre-migration schema.
ALTER TABLE klanten ADD COLUMN kunstenaarId CHAR(36) NULL AFTER prijsgroepId;
ALTER TABLE klanten DROP COLUMN exclusieveKunstenaarIds;
ALTER TABLE klanten ADD UNIQUE KEY uniq_klanten_kunstenaarId (kunstenaarId);
ALTER TABLE kunstenaars ADD COLUMN exclusieveKlantIds JSON NULL;
ALTER TABLE kunstenaars DROP COLUMN verkooprecht;
ALTER TABLE kunstenaars DROP COLUMN klantId;
ALTER TABLE kunstenaars DROP COLUMN exclusiefVoorKlantId;
