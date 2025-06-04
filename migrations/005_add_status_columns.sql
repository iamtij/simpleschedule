-- Add status and is_admin columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS status BOOLEAN DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Update existing admin user
UPDATE users 
SET is_admin = TRUE 
WHERE email = 'tjtalusan@gmail.com'; 