-- Per-user feature flag for host-managed recurring client meetings
ALTER TABLE users ADD COLUMN IF NOT EXISTS recurring_clients_enabled BOOLEAN NOT NULL DEFAULT false;

-- Series metadata for recurring client schedules
CREATE TABLE IF NOT EXISTS recurring_series (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    client_name TEXT NOT NULL,
    client_email TEXT NOT NULL,
    client_phone TEXT,
    start_date DATE NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    frequency VARCHAR(20) NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
    total_occurrences INTEGER NOT NULL CHECK (total_occurrences >= 2 AND total_occurrences <= 52),
    duration_minutes INTEGER,
    notes TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_recurring_series_user_status ON recurring_series(user_id, status);
CREATE INDEX IF NOT EXISTS idx_recurring_series_contact ON recurring_series(contact_id);

-- Link individual bookings to a series
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS recurring_series_id INTEGER REFERENCES recurring_series(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS occurrence_index INTEGER;

CREATE INDEX IF NOT EXISTS idx_bookings_recurring_series ON bookings(recurring_series_id);
