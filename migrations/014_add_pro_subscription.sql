ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_pro BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS pro_expires_at TIMESTAMP WITH TIME ZONE;

-- Set default values for existing users
UPDATE users SET is_pro = FALSE WHERE is_pro IS NULL; 