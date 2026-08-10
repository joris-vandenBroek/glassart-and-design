-- Migratie voor de unieke klantnr (2026-08-10), 2 van 8 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-10-bestelnr-klantnr-en-zendingnummer-als-sleutel-design.md
--
-- klantnr blijft nullable: alleen 'Goedgekeurd'-klanten hebben er een. MariaDB staat
-- meerdere NULL's in een UNIQUE-index toe, dus dat gedrag verandert niet -- zelfde
-- redenering als klanten.kunstenaarnr in het kunstenaarnummer-ontwerp.
ALTER TABLE klanten ADD UNIQUE KEY uniek_klantnr (klantnr);
