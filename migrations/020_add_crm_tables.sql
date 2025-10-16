-- CRM Component Migration
-- Create contacts table for CRM functionality

CREATE TABLE IF NOT EXISTS contacts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(50),
    company VARCHAR(255),
    position VARCHAR(255),
    industry VARCHAR(100),
    source VARCHAR(100) DEFAULT 'manual', -- 'booking', 'referral', 'manual', 'bni', 'import'
    status VARCHAR(50) DEFAULT 'new_lead', -- 'new_lead', 'qualified_lead', 'unqualified_lead', 'warm_prospect', 'hot_prospect', 'cold_prospect', 'active_client', 'past_client', 'vip_client', 'bni_member', 'bni_prospect', 'bni_alumni', 'competitor', 'inactive'
    referral_potential INTEGER CHECK (referral_potential BETWEEN 1 AND 5) DEFAULT 1,
    notes TEXT,
    tags TEXT[], -- Array of tags like ['bni_member', 'potential_referral', 'hot_lead']
    last_contact_date DATE,
    next_follow_up DATE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create interactions table for tracking all contact activities
CREATE TABLE IF NOT EXISTS interactions (
    id SERIAL PRIMARY KEY,
    contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- 'meeting', 'call', 'email', 'referral_given', 'referral_received', 'follow_up', 'social_media', 'event'
    subject VARCHAR(255),
    notes TEXT,
    outcome VARCHAR(100), -- 'positive', 'neutral', 'negative', 'referral_potential'
    referral_value DECIMAL(10,2),
    date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    booking_id INTEGER REFERENCES bookings(id) -- Link to actual booking if applicable
);

-- Create referrals table for tracking referral exchanges
CREATE TABLE IF NOT EXISTS referrals (
    id SERIAL PRIMARY KEY,
    giver_contact_id INTEGER REFERENCES contacts(id),
    receiver_contact_id INTEGER REFERENCES contacts(id),
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'completed', 'closed'
    value DECIMAL(10,2),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
CREATE INDEX IF NOT EXISTS idx_contacts_referral_potential ON contacts(referral_potential);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company);
CREATE INDEX IF NOT EXISTS idx_contacts_next_follow_up ON contacts(next_follow_up);

CREATE INDEX IF NOT EXISTS idx_interactions_contact_id ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_date ON interactions(date);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(type);

CREATE INDEX IF NOT EXISTS idx_referrals_user_id ON referrals(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- Add updated_at trigger for contacts table
CREATE OR REPLACE FUNCTION update_contacts_updated_at()
RETURNS TRIGGER AS $trigger$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$trigger$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON contacts
    FOR EACH ROW
    EXECUTE FUNCTION update_contacts_updated_at();
