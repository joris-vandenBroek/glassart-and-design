-- Migratie voor bestelheaders.klantnr (2026-08-10), 3 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Vervangt bestelheaders.klantId door klantnr. Bewust vervangen, niet aanvullen
-- (ontwerp, beslissing 2): twee kolommen naast elkaar zijn twee verwijzingen naar
-- dezelfde rij die uit elkaar kunnen lopen.
--
-- Volgorde van uitrol: eerst deze migratie, dan de code met de 'Goedgekeurd'-poort
-- (ontwerp, beslissing 3) deployen, dan herstarten. Tussen migratie en herstart leest
-- de nog draaiende oude code klantId en faalt elke nieuwe bestelling met
-- ER_BAD_FIELD_ERROR -- dat venster moet daarom kort zijn.
--
-- Als de UPDATE ... JOIN hieronder een bestaande bestelheader zonder klantnr
-- achterlaat (de klant bij die bestelling is nooit op 'Goedgekeurd' gezet, of is dat
-- nadien weer kwijtgeraakt), faalt de MODIFY ... NOT NULL hieronder luid. Controleer
-- dit VOORAF op de doelomgeving met:
--   SELECT bh.id, bh.bestelnr, k.email FROM bestelheaders bh
--   JOIN klanten k ON k.id = bh.klantId WHERE k.klantnr IS NULL;
-- Een niet-lege uitkomst vraagt om een handmatige blik (alsnog een klantnr toekennen
-- via PATCH /api/klanten/[id] met status 'Goedgekeurd') voordat deze migratie verder
-- kan.
ALTER TABLE bestelheaders ADD COLUMN klantnr VARCHAR(20) NULL AFTER id;

UPDATE bestelheaders bh
JOIN klanten k ON k.id = bh.klantId
SET bh.klantnr = k.klantnr;

ALTER TABLE bestelheaders DROP FOREIGN KEY bestelheaders_ibfk_1;
ALTER TABLE bestelheaders DROP COLUMN klantId;
ALTER TABLE bestelheaders MODIFY klantnr VARCHAR(20) NOT NULL;
ALTER TABLE bestelheaders ADD CONSTRAINT fk_bestelheaders_klantnr
  FOREIGN KEY (klantnr) REFERENCES klanten (klantnr);
