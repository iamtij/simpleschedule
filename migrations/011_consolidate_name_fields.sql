-- Ensure full_name exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Copy name to full_name if it exists and full_name is null
UPDATE users 
SET full_name = name 
WHERE name IS NOT NULL AND full_name IS NULL;

-- Drop the name column
ALTER TABLE users DROP COLUMN IF EXISTS name; 