-- Per-meeting client confirmation (replaces series-wide confirmation for new flows)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS client_confirmed_at TIMESTAMP;

-- Backfill from legacy series-level confirmation
UPDATE bookings b
SET client_confirmed_at = rs.client_confirmed_at
FROM recurring_series rs
WHERE b.recurring_series_id = rs.id
  AND rs.client_confirmed_at IS NOT NULL
  AND b.client_confirmed_at IS NULL
  AND b.status != 'cancelled';
