-- Migratie voor het drukkernummer (2026-08-10).
-- Ontwerp: docs/superpowers/specs/2026-08-10-kunstenaarnummer-en-drukkernummer-design.md
--
-- Zelfde vorm als het kunstenaarnummer, maar in één bestand: de drukkerkant heeft
-- maar één verwijzende kolom en op 2026-08-10 twee drukkers en twee zendingen.
--
-- Volgorde van uitrol: eerst migreren, dan deployen, dan herstarten.
--
-- drukkerZendingen.drukkerId was ON DELETE CASCADE. De nieuwe foreign key is dat
-- bewust NIET (ontwerp, beslissing 6): het verwijderen van een drukker mag de
-- verzendhistorie niet meenemen. Tot nu toe was de API-controle in
-- DELETE /api/drukkers/[id] het enige dat dat tegenhield.
ALTER TABLE drukkers ADD COLUMN drukkernr VARCHAR(20) AFTER id;

CREATE TEMPORARY TABLE drukkernr_backfill AS
SELECT id, ROW_NUMBER() OVER (ORDER BY naam, id) AS rn FROM drukkers;

UPDATE drukkers d
JOIN drukkernr_backfill b ON b.id = d.id
SET d.drukkernr = CONCAT('DR-', LPAD(b.rn, 5, '0'));

DROP TEMPORARY TABLE drukkernr_backfill;

ALTER TABLE drukkers MODIFY drukkernr VARCHAR(20) NOT NULL;
ALTER TABLE drukkers ADD UNIQUE KEY uniek_drukkernr (drukkernr);

INSERT INTO counters (id, value) VALUES ('drukkernummer', (SELECT COUNT(*) FROM drukkers));

-- drukkerZendingen: drukkerId -> drukkernr. NOT NULL, want een zending zonder drukker
-- bestaat niet. De MODIFY faalt hard als de backfill een zending zonder bestaande
-- drukker overlaat -- gewenst: dan moet daar met de hand naar gekeken worden.
ALTER TABLE drukkerZendingen ADD COLUMN drukkernr VARCHAR(20) NULL AFTER drukkerId;

UPDATE drukkerZendingen z
JOIN drukkers d ON d.id = z.drukkerId
SET z.drukkernr = d.drukkernr;

ALTER TABLE drukkerZendingen DROP FOREIGN KEY drukkerZendingen_ibfk_1;
ALTER TABLE drukkerZendingen DROP COLUMN drukkerId;
ALTER TABLE drukkerZendingen MODIFY drukkernr VARCHAR(20) NOT NULL;
ALTER TABLE drukkerZendingen ADD CONSTRAINT fk_drukkerzendingen_drukkernr
  FOREIGN KEY (drukkernr) REFERENCES drukkers (drukkernr);
