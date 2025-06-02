-- Add buffer_minutes column to users table
ALTER TABLE users ADD COLUMN buffer_minutes INTEGER DEFAULT 0;

-- Add comment to explain the column
COMMENT ON COLUMN users.buffer_minutes IS 'Number of minutes to add as buffer after each booking'; 