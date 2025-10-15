-- Add dismissed_checklist column to users table (if it doesn't exist)
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_dismissed_checklist BOOLEAN DEFAULT FALSE; 