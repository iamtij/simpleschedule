-- Migration: Add email templates table for admin email management
CREATE TABLE IF NOT EXISTS email_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL
);

-- Create index on name for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_name ON email_templates(name);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_email_templates_created_at ON email_templates(created_at);





