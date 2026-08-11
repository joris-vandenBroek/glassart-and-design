-- Migratie voor de zending<->bestelling-koppeltabel (2026-08-10), 7 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Elk bestand in deze reeks van acht migraties heeft een 2-cijferige volgordeprefix
-- (01 t/m 08, direct na de datum): db:migrate past migraties toe in kale alfabetische
-- bestandsvolgorde (sorteerMigraties in scripts/lib/migrations.ts doet
-- filenames.sort(), geen datum- of afhankelijkheidsbewuste sortering), en bij acht
-- onderling afhankelijke bestanden op dezelfde datum is op de beschrijvende naam
-- laten leunen te broos -- deze migratie legt bijvoorbeeld een foreign key naar
-- drukkerZendingen(zendingnummer), die pas UNIQUE is ná bestand 06 hierboven. De
-- prefix maakt die volgorde expliciet in plaats van afhankelijk van hoe de rest van
-- de bestandsnaam toevallig alfabetiseert.
--
-- Vervangt drukkerZendingen.bestellingIds (JSON-array van bestelheaders.id) door
-- echte rijen: een JSON-array kan geen foreign-key-constraint per element dragen.
CREATE TABLE drukkerZendingBestellingen (
  zendingnummer VARCHAR(20) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  PRIMARY KEY (zendingnummer, bestelnr),
  FOREIGN KEY (zendingnummer) REFERENCES drukkerZendingen (zendingnummer) ON DELETE CASCADE,
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders (bestelnr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pakt elke bestellingIds-JSON-array uit naar losse rijen. bestellingIds bevat
-- bestelheaders.id (UUID); de tweede JOIN vertaalt dat naar bestelnr.
--
-- JSON_TABLE's PATH-kolom krijgt zonder expliciete COLLATE de collatie van de
-- sessie (utf8mb4_general_ci hier), niet die van de tabel -- op deze
-- MariaDB-server is de tabelkolom-collatie utf8mb4_uca1400_ai_ci, wat zonder
-- deze COLLATE een "Illegal mix of collations"-fout gaf op de JOIN hieronder.
INSERT INTO drukkerZendingBestellingen (zendingnummer, bestelnr)
SELECT z.zendingnummer, bh.bestelnr
FROM drukkerZendingen z
JOIN JSON_TABLE(
  z.bestellingIds, '$[*]' COLUMNS (bestelheaderId CHAR(36) COLLATE utf8mb4_uca1400_ai_ci PATH '$')
) AS jt
JOIN bestelheaders bh ON bh.id = jt.bestelheaderId;

ALTER TABLE drukkerZendingen DROP COLUMN bestellingIds;
