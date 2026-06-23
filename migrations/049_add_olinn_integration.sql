-- Per-user OLINN webhook integration
ALTER TABLE users
ADD COLUMN IF NOT EXISTS olinn_webhook_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS olinn_webhook_url TEXT;

CREATE INDEX IF NOT EXISTS idx_users_olinn_webhook_enabled
ON users(olinn_webhook_enabled)
WHERE olinn_webhook_enabled = TRUE;
