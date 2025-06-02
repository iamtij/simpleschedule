-- Add full_name column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name VARCHAR(255);

-- Update existing users to have a default full_name based on their email
UPDATE users SET full_name = SPLIT_PART(email, '@', 1) WHERE full_name IS NULL; 