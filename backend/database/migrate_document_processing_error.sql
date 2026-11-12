-- Run once in the configured database before starting document background jobs.
-- Fresh databases created with schema.sql already have this column.
ALTER TABLE documents
  ADD COLUMN processing_error TEXT NULL AFTER status;
