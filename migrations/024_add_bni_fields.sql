-- Add BNI Member and BNI Chapter fields to contacts table
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bni_member BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS bni_chapter VARCHAR(255);

-- Create index for BNI member filtering
CREATE INDEX IF NOT EXISTS idx_contacts_bni_member ON contacts(bni_member);

-- Update existing contacts that have status = 'bni_member' to set bni_member = true
UPDATE contacts SET bni_member = true WHERE status = 'bni_member';

-- Note: We'll keep the status field as is for now, but BNI membership is now tracked separately
