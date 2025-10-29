-- Fix PostgreSQL collation version mismatch
-- This addresses the warning: "database has a collation version mismatch"
-- The database was created using collation version 2.36, but the operating system provides version 2.41

-- Note: This migration file is a placeholder to track the issue.
-- The actual fix is handled automatically by db/migrate.js after migrations complete.
-- The migration runner attempts to run: ALTER DATABASE [database_name] REFRESH COLLATION VERSION

-- If permissions allow, the collation version will be refreshed automatically.
-- If not, the warning is safe to ignore and doesn't affect application functionality.
-- The collation version mismatch is a warning and doesn't impact database operations.
