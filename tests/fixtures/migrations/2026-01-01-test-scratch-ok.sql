-- Fixture for tests/scripts/apply.test.ts. Never applied to a real database by the CLI:
-- it lives outside db/migrations/ and is only reachable via MIGRATIONS_DIR.
CREATE TABLE IF NOT EXISTS test_scratch_apply (
  id INT PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO test_scratch_apply (id) VALUES (1);
