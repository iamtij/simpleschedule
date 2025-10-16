-- Add buffer_minutes column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS buffer_minutes INTEGER DEFAULT 0;

-- Create universal_breaks table for global break settings
CREATE TABLE IF NOT EXISTS universal_breaks (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    enabled BOOLEAN DEFAULT FALSE,
    start_time TEXT, -- Format: HH:MM
    end_time TEXT,   -- Format: HH:MM
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id) -- One universal break setting per user
);
