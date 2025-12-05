-- Migration: Add upgrade token columns for trial expiration emails
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS upgrade_token TEXT,
    ADD COLUMN IF NOT EXISTS upgrade_token_expiry TIMESTAMP WITH TIME ZONE;

