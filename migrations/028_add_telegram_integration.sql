-- Add telegram_chat_id to users table
ALTER TABLE users ADD COLUMN telegram_chat_id VARCHAR(255) UNIQUE;
ALTER TABLE users ADD COLUMN telegram_username VARCHAR(255);
ALTER TABLE users ADD COLUMN telegram_notifications_enabled BOOLEAN DEFAULT false;

-- Create telegram_messages table for logging
CREATE TABLE telegram_messages (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    chat_id VARCHAR(255) NOT NULL,
    message_type VARCHAR(50) NOT NULL,
    message_content TEXT,
    direction VARCHAR(10) NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    status VARCHAR(20) DEFAULT 'sent',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create telegram_bot_sessions table for conversation state
CREATE TABLE telegram_bot_sessions (
    id SERIAL PRIMARY KEY,
    chat_id VARCHAR(255) NOT NULL UNIQUE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_state JSONB DEFAULT '{}',
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX idx_telegram_chat_id ON users(telegram_chat_id);
CREATE INDEX idx_telegram_messages_user ON telegram_messages(user_id);
CREATE INDEX idx_telegram_messages_chat ON telegram_messages(chat_id);
CREATE INDEX idx_telegram_sessions_chat ON telegram_bot_sessions(chat_id);
