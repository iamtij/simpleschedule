-- Drop existing foreign key constraints
ALTER TABLE availability DROP CONSTRAINT IF EXISTS availability_user_id_fkey;
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_user_id_fkey;
ALTER TABLE breaks DROP CONSTRAINT IF EXISTS breaks_user_id_fkey;

-- Recreate constraints with ON DELETE CASCADE
ALTER TABLE availability 
    ADD CONSTRAINT availability_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES users(id) 
    ON DELETE CASCADE;

ALTER TABLE bookings 
    ADD CONSTRAINT bookings_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES users(id) 
    ON DELETE CASCADE;

ALTER TABLE breaks 
    ADD CONSTRAINT breaks_user_id_fkey 
    FOREIGN KEY (user_id) 
    REFERENCES users(id) 
    ON DELETE CASCADE; 