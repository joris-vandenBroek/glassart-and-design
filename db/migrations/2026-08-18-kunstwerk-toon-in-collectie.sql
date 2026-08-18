-- Een kunstwerk kan uit de collectiepagina verdwijnen zonder verwijderd te worden.
-- DEFAULT TRUE, zodat bestaande kunstwerken na de migratie exact hetzelfde gedrag houden
-- en de nog niet gedeployde code de kolom straks gewoon negeert.
ALTER TABLE kunstwerken ADD COLUMN toonInCollectie BOOLEAN NOT NULL DEFAULT TRUE;
