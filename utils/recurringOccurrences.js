const MAX_OCCURRENCES = 52;
const MIN_OCCURRENCES = 2;

const VALID_FREQUENCIES = ['weekly', 'biweekly', 'monthly'];

function parseDateParts(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return { year, month, day };
}

function formatDateYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

/**
 * Add months keeping same day when possible; clamp to last day of month if needed.
 */
function addMonths(date, monthsToAdd) {
    const targetMonth = date.getMonth() + monthsToAdd;
    const result = new Date(date.getFullYear(), targetMonth, 1);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    const day = Math.min(date.getDate(), lastDay);
    result.setDate(day);
    return result;
}

/**
 * Generate occurrence dates for a recurring series.
 * @param {string} startDate - YYYY-MM-DD
 * @param {'weekly'|'biweekly'|'monthly'} frequency
 * @param {number} totalOccurrences
 * @returns {string[]} YYYY-MM-DD dates
 */
function generateOccurrenceDates(startDate, frequency, totalOccurrences) {
    if (!VALID_FREQUENCIES.includes(frequency)) {
        throw new Error('Invalid frequency');
    }
    const count = parseInt(totalOccurrences, 10);
    if (Number.isNaN(count) || count < MIN_OCCURRENCES || count > MAX_OCCURRENCES) {
        throw new Error(`total_occurrences must be between ${MIN_OCCURRENCES} and ${MAX_OCCURRENCES}`);
    }

    const { year, month, day } = parseDateParts(startDate);
    let current = new Date(year, month - 1, day);
    const dates = [formatDateYMD(current)];

    for (let i = 1; i < count; i++) {
        if (frequency === 'weekly') {
            current = new Date(current);
            current.setDate(current.getDate() + 7);
        } else if (frequency === 'biweekly') {
            current = new Date(current);
            current.setDate(current.getDate() + 14);
        } else {
            current = addMonths(current, 1);
        }
        dates.push(formatDateYMD(current));
    }

    return dates;
}

function clampOccurrenceCount(count) {
    const n = parseInt(count, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(MIN_OCCURRENCES, Math.min(MAX_OCCURRENCES, n));
}

module.exports = {
    generateOccurrenceDates,
    clampOccurrenceCount,
    MAX_OCCURRENCES,
    MIN_OCCURRENCES,
    VALID_FREQUENCIES
};
