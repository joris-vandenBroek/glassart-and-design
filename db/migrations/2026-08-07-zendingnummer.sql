-- Migration for zendingnummer (2026-08-07)
-- Run once against a database still on the pre-migration schema.
-- Both columns are nullable: existing bestellingen/zendingen from before this
-- migration never get a zendingnummer assigned retroactively. zendingnummer on
-- bestelheaders is a deliberate denormalized copy for display only -- the
-- existing bestellingIds-JSON zendinggenoten/afronden mechanism is untouched.
ALTER TABLE drukkerZendingen ADD COLUMN zendingnummer VARCHAR(20);
ALTER TABLE bestelheaders ADD COLUMN zendingnummer VARCHAR(20);
INSERT INTO counters (id, value) VALUES ('zendingnummer', 0);
