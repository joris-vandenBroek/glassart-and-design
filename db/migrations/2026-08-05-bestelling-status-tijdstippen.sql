-- Migration for bestelling-status-tijdstippen (2026-08-05)
-- Run once, in order, against a database still on the pre-migration schema.
ALTER TABLE bestelheaders ADD COLUMN teVersturenNaarDrukkerOp DATETIME NULL;
ALTER TABLE bestelheaders ADD COLUMN verstuurdNaarDrukkerOp DATETIME NULL;
ALTER TABLE bestelheaders ADD COLUMN afgewezenOp DATETIME NULL;
