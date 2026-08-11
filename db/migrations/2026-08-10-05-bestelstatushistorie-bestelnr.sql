-- Migratie voor bestelstatusHistorie.bestelnr (2026-08-10), 5 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Zelfde vorm als bestellines (vorige migratie in deze reeks).
ALTER TABLE bestelstatusHistorie ADD COLUMN bestelnr VARCHAR(20) NULL AFTER bestelheaderId;

UPDATE bestelstatusHistorie bsh
JOIN bestelheaders bh ON bh.id = bsh.bestelheaderId
SET bsh.bestelnr = bh.bestelnr;

ALTER TABLE bestelstatusHistorie DROP FOREIGN KEY bestelstatusHistorie_ibfk_1;
ALTER TABLE bestelstatusHistorie DROP COLUMN bestelheaderId;
ALTER TABLE bestelstatusHistorie MODIFY bestelnr VARCHAR(20) NOT NULL AFTER id;
ALTER TABLE bestelstatusHistorie ADD CONSTRAINT fk_bestelstatushistorie_bestelnr
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders (bestelnr) ON DELETE CASCADE;
