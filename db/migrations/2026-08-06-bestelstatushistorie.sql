-- Migration for bestelstatushistorie (2026-08-06)
-- Run once, in order, against a database still on the pre-migration schema.
-- Verified 2026-08-06: no real bestelheaders row has any of the 4 dropped columns
-- populated, so this drop is lossless -- do not re-verify unless staging has since
-- accumulated real Verstuurd-naar-drukker/Afgerond/Afgewezen orders under the old design.
CREATE TABLE bestelstatusHistorie (
  id CHAR(36) PRIMARY KEY,
  bestelheaderId CHAR(36) NOT NULL,
  status VARCHAR(50) NOT NULL,
  tijdstip TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bestelheaderId) REFERENCES bestelheaders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
ALTER TABLE bestelheaders DROP COLUMN teVersturenNaarDrukkerOp;
ALTER TABLE bestelheaders DROP COLUMN verstuurdNaarDrukkerOp;
ALTER TABLE bestelheaders DROP COLUMN afgerondOp;
ALTER TABLE bestelheaders DROP COLUMN afgewezenOp;
