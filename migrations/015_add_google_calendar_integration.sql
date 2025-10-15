-- Add Google Calendar integration fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS google_calendar_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS google_access_token TEXT,
ADD COLUMN IF NOT EXISTS google_refresh_token TEXT,
ADD COLUMN IF NOT EXISTS google_token_expires_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS google_calendar_id TEXT DEFAULT 'primary';

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_google_calendar_enabled ON users(google_calendar_enabled) WHERE google_calendar_enabled = TRUE;
