-- Koppeltabel voor kunstwerken.segmentIds (2026-08-11), 1 van 6 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
--
-- Puur additief: kunstwerken.segmentIds blijft in deze migratie bestaan en ongewijzigd.
-- FOR ORDINALITY geeft de 1-gebaseerde positie in de array, gebruikt als volgorde.
CREATE TABLE kunstwerkSegmenten (
  kunstwerkId CHAR(36) NOT NULL,
  segmentId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, segmentId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (segmentId) REFERENCES segmenten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkSegmenten (kunstwerkId, segmentId, volgorde)
SELECT k.id, jt.segmentId, jt.volgorde
FROM kunstwerken k
JOIN JSON_TABLE(
  k.segmentIds, '$[*]' COLUMNS (
    volgorde FOR ORDINALITY,
    segmentId CHAR(36) PATH '$'
  )
) AS jt
WHERE k.segmentIds IS NOT NULL;
