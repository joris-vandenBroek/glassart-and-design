-- Migration for klantnummer (2026-08-08)
-- Run once against a database still on the pre-migration schema.
-- klantnr is nullable on purpose: only klanten with status 'Goedgekeurd' get a
-- number, so klanten still under review (or rejected) keep it NULL. There is no
-- UNIQUE index -- the counters row inside a transaction is the uniqueness
-- guarantee, and an index would add a second, partly overlapping source of
-- truth for all the NULL rows.
ALTER TABLE klanten ADD COLUMN klantnr VARCHAR(20);
INSERT INTO counters (id, value) VALUES ('klantnummer', 0);

-- Backfill: klanten that were already approved before this migration get a
-- number in createdAt order. Uses a temporary table rather than a session
-- variable (@n := @n + 1 does not guarantee assignment order) or a correlated
-- subquery on klanten itself (that is the table being updated).
CREATE TEMPORARY TABLE klantnr_backfill AS
SELECT id, ROW_NUMBER() OVER (ORDER BY createdAt) AS rn
FROM klanten
WHERE status = 'Goedgekeurd' AND klantnr IS NULL;

UPDATE klanten k
JOIN klantnr_backfill b ON b.id = k.id
SET k.klantnr = CONCAT('KL-', LPAD(b.rn, 5, '0'));

DROP TEMPORARY TABLE klantnr_backfill;

-- Counts every numbered klant, not just the rows just updated, so the counter
-- stays correct if this ever runs on a database that already has numbers.
UPDATE counters
SET value = (SELECT COUNT(*) FROM klanten WHERE klantnr IS NOT NULL)
WHERE id = 'klantnummer';
