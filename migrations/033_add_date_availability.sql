-- Create date_availability table to support date-specific availability overrides
CREATE TABLE IF NOT EXISTS date_availability (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date DATE NOT NULL,
    start_time TEXT NOT NULL,     -- Format: HH:MM
    end_time TEXT NOT NULL,       -- Format: HH:MM
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_date_availability_user_id ON date_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_date_availability_date ON date_availability(user_id, date);
CREATE INDEX IF NOT EXISTS idx_date_availability_user_date ON date_availability(user_id, date, start_time);



