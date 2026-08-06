-- Migration for klant btwNummer (2026-08-06)
-- Run once against a database still on the pre-migration schema.
-- Nullable on purpose: existing klanten have no VAT number yet, and klanten outside
-- the EU have none at all. VARCHAR(20) covers the longest EU format (SE + 12 digits).
ALTER TABLE klanten ADD COLUMN btwNummer VARCHAR(20) AFTER kvk;
