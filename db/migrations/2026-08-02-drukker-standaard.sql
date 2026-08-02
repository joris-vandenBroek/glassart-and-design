-- Migration for drukker-standaard (2026-08-02)
-- Run once, in order, against a database still on the pre-migration schema.
ALTER TABLE drukkers ADD COLUMN standaard BOOLEAN DEFAULT FALSE;
