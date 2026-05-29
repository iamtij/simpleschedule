-- Public client portal link for recurring series
ALTER TABLE recurring_series ADD COLUMN IF NOT EXISTS client_confirmation_token UUID DEFAULT gen_random_uuid();
ALTER TABLE recurring_series ADD COLUMN IF NOT EXISTS client_confirmed_at TIMESTAMP;

UPDATE recurring_series SET client_confirmation_token = gen_random_uuid() WHERE client_confirmation_token IS NULL;

ALTER TABLE recurring_series ALTER COLUMN client_confirmation_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_series_client_confirmation_token
    ON recurring_series(client_confirmation_token);
