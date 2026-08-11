-- Migration for klanten.afwijsreden / bestelheaders.afwijsreden (2026-08-10)
-- Run once against a database still on the pre-migration schema.
-- Nullable: existing Afgewezen rows have no stored reason and stay NULL; only a
-- rejection made through the new confirmation popup fills this in going forward.
ALTER TABLE klanten ADD COLUMN afwijsreden TEXT NULL;
ALTER TABLE bestelheaders ADD COLUMN afwijsreden TEXT NULL;
