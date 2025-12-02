-- Migration: Add trial tracking and RevenueCat integration fields
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS revenuecat_user_id TEXT,
    ADD COLUMN IF NOT EXISTS revenuecat_subscription_status TEXT,
    ADD COLUMN IF NOT EXISTS revenuecat_entitlement_status TEXT;

-- Set trial_started_at for existing users who don't have it (use created_at as fallback)
UPDATE users 
SET trial_started_at = created_at 
WHERE trial_started_at IS NULL;

