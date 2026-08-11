-- Koppeltabel voor kunstwerken.stijlIds (2026-08-11), 4 van 6 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
CREATE TABLE kunstwerkStijlen (
  kunstwerkId CHAR(36) NOT NULL,
  stijlId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, stijlId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (stijlId) REFERENCES stijlen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkStijlen (kunstwerkId, stijlId, volgorde)
SELECT k.id, jt.stijlId, jt.volgorde
FROM kunstwerken k
JOIN JSON_TABLE(
  k.stijlIds, '$[*]' COLUMNS (
    volgorde FOR ORDINALITY,
    stijlId CHAR(36) PATH '$'
  )
) AS jt
WHERE k.stijlIds IS NOT NULL;
