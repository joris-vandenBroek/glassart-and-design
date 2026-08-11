-- Migratie voor de unieke zendingnummer (2026-08-10), 6 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- zendingnummer is nullable sinds 2026-08-07-zendingnummer.sql: zendingen van
-- dáárvóór kregen er nooit één. Backfill vult exact die rijen, met nummers boven de
-- huidige tellerstand zodat er geen overlap ontstaat met nummers die runtime via
-- volgendNummer() al zijn uitgegeven.
SET @start = (SELECT value FROM counters WHERE id = 'zendingnummer');

CREATE TEMPORARY TABLE zendingnr_backfill AS
SELECT id, ROW_NUMBER() OVER (ORDER BY verzondenOp, id) AS rn
FROM drukkerZendingen
WHERE zendingnummer IS NULL;

UPDATE drukkerZendingen z
JOIN zendingnr_backfill b ON b.id = z.id
SET z.zendingnummer = CONCAT('ZD-', LPAD(@start + b.rn, 5, '0'));

UPDATE counters
SET value = @start + (SELECT COUNT(*) FROM zendingnr_backfill)
WHERE id = 'zendingnummer';

DROP TEMPORARY TABLE zendingnr_backfill;

ALTER TABLE drukkerZendingen MODIFY zendingnummer VARCHAR(20) NOT NULL AFTER id;
ALTER TABLE drukkerZendingen ADD UNIQUE KEY uniek_zendingnummer (zendingnummer);
