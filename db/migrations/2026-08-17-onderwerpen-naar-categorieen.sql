-- Onderwerpen heten voortaan Categorieen (2026-08-17).
-- Ontwerp: docs/superpowers/specs/2026-08-17-onderwerpen-naar-categorieen-design.md
-- De koppeltabel wordt opnieuw opgebouwd in plaats van kolom-hernoemd: RENAME TABLE laat
-- de automatisch gegenereerde foreign-keynaam op onderwerpId staan, en die naam wil je niet
-- laten afwijken van wat een verse installatie uit db/schema.sql oplevert.
RENAME TABLE onderwerpen TO categorieen;

CREATE TABLE kunstwerkCategorieen (
  kunstwerkId CHAR(36) NOT NULL,
  categorieId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, categorieId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (categorieId) REFERENCES categorieen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkCategorieen (kunstwerkId, categorieId, volgorde)
SELECT kunstwerkId, onderwerpId, volgorde FROM kunstwerkOnderwerpen;

DROP TABLE kunstwerkOnderwerpen;

UPDATE activiteitenlog SET type = REPLACE(type, 'onderwerp_', 'categorie_') WHERE type LIKE 'onderwerp\_%';
