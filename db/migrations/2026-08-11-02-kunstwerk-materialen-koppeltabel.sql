-- Koppeltabel voor kunstwerken.materiaalIds (2026-08-11), 2 van 6 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
CREATE TABLE kunstwerkMaterialen (
  kunstwerkId CHAR(36) NOT NULL,
  materiaalId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, materiaalId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (materiaalId) REFERENCES materialen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkMaterialen (kunstwerkId, materiaalId, volgorde)
SELECT k.id, jt.materiaalId, jt.volgorde
FROM kunstwerken k
JOIN JSON_TABLE(
  k.materiaalIds, '$[*]' COLUMNS (
    volgorde FOR ORDINALITY,
    materiaalId CHAR(36) PATH '$'
  )
) AS jt
WHERE k.materiaalIds IS NOT NULL;
