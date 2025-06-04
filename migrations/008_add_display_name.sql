-- Add display_name column to users table
ALTER TABLE users ADD COLUMN display_name TEXT;

-- Initially set display_name to full_name for existing users
UPDATE users SET display_name = full_name WHERE display_name IS NULL; 