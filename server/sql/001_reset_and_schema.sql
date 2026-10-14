-- SAFETY GUARD (2026-10-15)
-- This legacy file used to DROP EVERY TABLE in public before rebuilding the schema.
-- It has been neutralized to prevent accidental data loss.
-- Do not replace this guard with a destructive reset.
-- Use the backend's versioned, non-destructive migrations after taking a verified backup.
DO $$
BEGIN
  RAISE EXCEPTION USING
    MESSAGE = 'Blocked: this legacy reset script is disabled because it destroys existing data.',
    HINT = 'Read server/deploy/DATABASE-RECOVERY.md. Never run this file for deployment or recovery.';
END
$$;
