-- Verwijdert de vijf JSON-arrays van kunstwerken nu de koppeltabellen (migraties
-- 2026-08-11-01 t/m 05) en de code die ze gebruikt (deze commit) klaar zijn.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
--
-- Uitrolvolgorde: eerst deze migratie, dan de code in deze commit deployen, dan
-- herstarten. Tussen migratie en herstart leest de nog draaiende oude code kolommen
-- die niet meer bestaan (ER_BAD_FIELD_ERROR) -- dat venster moet daarom kort zijn,
-- zelfde bewust geaccepteerde patroon als eerdere migraties in dit project.
ALTER TABLE kunstwerken DROP COLUMN segmentIds;
ALTER TABLE kunstwerken DROP COLUMN materiaalIds;
ALTER TABLE kunstwerken DROP COLUMN maatIds;
ALTER TABLE kunstwerken DROP COLUMN stijlIds;
ALTER TABLE kunstwerken DROP COLUMN onderwerpIds;
