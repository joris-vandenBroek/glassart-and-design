-- Migratie voor bestelheaders.korting (2026-08-11).
-- Vast kortingsbedrag per bestelling, voor speciale prijsafspraken (bv. een kunstenaar die
-- zijn eigen werk bestelt). Zie docs/superpowers/specs/2026-08-11-bestelling-bewerken-beheer-design.md.
ALTER TABLE bestelheaders ADD COLUMN korting DECIMAL(10,2) NULL AFTER status;
