-- Add timezone support to users table
-- This migration adds timezone column to users table and sets default timezone

-- Add timezone column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(50) DEFAULT 'Asia/Manila';

-- Update existing users to have the default timezone if NULL
UPDATE users SET timezone = 'Asia/Manila' WHERE timezone IS NULL;

-- Add comment to document the timezone column
COMMENT ON COLUMN users.timezone IS 'User timezone identifier (e.g., Asia/Manila, America/New_York)';
