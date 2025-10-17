-- Add follow-up and status fields to interactions table
-- Migration: 025_add_interaction_followup_fields.sql

-- Add follow-up date field
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS follow_up_date DATE;

-- Add follow-up time field  
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS follow_up_time TIME;

-- Add status field with default value
ALTER TABLE interactions ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending';

-- Add index on follow_up_date for better query performance
CREATE INDEX IF NOT EXISTS idx_interactions_follow_up_date ON interactions(follow_up_date);

-- Add index on status for filtering
CREATE INDEX IF NOT EXISTS idx_interactions_status ON interactions(status);
