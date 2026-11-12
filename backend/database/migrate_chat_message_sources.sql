-- Run once against the configured database in MySQL Workbench before using chat.
-- Fresh databases created with schema.sql already have this column.
ALTER TABLE chat_messages
  ADD COLUMN sources JSON NULL AFTER content;
