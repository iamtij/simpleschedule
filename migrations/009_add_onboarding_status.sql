-- Add onboarding status columns to users table (if they don't exist)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS has_set_availability BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_set_display_name BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS has_shared_link BOOLEAN DEFAULT FALSE;

-- Set has_set_display_name to TRUE for users who already have a custom display_name
UPDATE users 
SET has_set_display_name = TRUE 
WHERE display_name IS NOT NULL AND display_name != full_name;

-- Set has_set_availability to TRUE for users who already have availability settings
UPDATE users u
SET has_set_availability = TRUE 
WHERE EXISTS (
    SELECT 1 FROM availability a 
    WHERE a.user_id = u.id
); 