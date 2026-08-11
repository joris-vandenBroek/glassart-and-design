-- Migratie voor het kunstenaarnummer (2026-08-10), deel 2 van 2.
-- Ontwerp: docs/superpowers/specs/2026-08-10-kunstenaarnummer-en-drukkernummer-design.md
--
-- Vervangt de twee verwijzingen naar een kunstenaar door het nummer uit deel 1.
-- Bewust vervangen en niet aanvullen: twee kolommen naast elkaar zijn twee
-- verwijzingen naar dezelfde rij die uit elkaar kunnen lopen.
--
-- Volgorde van uitrol: eerst migreren, dan deployen, dan herstarten. Tussen migratie
-- en herstart leest de nog draaiende versie kunstenaarId en is de collectiepagina
-- stuk. Dat venster is bewust geaccepteerd (ontwerp, beslissing 7): op 2026-08-10 had
-- staging 8 kunstenaars, 111 gekoppelde kunstwerken en 1 gekoppelde klant, en
-- productie nul van alles.
--
-- De constraintnamen kunstwerken_ibfk_1 en drukkerZendingen_ibfk_1 zijn de door
-- MariaDB gegenereerde namen van de naamloze FOREIGN KEY-regels in db/schema.sql,
-- nagekeken op staging op 2026-08-10. MariaDB weigert een kolom te droppen zolang er
-- een foreign key op ligt, dus die moet er eerst af.

-- kunstwerken: kunstenaarId -> kunstenaarnr. Blijft nullable: een kunstwerk hoeft
-- geen kunstenaar te hebben (op staging is er precies één zo'n rij).
ALTER TABLE kunstwerken ADD COLUMN kunstenaarnr VARCHAR(20) NULL AFTER kunstenaarId;

UPDATE kunstwerken w
JOIN kunstenaars k ON k.id = w.kunstenaarId
SET w.kunstenaarnr = k.kunstenaarnr;

ALTER TABLE kunstwerken DROP FOREIGN KEY kunstwerken_ibfk_1;
ALTER TABLE kunstwerken DROP COLUMN kunstenaarId;
ALTER TABLE kunstwerken ADD CONSTRAINT fk_kunstwerken_kunstenaarnr
  FOREIGN KEY (kunstenaarnr) REFERENCES kunstenaars (kunstenaarnr);

-- klanten: kunstenaarId -> kunstenaarnr. Hier stond alleen een unieke index en géén
-- foreign key; die komt er nu wel bij. Meerdere NULL's blijven toegestaan in een
-- UNIQUE-index, dus het gedrag voor niet-kunstenaar-klanten verandert niet.
ALTER TABLE klanten ADD COLUMN kunstenaarnr VARCHAR(20) NULL AFTER kunstenaarId;

UPDATE klanten kl
JOIN kunstenaars k ON k.id = kl.kunstenaarId
SET kl.kunstenaarnr = k.kunstenaarnr;

ALTER TABLE klanten DROP INDEX uniq_klanten_kunstenaarId;
ALTER TABLE klanten DROP COLUMN kunstenaarId;
ALTER TABLE klanten ADD UNIQUE KEY uniq_klanten_kunstenaarnr (kunstenaarnr);
ALTER TABLE klanten ADD CONSTRAINT fk_klanten_kunstenaarnr
  FOREIGN KEY (kunstenaarnr) REFERENCES kunstenaars (kunstenaarnr);
