-- Migration for kunstenaar.website (2026-08-10)
-- Run once against a database still on the pre-migration schema.
-- Nullable: only kunstenaars with an own site fill it in; existing rows stay
-- NULL until someone fills it in via het beheer-formulier.
ALTER TABLE kunstenaars ADD COLUMN website VARCHAR(500);

-- One-off data cleanup: Jack Liemburg's omschrijving had the website hand-typed
-- as a trailing sentence in all 4 languages -- the exact pattern this feature
-- replaces. Move it into the new column and strip the sentence back out, so the
-- description shows the automatically-generated version like every other
-- kunstenaar going forward.
UPDATE kunstenaars
SET
  website = 'https://www.jacksart.nl/',
  omschrijvingNl = REPLACE(
    omschrijvingNl,
    CONCAT(CHAR(10), CHAR(10), 'Meer weten over Jack? Bekijk https://www.jacksart.nl/'),
    ''
  ),
  -- The French sentence uses a non-breaking space (CHAR(160)) before "?", per
  -- French typographic convention -- confirmed byte-for-byte against the actual
  -- staging row; a plain space here would silently no-op the REPLACE.
  omschrijvingFr = REPLACE(
    omschrijvingFr,
    CONCAT(CHAR(10), CHAR(10), 'En savoir plus sur Jack', CHAR(160), '? Rendez-vous sur https://www.jacksart.nl/en/'),
    ''
  ),
  omschrijvingDe = REPLACE(
    omschrijvingDe,
    CONCAT(CHAR(10), CHAR(10), 'Mehr über Jack erfahren? Besuchen Sie https://www.jacksart.nl/de/'),
    ''
  ),
  omschrijvingEn = REPLACE(
    omschrijvingEn,
    CONCAT(CHAR(10), CHAR(10), 'Want to know more about Jack? Visit https://www.jacksart.nl/en/'),
    ''
  )
WHERE naam = 'Jack Liemburg';
