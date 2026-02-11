-- Add booking logo path for PRO users (custom logo on public booking page)
ALTER TABLE users ADD COLUMN IF NOT EXISTS booking_logo_path VARCHAR(500);
