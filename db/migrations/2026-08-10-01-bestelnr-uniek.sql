-- Migratie voor de unieke bestelnr (2026-08-10), 1 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Geen backfill nodig: bestelnr is al NOT NULL op elke rij (schema.sql, CREATE TABLE
-- bestelheaders) en door de tellergarantie in volgendNummer() binnen een transactie
-- al uniek. Faalt deze migratie alsnog op ER_DUP_ENTRY, dan wijst dat op een bug in
-- die tellergarantie die eerst opgelost moet worden -- geen reden om deze migratie
-- aan te passen.
ALTER TABLE bestelheaders ADD UNIQUE KEY uniek_bestelnr (bestelnr);
