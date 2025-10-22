-- Fix foreign key constraint for interactions table to allow CASCADE delete
-- This will allow bookings to be deleted even if they have related interactions

-- Drop existing foreign key constraint
ALTER TABLE interactions DROP CONSTRAINT IF EXISTS interactions_booking_id_fkey;

-- Recreate with CASCADE delete
ALTER TABLE interactions 
    ADD CONSTRAINT interactions_booking_id_fkey 
    FOREIGN KEY (booking_id) 
    REFERENCES bookings(id) 
    ON DELETE CASCADE;
