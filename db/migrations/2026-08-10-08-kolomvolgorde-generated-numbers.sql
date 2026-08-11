-- Migratie voor kolomvolgorde (2026-08-10), laatste van deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- Zuiver leesbaarheid: verplaatst de twee kolommen die dit plan niet zelf al met
-- ADD COLUMN ... AFTER neerzette omdat ze al vóór dit plan bestonden. klantnr op
-- bestelheaders (taak 2) en drukkerZendingen.zendingnummer (taak 4) staan al goed en
-- worden hier NIET nogmaals verplaatst.
ALTER TABLE klanten MODIFY klantnr VARCHAR(20) NULL AFTER id;
ALTER TABLE bestelheaders MODIFY zendingnummer VARCHAR(20) NULL AFTER bestelnr;
