-- Add google_calendar_blocking_enabled column to users table (if it doesn't exist)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_blocking_enabled BOOLEAN DEFAULT TRUE;

-- Set default value for existing users
UPDATE users SET google_calendar_blocking_enabled = TRUE WHERE google_calendar_blocking_enabled IS NULL;
