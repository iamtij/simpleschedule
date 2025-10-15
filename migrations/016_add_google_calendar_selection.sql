-- Add google_calendar_id column to users table (if it doesn't exist)
ALTER TABLE users ADD COLUMN IF NOT EXISTS google_calendar_id TEXT DEFAULT 'primary';

-- Set default value for existing users
UPDATE users SET google_calendar_id = 'primary' WHERE google_calendar_id IS NULL;
