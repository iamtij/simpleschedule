-- Ensure full_name exists
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;

-- Copy name to full_name if it exists and full_name is null
-- Note: Only execute this if the name column actually exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_name = 'users' AND column_name = 'name') THEN
        UPDATE users 
        SET full_name = name 
        WHERE name IS NOT NULL AND full_name IS NULL;
        
        -- Drop the name column
        ALTER TABLE users DROP COLUMN name;
    END IF;
END $$; 