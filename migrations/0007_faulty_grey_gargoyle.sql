-- No-op migration.
-- This file originally duplicated changes already applied in:
-- - 0004_simulation_mode.sql
-- - 0005_public_content_fields.sql
-- - 0006_forfeit_support.sql
-- Keeping this migration empty avoids replaying CREATE TYPE / ADD COLUMN statements
-- that fail on existing databases while preserving migration history ordering.
SELECT 1;