-- Add reminder tracking columns to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS client_reminder_30_sent BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS host_reminder_30_sent BOOLEAN DEFAULT FALSE;

-- Add index for faster lookups on reminder status
CREATE INDEX IF NOT EXISTS idx_bookings_reminder_status ON bookings(client_reminder_30_sent, host_reminder_30_sent) 
WHERE client_reminder_30_sent = FALSE OR host_reminder_30_sent = FALSE;



