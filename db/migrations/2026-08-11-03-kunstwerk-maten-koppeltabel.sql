-- Koppeltabel voor kunstwerken.maatIds (2026-08-11), 3 van 6 in deze reeks.
-- Ontwerp: docs/superpowers/specs/2026-08-11-kunstwerk-relaties-koppeltabellen-design.md
--
-- 0 rijen voor een kunstwerk blijft het bestaande materiaalloos/prijs-per-m²-signaal
-- (prijsmodule.ts, berekenBestellijnPrijs) -- geen aparte vlag nodig.
CREATE TABLE kunstwerkMaten (
  kunstwerkId CHAR(36) NOT NULL,
  maatId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, maatId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (maatId) REFERENCES maten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO kunstwerkMaten (kunstwerkId, maatId, volgorde)
SELECT k.id, jt.maatId, jt.volgorde
FROM kunstwerken k
JOIN JSON_TABLE(
  k.maatIds, '$[*]' COLUMNS (
    volgorde FOR ORDINALITY,
    maatId CHAR(36) PATH '$'
  )
) AS jt
WHERE k.maatIds IS NOT NULL;
