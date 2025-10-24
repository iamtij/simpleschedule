-- Add URL shortener functionality
-- Create short_urls table for URL shortening

CREATE TABLE IF NOT EXISTS short_urls (
    id SERIAL PRIMARY KEY,
    code VARCHAR(20) UNIQUE NOT NULL,
    original_url TEXT NOT NULL,
    booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    click_count INTEGER DEFAULT 0,
    last_clicked_at TIMESTAMP
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_short_urls_code ON short_urls(code);
CREATE INDEX IF NOT EXISTS idx_short_urls_booking ON short_urls(booking_id);
CREATE INDEX IF NOT EXISTS idx_short_urls_user ON short_urls(user_id);
CREATE INDEX IF NOT EXISTS idx_short_urls_expires ON short_urls(expires_at);

-- Add comment for documentation
COMMENT ON TABLE short_urls IS 'URL shortener service for SMS and other communications';
COMMENT ON COLUMN short_urls.code IS 'Short code used in URL (e.g., a7k9m2)';
COMMENT ON COLUMN short_urls.original_url IS 'Full URL that the short code redirects to';
COMMENT ON COLUMN short_urls.booking_id IS 'Associated booking if this is a booking-related URL';
COMMENT ON COLUMN short_urls.click_count IS 'Number of times this short URL has been clicked';
COMMENT ON COLUMN short_urls.expires_at IS 'When this short URL expires (NULL = never expires)';
