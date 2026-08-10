-- Migratie voor de kunstwerkcode (2026-08-10), deel 2 van 2.
-- Ontwerp: docs/superpowers/specs/2026-08-10-kunstwerk-code-design.md
--
-- Een bestelregel legt vanaf nu vast WAT er naar de drukker ging, in de enige vorm
-- die daarbuiten betekenis heeft: de code. Het UUID in kunstwerkId zei niemand iets.
--
-- Bewust geen foreign key naar kunstwerken(code): de bestelregel legt een waarde
-- vast, geen verwijzing. Een kunstwerk dat ooit uit de catalogus verdwijnt mag een
-- historische bestelling niet ongeldig maken. Het verwijderslot in de API is wat
-- voorkomt dat een code vrijkomt en later door een ander werk hergebruikt wordt.
--
-- Volgorde van uitrol: net als deel 1 eerst migreren, dan deployen en herstarten.
-- De MODIFY ... NOT NULL faalt hard als de backfill een bestelregel zonder bestaand
-- kunstwerk overlaat. Dat is gewenst: dan moet er met de hand naar die regel worden
-- gekeken, in plaats van er stil een lege code achter te laten. Op 2026-08-10 had
-- staging 9 bestelregels, alle 9 met een bestaand kunstwerk, en productie nul.
ALTER TABLE bestellines ADD code VARCHAR(255) NULL AFTER bestelheaderId;

UPDATE bestellines bl
JOIN kunstwerken k ON k.id = bl.kunstwerkId
SET bl.code = k.code;

ALTER TABLE bestellines MODIFY code VARCHAR(255) NOT NULL;

ALTER TABLE bestellines DROP COLUMN kunstwerkId;
