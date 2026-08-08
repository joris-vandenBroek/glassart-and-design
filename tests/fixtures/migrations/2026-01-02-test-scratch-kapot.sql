-- Fixture: the first statement succeeds, the second cannot. Proves the runner stops at the
-- failure and does not record the file.
INSERT IGNORE INTO test_scratch_apply (id) VALUES (2);
ALTER TABLE test_scratch_apply ADD COLUMN id INT;
