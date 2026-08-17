-- Een materiaal kan uit het klantbeeld verdwijnen zonder verwijderd te worden.
-- DEFAULT TRUE, zodat bestaande materialen na de migratie exact hetzelfde gedrag houden
-- en de nog niet gedeployde code de kolom straks gewoon negeert.
ALTER TABLE materialen ADD COLUMN actief BOOLEAN NOT NULL DEFAULT TRUE;
