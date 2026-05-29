-- Allow custom (hand-picked) occurrence schedules
ALTER TABLE recurring_series DROP CONSTRAINT IF EXISTS recurring_series_frequency_check;
ALTER TABLE recurring_series ADD CONSTRAINT recurring_series_frequency_check
    CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'custom'));

ALTER TABLE recurring_series DROP CONSTRAINT IF EXISTS recurring_series_total_occurrences_check;
ALTER TABLE recurring_series ADD CONSTRAINT recurring_series_total_occurrences_check
    CHECK (total_occurrences >= 1 AND total_occurrences <= 52);
