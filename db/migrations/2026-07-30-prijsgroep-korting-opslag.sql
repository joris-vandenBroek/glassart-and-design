-- Migration for prijsgroep-korting-opslag (2026-07-30)
-- Run once, in order, against a database still on the pre-migration schema.
ALTER TABLE prijsgroepen MODIFY kortingspercentage DECIMAL(5,2) NULL;
ALTER TABLE prijsgroepen ADD COLUMN opslagpercentage DECIMAL(5,2) NULL AFTER kortingspercentage;
ALTER TABLE prijsgroepen
  ADD CONSTRAINT chk_prijsgroep_korting_xor_opslag
  CHECK ((kortingspercentage IS NULL) <> (opslagpercentage IS NULL));
