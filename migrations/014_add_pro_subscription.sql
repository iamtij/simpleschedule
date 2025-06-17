ALTER TABLE users
    ADD COLUMN is_pro BOOLEAN DEFAULT FALSE,
    ADD COLUMN pro_expires_at TIMESTAMP WITH TIME ZONE;

-- Set default values for existing users
UPDATE users SET is_pro = FALSE WHERE is_pro IS NULL; 