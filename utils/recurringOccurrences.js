const MAX_OCCURRENCES = 52;
const MIN_OCCURRENCES = 2;

const VALID_FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'custom'];

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

function clampOccurrenceCount(count, { min = MIN_OCCURRENCES } = {}) {
    const n = parseInt(count, 10);
    if (Number.isNaN(n)) return null;
    return Math.max(min, Math.min(MAX_OCCURRENCES, n));
}

function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

function minutesToTime(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Normalize and validate custom occurrence list from API.
 * @returns {{ occurrences: { date: string, start_time: string, end_time: string }[] }}
 */
function parseCustomOccurrences(customOccurrences, durationMinutes) {
    if (!Array.isArray(customOccurrences) || customOccurrences.length === 0) {
        throw new Error('Add at least one date and time');
    }
    if (customOccurrences.length > MAX_OCCURRENCES) {
        throw new Error(`At most ${MAX_OCCURRENCES} meetings allowed`);
    }

    const occurrences = customOccurrences.map((occ, index) => {
        const date = occ.date?.trim();
        let start_time = occ.start_time?.trim();
        let end_time = occ.end_time?.trim();

        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            throw new Error(`Invalid date on row ${index + 1}`);
        }
        if (!start_time) {
            throw new Error(`Start time required on row ${index + 1}`);
        }
        if (start_time.length > 5) {
            start_time = start_time.slice(0, 5);
        }

        if (!end_time && durationMinutes > 0) {
            end_time = minutesToTime(timeToMinutes(start_time) + durationMinutes);
        }
        if (!end_time) {
            throw new Error(`End time required on row ${index + 1}`);
        }
        if (end_time.length > 5) {
            end_time = end_time.slice(0, 5);
        }

        if (timeToMinutes(end_time) <= timeToMinutes(start_time)) {
            throw new Error(`End time must be after start time on row ${index + 1}`);
        }

        return { date, start_time, end_time };
    });

    occurrences.sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return timeToMinutes(a.start_time) - timeToMinutes(b.start_time);
    });

    return { occurrences };
}

module.exports = {
    generateOccurrenceDates,
    clampOccurrenceCount,
    parseCustomOccurrences,
    timeToMinutes,
    minutesToTime,
    MAX_OCCURRENCES,
    MIN_OCCURRENCES,
    VALID_FREQUENCIES
};
