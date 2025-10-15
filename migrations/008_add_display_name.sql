-- Add display_name column to users table (if it doesn't exist)
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;

-- Initially set display_name to full_name for existing users
UPDATE users SET display_name = full_name WHERE display_name IS NULL; 