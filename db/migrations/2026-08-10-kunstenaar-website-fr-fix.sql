-- Follow-up to 2026-08-10-kunstenaar-website.sql (2026-08-10)
-- Corrects a bug found in final whole-branch review: the FR REPLACE clause in
-- the original migration used CHAR(160) to build the non-breaking-space
-- needle. CHAR(160) returns a single-byte *binary* string (0xA0); CONCAT with
-- any binary argument makes the whole needle binary, so REPLACE compared it
-- byte-wise against the utf8mb4 column -- where NBSP (U+00A0) is actually the
-- two bytes C2 A0. The needle could never match, so the REPLACE was a silent
-- no-op, identical to the plain-space bug it was meant to fix. Verified
-- byte-for-byte against the live staging row before writing this file.
--
-- The original migration's file was edited in place to fix this (CHAR(194),
-- CHAR(160) in place of CHAR(160)), which corrects it for any *future* fresh
-- apply of that file -- but schema_migrations only stores filename +
-- applied_at, no checksum, so an environment that already applied that file
-- (staging) will never re-run it. This migration exists so the fix is a real,
-- tracked, tested migration on every environment that already applied the
-- original -- rather than an untracked manual UPDATE run outside the
-- migration system.
--
-- Idempotent/safe to run whether or not the FR field still has the broken
-- text: REPLACE no-ops when the needle isn't present, which is already the
-- case on staging (hand-fixed manually before this migration existed).
UPDATE kunstenaars
SET
  omschrijvingFr = REPLACE(
    omschrijvingFr,
    CONCAT(CHAR(10), CHAR(10), 'En savoir plus sur Jack', CHAR(194), CHAR(160), '? Rendez-vous sur https://www.jacksart.nl/en/'),
    ''
  )
WHERE naam = 'Jack Liemburg';
