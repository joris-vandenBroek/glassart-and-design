-- Migratie voor bestellines.bestelnr (2026-08-10), 4 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Geen weesrijen mogelijk: bestelheaderId is vandaag NOT NULL met een bestaande
-- foreign key, dus de UPDATE ... JOIN hieronder vult elke rij.
ALTER TABLE bestellines ADD COLUMN bestelnr VARCHAR(20) NULL AFTER bestelheaderId;

UPDATE bestellines bl
JOIN bestelheaders bh ON bh.id = bl.bestelheaderId
SET bl.bestelnr = bh.bestelnr;

ALTER TABLE bestellines DROP FOREIGN KEY bestellines_ibfk_1;
ALTER TABLE bestellines DROP COLUMN bestelheaderId;
ALTER TABLE bestellines MODIFY bestelnr VARCHAR(20) NOT NULL AFTER id;
ALTER TABLE bestellines ADD CONSTRAINT fk_bestellines_bestelnr
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders (bestelnr) ON DELETE CASCADE;
