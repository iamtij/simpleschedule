-- Migrate data from name to full_name where full_name is null
UPDATE users 
SET full_name = name 
WHERE full_name IS NULL;

-- Drop the name column
ALTER TABLE users DROP COLUMN name; 