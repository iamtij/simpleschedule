-- Add sms_phone to users table for host SMS notifications
-- When set, host receives booking confirmation SMS. When blank, no SMS is sent to host.
ALTER TABLE users ADD COLUMN IF NOT EXISTS sms_phone TEXT;
