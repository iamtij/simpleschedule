-- Add Google Calendar event tracking to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS google_event_id TEXT,
ADD COLUMN IF NOT EXISTS google_calendar_link TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_bookings_google_event_id ON bookings(google_event_id) WHERE google_event_id IS NOT NULL;
