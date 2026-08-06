-- Migration for bestelling-afronden (2026-08-05)
-- Run once, in order, against a database still on the pre-migration schema.
ALTER TABLE bestelheaders ADD COLUMN afgerondOp DATETIME NULL;
