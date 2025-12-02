-- Create system_settings table to store system-wide configuration
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    setting_key TEXT UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by INTEGER,
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);

-- Insert default setting for monthly subscription (enabled by default)
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES ('monthly_subscription_enabled', 'true', 'Enable or disable monthly subscription option in paywall')
ON CONFLICT (setting_key) DO NOTHING;

