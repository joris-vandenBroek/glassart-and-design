-- Migration for prijsmatrix-en-prijsmodule (2026-07-30)
-- Run once, in order, against a database still on the pre-migration schema.
CREATE TABLE prijsmatrix (
  id CHAR(36) PRIMARY KEY,
  maatId CHAR(36) NOT NULL,
  materiaalId CHAR(36) NOT NULL,
  prijs DECIMAL(10,2),
  UNIQUE KEY unique_maat_materiaal (maatId, materiaalId),
  FOREIGN KEY (maatId) REFERENCES maten(id) ON DELETE CASCADE,
  FOREIGN KEY (materiaalId) REFERENCES materialen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE kunstenaarAfspraken ADD COLUMN prijsopslag DECIMAL(10,2) NOT NULL DEFAULT 0;

ALTER TABLE kunstwerken DROP COLUMN prijzen;
