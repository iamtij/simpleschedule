-- Add UUID column to bookings table for secure confirmation URLs
-- Migration: 030_add_booking_uuid.sql

-- Add UUID column to bookings table
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS confirmation_uuid UUID DEFAULT gen_random_uuid();

-- Create unique index on confirmation_uuid for fast lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_confirmation_uuid ON bookings(confirmation_uuid);

-- Update existing bookings to have UUIDs (if any exist without them)
UPDATE bookings SET confirmation_uuid = gen_random_uuid() WHERE confirmation_uuid IS NULL;

-- Make confirmation_uuid NOT NULL after populating existing records
ALTER TABLE bookings ALTER COLUMN confirmation_uuid SET NOT NULL;
