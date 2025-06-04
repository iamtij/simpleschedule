-- Add dismissed_checklist column to users table
ALTER TABLE users ADD COLUMN has_dismissed_checklist BOOLEAN DEFAULT FALSE; 