-- Migration: Add pro_started_at column to track when Pro subscription started
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS pro_started_at TIMESTAMP WITH TIME ZONE;

-- Set pro_started_at for existing Pro users (use created_at as fallback if pro_started_at is null)
UPDATE users 
SET pro_started_at = COALESCE(pro_started_at, created_at)
WHERE is_pro = TRUE AND pro_started_at IS NULL;




