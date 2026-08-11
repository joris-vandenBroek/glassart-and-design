-- Koppeltabel voor kunstwerken.onderwerpIds (2026-08-11), 5 van 6 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
CREATE TABLE kunstwerkOnderwerpen (
  kunstwerkId CHAR(36) NOT NULL,
  onderwerpId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, onderwerpId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (onderwerpId) REFERENCES onderwerpen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkOnderwerpen (kunstwerkId, onderwerpId, volgorde)
SELECT k.id, jt.onderwerpId, jt.volgorde
FROM kunstwerken k
JOIN JSON_TABLE(
  k.onderwerpIds, '$[*]' COLUMNS (
    volgorde FOR ORDINALITY,
    onderwerpId CHAR(36) PATH '$'
  )
) AS jt
WHERE k.onderwerpIds IS NOT NULL;
