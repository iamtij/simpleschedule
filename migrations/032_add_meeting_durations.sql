-- Create meeting_durations table to support multiple meeting durations per user
CREATE TABLE IF NOT EXISTS meeting_durations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    duration_minutes INTEGER NOT NULL,
    meeting_link TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, duration_minutes)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_meeting_durations_user_id ON meeting_durations(user_id);
CREATE INDEX IF NOT EXISTS idx_meeting_durations_active ON meeting_durations(user_id, is_active) WHERE is_active = TRUE;

