-- Add status column to bookings table
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled'));

-- Add updated_at column to bookings table for tracking changes
ALTER TABLE bookings 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Update existing bookings to have 'pending' status if they don't have one
UPDATE bookings SET status = 'pending' WHERE status IS NULL;
