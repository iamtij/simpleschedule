-- Migration: Add plan_type to users table for manual admin override
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS plan_type TEXT CHECK (plan_type IN ('monthly', 'yearly'));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_users_plan_type ON users(plan_type);








