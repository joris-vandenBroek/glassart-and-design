-- Migratie voor het kunstenaarnummer (2026-08-10), deel 1 van 2.
-- Ontwerp: docs/superpowers/specs/2026-08-10-kunstenaarnummer-en-drukkernummer-design.md
--
-- Deel 1 is additief: het voegt het nummer toe en vult het. Er verwijst nog niets
-- naar; dat doet deel 2 (2026-08-10-kunstenaarnr-relaties.sql). Deze splitsing is
-- er zodat de testsuite na elke taak groen kan zijn.
--
-- Volgorde van uitrol: draai deze migratie tegen een omgeving VOORDAT de code die
-- hem gebruikt daar gedeployd wordt. Andersom levert POST /api/kunstenaars een
-- ER_BAD_FIELD_ERROR op. Deze kant op is onschadelijk: de dan nog draaiende versie
-- kent de kolom niet en raakt hem niet aan.
--
-- kunstenaars heeft geen createdAt, dus de backfill nummert op (naam, id) -- stabiel
-- en herhaalbaar. ROW_NUMBER() in een tijdelijke tabel, niet @n := @n + 1 (dat
-- garandeert geen toewijzingsvolgorde) en geen gecorreleerde subquery op kunstenaars
-- zelf (dat is de tabel die bijgewerkt wordt). Zelfde recept als
-- 2026-08-08-klantnummer.sql.
ALTER TABLE kunstenaars ADD COLUMN kunstenaarnr VARCHAR(20) AFTER id;

CREATE TEMPORARY TABLE kunstenaarnr_backfill AS
SELECT id, ROW_NUMBER() OVER (ORDER BY naam, id) AS rn FROM kunstenaars;

UPDATE kunstenaars k
JOIN kunstenaarnr_backfill b ON b.id = k.id
SET k.kunstenaarnr = CONCAT('KU-', LPAD(b.rn, 5, '0'));

DROP TEMPORARY TABLE kunstenaarnr_backfill;

-- NOT NULL kan pas na de backfill. De UNIQUE-index maakt het nummer de sleutel waar
-- deel 2 foreign keys naartoe legt.
ALTER TABLE kunstenaars MODIFY kunstenaarnr VARCHAR(20) NOT NULL;
ALTER TABLE kunstenaars ADD UNIQUE KEY uniek_kunstenaarnr (kunstenaarnr);

-- Telt élke genummerde kunstenaar, niet alleen de zojuist bijgewerkte rijen, zodat de
-- teller ook klopt als dit ooit draait op een database die al nummers heeft.
INSERT INTO counters (id, value) VALUES ('kunstenaarnummer', (SELECT COUNT(*) FROM kunstenaars));
