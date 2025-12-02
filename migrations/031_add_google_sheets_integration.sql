-- Add Google Sheets integration fields to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS google_sheet_id TEXT,
ADD COLUMN IF NOT EXISTS google_sheets_enabled BOOLEAN DEFAULT FALSE;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_google_sheets_enabled ON users(google_sheets_enabled) WHERE google_sheets_enabled = TRUE;



