-- Add meeting_link column to users table (if it doesn't exist)
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS meeting_link TEXT; 