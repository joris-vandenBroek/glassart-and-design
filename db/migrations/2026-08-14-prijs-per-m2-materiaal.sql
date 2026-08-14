-- Voegt prijsPerM2 toe aan materialen zodat kunstwerken met een gekoppeld materiaal hun
-- maatloze prijs voortaan van het materiaal halen in plaats van van het kunstwerk.
-- kunstwerken.prijsPerM2 blijft bestaan (nog steeds nodig voor materiaalloze kunstwerken,
-- bv. Akoestische stof, die geen materiaal hebben om de prijs aan te hangen).
-- Ontwerp: docs/superpowers/specs/2026-08-14-materialen-maten-select-all-en-prijs-verplaatsing-design.md
--
-- Zuivere toevoeging, geen drop -- geen risicovenster tussen migratie en deploy nodig.
ALTER TABLE materialen ADD COLUMN prijsPerM2 DECIMAL(10,2);
