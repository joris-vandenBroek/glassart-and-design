-- Migratie voor kolomvolgorde kunstwerken.code (2026-08-11).
-- Zuiver leesbaarheid, geen functionele wijziging: verplaatst code naar direct na id,
-- zelfde patroon als klantnr/bestelnr/zendingnummer/kunstenaarnr/drukkernr elders in
-- de database. Kolomvolgorde heeft geen betekenis voor MySQL/MariaDB zelf en geen
-- enkele query of applicatiecode leunt erop.
ALTER TABLE kunstwerken MODIFY code VARCHAR(255) NOT NULL DEFAULT '' AFTER id;
